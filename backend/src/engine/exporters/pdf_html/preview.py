"""Shared HTML document renderer for both preview and HTML-to-PDF export."""
import os
import re
import html as html_module
import base64
import urllib.parse
from typing import List, Dict, Any
from ..common import resolve_image_file

def _img_to_data_uri(path: str) -> str:
    ext = os.path.splitext(path)[1].lower().lstrip('.')
    mime_map = {
        'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
        'svg': 'image/svg+xml', 'gif': 'image/gif', 'webp': 'image/webp',
    }
    mime = mime_map.get(ext, 'image/png')
    try:
        with open(path, 'rb') as f:
            data = base64.b64encode(f.read()).decode()
        return f'data:{mime};base64,{data}'
    except Exception:
        return ''

def _resolve_image(url: str, images: list) -> tuple[str, float, int, int]:
    url = urllib.parse.unquote(url).split('?')[0]
    scale = 1.0
    local_path, matched_image = resolve_image_file(url, images)
    if matched_image and matched_image.get('img_scale') is not None:
        try:
            scale = float(matched_image['img_scale'])
        except (ValueError, TypeError):
            pass

    if local_path.lower().endswith('.svg'):
        png = local_path.replace('.svg', '.png')
        if os.path.exists(png):
            local_path = png

    width, height = 0, 0
    if os.path.exists(local_path):
        data_uri = _img_to_data_uri(local_path)
        if local_path.lower().endswith('.svg'):
            try:
                import re
                with open(local_path, 'r', encoding='utf-8') as f:
                    svg_content = f.read(2048)
                w_match = re.search(r'<svg[^>]*\swidth="([\d.]+)[a-zA-Z]*"', svg_content)
                h_match = re.search(r'<svg[^>]*\sheight="([\d.]+)[a-zA-Z]*"', svg_content)
                if w_match and h_match:
                    width = int(float(w_match.group(1)) * 1.333)
                    height = int(float(h_match.group(1)) * 1.333)
            except Exception:
                pass
        else:
            try:
                from PIL import Image
                with Image.open(local_path) as im:
                    width, height = im.size
                    dpi = im.info.get('dpi', (96, 96))
                    xdpi = dpi[0] if isinstance(dpi, tuple) else dpi
                    ydpi = dpi[1] if isinstance(dpi, tuple) else dpi
                    if xdpi > 0 and ydpi > 0:
                        width = int((width / xdpi) * 96)
                        height = int((height / ydpi) * 96)
            except Exception:
                pass
    else:
        data_uri = ''

    return data_uri, scale, width, height

def _fix_vietnamese_mathrm(latex: str) -> str:
    def repl(m):
        body = m.group(1)
        return '\\text{' + body + '}' if any(ord(c) > 127 for c in body) else m.group(0)

    return re.sub(r'\\mathrm\{([^{}]*)\}', repl, latex)

def _convert_tabular_to_html(text: str) -> str:
    """Convert basic LaTeX tabular/center blocks while math is protected."""
    table_re = re.compile(
        r'(?:\\begin\{center\}\s*)?\\begin\{(tabular|tabularx|longtable)\}'
        r'(?:\[[^\]]*\])?(?:\{[^{}]*\})*([\s\S]*?)\\end\{\1\}'
        r'(?:\s*\\end\{center\})?'
    )

    def repl(match):
        content = match.group(2).strip()
        raw_rows = re.split(r'\\\\', content)
        if len(raw_rows) == 1 and content.count(r'\hline') > 1:
            raw_rows = re.split(r'\\hline', content)
        rows = []
        for raw_row in raw_rows:
            raw_row = re.sub(r'\\hline|\\(?:cline|cmidrule)\{[^{}]*\}', '', raw_row).strip()
            if not raw_row:
                continue
            cells_html = []
            for cell in re.split(r'(?<!\\)&', raw_row):
                cell = cell.strip().replace(r'\&', '&')
                colspan = 1
                multi = re.match(r'^\\multicolumn\{(\d+)\}\{[^{}]*\}\{([\s\S]*)\}$', cell)
                if multi:
                    colspan, cell = int(multi.group(1)), multi.group(2)
                cells_html.append(f'<td colspan="{colspan}">{cell}</td>')
            rows.append('<tr>' + ''.join(cells_html) + '</tr>')
        return '<div class="latex-table-wrap"><table class="latex-table"><tbody>' + ''.join(rows) + '</tbody></table></div>'

    return table_re.sub(repl, text)

