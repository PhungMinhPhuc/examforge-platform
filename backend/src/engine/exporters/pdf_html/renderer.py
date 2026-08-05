"""
HTML + MathJax 3 (CHTML) + Playwright PDF Export
=============================================
Render đề thi thành HTML:
- MathJax 3 CHTML: Render LaTeX toán học dưới dạng HTML/CSS (chữ thực tế, không phải ảnh SVG)
  (không bị lỗi đè nét căn \\sqrt{}, đè dòng phân số \\frac{}{}, chữ nghiêng/đứng chuẩn xác)
- CSS float: wrap text quanh ảnh (immini layout)
- Base64 images: embed ảnh trực tiếp trong HTML
- Playwright headless Chromium: xuất PDF
"""
import os
import re
import html as html_module
import base64
import urllib.parse
import tempfile
from typing import List, Dict, Any
from ..common import resolve_image_file


# ═══════════════════════════════════════════════════════════════════════════════
# Image helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _img_to_data_uri(path: str) -> str:
    """Convert local image file to base64 data URI."""
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
    """Resolve markdown image URL → (data_uri, scale, w, h)."""
    url = urllib.parse.unquote(url).split('?')[0]
    scale = 1.0

    local_path, matched_image = resolve_image_file(url, images)
    if matched_image and matched_image.get('img_scale') is not None:
        try:
            scale = float(matched_image['img_scale'])
        except (ValueError, TypeError):
            pass

    # Prefer PNG over SVG
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
    """Chuyển \\mathrm{...} có chữ tiếng Việt sang \\text{...}.

    Trong math mode, Temml TÁCH chữ có dấu thành ký tự gốc + dấu rời:
        \\mathrm{lít} -> <mi>l</mi><mover><mi>ı</mi><mo>ˊ</mo></mover><mi>t</mi>
    nên chữ bị vỡ dấu. Còn \\text{lít} -> <mtext>lít</mtext> giữ nguyên.
    Chỉ đổi khi có ký tự ngoài ASCII, để không ảnh hưởng ký hiệu hoá học
    (\\mathrm{He}, \\mathrm{const}...) vốn đang hiển thị đúng.
    """
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


# ═══════════════════════════════════════════════════════════════════════════════
# LaTeX → HTML conversion
# ═══════════════════════════════════════════════════════════════════════════════

def _latex_to_html(text: str, images: list = None) -> str:
    """Convert LaTeX-flavored markdown to HTML with MathJax syntax."""
    if not text:
        return ""
    images = images or []

    # ── 1. Protect math blocks ───────────────────────────────────────────────
    math_blocks: list[str] = []
    math_inline: list[bool] = []

    def _save(m, inline: bool):
        idx = len(math_blocks)
        math_blocks.append(m.group(0))
        math_inline.append(inline)
        return f"\x00MATH{idx}\x00"

    # Display math first
    text = re.sub(r'\$\$[\s\S]*?\$\$', lambda m: _save(m, False), text)
    text = re.sub(r'\\\[[\s\S]*?\\\]', lambda m: _save(m, False), text)
    # Inline math
    text = re.sub(r'\$([^$]+?)\$', lambda m: _save(m, True), text)
    text = re.sub(r'\\\(.*?\\\)', lambda m: _save(m, True), text)

    # Convert before generic row-break handling consumes LaTeX's \\.
    text = _convert_tabular_to_html(text)

    # ── 2. Convert images to base64 ──────────────────────────────────────────
    def _replace_img(m):
        data_uri, scale, w, h = _resolve_image(m.group(1), images)
        if data_uri:
            img_w = int(w * scale) if w > 0 else int(450 * scale)
            img_w = max(50, img_w) # Ngăn ảnh quá nhỏ
            return f'<img src="{data_uri}" style="width:{img_w}px; max-width: 100%; height:auto; display:block; margin:4px auto;" />'
        return ''

    text = re.sub(r'!\[.*?\]\((.*?)\)', _replace_img, text)

    # ── 3. Line breaks: \\ → <br> (outside math) ────────────────────────────
    text = re.sub(r'\\\\', '<br>', text)
    text = text.replace('\\newline', '<br>')

    # ── 4. LaTeX text commands ───────────────────────────────────────────────
    text = re.sub(r'\\textbf\{([^}]*)\}', r'<strong>\1</strong>', text)
    text = re.sub(r'\\textit\{([^}]*)\}', r'<em>\1</em>', text)
    text = re.sub(r'\\underline\{([^}]*)\}', r'<u>\1</u>', text)

    # Clean up <br>
    text = re.sub(r'<br\s*/?>', '<br>', text)

    # Double newlines → paragraph breaks
    text = re.sub(r'\n[ \t\r]*\n(?:[ \t\r]*\n)*', '</p><p>', text)
    text = text.replace('\n', '<br>')

    # ── 5. Restore math delimiters for MathJax ──────────────────────────────
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
            replacement = f'<div class="math display">{latex}</div>'
        else:
            replacement = f'<span class="math">{latex}</span>'

        text = text.replace(placeholder, replacement)

    return text


