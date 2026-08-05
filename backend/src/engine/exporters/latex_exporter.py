import os
import re
from typing import List, Dict, Any
from .common import fix_soft_newlines, resolve_image_file
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "api", ".env"))

def replace_img_with_tikz(q: dict, options_tex: str = "", for_pdf_compilation: bool = False) -> str:
    content = q.get('content', '') or ''
    images = q.get('images', [])
    layout = q.get('layout_type', '') or ''
    q_type = q.get('question_type', '')
    
    if layout.startswith('immini') or layout == 'thm':
        img_matches = re.findall(r'(!\[.*?\]\((.*?)\))', content)
        if img_matches:
            image_codes = []
            for full_match, url in img_matches:
                code = replace_img_with_tikz_in_str(full_match, images, for_pdf_compilation)
                image_codes.append(code.strip())
            
            text_content = re.sub(r'!\[.*?\]\((.*?)\)', '', content).strip()
            
            if layout == 'immini_all' and options_tex:
                text_content += "\n    " + options_tex
                
            opt_arg = "[thm]"
            img_block = "\n".join(image_codes)
            
            result_immini = f"\\immini{opt_arg}{{\n    {text_content}\n}}{{\n    {img_block}\n}}"
            if layout != 'immini_all' and options_tex:
                result_immini += "\n    " + options_tex
            
            return result_immini
            
    # For normal images, wrap them in center with empty lines before and after
    def replacer(match):
        code = replace_img_with_tikz_in_str(match.group(0), images, for_pdf_compilation).strip()
        return f"\n\n\\begin{{center}}\n{code}\n\\end{{center}}\n\n"
        
    content = re.sub(r'!\[.*?\]\((.*?)\)', replacer, content)
    if options_tex:
        content += "\n    " + options_tex
    return content

def replace_img_with_tikz_in_str(content: str, images: list, for_pdf_compilation: bool = False) -> str:
    def replacer(match):
        url = match.group(1)
        abs_path, matched_image = resolve_image_file(url, images)
        scale_factor = 1
        for img in images:
            if img is matched_image:
                sc = img.get('img_scale')
                if sc is not None:
                    try: scale_factor = float(sc)
                    except: pass
                    
                if img.get('img_type') == 'tikz' and img.get('raw_code'):
                    if for_pdf_compilation:
                        pdf = abs_path.rsplit('.', 1)[0] + '.pdf'
                        if os.path.exists(pdf):
                            return f"\\includegraphics[scale={scale_factor:.2f}]{{{pdf}}}"
                    return "\n" + img.get('raw_code') + "\n"
        
        ext = os.path.splitext(abs_path)[1].lower()
        if ext in ['.emf', '.wmf']:
            if for_pdf_compilation:
                return ""
            else:
                return f"\\includegraphics[scale={scale_factor:.2f}]{{{abs_path}}}"
            
        if ext in ['.png', '.jpg', '.jpeg']:
            return f"\\includegraphics[width={scale_factor:.2f}\\textwidth]{{{abs_path}}}"
        else:
            return f"\\includegraphics[scale={scale_factor:.2f}]{{{abs_path}}}"
    return re.sub(r'!\[.*?\]\((.*?)\)', replacer, content)

