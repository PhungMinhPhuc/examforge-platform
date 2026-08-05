import os
import subprocess
import tempfile
import io
import zipfile
from typing import List, Dict, Any
from .latex_exporter import get_raw_latex, get_combined_latex, get_measure_latex, get_original_exam_latex


def measure_unit_heights_latex(contest: dict, questions: list, exam_title: str = "", department: str = "", exam_type: str = "", subject: str = "", duration: int = 50, general_info: str = "") -> dict:
    """Compile 1 lượt LaTeX để đo chiều cao thật (pt) từng câu → {id: pt}.

    Dùng cho thuật toán xếp câu lấp đầy trang. Lỗi thì trả {} (fallback ước lượng).
    """
    try:
        tex = get_measure_latex(
            contest, questions, exam_title=exam_title, general_info=general_info,
            department=department, exam_type=exam_type, subject=subject, duration=duration,
        )
    except Exception as e:
        print(f"measure_unit_heights_latex build error: {e}")
        return {}
    with tempfile.TemporaryDirectory() as tmpdir:
        with open(os.path.join(tmpdir, "measure.tex"), 'w', encoding='utf-8') as f:
            f.write(tex)
        import shutil
        extest_path = os.path.join(os.path.dirname(__file__), "ex_test.sty")
        if os.path.exists(extest_path):
            shutil.copy(extest_path, os.path.join(tmpdir, "ex_test.sty"))
        try:
            subprocess.run(["xelatex", "-interaction=nonstopmode", "measure.tex"], cwd=tmpdir, check=False, capture_output=True, text=True, timeout=200)
        except Exception as e:
            print(f"measure compile error: {e}")
            return {}
        hpath = os.path.join(tmpdir, "heights.txt")
        if not os.path.exists(hpath):
            return {}
        import re
        heights = {}
        for line in open(hpath, encoding='utf-8', errors='ignore'):
            m = re.match(r'\s*(\w+)\s*=\s*(-?[\d.]+)pt', line)
            if m:
                key, val = m.group(1), float(m.group(2))
                if key.isdigit():
                    heights[int(key)] = val
                else:
                    heights[key] = val  # khóa hình học: __PAGE__, __EXAMHDR__, __PART_*__
        # Dung lượng trang đầu = chiều cao trang - chiều cao header đề
        if '__PAGE__' in heights and '__EXAMHDR__' in heights:
            heights['__FIRST__'] = heights['__PAGE__'] - heights['__EXAMHDR__']
        return heights


def _split_combined_pdf(pdf_path: str, aux_path: str, codes_data: list, zf: zipfile.ZipFile):
    """Tách PDF gộp thành từng file {code}.pdf dựa trên số trang per-mã trong .aux.

    Nhãn mylt<idx> lưu số trang của mã thứ idx (page counter đã reset về 1 mỗi mã), nên số trang đó chính là số trang của mã. Cộng dồn để biết khoảng trang từng mã.
    """
    try:
        import re
        from pypdf import PdfReader, PdfWriter
        if not os.path.exists(aux_path):
            return
        aux = open(aux_path, encoding='utf-8', errors='ignore').read()
        counts = {}
        for m in re.finditer(r'\\newlabel\{mylt(\d+)\}\{\{[^}]*\}\{(\d+)\}', aux):
            counts[int(m.group(1))] = int(m.group(2))

        n = len(codes_data)
        ordered = [counts.get(i, 0) for i in range(n)]
        reader = PdfReader(pdf_path)
        total = len(reader.pages)
        # Chỉ tách khi đọc đủ số trang và tổng khớp với PDF thật
        if any(c <= 0 for c in ordered) or sum(ordered) != total:
            print(f"Split PDF: số trang per-mã không khớp (tổng {sum(ordered)} vs {total} trang) — bỏ qua tách.")
            return

        offset = 0
        for idx, (code, _) in enumerate(codes_data):
            c = ordered[idx]
            writer = PdfWriter()
            for p in range(offset, offset + c):
                writer.add_page(reader.pages[p])
            buf = io.BytesIO()
            writer.write(buf)
            zf.writestr(f"{code}.pdf", buf.getvalue())
            offset += c
    except Exception as e:
        print(f"Split combined PDF error: {e}")