def _latex_to_html(text: str, images: list = None) -> str:
    if not text:
        return ""
    images = images or []

    math_blocks: list[str] = []
    math_inline: list[bool] = []

    def _save(m, inline: bool):
        idx = len(math_blocks)
        math_blocks.append(m.group(0))
        math_inline.append(inline)
        return f"\x00MATH{idx}\x00"

    text = re.sub(r'\$\$[\s\S]*?\$\$', lambda m: _save(m, False), text)
    text = re.sub(r'\\\[[\s\S]*?\\\]', lambda m: _save(m, False), text)
    text = re.sub(r'\$([^$]+?)\$', lambda m: _save(m, True), text)
    text = re.sub(r'\\\(.*?\\\)', lambda m: _save(m, True), text)

    # Must run before generic \\ -> <br>, otherwise table row separators are lost.
    text = _convert_tabular_to_html(text)

    def _replace_img(m):
        data_uri, scale, w, h = _resolve_image(m.group(1), images)
        if data_uri:
            img_w = int(w * scale) if w > 0 else int(450 * scale)
            img_w = max(50, img_w)
            return f'<img src="{data_uri}" style="width:{img_w}px; max-width: 100%; height:auto; display:block; margin:4px auto;" />'
        return ''

    text = re.sub(r'!\[.*?\]\((.*?)\)', _replace_img, text)

    text = re.sub(r'\\\\[ \t\r]*\n?', '<br>', text)
    text = re.sub(r'\\newline[ \t\r]*\n?', '<br>', text)

    text = re.sub(r'\\textbf\{([^}]*)\}', r'<strong>\1</strong>', text)
    text = re.sub(r'\\textit\{([^}]*)\}', r'<em>\1</em>', text)
    text = re.sub(r'\\underline\{([^}]*)\}', r'<u>\1</u>', text)

    text = re.sub(r'<br\s*/?>', '<br>', text)
    text = re.sub(r'\n[ \t\r]*\n(?:[ \t\r]*\n)*', '</p><p>', text)
    text = text.replace('\n', '<br>')

    for i in range(len(math_blocks) - 1, -1, -1):
        block = math_blocks[i]
        is_inline = math_inline[i]
        placeholder = f"\x00MATH{i}\x00"

        if block.startswith('$$') and block.endswith('$$'):
            latex = block[2:-2].strip()
            display = True
        elif block.startswith('\\[') and block.endswith('\\]'):
            latex = block[2:-2].strip()
            display = True
        elif block.startswith('\\(') and block.endswith('\\)'):
            latex = block[2:-2].strip()
            display = False
        elif block.startswith('$') and block.endswith('$'):
            latex = block[1:-1].strip()
            display = False
        else:
            latex = block.strip()
            display = True

        latex = _fix_vietnamese_mathrm(latex)

        if display:
            # Remove <br> around display math to prevent ugly gaps
            text = re.sub(r'<br\s*/?>\s*' + re.escape(placeholder), placeholder, text)
            text = re.sub(re.escape(placeholder) + r'\s*<br\s*/?>', placeholder, text)
            replacement = f'<div class="math display">{latex}</div>'
        else:
            replacement = f'<span class="math">{latex}</span>'

        text = text.replace(placeholder, replacement)

    return text

def _extract_wrap_images(q: dict) -> tuple[str, str]:
    content = q.get('content', '') or ''
    images = q.get('images', [])

    img_matches = re.findall(r'(!\[.*?\]\((.*?)\))', content)
    img_parts = []
    
    wrapper_width = 0
    for _, url in img_matches:
        data_uri, scale, w, h = _resolve_image(url, images)
        if data_uri:
            img_w = int(w * scale) if w > 0 else int(450 * scale)
            wrapper_width = max(wrapper_width, img_w)
            img_parts.append(f'<img src="{data_uri}" style="width: {img_w}px; max-width: 100%; height: auto; margin-bottom: 5px; display: block;" />')

    text_content = re.sub(r'!\[.*?\]\((.*?)\)', '', content).strip()
    text_html = _latex_to_html(text_content, images)

    if wrapper_width == 0:
        wrapper_width = 150

    img_wrapper = f'<div class="immini-img" style="float: right; margin-left: 15px; margin-bottom: 5px; text-align: center; width: {wrapper_width}px; max-width: 55%;">{"".join(img_parts)}</div>'
    return text_html, img_wrapper

def _render_mc_options(options: list, images: list, layout: str, show_answers: bool) -> str:
    opts = []
    max_len = 0
    has_image = False

    for idx, opt in enumerate(options):
        label = chr(65 + idx)
        raw = opt.get('content', '') or ''
        opt_html = _latex_to_html(raw, images)
        is_correct = opt.get('is_correct', False) and show_answers

        plain = re.sub(r'<[^>]+>', '', re.sub(r'\$[^$]*\$', 'xxx', raw))
        max_len = max(max_len, len(plain.strip()))
        if '![' in raw:
            has_image = True

        cls = "option correct" if is_correct else "option"
        opts.append(f'<span class="{cls}"><strong>{label}.</strong> {opt_html}</span>')

    if layout == '4':
        cols = 4
    elif layout == '2':
        cols = 2
    elif layout == '1':
        cols = 1
    else:
        cols = 'auto'

    return f'<div class="options cols-{cols}">{"".join(opts)}</div>'