def render_options_and_solution_latex(q: dict, include_solution: bool = True, for_pdf_compilation: bool = False, show_answers: bool = True) -> tuple[str, str]:
    q_type = q.get('question_type')
    options = q.get('options', [])
    solution = q.get('solution', '') or ''
    
    def replacer_sol(match):
        code = replace_img_with_tikz_in_str(match.group(0), q.get('images', []), for_pdf_compilation).strip()
        return f"\n\n\\begin{{center}}\n{code}\n\\end{{center}}\n\n"
        
    solution = re.sub(r'!\[.*?\]\((.*?)\)', replacer_sol, solution)
    
    options_lines = []
    
    if q_type == 'mc':
        options_lines.append("\\choice")
        for opt in options:
            mark = "\\True " if (show_answers and opt.get('is_correct')) else ""
            opt_content = replace_img_with_tikz_in_str(opt.get('content', ''), q.get('images', []), for_pdf_compilation)
            options_lines.append(f"{{{mark}{opt_content}}}")

    elif q_type == 'tf':
        options_lines.append("\\choiceTF[1]")
        for opt in options:
            mark = "\\True " if (show_answers and opt.get('is_correct')) else ""
            opt_content = replace_img_with_tikz_in_str(opt.get('content', ''), q.get('images', []), for_pdf_compilation)
            options_lines.append(f"{{{mark}{opt_content}}}")
            
        # Explanations for TF
        if any(opt.get('explaination') for opt in options):
            expl_lines = ["\\begin{itemchoice}"]
            for opt in options:
                expl = opt.get('explaination', '') or ''
                expl = replace_img_with_tikz_in_str(expl, q.get('images', []), for_pdf_compilation)
                expl_lines.append(f"\\itemch {expl}")
            expl_lines.append("\\end{itemchoice}")
            solution += "\n" + "\n".join(expl_lines)
            
    elif q_type == 'sa':
        correct_ans = options[0].get('content', '') if options else ''
        if not show_answers:
            correct_ans = ''
        options_lines.append(f"\\shortans{{{correct_ans}}}")
        
    solution_lines = []
    if include_solution:
        solution_lines.append(f"\\loigiai{{{solution}}}")
    return "\n".join(options_lines), "\n".join(solution_lines)