def export_pdf_latex_combined(contest: dict, codes_data: list, exam_title: str, department: str, exam_type: str, subject: str, duration: int, general_info: str, zf: zipfile.ZipFile = None, out_name: str = "De_dao.pdf") -> bytes | None:
    """Compile TẤT CẢ mã đề đảo trong 1 lần chạy xelatex (1 tiến trình, 2 lượt).

    An toàn cho server yếu (chỉ 1 tiến trình thay vì N) và nhanh hơn nhiều vì
    nạp unicode-math/Cambria Math đúng 1 lần thay vì N lần.
    """
    if not codes_data:
        return None
    raw_tex = get_combined_latex(
        contest, codes_data,
        exam_title=exam_title, general_info=general_info,
        department=department, exam_type=exam_type, subject=subject,
        duration=duration, for_pdf_compilation=True,
    )
    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = os.path.join(tmpdir, "combined.tex")
        with open(tex_path, 'w', encoding='utf-8') as f:
            f.write(raw_tex)

        import shutil
        current_dir = os.path.dirname(__file__)
        extest_path = os.path.join(current_dir, "ex_test.sty")
        if os.path.exists(extest_path):
            shutil.copy(extest_path, os.path.join(tmpdir, "ex_test.sty"))

        pdf_path = os.path.join(tmpdir, "combined.pdf")
        try:
            compiler = "xelatex"
            proc1 = subprocess.run([compiler, "-interaction=nonstopmode", "combined.tex"], cwd=tmpdir, check=False, capture_output=True, text=True, timeout=300)
            if not os.path.exists(pdf_path):
                print(f"Combined PDF with xelatex failed (Code {proc1.returncode}). Trying lualatex...")
                compiler = "lualatex"
                proc1 = subprocess.run([compiler, "-interaction=nonstopmode", "combined.tex"], cwd=tmpdir, check=False, capture_output=True, text=True, timeout=300)
                if not os.path.exists(pdf_path):
                    print(f"Combined PDF compilation failed (Code {proc1.returncode}).")
                    print(proc1.stdout[-1500:] if proc1.stdout else "No output")
                    return None
            # Lượt 2 để resolve \pageref (số trang per-mã trong header/footer)
            subprocess.run([compiler, "-interaction=nonstopmode", "combined.tex"], cwd=tmpdir, check=False, capture_output=True, text=True, timeout=300)
            if os.path.exists(pdf_path):
                if zf:
                    # File gộp
                    zf.write(pdf_path, out_name)
                    # Tách thành từng file riêng theo số trang per-mã (đọc từ .aux)
                    _split_combined_pdf(pdf_path, os.path.join(tmpdir, "combined.aux"), codes_data, zf)
                with open(pdf_path, 'rb') as f:
                    return f.read()
        except subprocess.TimeoutExpired as e:
            print(f"Combined PDF error: TimeoutExpired ({e.timeout}s).")
        except Exception as e:
            print(f"Combined PDF error: {e}")
    return None

def export_pdf_latex(contest: dict, questions: List[dict], code: str, exam_title: str, department: str, exam_type: str, subject: str, duration: int, general_info: str, include_solution: bool, zf: zipfile.ZipFile = None) -> bytes | None:
    if include_solution:
        # Đề gốc (có đáp án): 3 mục = ĐỀ sạch + BẢNG ĐÁP ÁN + LỜI GIẢI CHI TIẾT
        raw_tex_header = get_original_exam_latex(
            contest, questions,
            exam_title=exam_title,
            general_info=general_info,
            code=code,
            department=department,
            exam_type=exam_type,
            subject=subject,
            duration=duration,
            for_pdf_compilation=True,
            use_minipage=True if code != "000" else False,
        )
    else:
        raw_tex_header = get_raw_latex(
            contest, questions,
            include_header=True,
            use_minipage=True if code != "000" else False,
            exam_title=exam_title,
            general_info=general_info,
            code=code,
            department=department,
            exam_type=exam_type,
            subject=subject,
            duration=duration,
            include_solution=include_solution,
            for_pdf_compilation=True
        )
    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = os.path.join(tmpdir, f"{code}.tex")
        with open(tex_path, 'w', encoding='utf-8') as f:
            f.write(raw_tex_header)
            
        import shutil
        current_dir = os.path.dirname(__file__)
        extest_path = os.path.join(current_dir, "ex_test.sty")
        if os.path.exists(extest_path):
            shutil.copy(extest_path, os.path.join(tmpdir, "ex_test.sty"))
            
        try:
            compiler = "xelatex"
            # First pass
            proc1 = subprocess.run([compiler, "-interaction=nonstopmode", f"{code}.tex"], cwd=tmpdir, check=False, capture_output=True, text=True, timeout=300)
            pdf_path = os.path.join(tmpdir, f"{code}.pdf")
            if not os.path.exists(pdf_path):
                print(f"PDF compilation with xelatex failed (Code {proc1.returncode}). Trying lualatex...")
                compiler = "lualatex"
                proc1 = subprocess.run([compiler, "-interaction=nonstopmode", f"{code}.tex"], cwd=tmpdir, check=False, capture_output=True, text=True, timeout=300)
                if not os.path.exists(pdf_path):
                    print(f"PDF compilation with lualatex also failed (Code {proc1.returncode}).")
                    print("Last 1000 chars of output:")
                    print(proc1.stdout[-1000:] if proc1.stdout else "No output")
                    return None

            # Second pass (for references)
            proc2 = subprocess.run([compiler, "-interaction=nonstopmode", f"{code}.tex"], cwd=tmpdir, check=False, capture_output=True, text=True, timeout=300)
            
            pdf_path = os.path.join(tmpdir, f"{code}.pdf")
            if os.path.exists(pdf_path):
                if zf:
                    zf.write(pdf_path, f"{code}.pdf")
                with open(pdf_path, 'rb') as f:
                    return f.read()
        except subprocess.TimeoutExpired as e:
            print(f"PDF error: TimeoutExpired. Compilation took longer than {e.timeout} seconds.")
        except Exception as e:
            print(f"PDF error: {e}")
    return None