def _render_tf_options(options: list, images: list, show_answers: bool) -> str:
    parts = ['<div class="tf-options">']
    for idx, opt in enumerate(options):
        label = chr(97 + idx)
        opt_html = _latex_to_html(opt.get('content', ''), images)
        is_correct = opt.get('is_correct', False)
        cls = "tf-item correct" if (is_correct and show_answers) else "tf-item"
        parts.append(f'<div class="{cls}"><strong>{label})</strong> {opt_html}</div>')
    parts.append('</div>')
    return '\n'.join(parts)

def _render_single_question(q: dict, counter: int, include_solution: bool, show_answers: bool) -> str:
    q_type = q.get('question_type')
    content = q.get('content', '') or ''
    solution = q.get('solution', '') or ''
    options = q.get('options', [])
    images = q.get('images', [])
    layout = q.get('layout_type', '') or ''

    parts = []
    has_immini = layout and layout.startswith('immini')

    if has_immini:
        text_html, img_html = _extract_wrap_images(q)
        parts.append(f'<div class="question" id="q-{q.get("id", counter)}">')
        parts.append('<div class="question-content immini">')
        parts.append(img_html)
        parts.append(f'<div class="immini-text"><p><strong>Câu {counter}:</strong> {text_html}</p>')
    else:
        content_html = _latex_to_html(content, images)
        parts.append(f'<div class="question" id="q-{q.get("id", counter)}">')
        parts.append(f'<div class="question-content"><p><strong>Câu {counter}:</strong> {content_html}</p>')

    if q_type == 'mc':
        parts.append(_render_mc_options(options, images, layout, show_answers))
    elif q_type == 'tf':
        parts.append(_render_tf_options(options, images, show_answers))
    elif q_type == 'sa':
        if show_answers and options and not include_solution:
            ans = _latex_to_html(options[0].get('content', ''), images)
            parts.append(f'<div class="short-answer">Trả lời: <span class="answer-box">{ans}</span></div>')

    if has_immini:
        parts.append('</div>')

    parts.append('</div>')

    if include_solution:
        has_sol = bool(solution.strip())
        extra_html = ""
        
        if q_type == 'mc' and options:
            correct_labels = [chr(65 + i) for i, opt in enumerate(options) if opt.get('is_correct')]
            if correct_labels:
                extra_html = f'<p style="margin-top: 4px;"><strong>Chọn {", ".join(correct_labels)}</strong></p>'
                
        elif q_type == 'tf' and options:
            tf_parts = []
            for idx, opt in enumerate(options):
                label = chr(97 + idx)
                tf_status = "Đúng" if opt.get('is_correct') else "Sai"
                explain = _latex_to_html(opt.get('explaination', '') or '', images)
                tf_parts.append(f'<p style="margin-top: 2px;"><strong>{label}) {tf_status}.</strong> {explain}</p>')
            if tf_parts:
                extra_html = "".join(tf_parts)
                
        elif q_type == 'sa' and options:
            ans = _latex_to_html(options[0].get('content', '') or '', images)
            extra_html = f'<p style="margin-bottom: 4px;"><strong>Trả lời ngắn:</strong> {ans}</p>'

        if has_sol or extra_html:
            sol_html = _latex_to_html(solution, images) if has_sol else ""
            sol_body = f"<p>{sol_html}</p>" if has_sol else ""
            
            if q_type == 'sa':
                content = f"{extra_html}{sol_body}"
            else:
                content = f"{sol_body}{extra_html}"
                
            parts.append(f'<div class="solution"><p class="solution-header">Lời giải</p>{content}</div>')

    parts.append('</div>')
    return '\n'.join(parts)


def _render_questions_body(questions: List[dict], section_labels: dict,
                           include_solution: bool, show_answers: bool) -> str:
    """Render only the question area so the same layout can be reused in the
    clean exam and in the detailed-solution section."""
    body_html = []
    printed = {k: False for k in section_labels}
    q_counter = 1
    processed_ids = set()

    for q in questions:
        q_id = str(q.get('id', ''))
        if q_id in processed_ids:
            continue

        q_type = q.get('question_type')
        layout = q.get('layout_type', '') or ''
        eff_type = q_type
        if q_type == 'st':
            children = [c for c in questions if c.get('parent_id') == q['id']]
            if children:
                eff_type = children[0].get('question_type', 'mc')

        if eff_type in printed and not printed[eff_type]:
            body_html.append(f'<div class="section-header"><strong>{section_labels[eff_type]}</strong></div>')
            printed[eff_type] = True
            q_counter = 1

        if q_type == 'st':
            children = [c for c in questions if c.get('parent_id') == q['id']]
            has_immini = layout and layout.startswith('immini')
            if children:
                prefix_text = f"Sử dụng dữ kiện sau để trả lời từ Câu {q_counter} đến Câu {q_counter + len(children) - 1}:"
            else:
                prefix_text = "Sử dụng dữ kiện sau:"

            body_html.append(f'<div class="question stimulus" id="q-{q_id}" style="margin-bottom: 5px;">')
            body_html.append(f'<div class="stimulus-prefix" style="margin-bottom: 5px;"><p><strong><em>{prefix_text}</em></strong></p></div>')
            if has_immini:
                text_html, img_html = _extract_wrap_images(q)
                body_html.append('<div class="question-content immini">')
                body_html.append(img_html)
                body_html.append(f'<div class="immini-text"><p>{text_html}</p></div></div>')
            else:
                content_html = _latex_to_html(q.get('content', ''), q.get('images', []))
                body_html.append(f'<div class="question-content"><p>{content_html}</p></div>')
            body_html.append('</div>')

            for child in children:
                body_html.append(_render_single_question(child, q_counter, include_solution, show_answers))
                processed_ids.add(str(child.get('id', '')))
                q_counter += 1
            processed_ids.add(q_id)
        elif not q.get('parent_id'):
            body_html.append(_render_single_question(q, q_counter, include_solution, show_answers))
            processed_ids.add(q_id)
            q_counter += 1

    return '\n'.join(body_html)