def get_raw_latex(contest: dict, questions: List[dict], include_header: bool = True, use_minipage: bool = True, exam_title: str = "", general_info: str = "", code: str = "000", department: str = "", exam_type: str = "", subject: str = "", duration: int = 50, include_solution: bool = True, for_pdf_compilation: bool = False, show_answers: bool = True, force_solcolor: bool = False) -> str:
    lines = []
    
    # Calculate section counts
    total_mc = 0; total_tf = 0; total_sa = 0; total_oe = 0
    cau_counter = 1
    for q in questions:
        if q.get('question_type') == 'mc': total_mc += 1
        elif q.get('question_type') == 'tf': total_tf += 1
        elif q.get('question_type') == 'sa': total_sa += 1
        elif q.get('question_type') == 'oe': total_oe += 1
    
    if include_header:
        # Default fallback
            
        extest_option = "solcolor" if (include_solution or force_solcolor) else "dethi"
        header_tex = f"""\\documentclass[12pt, a4paper]{{article}}
\\usepackage{{amsmath,amssymb,fancyhdr}}
\\usepackage[top=1.2cm, bottom=2cm, left=1.5cm, right=1.2cm]{{geometry}}
\\usepackage[{extest_option}]{{ex_test}}
\\usepackage[utf8]{{vietnam}} 
\\usepackage{{fontspec}}
\\setmainfont{{Times New Roman}}
\\usepackage{{unicode-math}}
\\setmathfont{{CambriaMath}}
\\setmathrm{{CambriaMath}}
\\setmathfont{{XITS Math}}[range={{cal,bfcal}}]
\\usepackage{{hyperref}}
\\hypersetup{{
    pdftitle={{}},
    hidelinks,
}}
\\usepackage{{tikz,tikz-3dplot,tkz-tab}}
\\usetikzlibrary{{arrows,calc,intersections,patterns,angles,shapes.geometric,arrows.meta,shapes.symbols, quotes, decorations.pathmorphing,backgrounds}}
\\usepackage{{fontawesome5}}
\\usepackage{{setspace}}
\\newcommand{{\\hoac}}[1]{{\\left[\\begin{{aligned}}#1\\end{{aligned}}\\right.}}
\\newcommand{{\\heva}}[1]{{\\left\\{{\\begin{{aligned}}#1\\end{{aligned}}\\right.}}
\\tikzset{{arrow style/.append style = {{>={{Stealth[length=8pt, width=6pt]}}}}}}
\\renewcommand{{\\headrulewidth}}{{0pt}}
\\renewcommand{{\\footrulewidth}}{{0pt}}
\\usepackage{{scrextend}}
\\pagestyle{{fancy}}
\\fancyhf{{}}
\\sloppy
\\usepackage{{xcolor}}
\\setlength{{\\fboxrule}}{{0.75pt}}
\\everymath{{\\displaystyle}}
\\usepackage{{enumitem}}
\\setlist{{noitemsep}}
\\setlist{{nosep}}
\\setlength{{\\parindent}}{{0pt}}
\\setlength{{\\multicolsep}}{{0pt}}
\\let\\oldfrac\\frac
\\renewcommand{{\\frac}}[2]{{%
    \\mathchoice
        {{\\oldfrac{{#1}}{{#2}}\\rule[-2ex]{{0pt}}{{0pt}}\\rule{{0pt}}{{3.5ex}}}} 
        {{\\oldfrac{{#1}}{{#2}}\\rule[-2ex]{{0pt}}{{0pt}}\\rule{{0pt}}{{3.5ex}}}}
        {{\\oldfrac{{#1}}{{#2}}}}
        {{\\oldfrac{{#1}}{{#2}}}}
}}
\\usepackage{{ifsym}}
\\renewenvironment{{center}}{{\\par\\centering}}{{\\par}}

\\begin{{document}}
\\begin{{center}}
    \\noindent\\setstretch{{1.2}}{{%
      %Trái
      \\begin{{minipage}}[t]{{6.25cm}}
      \\centering
      \\setstretch{{1.1}}
      \\textbf{{{department}}}\\\\
      \\vspace{{0.1cm}}
      $\\overline{{\\text{{{exam_type}}}}}$\\\\
      \\vspace{{0.1cm}}
      \\textit{{(Đề thi có 0\\pageref{{mylt}} trang)}}
      \\end{{minipage}}\\hfill%
      %Phải
      \\begin{{minipage}}[t]{{11.8cm}}
      \\centering
      \\setstretch{{1.1}}
      \\textbf{{{exam_title}}}\\\\
      \\textbf{{Môn thi: {subject}}}\\\\
      \\textit{{Thời gian \\underline{{làm bài: {duration} phút, không kể thời gian}} phát đề}}
      \\end{{minipage}}\\\\%
      %Họ tên
      \\begin{{minipage}}[b]{{11cm}}
      \\vspace{{12pt}}\\textbf{{Họ, tên thí sinh: }}{{\\small\\dotfill}}\\\\
      \\textbf{{Số báo danh: }}{{\\small\\dotfill}}
      \\end{{minipage}}\\hfill
      %Mã đề
      \\begin{{minipage}}[b]{{6.5cm}}
      \\flushright\\fbox{{\\bf \\hspace{{1cm}} Mã đề: {code} \\hspace{{1cm}}}}
      \\vspace{{0.25cm}}
      \\end{{minipage}}\\hfill\\\\
    }}
\\end{{center}}
\\rfoot{{Trang \\thepage/\\pageref{{mylt}} - Mã đề thi {code}}}
\\setstretch{{1.18}}
"""
        if general_info:
            gi_lines = general_info.strip().split('\n')
            gi_tex = '\n\n'.join(f"\\noindent\\textit{{{line.strip()}}}" for line in gi_lines if line.strip())
            header_tex += f"{gi_tex}\n\\vspace{{0.5cm}}\n"
        lines.append(header_tex)
    
    # Map questions by ID
    q_map = {q['id']: q for q in questions}
    
    # Process them in logical groups (single or stimulus)
    processed_ids = set()
    
    # Track section headers printed
    printed_mc = False
    printed_tf = False
    printed_sa = False
    printed_oe = False
    
    cau_counter = 1
    for q in questions:
        q_id = str(q.get('id', ''))
        if q_id in processed_ids:
            continue
            
        q_type = q.get('question_type')
        if q_type == 'mc' and not printed_mc:
            if for_pdf_compilation:
                lines.append(f"\\par\\addvspace{{5pt}}\\noindent\\textbf{{PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu {total_mc}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.}}\\par\n\\setcounter{{ex}}{{0}}")
            else:
                lines.append("% Phần I")
            printed_mc = True
            cau_counter = 1
        elif q_type == 'tf' and not printed_tf:
            if for_pdf_compilation:
                lines.append(f"\\par\\addvspace{{5pt}}\\noindent\\textbf{{PHẦN II. Câu trắc nghiệm đúng sai. Thí sinh trả lời từ câu 1 đến câu {total_tf}. Trong mỗi ý a), b), c), d) ở mỗi câu hỏi, thí sinh chọn đúng hoặc sai.}}\\par\n\\setcounter{{ex}}{{0}}")
            else:
                lines.append("% Phần II")
            printed_tf = True
            cau_counter = 1
        elif q_type == 'sa' and not printed_sa:
            if for_pdf_compilation:
                lines.append(f"\\par\\addvspace{{5pt}}\\noindent\\textbf{{PHẦN III. Câu trắc nghiệm trả lời ngắn. Thí sinh trả lời từ câu 1 đến câu {total_sa}.}}\\par\n\\setcounter{{ex}}{{0}}")
            else:
                lines.append("% Phần III")
            printed_sa = True
            cau_counter = 1
        elif q_type == 'oe' and not printed_oe:
            if for_pdf_compilation:
                lines.append(f"\\par\\addvspace{{5pt}}\\noindent\\textbf{{PHẦN IV. Câu tự luận. Thí sinh trả lời từ câu 1 đến câu {total_oe}.}}\\par\n\\setcounter{{ex}}{{0}}")
            else:
                lines.append("% Phần IV")
            printed_oe = True
            cau_counter = 1
            
        # Also handle stimulus type which can contain MC/TF/SA
        if q_type == 'st':
            children = [c for c in questions if c.get('parent_id') == q['id']]
            if children:
                child_type = children[0].get('question_type')
                if child_type == 'mc' and not printed_mc:
                    if for_pdf_compilation:
                        lines.append(f"\\par\\addvspace{{5pt}}\\noindent\\textbf{{PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu {total_mc}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.}}\\par\n\\setcounter{{ex}}{{0}}")
                    else:
                        lines.append("% Phần I")
                    printed_mc = True
                    cau_counter = 1
                elif child_type == 'tf' and not printed_tf:
                    if for_pdf_compilation:
                        lines.append(f"\\par\\addvspace{{5pt}}\\noindent\\textbf{{PHẦN II. Câu trắc nghiệm đúng sai. Thí sinh trả lời từ câu 1 đến câu {total_tf}. Trong mỗi ý a), b), c), d) ở mỗi câu hỏi, thí sinh chọn đúng hoặc sai.}}\\par\n\\setcounter{{ex}}{{0}}")
                    else:
                        lines.append("% Phần II")
                    printed_tf = True
                    cau_counter = 1
                elif child_type == 'sa' and not printed_sa:
                    if for_pdf_compilation:
                        lines.append(f"\\par\\addvspace{{5pt}}\\noindent\\textbf{{PHẦN III. Câu trắc nghiệm trả lời ngắn. Thí sinh trả lời từ câu 1 đến câu {total_sa}.}}\\par\n\\setcounter{{ex}}{{0}}")
                    else:
                        lines.append("% Phần III")
                    printed_sa = True
                    cau_counter = 1
                elif child_type == 'oe' and not printed_oe:
                    if for_pdf_compilation:
                        lines.append(f"\\par\\addvspace{{5pt}}\\noindent\\textbf{{PHẦN IV. Câu tự luận. Thí sinh trả lời từ câu 1 đến câu {total_oe}.}}\\par\n\\setcounter{{ex}}{{0}}")
                    else:
                        lines.append("% Phần IV")
                    printed_oe = True
                    cau_counter = 1

            if for_pdf_compilation:
                lines.append("\\par\\addvspace{8pt}")
                if use_minipage: lines.append("\\noindent\\begin{minipage}[t]{\\linewidth}")
            if not for_pdf_compilation:
                lines.append(f"% Câu {cau_counter}")
            lines.append("\\begin{ex}")
            content = replace_img_with_tikz(q, "", for_pdf_compilation)
            lines.append(f"\\sochc{{{len(children)}}}{{{content}}}")
            
            for child in children:
                lines.append("    \\begin{chc}")
                options_tex, solution_tex = render_options_and_solution_latex(child, include_solution, for_pdf_compilation, show_answers)
                lines.append("        " + replace_img_with_tikz(child, options_tex, for_pdf_compilation))
                if solution_tex:
                    lines.append("        " + solution_tex)
                lines.append("    \\end{chc}")
                child_id = str(child.get('id', ''))
                processed_ids.add(child_id)
                
            lines.append("\\end{ex}\n")
            if for_pdf_compilation:
                if use_minipage: lines.append("\\end{minipage}")
                lines.append("\\par\\addvspace{2pt}\n")
            processed_ids.add(str(q.get('id', '')))
            if q.get('question_type') == 'st':
                cau_counter += len([c for c in questions if c.get('parent_id') == q['id']])
            else:
                cau_counter += 1
            
        elif not q.get('parent_id'): # single question
            if for_pdf_compilation:
                lines.append("\\par\\addvspace{8pt}")
                if use_minipage: lines.append("\\noindent\\begin{minipage}[t]{\\linewidth}")
            if not for_pdf_compilation:
                lines.append(f"% Câu {cau_counter}")
            lines.append("\\begin{ex}")
            options_tex, solution_tex = render_options_and_solution_latex(q, include_solution, for_pdf_compilation, show_answers)
            lines.append("    " + replace_img_with_tikz(q, options_tex, for_pdf_compilation))
            if solution_tex:
                lines.append("    " + solution_tex)
            lines.append("\\end{ex}\n")
            if for_pdf_compilation:
                if use_minipage: lines.append("\\end{minipage}")
                lines.append("\\par\\addvspace{2pt}\n")
            processed_ids.add(str(q.get('id', '')))
            if q.get('question_type') == 'st':
                cau_counter += len([c for c in questions if c.get('parent_id') == q['id']])
            else:
                cau_counter += 1

    if include_header:
        lines.append("\\centerline{\\textbf{-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt- HẾT -\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-\\kern0pt-}}")
        lines.append("\\label{mylt}")
        lines.append("\\end{document}")
    raw = "\n".join(lines)
    from .common import balance_latex_braces
    return balance_latex_braces(raw)