# ═══════════════════════════════════════════════════════════════════════════════
# Question renderers
# ═══════════════════════════════════════════════════════════════════════════════

def _extract_wrap_images(q: dict) -> tuple[str, str]:
    """Extract images for immini (wrap) layout → (text_html, img_html)."""
    content = q.get('content', '') or ''
    images = q.get('images', [])

    img_matches = re.findall(r'(!\[.*?\]\((.*?)\))', content)
    img_parts = []
    
    wrapper_width = 0
    for _, url in img_matches:
        data_uri, scale, w, h = _resolve_image(url, images)
        if data_uri:
            # Lấy đúng kích thước gốc nhân hệ số scale từ database theo ý người dùng
            img_w = int(w * scale) if w > 0 else int(450 * scale)
            wrapper_width = max(wrapper_width, img_w)
            img_parts.append(f'<img src="{data_uri}" style="width: {img_w}px; max-width: 100%; height: auto; margin-bottom: 5px; display: block;" />')

    text_content = re.sub(r'!\[.*?\]\((.*?)\)', '', content).strip()
    text_html = _latex_to_html(text_content, images)

    # Nếu không đọc được kích thước, fall back về giá trị mặc định để tránh lỗi
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

    # Options
    if q_type == 'mc':
        parts.append(_render_mc_options(options, images, layout, show_answers))
    elif q_type == 'tf':
        parts.append(_render_tf_options(options, images, show_answers))
    elif q_type == 'sa':
        if show_answers and options and not include_solution:
            ans = _latex_to_html(options[0].get('content', ''), images)
            parts.append(f'<div class="short-answer">Trả lời: <span class="answer-box">{ans}</span></div>')

    if has_immini:
        parts.append('</div>')  # close immini-text

    parts.append('</div>')  # close question-content

    # Solution
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

    parts.append('</div>')  # close question
    return '\n'.join(parts)


# ═══════════════════════════════════════════════════════════════════════════════
# Full exam renderer
# ═══════════════════════════════════════════════════════════════════════════════