def _render_answer_key_html(contest: dict, questions: List[dict]) -> str:
    """Render the grading tables with the same structure as the Word export."""
    import json

    sections = []
    mc = [q for q in questions if q.get('question_type') == 'mc']
    tf = [q for q in questions if q.get('question_type') == 'tf']
    sa = [q for q in questions if q.get('question_type') == 'sa']
    oe = [q for q in questions if q.get('question_type') == 'oe']

    scoring = contest.get('scoring_config') if isinstance(contest, dict) else {}
    if isinstance(scoring, str):
        try:
            scoring = json.loads(scoring)
        except Exception:
            scoring = {}
    if not isinstance(scoring, dict):
        scoring = {}
    weights = {
        'mc': float(scoring.get('mc', 0.25) or 0.25),
        'tf': float(scoring.get('tf', 1.0) or 1.0),
        'sa': float(scoring.get('sa', 0.5) or 0.5),
        'oe': float(scoring.get('oe', 1.0) or 1.0),
    }

    def fmt(value: float) -> str:
        result = f'{value:.2f}'
        if result.endswith('0'):
            result = result[:-1]
        return result.replace('.', ',')

    def table(rows, cls=''):
        return '<div class="answer-table-wrap"><table class="answer-table"><tbody>' + ''.join(
            '<tr>' + ''.join(f'<td>{cell}</td>' for cell in row) + '</tr>' for row in rows
        ) + f'</tbody></table></div>'

    if mc:
        sections.append(f'<h3>PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn: <span>Mỗi câu trả lời đúng thí sinh được {fmt(weights["mc"])} điểm.</span></h3>')
        rows = []
        for start in range(0, len(mc), 10):
            chunk = mc[start:start + 10]
            answers = []
            for q in chunk:
                answers.append(next((chr(65 + i) for i, o in enumerate(q.get('options', [])) if o.get('is_correct')), ''))
            padding = [''] * (10 - len(chunk))
            rows.append([str(start + i + 1) for i in range(len(chunk))] + padding)
            rows.append(answers + padding)
        sections.append(table(rows))

    if tf:
        sections.append('<h3>PHẦN II. Câu trắc nghiệm đúng sai.</h3>')
        sections.append(f'''<div class="tf-scoring-notes">
            <p>- Thí sinh chỉ lựa chọn chính xác 01 ý trong 1 câu hỏi được {fmt(0.1 * weights['tf'])} điểm.</p>
            <p>- Thí sinh chỉ lựa chọn chính xác 02 ý trong 1 câu hỏi được {fmt(0.25 * weights['tf'])} điểm.</p>
            <p>- Thí sinh chỉ lựa chọn chính xác 03 ý trong 1 câu hỏi được {fmt(0.5 * weights['tf'])} điểm.</p>
            <p>- Thí sinh lựa chọn chính xác cả 04 ý trong 1 câu hỏi được {fmt(weights['tf'])} điểm.</p>
        </div>''')
        rows_html = ['<tr><td>Câu</td><td>Lệnh hỏi</td><td>Đáp án</td><td>Câu</td><td>Lệnh hỏi</td><td>Đáp án</td></tr>']
        half = (len(tf) + 1) // 2
        for left_index in range(half):
            pair = [(left_index, tf[left_index])]
            right_index = left_index + half
            pair.append((right_index, tf[right_index]) if right_index < len(tf) else (None, None))
            for option_index in range(4):
                cells = []
                for q_index, q in pair:
                    if option_index == 0:
                        cells.append(f'<td rowspan="4">{q_index + 1 if q_index is not None else ""}</td>')
                    options = q.get('options', []) if q else []
                    option = options[option_index] if option_index < len(options) else None
                    cells.append(f'<td>{chr(97 + option_index)})</td>')
                    cells.append(f'<td>{"Đúng" if option and option.get("is_correct") else "Sai" if option else ""}</td>')
                rows_html.append('<tr>' + ''.join(cells) + '</tr>')
        sections.append('<div class="answer-table-wrap"><table class="answer-table tf-answer-table"><tbody>' + ''.join(rows_html) + '</tbody></table></div>')

    if sa:
        sections.append(f'<h3>PHẦN III. Câu trắc nghiệm trả lời ngắn: <span>Mỗi câu trả lời đúng thí sinh được {fmt(weights["sa"])} điểm.</span></h3>')
        ncol = min(10, len(sa))
        rows = []
        for start in range(0, len(sa), ncol):
            chunk = sa[start:start + ncol]
            nums = [f'<strong>{start + i + 1}</strong>' for i in range(len(chunk))]
            answers = [_latex_to_html(str(q.get('options', [{}])[0].get('content', '')),
                                      q.get('images', [])) if q.get('options') else '' for q in chunk]
            padding = [''] * (ncol - len(chunk))
            rows.append(['Câu'] + nums + padding)
            rows.append(['Đáp án'] + answers + padding)
        sections.append(table(rows))

    if oe:
        sections.append(f'<h3>PHẦN IV. Câu tự luận: <span>{fmt(len(oe) * weights["oe"])} điểm.</span></h3>')

    return '\n'.join(sections) or '<p>Đề chưa có đáp án để hiển thị.</p>'