def _render_answer_key_latex(contest: dict, questions: List[dict]) -> str:
    """Dựng BẢNG ĐÁP ÁN (mã câu -> đáp án đúng) bằng LaTeX cho đề gốc PDF."""
    mc = [q for q in questions if q.get('question_type') == 'mc']
    tf = [q for q in questions if q.get('question_type') == 'tf']
    sa = [q for q in questions if q.get('question_type') == 'sa']

    def mc_letter(q: dict) -> str:
        for i, o in enumerate(q.get('options', [])):
            if o.get('is_correct'):
                return chr(65 + i)
        return ''

    out: List[str] = []

    if mc:
        out.append("\\par\\addvspace{5pt}\\noindent\\textbf{PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.}\\par\\addvspace{4pt}")
        items = [(i + 1, mc_letter(q)) for i, q in enumerate(mc)]
        per = 10
        for s in range(0, len(items), per):
            chunk = items[s:s + per]
            n = len(chunk)
            out.append("\\noindent\\begin{tabular}{|" + "c|" * n + "}\\hline")
            out.append(" & ".join(f"\\textbf{{{c[0]}}}" for c in chunk) + " \\\\\\hline")
            out.append(" & ".join(f"{c[1]}" for c in chunk) + " \\\\\\hline")
            out.append("\\end{tabular}\\par\\addvspace{6pt}")

    if tf:
        out.append("\\par\\addvspace{5pt}\\noindent\\textbf{PHẦN II. Câu trắc nghiệm đúng sai.}\\par\\addvspace{4pt}")
        for i, q in enumerate(tf):
            marks = []
            for j, o in enumerate(q.get('options', [])):
                letter = chr(97 + j)
                ds = "\\textbf{Đ}" if o.get('is_correct') else "S"
                marks.append(f"{letter}) {ds}")
            out.append(f"\\noindent Câu {i + 1}:\\quad " + "\\quad ".join(marks) + "\\par")
        out.append("\\addvspace{6pt}")

    if sa:
        out.append("\\par\\addvspace{5pt}\\noindent\\textbf{PHẦN III. Câu trắc nghiệm trả lời ngắn.}\\par\\addvspace{4pt}")
        items = []
        for i, q in enumerate(sa):
            ans = q.get('options', [{}])[0].get('content', '') if q.get('options') else ''
            ans = str(ans).replace('\n', ' ').strip()
            items.append((i + 1, ans))
        per = 8
        for s in range(0, len(items), per):
            chunk = items[s:s + per]
            n = len(chunk)
            out.append("\\noindent\\begin{tabular}{|c|" + "c|" * n + "}\\hline")
            out.append("\\textbf{Câu} & " + " & ".join(f"\\textbf{{{c[0]}}}" for c in chunk) + " \\\\\\hline")
            out.append("\\textbf{Đáp án} & " + " & ".join(f"{c[1]}" for c in chunk) + " \\\\\\hline")
            out.append("\\end{tabular}\\par\\addvspace{6pt}")

    return "\n".join(out)


