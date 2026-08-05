import os
import random
import copy
import zipfile
import io
from typing import List

from exporters.common import shuffle_contest, generate_answer_key_excel, min_pages, sanitize_general_info_for_pandoc
from exporters.latex_exporter import export_latex
from exporters.pdf_latex_exporter import (
    export_pdf_latex,
    export_pdf_latex_combined,
    measure_unit_heights_latex,
)
from exporters.word_exporter import export_word

from .pdf_html import (
    html_to_pdf_sync,
    measure_unit_heights_html_sync,
    render_exam_preview_html,
)


def export_contest_zip(contest: dict, questions: List[dict], num_shuffles: int, formats: List[str], exam_title: str = "", general_info: str = "", department: str = "", exam_type: str = "", subject: str = "", duration: int = 50, code_type: str = "incremental", starting_code: str = "001", code_step: int = 1, random_length: int = 3, progress_callback=None, shuffle_order: bool = True, shuffle_options: bool = True, original_code: str = "000") -> io.BytesIO:
    zip_buffer = io.BytesIO()
    
    answer_keys = {} # code -> { q_num: ans }
    pdf_buffers = [] # list of bytes of generated pdfs
    
    total_steps = 1 + num_shuffles
    current_step = 0
    
    if progress_callback:
        progress_callback(current_step, total_steps, "Khởi tạo xuất đề thi...")
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Original Exam
        original_code = original_code or "000"
        orig_q = copy.deepcopy(questions)
        
        orig_key = {}
        q_c = 1
        for q in orig_q:
            if q['question_type'] == 'st': continue
            ans = ""
            if q['question_type'] == 'mc':
                for idx, opt in enumerate(q.get('options', [])):
                    if opt.get('is_correct'): ans = chr(65+idx); break
            elif q['question_type'] == 'tf':
                ans = ",".join("D" if o.get('is_correct') else "S" for o in q.get('options', []))
            elif q['question_type'] == 'sa':
                ans = q.get('options', [{}])[0].get('content', '') if q.get('options') else ''
            orig_key[q_c] = ans
            q_c += 1
            
        # Note: Do not add original exam to answer_keys or pdf_buffers as requested
            
        # Output original exam
        if progress_callback:
            progress_callback(current_step, total_steps, f"Đang xuất đề gốc...")
            
        if 'latex' in formats:
            export_latex(contest, orig_q, original_code, exam_title, department, exam_type, subject, duration, general_info, True, zf)
            
        if 'pdf_latex' in formats:
            export_pdf_latex(contest, orig_q, original_code, exam_title, department, exam_type, subject, duration, general_info, True, zf)

        if 'pdf' in formats:
            import tempfile
            try:
                html = render_exam_preview_html(dict(contest), orig_q, exam_title, department, exam_type, subject, duration, general_info, original_code, for_export=True)
                with tempfile.TemporaryDirectory() as tmpdir:
                    pdf_path = os.path.join(tmpdir, f"{original_code}.pdf")
                    html_to_pdf_sync(html, pdf_path, original_code)
                    if os.path.exists(pdf_path):
                        zf.write(pdf_path, f"{original_code}.pdf")
            except Exception as e:
                import traceback
                traceback.print_exc()
                print("HTML to PDF error for original:", e)

        if 'word' in formats:
            # Đề gốc: in phần đề trước, rồi mới đến phần đề kèm đáp án + lời giải chi tiết
            word_general_info = sanitize_general_info_for_pandoc(general_info)
            export_word(contest, orig_q, original_code, exam_title, department, exam_type, subject, duration, word_general_info, True, zf, dual_section=True)

        current_step += 1
        
        # Shuffled exams
        used_codes = {original_code}
        pdf_codes_data = []  # gom (code, shuf_q) để compile PDF gộp 1 lần

        # Chỉ xếp trang lấp đầy + đồng bộ khi CÓ đảo thứ tự câu (đảo đề). Nếu chỉ
        # đảo phương án (đảo câu) thì giữ nguyên thứ tự -> mọi mã cùng bố cục, tự đồng bộ.
        unit_heights = {}
        target_pages = None
        if shuffle_order and num_shuffles > 0:
            if 'pdf' in formats:
                if progress_callback:
                    progress_callback(current_step, total_steps, "Đang đo bố cục (HTML) để đồng bộ số trang...")
                html_for_measure = render_exam_preview_html(
                    dict(contest), orig_q, exam_title, department, exam_type, subject,
                    duration, general_info, original_code, include_solution=False,
                    show_answers=False, for_export=True, measure=True,
                )
                unit_heights = measure_unit_heights_html_sync(html_for_measure)
                target_pages = min_pages(orig_q, unit_heights)
            elif 'latex' in formats or 'pdf_latex' in formats:
                if progress_callback:
                    progress_callback(current_step, total_steps, "Đang đo bố cục (LaTeX) để đồng bộ số trang...")
                unit_heights = measure_unit_heights_latex(contest, orig_q, exam_title, department, exam_type, subject, duration, general_info)
                target_pages = min_pages(orig_q, unit_heights)

        for i in range(num_shuffles):
            if code_type == "incremental":
                try:
                    num = int(starting_code) + i * code_step
                    code = str(num).zfill(max(3, len(starting_code)))
                    while code in used_codes:
                        num += code_step
                        code = str(num).zfill(max(3, len(starting_code)))
                except ValueError:
                    code = f"{starting_code}-{i+1}"
            else:
                min_val = 10 ** (random_length - 1)
                max_val = (10 ** random_length) - 1
                if random_length <= 1:
                    min_val = 0
                    max_val = 9
                code = f"{random.randint(min_val, max_val):0{random_length}d}"
                while code in used_codes:
                    code = f"{random.randint(min_val, max_val):0{random_length}d}"
            used_codes.add(code)
                
            if progress_callback:
                progress_callback(current_step, total_steps, f"Đang xuất mã đề {code} ({i+1}/{num_shuffles})...")

            shuf_q, shuf_key = shuffle_contest(
                orig_q, pack=shuffle_order, heights=unit_heights, target_pages=target_pages,
                shuffle_order=shuffle_order, shuffle_options=shuffle_options,
            )
            answer_keys[code] = shuf_key
            
            if 'latex' in formats:
                export_latex(contest, shuf_q, code, exam_title, department, exam_type, subject, duration, general_info, False, zf)
                
            if 'pdf_latex' in formats:
                # Gom lại, compile gộp 1 lần sau vòng lặp (an toàn server yếu + nhanh)
                pdf_codes_data.append((code, shuf_q))

            if 'pdf' in formats:
                import tempfile
                try:
                    html = render_exam_preview_html(dict(contest), shuf_q, exam_title, department, exam_type, subject, duration, general_info, code, include_solution=False, show_answers=False, for_export=True)
                    with tempfile.TemporaryDirectory() as tmpdir:
                        pdf_path = os.path.join(tmpdir, f"{code}.pdf")
                        html_to_pdf_sync(html, pdf_path, code)
                        if os.path.exists(pdf_path):
                            zf.write(pdf_path, f"{code}.pdf")
                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    print("HTML to PDF error for shuffled code", code, ":", e)

            if 'word' in formats:
                word_general_info = sanitize_general_info_for_pandoc(general_info)
                export_word(contest, shuf_q, code, exam_title, department, exam_type, subject, duration, word_general_info, False, zf)
                
            current_step += 1

        # Write Answer Key Excel
        if progress_callback:
            progress_callback(current_step, total_steps, "Đang đóng gói dữ liệu...")
            
        excel_content = generate_answer_key_excel(answer_keys)
        zf.writestr("Bang_Dap_An.xlsx", excel_content)

        if 'latex' in formats:
            current_dir = os.path.dirname(__file__)
            extest_path = os.path.join(current_dir, "ex_test.sty")
            if os.path.exists(extest_path):
                zf.write(extest_path, "ex_test.sty")
                
        # PDF đề đảo: compile TẤT CẢ mã trong 1 lần chạy (1 tiến trình, 2 lượt)
        if 'pdf_latex' in formats and pdf_codes_data:
            if progress_callback:
                progress_callback(current_step, total_steps, f"Đang compile {len(pdf_codes_data)} mã đề LaTeX...")
            export_pdf_latex_combined(
                contest, pdf_codes_data,
                exam_title, department, exam_type, subject, duration, general_info,
                zf, out_name="De_dao_latex.pdf",
            )

    return zip_buffer