def render_exam_preview_html(
    contest: dict,
    questions: List[dict],
    exam_title: str = "",
    department: str = "",
    exam_type: str = "",
    subject: str = "",
    duration: int = 50,
    general_info: str = "",
    code: str = "000",
    include_solution: bool = True,
    show_answers: bool = True,
    font_family: str = "'Times New Roman', 'Tinos', serif",
    math_font: str = "",
    for_export: bool = False,
    measure: bool = False
) -> str:
    total_mc = sum(1 for q in questions if q.get('question_type') == 'mc')
    total_tf = sum(1 for q in questions if q.get('question_type') == 'tf')
    total_sa = sum(1 for q in questions if q.get('question_type') == 'sa')
    total_oe = sum(1 for q in questions if q.get('question_type') == 'oe')

    section_labels = {
        'mc': f'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu {total_mc}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.',
        'tf': f'PHẦN II. Câu trắc nghiệm đúng sai. Thí sinh trả lời từ câu 1 đến câu {total_tf}. Trong mỗi ý a), b), c), d) ở mỗi câu hỏi, thí sinh chọn đúng hoặc sai.',
        'sa': f'PHẦN III. Câu trắc nghiệm trả lời ngắn. Thí sinh trả lời từ câu 1 đến câu {total_sa}.',
        'oe': f'PHẦN IV. Câu tự luận. Thí sinh trả lời từ câu 1 đến câu {total_oe}.',
    }

    # The original copy follows the Word export: clean exam, answer tables, then
    # detailed solutions. Shuffled copies still contain only the clean exam.
    if include_solution and show_answers:
        clean_body = _render_questions_body(questions, section_labels, False, False)
        solution_body = _render_questions_body(questions, section_labels, True, True)
        body_content = clean_body
        trailing_content = f'''
        <section class="document-section answer-key-section">
            <div class="answer-page-header">
                <div class="answer-header-left">
                    <strong id="preview-answer-department">{html_module.escape(department or 'BỘ GIÁO DỤC VÀ ĐÀO TẠO')}</strong><br>
                    <span id="preview-answer-exam-type">{html_module.escape(exam_type or 'ĐỀ THI CHÍNH THỨC')}</span><br>
                    <em>(Đáp án có <span class="answer-pages-placeholder">...</span> trang)</em>
                </div>
                <div class="answer-header-right">
                    <strong id="preview-answer-exam-title">{html_module.escape(exam_title)}</strong><br>
                    <strong>Môn thi: <span id="preview-answer-subject">{html_module.escape(subject or '...')}</span></strong><br>
                    <em>Thời gian làm bài: <span id="preview-answer-duration">{duration}</span> phút, không kể thời gian phát đề</em>
                    <div class="answer-code-box"><strong>Mã đề: <span id="preview-answer-code">{html_module.escape(code)}</span></strong></div>
                </div>
            </div>
            {_render_answer_key_html(contest, questions)}
        </section>
        <section class="document-section detailed-solution-section">
            <h2>LỜI GIẢI CHI TIẾT</h2>
            <div class="questions">{solution_body}</div>
        </section>'''
    else:
        body_content = _render_questions_body(questions, section_labels, include_solution, show_answers)
        trailing_content = ''

    gi_html = f'<div id="preview-general-info" class="general-info" style="margin-top: 4px; font-style: italic;">{_latex_to_html(general_info)}</div>' if general_info else ''

    # Paged.js script inclusion
    pagedjs_script = ""
    if not measure:
        pagedjs_script = """<script src="https://unpkg.com/pagedjs/dist/paged.polyfill.js"></script>"""

    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>{html_module.escape(exam_title)}</title>
{pagedjs_script}
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{
    font-family: 'Times New Roman', 'Tinos', serif;
    font-size: 12pt;
    line-height: 1.08;
    color: #000;
    orphans: 1;
    widows: 1;
    background: #fff;
}}
div.math.display math {{
    display: block !important;
    margin: 3px auto !important;
    text-align: center !important;
    text-align-last: center !important;
}}
span.math {{
    display: inline-block;
    padding-top: 3px;
    padding-bottom: 3px;
    margin-inline: 0.045em;
    vertical-align: baseline;
}}
math {{
    font-family: "Cambria Math", "STIX Two Math", "Latin Modern Math", math, serif;
}}
msqrt > mrow.sqrt-radicand {{
    transform: translateY(0.08em);
}}
math mtext {{
    font-family: "Cambria", "Times New Roman", serif;
}}
@page {{
  size: A4;
  margin-top: 1.2cm;
  margin-bottom: 2cm;
  margin-left: 1.5cm;
  margin-right: 1.2cm;
  @bottom-right {{
    content: "Trang " counter(page) "/" counter(pages) " - Mã đề thi {code}";
    font-family: 'Times New Roman', serif;
    font-size: 12pt;
  }}
}}
@media print {{
  body {{ background-color: white !important; padding: 0 !important; }}
  .pagedjs_pages {{ padding: 0 !important; background-color: transparent !important; }}
  .pagedjs_page {{ margin: 0 !important; }}
  .pagedjs_sheet {{ box-shadow: none !important; border: none !important; }}
}}
.header-table {{ width: 100%; border-collapse: collapse; margin-bottom: 4px; }}
.header-left  {{ width: 35%; text-align: center; vertical-align: top; line-height: 1.08; padding-right: 8px; }}
.header-right {{ width: 65%; text-align: center; vertical-align: top; line-height: 1.08; }}
.info-table   {{ margin-top: 8px; }}
.info-left    {{ width: 60%; vertical-align: bottom; line-height: 1.8; }}
.info-right   {{ width: 40%; text-align: right; vertical-align: middle; }}
.code-box     {{ display: inline-block; border: 1px solid #000; padding: 0px 43px; font-size: 12pt; }}
.general-info {{ margin-top: 8px; margin-bottom: 8px; }}
.section-header {{ margin-top: 6px; margin-bottom: 4px; text-align: justify; page-break-inside: avoid; break-inside: avoid; }}
.questions    {{ margin-top: 4px; }}
.question     {{ margin-bottom: 4px; {'' if include_solution else 'page-break-inside: avoid; break-inside: avoid;'} }}
.question-content {{ text-align: justify; line-height: 1.08; }}
.question-content p {{ margin: 0; }}
.latex-table-wrap {{ overflow-x: auto; margin: 8px 0; display: flex; justify-content: center; }}
.latex-table {{ border-collapse: collapse; width: auto; max-width: 100%; font-size: 0.95em; }}
.latex-table td {{ border: 1px solid #000; padding: 4px 7px; text-align: center; vertical-align: middle; }}
.immini::after {{
    content: "";
    display: table;
    clear: both;
}}
.immini .immini-img {{
    float: right;
    margin-left: 12px;
    margin-bottom: 6px;
}}
.immini .immini-img img {{ display: block; max-width: 100%; }}
.options {{ display: flex; flex-wrap: wrap; margin-top: 1px; margin-bottom: 1px; line-height: 1.25; }}
.options .option {{ padding: 1px 12px 1px 0; }}
.options.cols-4 .option {{ width: 25%; }}
.options.cols-2 .option {{ width: 50%; }}
.options.cols-1 .option {{ width: 100%; }}
.option.correct {{ color: #d32f2f; }}
.tf-options {{ margin-top: 1px; line-height: 1.25; }}
.tf-item    {{ margin-bottom: 1px; }}
.tf-item.correct {{ color: #d32f2f; }}
.short-answer {{ margin-top: 2px; }}
.answer-box   {{ font-weight: bold; text-decoration: underline; }}
.solution {{ margin-top: 2px; margin-bottom: 2px; line-height: 1.35; }}
.solution p {{ margin: 0; }}
.solution-header {{
    font-weight: bold;
    text-align: center;
    text-align-last: center;
    margin-bottom: 2px;
}}
.exam-footer {{ text-align: center; text-align-last: center; margin-top: 16px; }}
.answer-key-section {{ break-before: page; page-break-before: always; }}
.detailed-solution-section {{ margin-top: 24px; }}
.document-section > h2 {{ font-size: 14pt; text-align: center; margin: 0 0 12px; }}
.answer-page-header {{ display: grid; grid-template-columns: 35% 65%; margin-bottom: 42px; line-height: 1.3; text-align: center; }}
.answer-header-left, .answer-header-right {{ min-width: 0; }}
.answer-header-left strong, .answer-header-right strong {{ font-size: 12pt; }}
.answer-code-box {{ width: 52%; margin: 28px 0 0 auto; border: 1px solid #000; padding: 2px 8px; }}
.answer-key-section h3 {{ font-size: 12pt; margin: 10px 0 3px; }}
.answer-key-section h3 span {{ font-weight: normal; }}
.tf-scoring-notes {{ line-height: 1.45; margin: 2px 0 4px; }}
.answer-table-wrap {{ display: flex; justify-content: center; margin: 3px 0 10px; break-inside: avoid; page-break-inside: avoid; }}
.answer-table {{ border-collapse: collapse; width: 100%; table-layout: fixed; }}
.answer-table td {{ border: 1px solid #000; padding: 2px 5px; text-align: center; vertical-align: middle; line-height: 1.05; }}
.tf-answer-table td {{ width: 16.666%; }}
.question img {{ max-width: 100%; height: auto; }}
.stimulus > .question-content {{
    font-style: italic;
    margin-bottom: 6px;
    padding-bottom: 4px;
}}

/* Fix: Prevent Paged.js from stretching the last line of a broken paragraph
   while preserving text-align: center for images, tables, and headers */
[data-split-to] {{ text-align-last: auto !important; }}
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/temml@0.11.3/dist/Temml-Local.css">
<script src="https://cdn.jsdelivr.net/npm/temml@0.11.3/dist/temml.min.js"></script>
<script>
window.PagedConfig = {{ auto: false }};
</script>
<script src="https://cdn.jsdelivr.net/npm/pagedjs/dist/paged.polyfill.js"></script>
<script>
document.addEventListener("DOMContentLoaded", function() {{
    let mathElems = document.querySelectorAll(".math");
    mathElems.forEach(function(el) {{
        let tex = el.textContent;
        try {{
            let isDisplay = el.classList.contains("display");
            tex = "\\\\displaystyle " + tex;
            temml.render(tex, el, {{ 
                displayMode: isDisplay,
                macros: {{
                    "\\\\hoac": "\\\\left[\\\\begin{{aligned}}#1\\\\end{{aligned}}\\\\right.",
                    "\\\\heva": "\\\\left\\\\{{\\\\begin{{aligned}}#1\\\\end{{aligned}}\\\\right."
                }}
            }});
        }} catch (e) {{
            console.error("Temml error:", e);
        }}
    }});
    
    var MML_NS = "http://www.w3.org/1998/Math/MathML";
    document.querySelectorAll("msqrt").forEach(function(sq) {{
        var row = document.createElementNS(MML_NS, "mrow");
        row.classList.add("sqrt-radicand");
        while (sq.firstChild) row.appendChild(sq.firstChild);
        sq.appendChild(row);
    }});

    document.querySelectorAll("mfrac").forEach(function(f) {{
        f.setAttribute("linethickness", "1px");
    }});
    document.body.setAttribute('data-math-ready', 'true');
}});
</script>
</head>
<body>
<div id="pagedjs-loader" data-pagedjs-ignore="true" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #fff; z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: sans-serif; color: #555;">
    <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 15px;"></div>
    <style>@keyframes spin {{ 0% {{ transform: rotate(0deg); }} 100% {{ transform: rotate(360deg); }} }}</style>
    <div style="font-size: 16px; font-weight: 500;">Đang xử lý phân trang A4...</div>
</div>
<div class="page">
    <div class="exam-header">
        <table class="header-table">
            <tr>
                <td class="header-left" style="width: 33.33%; text-align: center; vertical-align: top; line-height: 1.3;">
                    <strong id="preview-department">{html_module.escape(department or 'BỘ GIÁO DỤC VÀ ĐÀO TẠO')}</strong>
                    <div style="border-bottom: 1px solid #000; margin: 2px auto 4px auto; width: 70%;"></div>
                    <span id="preview-exam-type">{html_module.escape(exam_type or 'ĐỀ THI CHÍNH THỨC')}</span><br>
                    <em>(Đề thi có <span class="total-pages-placeholder">...</span> trang)</em>
                </td>
                <td class="header-right" style="width: 66.67%; text-align: center; vertical-align: top; line-height: 1.3;">
                    <strong id="preview-exam-title">{html_module.escape(exam_title)}</strong><br>
                    <strong>Môn thi: <span id="preview-subject">{html_module.escape(subject or '...')}</span></strong><br>
                    <em>Thời gian làm bài: <span id="preview-duration">{duration}</span> phút, không kể thời gian phát đề</em>
                    <div style="border-bottom: 1px solid #000; margin: 2px auto 4px auto; width: 55%;"></div>
                </td>
            </tr>
        </table>
        <table class="header-table info-table" style="margin-top: 16px;">
            <tr>
                <td class="info-left" style="width: 60%; vertical-align: bottom; line-height: 1.5; text-align: left;">
                    <strong>Họ, tên thí sinh: ....................................................................</strong><br>
                    <strong>Số báo danh: .........................................................................</strong>
                </td>
                <td class="info-right" style="width: 40%; text-align: right; vertical-align: middle;">
                    <div class="code-box" style="display: inline-flex; align-items: center; justify-content: center; border: 1px solid #000; padding: 0px 43px; font-size: 12pt; height: 24px;"><strong>Mã đề: <span id="preview-code">{html_module.escape(code)}</span></strong></div>
                </td>
            </tr>
        </table>
    </div>

    {gi_html}

    <div class="questions">
        {body_content}
    </div>

    <div class="exam-footer">
        <strong>{'-' * 24} HẾT {'-' * 24}</strong>
    </div>
</div>
{trailing_content}
<script>
// Chạy PagedJS ngay khi thẻ body đã nạp xong
let pagedjsAttempts = 0;
function runPagedJS() {{
    if (window.PagedPolyfill) {{
        // Tạm thời giới hạn độ rộng body để đo lường chính xác trên mọi màn hình (A4 content width = 691px)
        const originalBodyWidth = document.body.style.width;
        document.body.style.width = '691px';

        document.querySelectorAll('.options.cols-auto').forEach(grid => {{
            // Ẩn tạm thời các option để grid tự động co lại đúng với không gian còn lại (nếu có ảnh float bên cạnh)
            const opts = grid.querySelectorAll('.option');
            opts.forEach(opt => opt.style.display = 'none');
            
            grid.style.display = 'flex'; 
            let containerW = grid.offsetWidth || 691; 

            // Đo độ rộng lớn nhất của các phương án
            let maxW = 0;
            opts.forEach(opt => {{
                opt.style.display = 'inline-block';
                opt.style.width = 'auto';
                opt.style.whiteSpace = 'nowrap';
                maxW = Math.max(maxW, opt.getBoundingClientRect().width);
            }});
            
            let cols = 4;
            if (maxW > containerW * 0.48) {{ // > 48% width -> 1 col
                cols = 1;
            }} else if (maxW > containerW * 0.23) {{ // > 23% width -> 2 cols
                cols = 2;
            }}
            
            grid.style.display = '';
            opts.forEach(opt => {{
                opt.style.display = '';
                opt.style.width = '';
                opt.style.whiteSpace = '';
            }});
            grid.className = `options cols-${{cols}}`;
        }});

        // Trả lại kích thước gốc cho body để PagedJS tự phân trang
        document.body.style.width = originalBodyWidth;

        window.PagedPolyfill.preview().then(() => {{
            console.log("PagedJS rendered successfully.");
            
            const loader = document.getElementById('pagedjs-loader');
            if (loader) loader.remove();
            
            const pages = Array.from(document.querySelectorAll('.pagedjs_page'));
            const answerSection = document.querySelector('.pagedjs_page .answer-key-section');
            const firstAnswerPage = answerSection ? pages.indexOf(answerSection.closest('.pagedjs_page')) : -1;
            const examPagesCount = firstAnswerPage >= 0 ? firstAnswerPage : pages.length;
            const formattedTotal = examPagesCount.toString().padStart(2, '0');
            document.querySelectorAll('.total-pages-placeholder').forEach(el => el.textContent = formattedTotal);
            const answerPages = Math.max(0, pages.length - examPagesCount);
            const formattedAnswerPages = answerPages.toString().padStart(2, '0');
            document.querySelectorAll('.answer-pages-placeholder').forEach(el => el.textContent = formattedAnswerPages);
            
            // Bơm CSS Viewer trực tiếp vào DOM nếu không phải là bản để export
            const isForExport = {str(for_export).lower()};
            if (!isForExport) {{
                const style = document.createElement('style');
                style.textContent = `
                    body {{ background-color: #e5e7eb !important; margin: 0 !important; padding: 0 !important; }}
                    .pagedjs_pages {{
                      display: flex !important;
                      flex-direction: column !important;
                      align-items: center !important;
                      background-color: #e5e7eb !important;
                      padding: 30px 0 !important;
                    }}
                    .pagedjs_page {{
                      margin: 0 auto 40px auto !important;
                      background: transparent !important;
                      border: none !important;
                      box-shadow: none !important;
                      flex-shrink: 0 !important;
                    }}
                    .pagedjs_sheet {{
                      background-color: white !important;
                      box-shadow: 0 10px 20px rgba(0,0,0,0.2) !important;
                      border: 1px solid #999 !important;
                    }}
                `;
                document.head.appendChild(style);
            }}
            
            // Báo cho React Component biết PagedJS đã xong để tự động Khớp khung (Fit width)
            window.parent.postMessage({{ type: 'PAGEDJS_READY' }}, '*');
        }}).catch(err => {{
            console.error("Paged.js error:", err);
            document.body.innerHTML = '<div style="color:red; padding: 20px;">Lỗi xử lý PagedJS: ' + err.message + '</div>' + document.body.innerHTML;
        }});
    }} else {{
        pagedjsAttempts++;
        if (pagedjsAttempts < 50) {{
            setTimeout(runPagedJS, 100);
        }} else {{
            document.body.innerHTML = '<div style="color:red; padding: 20px;">Lỗi: Không tải được thư viện Paged.js từ mạng.</div>' + document.body.innerHTML;
        }}
    }}
}}
{'' if measure else 'setTimeout(runPagedJS, 300); // Cho Temml và DOM render xong rồi mới kích hoạt'}
</script>
</body>
</html>"""