def get_original_exam_latex(contest: dict, questions: List[dict], exam_title: str = "", general_info: str = "", code: str = "000", department: str = "", exam_type: str = "", subject: str = "", duration: int = 50, for_pdf_compilation: bool = True, use_minipage: bool = True) -> str:
    """Đề gốc = 3 mục trong 1 file: (1) ĐỀ sạch, (2) BẢNG ĐÁP ÁN, (3) LỜI GIẢI CHI TIẾT.

    Cả tài liệu chạy ở chế độ solcolor (force_solcolor) để mục 3 hiện đáp án tô màu
    + lời giải; mục 1 dựng với show_answers=False/include_solution=False nên đề sạch.
    """
    # Mục 1: ĐỀ sạch — kèm preamble + header + dòng HẾT + \label{mylt}
    de = get_raw_latex(
        contest, questions, include_header=True, use_minipage=use_minipage,
        exam_title=exam_title, general_info=general_info, code=code,
        department=department, exam_type=exam_type, subject=subject, duration=duration,
        include_solution=False, show_answers=False, force_solcolor=True,
        for_pdf_compilation=for_pdf_compilation,
    )
    head = de.rpartition("\\end{document}")[0]  # tất cả trước \end{document}

    # Mục 2: BẢNG ĐÁP ÁN
    key = _render_answer_key_latex(contest, questions)

    # Mục 3: ĐỀ + LỜI GIẢI CHI TIẾT
    sol = get_raw_latex(
        contest, questions, include_header=False, use_minipage=use_minipage,
        exam_title=exam_title, general_info=general_info, code=code,
        department=department, exam_type=exam_type, subject=subject, duration=duration,
        include_solution=True, show_answers=True, force_solcolor=True,
        for_pdf_compilation=for_pdf_compilation,
    )

    doc = (
        head
        + "\n\\clearpage\\rfoot{Mã đề thi " + code + "}%\n"
        + "{\\centering\\bfseries\\large BẢNG ĐÁP ÁN\\par}\\addvspace{6pt}\n"
        + key
        + "\n\\clearpage\n"
        + "{\\centering\\bfseries\\large LỜI GIẢI CHI TIẾT\\par}\\addvspace{6pt}\n"
        + sol
        + "\n\\end{document}\n"
    )
    from .common import balance_latex_braces
    return balance_latex_braces(doc)