def render_exam_html(
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
            
            child_count = len(children)
            if child_count > 0:
                start_c = q_counter
                end_c = q_counter + child_count - 1
                prefix_text = f"Sử dụng dữ kiện sau để trả lời từ Câu {start_c} đến Câu {end_c}:"
            else:
                prefix_text = "Sử dụng dữ kiện sau:"

            if has_immini:
                text_html, img_html = _extract_wrap_images(q)
                body_html.append(f'<div class="question stimulus" id="q-{q_id}" style="margin-bottom: 5px;">')
                body_html.append(f'<div class="stimulus-prefix" style="margin-bottom: 5px;"><p><strong><em>{prefix_text}</em></strong></p></div>')
                body_html.append('<div class="question-content immini">')
                body_html.append(img_html)
                body_html.append(f'<div class="immini-text"><p>{text_html}</p></div>')
                body_html.append('</div>')
                body_html.append('</div>')
            else:
                content_html = _latex_to_html(q.get('content', ''), q.get('images', []))
                body_html.append(f'<div class="question stimulus" id="q-{q_id}" style="margin-bottom: 5px;">')
                body_html.append(f'<div class="stimulus-prefix" style="margin-bottom: 5px;"><p><strong><em>{prefix_text}</em></strong></p></div>')
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

    body_content = '\n'.join(body_html)

    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>{html_module.escape(exam_title)}</title>
<style>
{_get_css(font_family, math_font)}
</style>
<!-- temml: LaTeX → MathML, browser renders with Cambria Math -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/temml@0.11.3/dist/Temml-Local.css">
<script src="https://cdn.jsdelivr.net/npm/temml@0.11.3/dist/temml.min.js"></script>
<script>
document.addEventListener("DOMContentLoaded", function() {{
    let mathElems = document.querySelectorAll(".math");
    mathElems.forEach(function(el) {{
        let tex = el.textContent;
        try {{
            let isDisplay = el.classList.contains("display");
            
            // Ép tất cả công thức hiển thị ở dạng to (displaystyle) đúng chuẩn LaTeX
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

    // Chromium/MathML đặt radicand Cambria Math quá sát gạch trên. Chỉ bọc
    // radicand để CSS hạ phần chữ xuống, giữ nguyên hình học của dấu căn.
    var MML_NS = "http://www.w3.org/1998/Math/MathML";
    document.querySelectorAll("msqrt").forEach(function(sq) {{
        var row = document.createElementNS(MML_NS, "mrow");
        row.classList.add("sqrt-radicand");
        while (sq.firstChild) row.appendChild(sq.firstChild);
        sq.appendChild(row);
    }});

    // Gạch phân số: độ dày font quy định là số LẺ px -> Chromium snap mép trên/dưới
    // về lưới pixel, tuỳ vị trí Y từng phân số mà ra 1px hoặc 2px (chỗ đậm chỗ nhạt).
    // Ép 1 giá trị nguyên để mọi gạch dày như nhau.
    document.querySelectorAll("mfrac").forEach(function(f) {{
        f.setAttribute("linethickness", "1px");
    }});

    // Auto-calculate grid columns for multiple choice options based on REAL rendered width
    document.querySelectorAll('.options.cols-auto').forEach(function(grid) {{
        let maxW = 0;
        let opts = grid.querySelectorAll('.option');
        grid.style.display = 'block'; // Temporarily disable flex to measure natural inline width
        opts.forEach(function(opt) {{
            opt.style.display = 'inline-block';
            opt.style.width = 'auto';
            opt.style.whiteSpace = 'nowrap';
            maxW = Math.max(maxW, opt.getBoundingClientRect().width);
        }});
        
        let containerW = grid.offsetWidth || 690;
        
        let cols = 4;
        if (maxW > containerW * 0.40) {{
            cols = 1;
        }} else if (maxW > containerW * 0.20) {{
            cols = 2;
        }}
        
        grid.style.display = '';
        opts.forEach(function(opt) {{
            opt.style.display = '';
            opt.style.width = '';
            opt.style.whiteSpace = '';
        }});
        grid.className = "options cols-" + cols;
    }});

    document.body.setAttribute('data-math-ready', 'true');
}});
</script>
</head>
<body>
<div class="page">
    <div class="exam-header">
        <table class="header-table">
            <tr>
                <td class="header-left" style="width: 33.33%; text-align: center; vertical-align: top; line-height: 1.3;">
                    <strong>{html_module.escape(department or 'BỘ GIÁO DỤC VÀ ĐÀO TẠO')}</strong>
                    <div style="border-bottom: 1px solid #000; margin: 2px auto 4px auto; width: 70%;"></div>
                    <span>{html_module.escape(exam_type or 'ĐỀ THI CHÍNH THỨC')}</span><br>
                    <em>(Đề thi có ... trang)</em>
                </td>
                <td class="header-right" style="width: 66.67%; text-align: center; vertical-align: top; line-height: 1.3;">
                    <strong>{html_module.escape(exam_title)}</strong><br>
                    <strong>Môn thi: {html_module.escape(subject or '...')}</strong><br>
                    <em>Thời gian làm bài: {duration} phút, không kể thời gian phát đề</em>
                    <div style="border-bottom: 1px solid #000; margin: 2px auto 4px auto; width: 55%;"></div>
                </td>
            </tr>
        </table>
        <table class="header-table info-table" style="margin-top: 16px;">
            <tr>
                <td class="info-left" style="width: 66.67%; vertical-align: bottom; line-height: 1.5; text-align: left;">
                    <strong>Họ, tên thí sinh: ........................................................................</strong><br>
                    <strong>Số báo danh: .............................................................................</strong>
                </td>
                <td class="info-right" style="width: 33.33%; text-align: center; vertical-align: middle;">
                    <div class="code-box" style="display: inline-flex; align-items: center; justify-content: center; border: 1px solid #000; padding: 0px 43px; font-size: 12pt; height: 24px;"><strong>Mã đề: {html_module.escape(code)}</strong></div>
                </td>
            </tr>
        </table>
    </div>

    {f'<div class="general-info"><em>{html_module.escape(general_info)}</em></div>' if general_info else ''}

    <div class="questions">
        {body_content}
    </div>

    <div class="exam-footer">
        <strong>{'-' * 24} HẾT {'-' * 24}</strong>
    </div>
</div>
</body>
</html>"""


# ═══════════════════════════════════════════════════════════════════════════════
# CSS
# ═══════════════════════════════════════════════════════════════════════════════

def _get_css(font_family: str = "'Times New Roman', 'Tinos', serif", math_font: str = "") -> str:
    # Với Temml, không cần CSS ép font toán vì Temml-Local.css đã tự dùng Cambria Math.
    math_css = ""
    css = """
/* Reset & base */
* { margin: 0; padding: 0; box-sizing: border-box; }

@page {
    size: A4;
    margin: 1.2cm 1.2cm 2cm 1.5cm;
}

body {
    font-family: __FONT_FAMILY__;
    font-size: 12pt;
    line-height: 1.3;
    color: #000;
    orphans: 1;
    widows: 1;
    background: #fff;
}

/* Temml alignment & line spacing */
div.math.display math {
    display: block !important;
    margin: 3px auto !important;
    text-align: center !important;
    text-align-last: center !important;
}

/* Font toán: BẮT BUỘC khai báo tường minh.
   Cambria Math có bảng OpenType MATH -> dấu căn (sqrt) giãn đúng theo chiều cao
   (không đè lên số) và gạch phân số (frac) lấy đúng FractionRuleThickness
   (không còn chỗ đậm chỗ nhạt do Chromium in đậm giả / làm tròn sub-pixel).
   Các font sau là dự phòng nếu máy thiếu Cambria Math. */
math {
    font-family: "Cambria Math", "STIX Two Math", "Latin Modern Math", math, serif;
}

/* Chromium đặt đỉnh radicand sát gạch căn với Cambria Math. Hạ riêng nội
   dung 0.08em để có RadicalVerticalGap gần với bản XeLaTeX. */
msqrt > mrow.sqrt-radicand {
    transform: translateY(0.08em);
}

/* Một khoảng thở rất nhỏ giữa công thức inline và chữ thường. Dùng em để
   không phụ thuộc DPI/pixel của Chromium. */
span.math {
    display: inline-block;
    padding-top: 3px;
    padding-bottom: 3px;
    margin-inline: 0.045em;
    vertical-align: baseline;
}

/* Chữ trong lệnh text (và mathrm tiếng Việt đã đổi sang text): dùng Cambria —
   font chữ cùng họ với Cambria Math nên nhìn đồng bộ, lại đủ dấu tiếng Việt. */
math mtext {
    font-family: "Cambria", "Times New Roman", serif;
}

.page {
    max-width: 210mm;
    margin: 0 auto;
}

/* Header */
.header-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
.header-left  { width: 35%; text-align: center; vertical-align: top; line-height: 1.3; padding-right: 8px; }
.exam-type-line { text-decoration: overline; }
.header-right { width: 65%; text-align: center; vertical-align: top; line-height: 1.3; }
.info-table   { margin-top: 8px; }
.info-left    { width: 60%; vertical-align: bottom; line-height: 1.8; }
.info-right   { width: 40%; text-align: right; vertical-align: middle; }
.code-box     { display: inline-block; border: 1px solid #000; padding: 0px 43px; font-size: 12pt; }
.general-info { margin-top: 8px; margin-bottom: 8px; }

/* Section headers */
.section-header { margin-top: 6px; margin-bottom: 4px; text-align: justify; page-break-inside: avoid; break-inside: avoid; }

/* Questions */
.questions    { margin-top: 4px; }
.question     { margin-bottom: 6px; page-break-inside: avoid; break-inside: avoid; }
.question-content { text-align: justify; line-height: 1.35; }
.question-content p { margin: 0; }
.latex-table-wrap { overflow-x: auto; margin: 8px 0; display: flex; justify-content: center; }
.latex-table { border-collapse: collapse; width: auto; max-width: 100%; font-size: 0.95em; }
.latex-table td { border: 1px solid #000; padding: 4px 7px; text-align: center; vertical-align: middle; }

/* ── Wrap text (immini layout) ── */
.immini::after {
    content: "";
    display: table;
    clear: both;
}
.immini .immini-img {
    float: right;
    margin-left: 12px;
    margin-bottom: 6px;
    page-break-inside: avoid;
}
.immini .immini-img img { display: block; max-width: 100%; page-break-inside: avoid; }

/* MC Options */
.options { display: flex; flex-wrap: wrap; margin-top: 1px; margin-bottom: 1px; line-height: 1.25; }
.options .option { padding: 1px 12px 1px 0; }
.options.cols-4 .option { width: 25%; }
.options.cols-2 .option { width: 50%; }
.options.cols-1 .option { width: 100%; }
.option.correct { color: #d32f2f; }

/* TF Options */
.tf-options { margin-top: 1px; line-height: 1.25; }
.tf-item    { margin-bottom: 1px; }
.tf-item.correct { color: #d32f2f; }

/* Short Answer */
.short-answer { margin-top: 2px; }
.answer-box   { font-weight: bold; text-decoration: underline; }

/* Solution */
.solution { margin-top: 2px; margin-bottom: 2px; line-height: 1.35; }
.solution-header {
    font-weight: bold;
    text-align: center;
    text-align-last: center;
    margin-bottom: 2px;
}

/* Footer */
.exam-footer { text-align: center; text-align-last: center; margin-top: 16px; }

/* Images */
.question img { max-width: 100%; height: auto; page-break-inside: avoid; }

/* Fix: Prevent Paged.js from stretching the last line of a broken paragraph
   while preserving text-align: center for images, tables, and headers */
[data-split-to] { text-align-last: auto !important; }

@media print {
    body { background: none; }
    .page { max-width: none; padding: 0; }
}
"""
    css = css.replace("__FONT_FAMILY__", font_family)
    css = css.replace("__MATH_CSS__", math_css)
    return css


# ═══════════════════════════════════════════════════════════════════════════════
# Measure heights via Playwright
# ═══════════════════════════════════════════════════════════════════════════════

async def measure_unit_heights_html_async(html_content: str) -> dict:
    from playwright.async_api import async_playwright
    import tempfile
    import os

    with tempfile.NamedTemporaryFile(suffix='.html', delete=False, mode='w', encoding='utf-8') as f:
        f.write(html_content)
        temp_html = f.name
        
    heights = {}
    try:
        async with async_playwright() as p:
            # We want to measure the natural heights without Paged.js breaking it.
            # A4 width is ~794px at 96 DPI.
            browser = await p.chromium.launch()
            page = await browser.new_page()
            await page.set_viewport_size({"width": 794, "height": 3000})

            file_url = 'file:///' + temp_html.replace('\\', '/')
            await page.goto(file_url, wait_until='networkidle')

            try:
                await page.wait_for_function(
                    "document.body.getAttribute('data-math-ready') === 'true'",
                    timeout=30000,
                )
            except Exception:
                pass
                
            await page.evaluate("document.fonts.ready")
            await page.wait_for_timeout(100)

            js_code = """
            () => {
                document.body.style.width = '183mm';
                
                // TÍNH TOÁN CỘT ĐÁP ÁN (BẮT BUỘC ĐỂ ĐO CHIỀU CAO CHÍNH XÁC)
                document.querySelectorAll('.options.cols-auto').forEach(grid => {
                    const containerW = grid.getBoundingClientRect().width;
                    let maxW = 0;
                    const opts = grid.querySelectorAll('.option');
                    
                    grid.style.display = 'block';
                    opts.forEach(opt => {
                        opt.style.display = 'inline-block';
                        opt.style.width = 'auto';
                        opt.style.whiteSpace = 'nowrap';
                        maxW = Math.max(maxW, opt.getBoundingClientRect().width);
                    });
                    
                    let cols = 4;
                    if (maxW > containerW * 0.48) {
                        cols = 1;
                    } else if (maxW > containerW * 0.23) {
                        cols = 2;
                    }
                    
                    grid.style.display = '';
                    opts.forEach(opt => {
                        opt.style.display = '';
                        opt.style.width = '';
                        opt.style.whiteSpace = '';
                    });
                    grid.className = `options cols-${cols}`;
                });

                const res = {};
                const qElements = document.querySelectorAll('.question');
                qElements.forEach(el => {
                    const idAttr = el.getAttribute('id');
                    if (idAttr && idAttr.startsWith('q-')) {
                        const idStr = idAttr.substring(2);
                        const id = isNaN(parseInt(idStr)) ? idStr : parseInt(idStr);
                        const style = getComputedStyle(el);
                        const rect = el.getBoundingClientRect();
                        res[id] = rect.height
                            + parseFloat(style.marginTop || 0)
                            + parseFloat(style.marginBottom || 0);
                    }
                });
                const secElements = document.querySelectorAll('.section-header');
                secElements.forEach(el => {
                    const text = el.innerText || "";
                    let t = '';
                    if (text.includes('PHẦN I.')) t = 'mc';
                    else if (text.includes('PHẦN II.')) t = 'tf';
                    else if (text.includes('PHẦN III.')) t = 'sa';
                    else if (text.includes('PHẦN IV.')) t = 'oe';
                    if (t) {
                        const style = getComputedStyle(el);
                        res['__PART_' + t + '__'] = el.getBoundingClientRect().height
                            + parseFloat(style.marginTop || 0)
                            + parseFloat(style.marginBottom || 0);
                    }
                });
                return res;
            }
            """
            heights = await page.evaluate(js_code)
            
            header_js = """() => {
                let total = 0;
                const h = document.querySelector('.exam-header');
                if (h) total += h.offsetHeight;
                const gi = document.querySelector('.general-info');
                if (gi) total += gi.offsetHeight + 16; // 8px margin-top, 8px margin-bottom
                return total;
            }"""
            header_h = await page.evaluate(header_js)
            
            # Content height of A4 minus margins (top 1.2cm, bottom 2cm): 
            # 297mm - 32mm = 265mm. Ở độ phân giải 96DPI, 265mm = chính xác 1001.57px.
            # CSS px chuẩn: 1in=96px, không làm tròn trung gian.
            page_content_px = (297.0 - 12.0 - 20.0) * 96.0 / 25.4
            heights['__PAGE__'] = page_content_px
            heights['__EXAMHDR__'] = header_h
            heights['__FIRST__'] = page_content_px - header_h - 4.0  # .questions margin-top
            
            await browser.close()
    finally:
        try:
            os.unlink(temp_html)
        except OSError:
            pass
            
    return heights

def measure_unit_heights_html_sync(html_content: str) -> dict:
    import asyncio
    return asyncio.run(measure_unit_heights_html_async(html_content))


# ═══════════════════════════════════════════════════════════════════════════════
# PDF export via Playwright
# ═══════════════════════════════════════════════════════════════════════════════

async def html_to_pdf(html_content: str, output_path: str, code: str = "000",
                      html_output_path: str = None):
    """Save HTML to temp file, open in Chromium, wait for Temml, print to PDF.

    html_output_path: nếu truyền vào, ghi thêm bản HTML ĐÃ render sẵn MathML
    (bỏ script) -> file tự chứa, mở offline vẫn thấy công thức.
    """
    from playwright.async_api import async_playwright
    import fitz
    import tempfile
    import os
    import html as html_module

    temp_pdf_fd, temp_pdf_path = tempfile.mkstemp(suffix='.pdf')
    os.close(temp_pdf_fd)

    with tempfile.NamedTemporaryFile(suffix='.html', delete=False, mode='w', encoding='utf-8') as f:
        f.write(html_content)
        temp_html = f.name

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            file_url = 'file:///' + temp_html.replace('\\', '/')
            await page.goto(file_url, wait_until='networkidle')

            try:
                await page.wait_for_function(
                    "document.body.getAttribute('data-math-ready') === 'true'",
                    timeout=30000,
                )
            except Exception:
                print("Warning: Math rendering may not have completed")

            # Wait for Paged.js to finish rendering pages
            try:
                await page.wait_for_selector(".pagedjs_page", timeout=30000)
            except Exception:
                print("Warning: Paged.js may not have completed")

            await page.wait_for_timeout(1000)

            # Final PDF: rely entirely on Paged.js for layout, margins, and headers/footers.
            await page.pdf(
                path=output_path,
                print_background=True,
                prefer_css_page_size=True,
                display_header_footer=False,
                margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'}
            )

            # Ghi bản HTML đã render sẵn MathML: bỏ hết <script> để khi mở lại
            # Temml không chạy đè lên công thức đã render.
            if html_output_path:
                await page.evaluate(
                    "document.querySelectorAll('script').forEach(function(s){ s.remove(); })"
                )
                rendered_html = await page.content()
                with open(html_output_path, 'w', encoding='utf-8') as f:
                    f.write(rendered_html)
                print(f"HTML (MathML san, tu chua) saved to: {html_output_path}")

            await browser.close()

        print(f"PDF saved to: {output_path}")
    finally:
        try:
            os.unlink(temp_html)
        except OSError:
            pass
        try:
            os.unlink(temp_pdf_path)
        except OSError:
            pass


def html_to_pdf_sync(html_content: str, output_path: str, code: str = "000",
                     html_output_path: str = None):
    """Sync wrapper."""
    import asyncio
    asyncio.run(html_to_pdf(html_content, output_path, code, html_output_path))