def get_combined_latex(contest: dict, codes_data: list, exam_title: str = "", general_info: str = "", department: str = "", exam_type: str = "", subject: str = "", duration: int = 50, for_pdf_compilation: bool = True, use_minipage: bool = True) -> str:
    """Gộp nhiều mã đề (đề đảo) vào MỘT document để compile 1 lần.

    codes_data: list các tuple (code, questions). Mỗi mã là một block riêng:
    sang trang mới, reset số trang về 1, và dùng nhãn trang riêng (mylt<idx>) để
    header/footer hiện đúng số trang của từng mã. Tái dùng get_raw_latex để giữ
    nguyên cách trình bày, chỉ ghép preamble 1 lần + nhiều block thân đề.
    """
    preamble = None
    blocks = []
    for idx, (code, questions) in enumerate(codes_data):
        full = get_raw_latex(
            contest, questions,
            include_header=True,
            use_minipage=use_minipage,
            exam_title=exam_title,
            general_info=general_info,
            code=code,
            department=department,
            exam_type=exam_type,
            subject=subject,
            duration=duration,
            include_solution=False,
            for_pdf_compilation=for_pdf_compilation,
        )
        pre, _, after = full.partition("\\begin{document}")
        body = after.rpartition("\\end{document}")[0]
        if preamble is None:
            preamble = pre
        # Nhãn trang riêng cho từng mã (header/footer/\label dùng chung tên 'mylt')
        body = body.replace("mylt", f"mylt{idx}")
        # Mỗi mã: sang trang mới + reset số trang về 1 -> đếm trang đúng theo từng mã
        blocks.append("\\clearpage\\setcounter{page}{1}%\n" + body)

    combined = (preamble or "") + "\\begin{document}\n" + "\n".join(blocks) + "\n\\end{document}\n"
    return combined


def get_measure_latex(contest: dict, questions: List[dict], exam_title: str = "", general_info: str = "", department: str = "", exam_type: str = "", subject: str = "", duration: int = 50) -> str:
    """Dựng document đo CHIỀU CAO THẬT từng câu: đóng mỗi câu vào \\vbox rồi ghi
    ht+dp ra file heights.txt (dạng '<id>=<pt>'). Compile 1 lượt là có số đo.
    """
    from .common import group_units
    # Preamble (dethi) lấy từ một bản render đầy đủ
    sample = get_raw_latex(
        contest, questions, include_header=True, use_minipage=False,
        exam_title=exam_title, general_info=general_info, code="000",
        department=department, exam_type=exam_type, subject=subject,
        duration=duration, include_solution=False, for_pdf_compilation=True,
    )
    preamble = sample.split("\\begin{document}")[0]

    lines = [preamble, "\\begin{document}", "\\newwrite\\hgtfile", "\\immediate\\openout\\hgtfile=heights.txt"]

    # Đo chiều cao TRANG thật + HEADER đề + từng tiêu đề PHẦN để model khớp thực tế.
    lines.append("\\immediate\\write\\hgtfile{__PAGE__=\\the\\textheight}")
    after_doc = sample.split("\\begin{document}", 1)[1] if "\\begin{document}" in sample else ""
    mfirst = re.search(r'\\par\\addvspace\{5pt\}\\noindent\\textbf\{PHẦN', after_doc)
    hdr_block = after_doc[:mfirst.start()] if mfirst else ""
    if hdr_block.strip():
        lines.append("\\setbox0=\\vbox{\\hsize=\\linewidth\\relax " + hdr_block + "}")
        lines.append("\\immediate\\write\\hgtfile{__EXAMHDR__=\\the\\dimexpr\\ht0+\\dp0\\relax}")
    for hdr in re.findall(r'\\noindent\\textbf\{(PHẦN[^}]*)\}', sample):
        if 'nhiều phương án' in hdr:
            t = 'mc'
        elif 'đúng sai' in hdr:
            t = 'tf'
        elif 'trả lời ngắn' in hdr:
            t = 'sa'
        elif 'tự luận' in hdr:
            t = 'oe'
        else:
            continue
        lines.append("\\setbox0=\\vbox{\\hsize=\\linewidth\\relax \\noindent\\textbf{" + hdr + "}\\par}")
        lines.append("\\immediate\\write\\hgtfile{__PART_" + t + "__=\\the\\dimexpr\\ht0+\\dp0\\relax}")

    for unit in group_units(questions):
        top_id = unit[0].get('id')
        body = get_raw_latex(
            contest, unit, include_header=False, use_minipage=False,
            include_solution=False, for_pdf_compilation=True,
        )
        s = body.find("\\begin{ex}")
        e = body.rfind("\\end{ex}")
        block = body[s:e + len("\\end{ex}")] if (s >= 0 and e >= 0) else body
        lines.append("\\setbox0=\\vbox{\\hsize=\\linewidth\\relax " + block + "}")
        lines.append("\\immediate\\write\\hgtfile{" + str(top_id) + "=\\the\\dimexpr\\ht0+\\dp0\\relax}")
    lines.append("\\immediate\\closeout\\hgtfile")
    lines.append("\\end{document}\n")
    return "\n".join(lines)


import zipfile

def export_latex(contest: dict, questions: list, code: str, exam_title: str, department: str, exam_type: str, subject: str, duration: int, general_info: str, include_solution: bool, zf: zipfile.ZipFile):
    raw_tex = get_raw_latex(
        contest, questions, 
        include_header=False, 
        use_minipage=True if code != "000" else False, 
        exam_title=exam_title, 
        general_info=general_info, 
        code=code, 
        department=department, 
        exam_type=exam_type, 
        subject=subject, 
        duration=duration, 
        include_solution=include_solution
    )
    
    import re
    import os
    
    def repl(m):
        full_match = m.group(0)
        options = m.group(1) or ""
        img_path = m.group(2)
        
        if os.path.exists(img_path):
            basename = os.path.basename(img_path)
            arcname = f"figure/{basename}"
            if arcname not in zf.namelist():
                zf.write(img_path, arcname)
            return f"\\includegraphics{options}{{figure/{basename}}}"
        return full_match
        
    raw_tex = re.sub(r'\\includegraphics(\[.*?\])?\{(.*?)\}', repl, raw_tex)
    
    zf.writestr(f"{code}.tex", raw_tex)
