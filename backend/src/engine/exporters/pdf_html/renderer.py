"""
HTML + MathJax 3 (CHTML) + Playwright PDF Export

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
import itertools
import urllib.parse
from pathlib import Path
from typing import List, Dict, Any
from ..common import resolve_image_file, raster_native_width_pt
from doctree import content_len, has_image, question_to_rec
from doctree.figures import svg_native_width_in
from doctree.read.tex import to_doc as _tex_to_doc
from doctree.write.html import doc_to_html, inline_html, block_html


PDF_FONT_URL = "https://exam-fonts.local"
PDF_FONT_DIR = str(Path(__file__).resolve().parents[5] / "assets" / "fonts" / "document")
BUNDLED_FONT_FACE_CSS = f"""
@font-face {{
    font-family: 'Exam Times New Roman';
    src: url('{PDF_FONT_URL}/times.ttf') format('truetype');
    font-style: normal;
    font-weight: 400;
    font-display: block;
}}
@font-face {{
    font-family: 'Exam Times New Roman';
    src: url('{PDF_FONT_URL}/timesbd.ttf') format('truetype');
    font-style: normal;
    font-weight: 700;
    font-display: block;
}}
@font-face {{
    font-family: 'Exam Times New Roman';
    src: url('{PDF_FONT_URL}/timesi.ttf') format('truetype');
    font-style: italic;
    font-weight: 400;
    font-display: block;
}}
@font-face {{
    font-family: 'Exam Times New Roman';
    src: url('{PDF_FONT_URL}/timesbi.ttf') format('truetype');
    font-style: italic;
    font-weight: 700;
    font-display: block;
}}
@font-face {{
    font-family: 'Exam Cambria';
    src: url('{PDF_FONT_URL}/Cambria.ttf') format('truetype');
    font-style: normal;
    font-weight: 400;
    font-display: block;
}}
@font-face {{
    font-family: 'Exam Cambria Math';
    src: url('{PDF_FONT_URL}/CambriaMath.ttf') format('truetype');
    font-style: normal;
    font-weight: 400;
    font-display: block;
}}
"""
BUNDLED_FONT_FAMILY = "'Exam Times New Roman', 'Times New Roman', serif"


# Image helpers

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


def _figure_data_uri(row: dict, abs_path: str) -> str:
    """Đường dẫn hình -> data URI, nhúng THẲNG file đã tra được — SVG không
    còn bị thay bằng bản PNG dựng sẵn nữa (PNG đó dựng ở DPI khác 96, nhúng
    qua `<img>` không kèm `style` sẽ ra sai kích thước, xem `raster_native_width_pt`)."""
    return _img_to_data_uri(abs_path) if os.path.exists(abs_path) else ''


_SVG_ID_RE = re.compile(r'\bid="([^"]+)"')
_SVG_HREF_RE = re.compile(r'\b(xlink:href|href)="#([^"]+)"')
_SVG_URL_REF_RE = re.compile(r'url\(#([^)]+)\)')
_svg_instance_counter = itertools.count()


def _svg_inline_markup(abs_path: str) -> str:
    """Đọc thẳng nội dung `<svg>...</svg>` để nhúng làm DOM gốc (KHÔNG qua
    `<img src="data:image/svg+xml...">`) — đã kiểm chứng: Chromium `page.pdf()`
    (in PDF) âm thầm bỏ hẳn `<img>` nguồn SVG data URI (DOM tải ảnh, screenshot
    thấy ảnh bình thường; chỉ riêng lúc IN PDF là mất — PNG data URI thì in
    đúng), nên buộc phải nhúng thẳng thẻ `<svg>`.

    `id`/`href="#..."`/`url(#...)` (dùng cho `clip-path`/`fill`/`mask`...) bên
    trong file (do `pdftocairo` sinh, kiểu "glyph-0-0", "clip-0" — KHÔNG duy
    nhất giữa các file, đã kiểm chứng nhiều ảnh TikZ trùng hệt id) phải đổi
    tên riêng theo từng ảnh trước khi nhúng: nhúng thẳng vào cùng 1 trang HTML
    thì `id` có phạm vi TOÀN TRANG, không còn riêng theo từng thẻ `<svg>` nữa
    — nhiều ảnh trùng id trên cùng trang sẽ khiến `<use>`/`clip-path` của ảnh
    này trỏ lệch sang phần tử định nghĩa trong ảnh KHÁC. Đánh số theo LƯỢT
    NHÚNG (bộ đếm toàn cục), không theo id file — cùng 1 ảnh có thể được nhúng
    NHIỀU LẦN trên cùng trang (đề gốc + lời giải chi tiết render lại), nếu
    đánh số theo id file thì 2 lượt nhúng của CÙNG 1 ảnh vẫn trùng id nhau."""
    try:
        with open(abs_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception:
        return ''
    idx = content.find('<svg')
    if idx < 0:
        return ''
    content = content[idx:]
    prefix = f'svgf{next(_svg_instance_counter)}-'
    content = _SVG_ID_RE.sub(lambda m: f'id="{prefix}{m.group(1)}"', content)
    content = _SVG_HREF_RE.sub(lambda m: f'{m.group(1)}="#{prefix}{m.group(2)}"', content)
    content = _SVG_URL_REF_RE.sub(lambda m: f'url(#{prefix}{m.group(1)})', content)
    return content


def _html_figures(images: list, linked_assets: bool = False) -> dict:
    """`[q_images...]` -> `{figure_id: row}`, `storage_path` đã là data URI.

    HTML dựng ra được đưa thẳng cho Playwright, không có máy chủ đứng giữa để
    phục vụ ảnh theo đường dẫn tương đối — nên phải nhúng base64 ngay tại đây,
    khác với bộ ghi `.docx`/`.tex` chỉ cần đường dẫn file.

    `width` NULL — không bịa tỉ lệ, lấy đúng bề rộng gốc bằng pt. SVG (TikZ)
    thì con số này CÓ SẴN ngay trong chính file (`pdftocairo` ghi theo point) —
    không tính/đo gì thêm, chỉ đọc lại đúng số đó và khai rõ đơn vị `pt` cho
    trình duyệt, thay vì để trống rồi bị hiểu lầm thành px (96dpi) làm ảnh
    nhỏ hơn thật ~25%. Ảnh raster (PNG/JPG — công thức MathType, ảnh rời...)
    thì đọc DPI thật của chính file để quy ra pt, vì lý do tương tự.
    """
    out = {}
    for img in images or []:
        row = dict(img)
        abs_path, _matched = resolve_image_file(row.get('storage_path') or '', [row])
        is_svg = abs_path.lower().endswith('.svg')
        if row.get('width') is None:
            if is_svg:
                in_ = svg_native_width_in(abs_path)
                if in_:
                    row['native_width_pt'] = in_ * 72.0
            else:
                pt = raster_native_width_pt(abs_path)
                if pt:
                    row['native_width_pt'] = pt
        if linked_assets:
            # PDF backend có route nội bộ `exam-assets.local`; HTML chỉ giữ
            # URL ngắn nên Paged.js clone thẻ <img>, không clone hàng chục MB
            # path SVG. Preview trình duyệt vẫn dùng nhánh nhúng cũ vì không
            # truy cập được route Playwright nội bộ này.
            stored = str(row.get('storage_path') or '').replace('\\', '/')
            row['storage_path'] = (
                'https://exam-assets.local/'
                + urllib.parse.quote(stored.lstrip('/'), safe='/')
            )
        elif is_svg:
            row['inline_svg'] = _svg_inline_markup(abs_path)
            row['storage_path'] = ''
        else:
            row['storage_path'] = _figure_data_uri(row, abs_path)
        out[row['id']] = row
        out[str(row['id'])] = row
    return out


def _math_fmt(tex: str, display: bool) -> str:
    """Công thức -> `<span class="math">`/`<div class="math display">`.

    Dự án dùng Temml (không phải KaTeX auto-render), nên JS tự đọc
    `el.textContent` và gọi `temml.render(...)` — xem script trong
    `render_exam_html()`. Đây là lý do phải truyền `math_fmt` riêng thay vì
    dùng mặc định `\\(...\\)` của `doctree.write.html`.
    """
    cls = "math display" if display else "math"
    tag = "div" if display else "span"
    return f'<{tag} class="{cls}">{tex}</{tag}>'


def _option_html(doc, figures) -> str:
    """Nội dung một phương án -> HTML, không bọc ảnh đáp án bằng ``figure``.

    Ở cấp doctree, ảnh đứng riêng là node ``image`` vì đó là một block hợp lệ
    trong nội dung nói chung. Tuy nhiên trong một phương án, chính ``.option``
    đã là khối bố cục và nhãn ``A./B./...`` phải nằm sát ảnh. Nếu chuyển node
    này qua ``block_html`` thì nó thành ``<figure>`` và trình duyệt dành cả vùng
    block trước khi đặt ảnh, tạo ra khoảng trống lớn sau nhãn đáp án.
    """
    blocks = (doc or {}).get("content", [])
    parts = []
    for block in blocks:
        block_type = block.get("type")
        if block_type == "paragraph":
            parts.append(inline_html(block.get("content", []), figures, _math_fmt))
        elif block_type in ("image", "image_inline"):
            # Render trực tiếp thành inline image ngay sau nhãn phương án.
            parts.append(inline_html([
                {"type": "image_inline", "figure_id": block["figure_id"]}
            ], figures, _math_fmt))
        else:
            # Bảng/danh sách vẫn cần cấu trúc block riêng của chúng.
            parts.append(block_html([block], figures, _math_fmt))
    return "".join(parts)


def _tf_explanation_html(doc, figures, lead: str) -> str:
    """Dựng một lời giải Đúng/Sai với HTML block hợp lệ.

    Đoạn chữ đầu nằm cùng hàng với ``a) Đúng/Sai.``; bảng, ảnh, danh sách và
    các block tiếp theo đứng ngoài ``<p>`` để trình duyệt/Paged.js không tự
    sửa DOM theo những cách khác nhau.
    """
    blocks = list((doc or {}).get("content", []))
    parts = []
    if blocks and blocks[0].get("type") == "paragraph":
        first = blocks.pop(0)
        parts.append(
            f'<p style="margin-top:2px"><strong>{lead}</strong> '
            f'{inline_html(first.get("content", []), figures, _math_fmt)}</p>'
        )
    else:
        parts.append(f'<p style="margin-top:2px"><strong>{lead}</strong></p>')
    if blocks:
        parts.append(block_html(blocks, figures, _math_fmt))
    return "".join(parts)


# Question renderers

def _render_mc_options(rec: dict, figures: dict, layout: str, show_answers: bool) -> str:
    opts = []
    max_len = 0
    img_in_opts = False

    for i, o in enumerate(rec["options"]):
        label = chr(65 + i)
        opt_html = _option_html(o["content_doc"], figures)
        is_correct = o["is_correct"] and show_answers

        max_len = max(max_len, content_len(o["content_doc"]))
        if has_image(o["content_doc"]):
            img_in_opts = True

        if is_correct:
            label_html = f'<strong class="correct-label">{label}</strong><strong>.</strong> '
        else:
            label_html = f'<strong>{label}.</strong> '
        opts.append(f'<span class="option">{label_html}{opt_html}</span>')

    if layout == '4':
        cols = 4
    elif layout == '2':
        cols = 2
    elif layout == '1':
        cols = 1
    else:
        cols = 'auto'
    image_cls = " has-image" if img_in_opts else ""
    return f'<div class="options cols-{cols}{image_cls}">{"".join(opts)}</div>'


def _render_tf_options(rec: dict, figures: dict, show_answers: bool) -> str:
    parts = ['<div class="tf-options">']
    for i, o in enumerate(rec["options"]):
        label = chr(97 + i)
        opt_html = _option_html(o["content_doc"], figures)
        if o["is_correct"] and show_answers:
            label_html = f'<strong class="correct-label">{label}</strong><strong>)</strong> '
        else:
            label_html = f'<strong>{label})</strong> '
        parts.append(f'<div class="tf-item">{label_html}{opt_html}</div>')
    parts.append('</div>')
    return '\n'.join(parts)


def _side_class(doc: dict) -> str:
    """`{"side": "left"/"right"}` -> class CSS gắn thẳng lên khối chứa cả đáp
    án/lời giải (`.question-content`/`.solution`), không phải một `<div>` lồng
    riêng — để float còn ảnh hưởng tới đáp án/lời giải render sau đó."""
    side = (doc or {}).get("side")
    return f" doc-side-{side}" if side in ("left", "right") else ""


def _section_label_html(label: str) -> str:
    """In đậm đúng tên phần, không in đậm câu hướng dẫn phía sau."""
    heading, separator, instruction = label.partition(" Thí sinh")
    heading = html_module.escape(heading)
    if not separator:
        return f"<strong>{heading}</strong>"
    return f"<strong>{heading}</strong> {html_module.escape('Thí sinh' + instruction)}"


def _add_pdf_image_markers(content_html: str, question_css_id: str) -> str:
    """Gắn marker theo đúng ID câu + ID ảnh vào từng figure ở PDF nháp."""
    def inject(match):
        fid = match.group(2)
        marker = html_module.escape(f"[[IMGQID:{question_css_id}:{fid}]]")
        return f'{match.group(1)}<span class="pdf-image-marker">{marker}</span>'

    return re.sub(
        r'(<figure\s+class="doc-figure-block"\s+data-figure-id="([^"]+)">)',
        inject, content_html,
    )


def _render_single_question(q: dict, counter: int, include_solution: bool, show_answers: bool,
                             id_prefix: str = "q-", pdf_marker: bool = False,
                             linked_image_assets: bool = False) -> str:
    rec = question_to_rec(q)
    qt = rec["question_type"]
    figures = _html_figures(q.get('images') or [], linked_image_assets)
    layout = q.get('layout_type', '') or ''

    question_css_id = f'{id_prefix}{q.get("id", counter)}'
    parts = [f'<div class="question" id="{question_css_id}">']

    content_html = doc_to_html(rec["content_doc"], figures, _math_fmt)
    if pdf_marker:
        content_html = _add_pdf_image_markers(content_html, question_css_id)
    # Chèn "Câu N:" vào đúng đoạn đầu, để tiêu đề và đề bài nằm chung dòng —
    # content_html luôn mở bằng đúng một thẻ <p> (trừ khi đoạn đầu là ảnh khối,
    # rất hiếm), nên chỉ cần thay thế lần xuất hiện đầu tiên.
    question_marker = (
        f'<span class="pdf-question-marker">[[QID:{question_css_id}]]</span>'
        if pdf_marker else ''
    )
    content_html = content_html.replace(
        '<p>', f'<p><strong>Câu {counter}:</strong>{question_marker} ', 1,
    )
    cls = "question-content" + (" immini" if layout.startswith("immini") else "") \
        + _side_class(rec["content_doc"])
    parts.append(f'<div class="{cls}">')
    parts.append(content_html)

    if qt == 'mc':
        parts.append(_render_mc_options(rec, figures, layout, show_answers))
    elif qt == 'tf':
        parts.append(_render_tf_options(rec, figures, show_answers))
    elif qt == 'sa':
        if show_answers and rec["options"] and not include_solution:
            ans = _option_html(rec["options"][0]["content_doc"], figures)
            parts.append(f'<div class="short-answer">Trả lời: <span class="answer-box">{ans}</span></div>')

    parts.append('</div>')  # close question-content

    if include_solution:
        sol_html = doc_to_html(rec["solution_doc"], figures, _math_fmt)
        has_sol = bool(rec["solution_doc"].get("content"))
        extra_html = ""

        if qt == 'mc' and rec["options"]:
            correct_labels = [chr(65 + i) for i, o in enumerate(rec["options"]) if o["is_correct"]]
            if correct_labels:
                extra_html = f'<p style="margin-top: 4px;"><strong>Chọn {", ".join(correct_labels)}</strong></p>'

        elif qt == 'tf' and rec["options"]:
            tf_parts = []
            for i, o in enumerate(rec["options"]):
                label = chr(97 + i)
                tf_status = "Đúng" if o["is_correct"] else "Sai"
                expl = o.get("explaination_doc")
                lead = f"{label}) {tf_status}."
                tf_parts.append(
                    _tf_explanation_html(expl, figures, lead)
                    if expl else f'<p style="margin-top:2px"><strong>{lead}</strong></p>'
                )
            extra_html = "".join(tf_parts)

        elif qt == 'sa' and rec["options"]:
            ans = _option_html(rec["options"][0]["content_doc"], figures)
            extra_html = f'<p style="margin-bottom: 4px;"><strong>Trả lời ngắn:</strong> {ans}</p>'

        if has_sol or extra_html:
            sol_body = sol_html if has_sol else ""
            content_order = f"{extra_html}{sol_body}" if qt == 'sa' else f"{sol_body}{extra_html}"
            sol_cls = "solution" + _side_class(rec["solution_doc"])
            parts.append(f'<div class="{sol_cls}"><p class="solution-header">Lời giải</p>{content_order}</div>')

    parts.append('</div>')  # close question
    return '\n'.join(parts)


# Full exam renderer

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
    font_family: str = BUNDLED_FONT_FAMILY,
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
            body_html.append(
                f'<div class="section-header">{_section_label_html(section_labels[eff_type])}</div>'
            )
            printed[eff_type] = True
            q_counter = 1

        if q_type == 'st':
            children = [c for c in questions if c.get('parent_id') == q['id']]

            child_count = len(children)
            if child_count > 0:
                start_c = q_counter
                end_c = q_counter + child_count - 1
                prefix_text = f"Dựa vào thông tin dưới đây để trả lời các câu từ {start_c} đến {end_c}."
            else:
                prefix_text = "Dựa vào thông tin dưới đây:"

            rec = question_to_rec(q)
            figures = _html_figures(q.get('images') or [])
            content_html = doc_to_html(rec["content_doc"], figures, _math_fmt)
            cls = "question-content" + (" immini" if layout.startswith("immini") else "") \
                + _side_class(rec["content_doc"])
            body_html.append(f'<div class="question stimulus" id="q-{q_id}" style="margin-bottom: 5px;">')
            body_html.append(f'<div class="stimulus-prefix" style="margin-bottom: 5px;"><p><em>{prefix_text}</em></p></div>')
            body_html.append(f'<div class="{cls}">{content_html}</div>')
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
        // 'flow-root' (không phải 'block') để đo: vẫn tự thu hẹp cạnh ảnh nổi
        // (float) như 'flex' cũ, nhưng không ép các .option thành flex-item
        // nên .option vẫn đo được bề rộng tự nhiên qua inline-block bên dưới.
        grid.style.display = 'flow-root';
        opts.forEach(function(opt) {{
            opt.style.display = 'inline-block';
            opt.style.width = 'auto';
            opt.style.whiteSpace = 'nowrap';
            maxW = Math.max(maxW, opt.getBoundingClientRect().width);
        }});

        // Đo trên bề ngang khả dụng THẬT (containerW đã tự thu hẹp cạnh ảnh
        // nổi nhờ 'flow-root' ở trên) — câu có ảnh cạnh vẫn được 4 cột nếu
        // đáp án đủ ngắn để chia đều vừa khung hẹp đó, không ép cứng.
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
        const imageClass = grid.classList.contains("has-image") ? " has-image" : "";
        grid.className = "options cols-" + cols + imageClass;
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
                <td class="header-left" style="width: 33.33%; text-align: center; vertical-align: top; line-height: 1.25;">
                    <strong>{html_module.escape(department or 'BỘ GIÁO DỤC VÀ ĐÀO TẠO')}</strong>
                    <div style="border-bottom: 1px solid #000; margin: 2px auto 4px auto; width: 70%;"></div>
                    <span>{html_module.escape(exam_type or 'ĐỀ THI CHÍNH THỨC')}</span><br>
                    <em>(Đề thi có ... trang)</em>
                </td>
                <td class="header-right" style="width: 66.67%; text-align: center; vertical-align: top; line-height: 1.25;">
                    <strong>{html_module.escape(exam_title)}</strong><br>
                    <strong>Môn thi: {html_module.escape(subject or '...')}</strong><br>
                    <em>Thời gian làm bài: {duration} phút, không kể thời gian phát đề</em>
                    <div style="border-bottom: 1px solid #000; margin: 2px auto 4px auto; width: 55%;"></div>
                </td>
            </tr>
        </table>
        <table class="header-table info-table" style="margin-top: 16px;">
            <tr>
                <td class="info-left" style="width: 66.67%; vertical-align: bottom; line-height: 1.25; text-align: left;">
                    <strong>Họ, tên thí sinh: ........................................................................</strong><br>
                    <strong>Số báo danh: .............................................................................</strong>
                </td>
                <td class="info-right" style="width: 33.33%; text-align: center; vertical-align: middle;">
                    <div class="code-box" style="display: inline-flex; align-items: center; justify-content: center; border: 1px solid #000; padding: 0px 43px; font-size: 12pt; height: 24px;"><strong>Mã đề: {html_module.escape(code)}</strong></div>
                </td>
            </tr>
        </table>
    </div>

    {f'<div class="general-info">{doc_to_html(_tex_to_doc(general_info), None, _math_fmt)}</div>' if general_info else ''}

    <div class="questions">
        {body_content}
    </div>

    <div class="exam-footer">
        <strong>{'-' * 24} HẾT {'-' * 24}</strong>
    </div>
</div>
</body>
</html>"""


# CSS

def _get_css(font_family: str = BUNDLED_FONT_FAMILY, math_font: str = "") -> str:
    # Với Temml, không cần CSS ép font toán vì Temml-Local.css đã tự dùng Cambria Math.
    math_css = ""
    css = BUNDLED_FONT_FACE_CSS + """
/* Reset & base */
* { margin: 0; padding: 0; box-sizing: border-box; }

@page {
    size: A4;
    margin: 1.15cm 1.2cm 2cm 1.5cm;
}

body {
    font-family: __FONT_FAMILY__;
    font-size: 12pt;
    line-height: 1.25;
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
    font-family: "Exam Cambria Math", math, serif;
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
.general-info span.math {
    vertical-align: 0em;
}

/* Chữ trong lệnh text (và mathrm tiếng Việt đã đổi sang text): dùng Cambria —
   font chữ cùng họ với Cambria Math nên nhìn đồng bộ, lại đủ dấu tiếng Việt. */
math mtext {
    font-family: "Exam Cambria", "Exam Times New Roman", serif;
}

.page {
    max-width: 210mm;
    margin: 0 auto;
}

/* Header */
.header-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
.header-left  { width: 35%; text-align: center; vertical-align: top; line-height: 1.25; padding-right: 8px; }
.exam-type-line { text-decoration: overline; }
.header-right { width: 65%; text-align: center; vertical-align: top; line-height: 1.25; }
.info-table   { margin-top: 8px; }
.info-left    { width: 60%; vertical-align: bottom; line-height: 1.25; }
.info-right   { width: 40%; text-align: right; vertical-align: middle; }
.code-box     { display: inline-block; border: 1px solid #000; padding: 0px 43px; font-size: 12pt; }
.general-info { margin-top: 8px; margin-bottom: 8px; }

/* Section headers */
.section-header { margin-top: 6px; margin-bottom: 4px; text-align: justify; page-break-inside: avoid; break-inside: avoid; }

/* Questions */
.questions    { margin-top: 4px; }
.question     { margin-bottom: 6px; page-break-inside: avoid; break-inside: avoid; }
.question-content { text-align: justify; line-height: 1.25; }
.question-content p { margin: 0; }
.latex-table-wrap { overflow-x: auto; margin: 8px 0; display: flex; justify-content: center; }
.latex-table { border-collapse: collapse; width: auto; max-width: 100%; font-size: 0.95em; }
.latex-table td { border: 1px solid #000; padding: 4px 7px; text-align: center; vertical-align: middle; }

/* Wrap text (immini layout): doc-side-left/right gắn thẳng lên .question-content
   hoặc .solution (không còn <div> lồng riêng chỉ bọc đoạn văn) — clearfix đặt
   NGAY TRÊN chính khối đó nên chỉ có hiệu lực SAU KHI đáp án/lời giải bên
   trong đã render xong; suốt lúc đó chúng vẫn nằm trong vùng ảnh hưởng của
   float, nên chảy tiếp bên cạnh ảnh thay vì nhảy hẳn xuống dưới. */
.question-content.doc-side-left::after,
.question-content.doc-side-right::after,
.solution.doc-side-left::after,
.solution.doc-side-right::after {
    content: "";
    display: table;
    clear: both;
}
.doc-side-right .doc-figure-block {
    float: right; margin: 0 0 6px 12px; page-break-inside: avoid;
}
.doc-side-left .doc-figure-block {
    float: left; margin: 0 12px 6px 0; page-break-inside: avoid;
}
.doc-figure-block { text-align: center; page-break-inside: avoid; }
.doc-figure-block img, .doc-figure { display: inline-block; height: auto; }
.doc-figure-inline { vertical-align: middle; }
.doc-figure.is-missing, .doc-figure-inline.is-missing {
    display: inline-block; color: #b91c1c; font-style: italic; font-size: 0.85em;
}
.doc-figure-svg svg { display: block; width: 100%; height: auto; }
.doc-figure-svg.doc-figure-inline { display: inline-block; vertical-align: middle; }
.doc-figure-svg.doc-figure-inline svg { display: block; width: 100%; height: auto; }
.doc-table { border-collapse: collapse; margin: 8px auto; width: 100%; table-layout: fixed; font-size: 0.95em; }
.doc-table td { border: 1px solid #000; padding: 4px 7px; text-align: center; vertical-align: middle; overflow-wrap: anywhere; word-break: break-word; }
.question ul, .question ol { margin: 3px 0 3px 1.25em; padding-left: 1.1em; }
.question ul { list-style-type: disc; }
.question ul ul { list-style-type: circle; }
.question ol { list-style-type: decimal; }
.question li { margin: 1px 0; }
.doc-math { text-align: center; }

/* MC Options */
.options { display: flex; flex-wrap: wrap; margin-top: 1px; margin-bottom: 1px; line-height: 1.25; }
.options .option {
    padding: 1px 12px 1px 0;
    break-inside: avoid;
    page-break-inside: avoid;
}
.options .option > .doc-figure-block {
    display: inline-block;
    width: auto;
    margin: 0 0 0 4px;
    vertical-align: middle;
    text-align: left;
}
.options.cols-4 .option { width: 25%; }
.options.cols-2 .option { width: 50%; }
.options.cols-1 .option { width: 100%; }
/* Với đáp án chữ một-cột bên cạnh ảnh trôi, bỏ flex container để từng đáp
   án tự lấy lại toàn bộ chiều ngang ngay khi đã đi qua đáy ảnh. Câu có ảnh
   trong phương án giữ flex để nhãn và ảnh không bị tách bố cục. */
.question-content.doc-side-left > .options.cols-1:not(.has-image),
.question-content.doc-side-right > .options.cols-1:not(.has-image) {
    display: block;
}
.question-content.doc-side-left > .options.cols-1:not(.has-image) > .option,
.question-content.doc-side-right > .options.cols-1:not(.has-image) > .option {
    display: block;
    width: auto;
}
.correct-label { color: #d32f2f; text-decoration: underline; font-weight: bold; }

/* TF Options */
.tf-options { margin-top: 1px; line-height: 1.25; }
.tf-item    { margin-bottom: 1px; }

/* Short Answer */
.short-answer { margin-top: 2px; }
.answer-box   { font-weight: bold; text-decoration: underline; }

/* Solution */
.solution { margin-top: 2px; margin-bottom: 2px; line-height: 1.25; }
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


# Measure heights via Playwright

async def measure_unit_heights_html_async(html_content: str) -> dict:
    heights = {}
    # Dùng chung Chromium của luồng xuất và nạp HTML trực tiếp; phép đo này
    # không cần tạo file HTML tạm hay khởi động một browser riêng.
    browser = await _get_browser()
    page = await browser.new_page(viewport={"width": 794, "height": 3000})
    try:
        await page.set_content(html_content, wait_until='networkidle')
        if True:  # giữ cùng scope đo sau khi bỏ lớp context browser cũ
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

                    // 'flow-root' (không phải 'block'): vẫn tự thu hẹp cạnh ảnh
                    // nổi (float) như 'flex' cũ lúc đo, không ép .option thành
                    // flex-item nên vẫn đo được bề rộng tự nhiên qua inline-block.
                    grid.style.display = 'flow-root';
                    opts.forEach(opt => {
                        opt.style.display = 'inline-block';
                        opt.style.width = 'auto';
                        opt.style.whiteSpace = 'nowrap';
                        maxW = Math.max(maxW, opt.getBoundingClientRect().width);
                    });

                    // containerW đã tự thu hẹp cạnh ảnh nổi (float) nhờ đo bằng
                    // 'flow-root' ở trên — câu có ảnh cạnh vẫn ra 4 cột nếu đáp
                    // án đủ ngắn để chia đều vừa khung hẹp đó, không ép cứng.
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
                    const imageClass = grid.classList.contains('has-image') ? ' has-image' : '';
                    grid.className = `options cols-${cols}${imageClass}`;
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
            
    finally:
        await page.close()
            
    return heights

def measure_unit_heights_html_sync(html_content: str) -> dict:
    loop = _ensure_browser_loop()
    future = asyncio.run_coroutine_threadsafe(
        measure_unit_heights_html_async(html_content), loop,
    )
    return future.result()


# PDF export via Playwright

import asyncio
import threading

# Trình duyệt Chromium DÙNG CHUNG, khởi tạo 1 LẦN, sống xuyên suốt tiến trình
# server — mỗi lần in PDF chỉ mở/đóng 1 TAB (`browser.new_page()`) bên trong
# nó, không `browser.close()` rồi mở tiến trình Chromium mới cho từng lần.
# `async_playwright()`/`Browser` gắn chặt với 1 event loop cụ thể, nên KHÔNG
# thể tái dùng qua nhiều lần `asyncio.run()` riêng rẽ (mỗi lần tạo loop mới)
# — phải giữ 1 event loop nền chạy suốt trong 1 thread riêng, các lệnh gọi
# đồng bộ nộp việc vào loop đó qua `run_coroutine_threadsafe`.
#
# LƯU Ý: đã từng nghi ngờ chính cơ chế này gây ra 1 ca PDF in ra chữ co nhỏ
# bất thường (~94% kích thước thật) trên đúng 1 đề cụ thể — đã revert thử về
# "mở tiến trình mới mỗi lần" nhưng bug đó VẪN CÒN xảy ra (xác nhận qua test
# thật), nên không phải do trình duyệt dùng chung. Quay lại dùng chung theo
# đúng yêu cầu; nguyên nhân thật của ca co chữ đó đang truy tìm riêng (khả
# năng: 1 phần tử có bề ngang vượt cột nội dung trong chính HTML đề đó).
_browser_loop: "asyncio.AbstractEventLoop | None" = None
_browser_thread: "threading.Thread | None" = None
_browser = None
_browser_init_lock = threading.Lock()


def _ensure_browser_loop() -> "asyncio.AbstractEventLoop":
    global _browser_loop, _browser_thread
    if _browser_loop is not None:
        return _browser_loop
    with _browser_init_lock:
        if _browser_loop is not None:
            return _browser_loop
        loop = asyncio.new_event_loop()

        def _run():
            asyncio.set_event_loop(loop)
            loop.run_forever()

        thread = threading.Thread(target=_run, daemon=True, name="pdf-browser-loop")
        thread.start()
        _browser_loop = loop
        _browser_thread = thread
    return _browser_loop


async def _get_browser():
    global _browser
    if _browser is None or not _browser.is_connected():
        from playwright.async_api import async_playwright
        pw = await async_playwright().start()
        _browser = await pw.chromium.launch()
    return _browser


def _with_pdf_print_style(html_content: str) -> str:
    """Thêm khổ in rộng dùng để cho công thức tràn lề rồi crop về A4."""
    # Chromium tự scale-to-fit TOÀN tài liệu nếu một MathML inline rộng hơn
    # cột in. In trên một trang tạm rộng thêm đúng lề phải (12 mm), nhưng giữ
    # body ở nguyên bề rộng vùng nội dung A4 (183 mm), cho công thức được vẽ
    # qua lề mà vẫn nằm trong printable area. PDF được crop về A4 ngay sau
    # page.pdf(); phần vượt mép giấy vì thế mới bị mất, không phải phần vừa
    # vượt mép cột. Padding của margin box giữ footer ở vị trí A4 ban đầu.
    print_overflow_style = """<style id="pdf-print-overflow-fix">
@page {
    size: 222mm 297mm !important;
    margin: 1.15cm 1.2cm 2cm 1.5cm !important;
    @bottom-right { padding-right: 12mm; }
}
body { width: 183mm !important; }
</style>
"""
    return html_content.replace(
        '</head>', print_overflow_style + '</head>', 1,
    )


async def _new_prepared_pdf_page(html_content: str):
    """Mở một tab, render Temml/font đúng một lần và trả tab đã sẵn sàng."""
    browser = await _get_browser()
    page = await browser.new_page(viewport={'width': 794, 'height': 1123})
    try:
        await page.set_content(_with_pdf_print_style(html_content), wait_until='networkidle')

        try:
            await page.wait_for_function(
                "document.body.getAttribute('data-math-ready') === 'true'",
                timeout=30000,
            )
        except Exception:
            print("Warning: Math rendering may not have completed")

        await page.evaluate("document.fonts.ready")
        await page.wait_for_timeout(1000)
        return page
    except Exception:
        await page.close()
        raise


async def _page_to_cropped_pdf_bytes(page) -> bytes:
    """In trạng thái DOM hiện tại và crop đúng như pipeline PDF truyền thống."""
    wide_pdf = await page.pdf(
        print_background=True,
        prefer_css_page_size=True,
        display_header_footer=False,
        margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'},
        scale=1.0,
    )

    import fitz
    wide_doc = fitz.open(stream=wide_pdf, filetype='pdf')
    try:
        for pdf_page in wide_doc:
            pdf_page.set_mediabox(
                fitz.Rect(0, 0, 594.96, pdf_page.mediabox.height)
            )
        return wide_doc.tobytes()
    finally:
        wide_doc.close()


def _stamp_section_footers(pdf_bytes: bytes, exam_pages: int,
                           answer_pages: int, code: str) -> bytes:
    """Đóng footer theo phạm vi đề/đáp án trong cùng lần xử lý PyMuPDF."""
    import os
    import fitz

    font_candidates = [
        os.path.join(PDF_FONT_DIR, 'times.ttf'),
        os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', 'times.ttf'),
        '/usr/share/fonts/truetype/msttcorefonts/Times_New_Roman.ttf',
        '/usr/share/fonts/truetype/msttcorefonts/times.ttf',
        '/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
    ]
    font_path = next((path for path in font_candidates if os.path.isfile(path)), None)
    if not font_path:
        raise RuntimeError('Không tìm thấy font serif Unicode để đóng footer PDF')

    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    font = fitz.Font(fontfile=font_path)
    try:
        total_pages = len(doc)
        for index, pdf_page in enumerate(doc):
            if index < exam_pages:
                local_page = index + 1
                local_total = exam_pages
            else:
                local_page = index - exam_pages + 1
                local_total = answer_pages or max(1, total_pages - exam_pages)
            footer = f"Trang {local_page}/{local_total} - Mã đề thi {code}"
            font_name = 'ExamFooterTimes'
            pdf_page.insert_font(fontname=font_name, fontfile=font_path)
            text_width = font.text_length(footer, fontsize=12)
            # Khớp mép phải 1,2 cm và baseline footer Chromium cũ.
            pdf_page.insert_text(
                (pdf_page.rect.width - 32.72 - text_width, 817.0),
                footer,
                fontname=font_name,
                fontsize=12,
                color=(0, 0, 0),
                overlay=True,
            )
        return doc.tobytes()
    finally:
        doc.close()


async def _run_pdf_page_session(html_content: str, worker):
    """Chạy `worker(page)` trên một tab đã render xong, rồi luôn đóng tab."""
    page = await _new_prepared_pdf_page(html_content)
    try:
        return await worker(page)
    finally:
        await page.close()


def html_pdf_page_session_sync(html_content: str, worker):
    """Wrapper đồng bộ cho một chuỗi nhiều lượt PDF dùng chung đúng một tab."""
    loop = _ensure_browser_loop()
    future = asyncio.run_coroutine_threadsafe(
        _run_pdf_page_session(html_content, worker), loop,
    )
    return future.result()


async def _pagedjs_pages_to_pdf(html_content: str, capture_html: bool = True):
    """Phân trang bằng Paged.js rồi in nguyên từng sheet A4 và ghép trong RAM.

    Tài liệu được phục vụ qua một URL nội bộ thay vì ``set_content`` để cơ
    chế reload một lần của bộ dò ảnh mồ côi vẫn giữ được ``sessionStorage``.
    Chromium không được phân trang lại cả tài liệu: tại mỗi lần in chỉ đúng
    một ``.pagedjs_page`` được hiện, nên ranh giới dòng giống preview.
    """
    import fitz

    browser = await _get_browser()
    page = await browser.new_page(viewport={'width': 794, 'height': 1123})
    export_url = 'https://exam-pdf.local/'
    asset_dir = os.path.join(os.path.dirname(__file__), 'assets')
    try:
        await page.route(
            export_url,
            lambda route: route.fulfill(
                body=html_content, content_type='text/html; charset=utf-8',
            ),
        )
        # Export backend phải hoạt động cả khi CDN chậm/mất mạng. Cùng đúng
        # phiên bản asset mà HTML preview khai báo để metric chữ không đổi.
        await page.route(
            'https://cdn.jsdelivr.net/npm/pagedjs/dist/paged.polyfill.js',
            lambda route: route.fulfill(
                path=os.path.join(asset_dir, 'paged.polyfill.js'),
                content_type='application/javascript',
            ),
        )
        await page.route(
            'https://cdn.jsdelivr.net/npm/temml@0.11.3/dist/temml.min.js',
            lambda route: route.fulfill(
                path=os.path.join(asset_dir, 'temml.min.js'),
                content_type='application/javascript',
            ),
        )
        await page.route(
            'https://cdn.jsdelivr.net/npm/temml@0.11.3/dist/Temml-Local.css',
            lambda route: route.fulfill(
                path=os.path.join(asset_dir, 'Temml-Local.css'),
                content_type='text/css',
            ),
        )
        await page.route(
            '**/Temml.woff2',
            lambda route: route.fulfill(
                path=os.path.join(asset_dir, 'Temml.woff2'),
                content_type='font/woff2',
            ),
        )
        await page.route(
            f'{PDF_FONT_URL}/**',
            lambda route: route.fulfill(
                path=os.path.join(PDF_FONT_DIR, route.request.url.rsplit('/', 1)[-1]),
                content_type='font/ttf',
                headers={'Cache-Control': 'public, max-age=31536000, immutable'},
            ),
        )
        async def serve_exam_asset(route):
            parsed = urllib.parse.urlparse(route.request.url)
            stored_path = '/' + urllib.parse.unquote(parsed.path).lstrip('/')
            absolute, _matched = resolve_image_file(stored_path)
            if not os.path.isfile(absolute):
                await route.fulfill(status=404, body=b'')
                return
            ext = os.path.splitext(absolute)[1].lower()
            mime = {
                '.svg': 'image/svg+xml', '.png': 'image/png',
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.gif': 'image/gif', '.webp': 'image/webp',
            }.get(ext, 'application/octet-stream')
            await route.fulfill(
                path=absolute, content_type=mime,
                headers={'Cache-Control': 'public, max-age=31536000, immutable'},
            )

        await page.route('https://exam-assets.local/**', serve_exam_asset)
        await page.goto(export_url, wait_until='domcontentloaded')
        await page.wait_for_function(
            """document.querySelectorAll('.pagedjs_page').length > 0 &&
               !document.getElementById('pagedjs-loader')""",
            timeout=60000,
        )
        await page.evaluate('document.fonts.ready')

        page_count = await page.locator('.pagedjs_page').count()
        if page_count < 1:
            raise RuntimeError('Paged.js did not produce any PDF pages')

        section_counts = await page.evaluate("""() => {
            const pages = Array.from(document.querySelectorAll('.pagedjs_page'));
            const answer = document.querySelector('.pagedjs_page .answer-key-section');
            const answerIndex = answer
                ? pages.indexOf(answer.closest('.pagedjs_page')) : pages.length;
            return {examPages: answerIndex, answerPages: pages.length - answerIndex};
        }""")
        combined_exam_ranges = await page.evaluate(
            'window.__combinedExamRanges || []'
        )

        # Chỉ serialize DOM Paged.js khi caller thật sự yêu cầu file HTML.
        # Với SVG phức tạp, page.content() từng sao chép hàng chục MB vô ích
        # cho mỗi mã PDF.
        rendered_html = await page.content() if capture_html else None
        await page.emulate_media(media='print')
        await page.add_style_tag(content="""
@media print {
  @page { size: A4 !important; margin: 0 !important; }
  html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
  .pagedjs_pages { display: block !important; padding: 0 !important; background: white !important; }
  .pagedjs_page { display: none !important; }
  .pagedjs_page.export-target {
    display: block !important; margin: 0 !important;
    border: 0 !important; box-shadow: none !important;
  }
  .pagedjs_page.export-target .pagedjs_sheet {
    border: 0 !important; box-shadow: none !important;
  }
}
""")

        atomic_questions = await page.evaluate(
            'Boolean(window.__examAtomicQuestions)'
        )
        if atomic_questions:
            # Đề đảo: Paged.js đã tạo sẵn các sheet A4, mỗi câu là block và
            # không có lượt dò/reload. In toàn bộ sheet trong MỘT lệnh thay
            # vì gọi page.pdf() N lần (N = số trang của từng mã đề).
            await page.add_style_tag(content="""
@media print {
  .pagedjs_page {
    display: block !important;
    break-after: page !important;
    page-break-after: always !important;
  }
  .pagedjs_page:last-child {
    break-after: auto !important;
    page-break-after: auto !important;
  }
}
""")
            pdf_bytes = await page.pdf(
                width='210mm', height='297mm', print_background=True,
                prefer_css_page_size=False, display_header_footer=False,
                margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'},
                scale=1.0,
            )
            check_doc = fitz.open(stream=pdf_bytes, filetype='pdf')
            try:
                if len(check_doc) != page_count:
                    raise RuntimeError(
                        f'Atomic PDF printed as {len(check_doc)} pages; '
                        f'Paged.js produced {page_count}'
                    )
                check_doc.subset_fonts()
                pdf_bytes = check_doc.tobytes(garbage=4, deflate=True)
            finally:
                check_doc.close()
        else:
            # Đề gốc giữ đường an toàn: in riêng từng sheet để không cho
            # Chromium phân trang lại nội dung đã qua dò ảnh mồ côi.
            merged = fitz.open()
            try:
                for index in range(page_count):
                    await page.evaluate("""index => {
                        document.querySelectorAll('.pagedjs_page').forEach((node, i) =>
                            node.classList.toggle('export-target', i === index));
                    }""", index)
                    raw = await page.pdf(
                        width='210mm', height='297mm', print_background=True,
                        prefer_css_page_size=False, display_header_footer=False,
                        margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'},
                        scale=1.0,
                    )
                    part = fitz.open(stream=raw, filetype='pdf')
                    try:
                        if len(part) != 1:
                            raise RuntimeError(
                                f'Paged.js sheet {index + 1} printed as {len(part)} pages'
                            )
                        merged.insert_pdf(part)
                    finally:
                        part.close()
                merged.subset_fonts()
                pdf_bytes = merged.tobytes(garbage=4, deflate=True)
            finally:
                merged.close()

        return {
            'pdf': pdf_bytes,
            'html': rendered_html,
            'exam_pages': section_counts['examPages'],
            'answer_pages': section_counts['answerPages'],
            'combined_exam_ranges': combined_exam_ranges,
        }
    finally:
        await page.close()


def pagedjs_to_pdf_sync(html_content: str, capture_html: bool = True):
    """Wrapper đồng bộ cho PDF lấy trực tiếp từ các sheet của Paged.js."""
    loop = _ensure_browser_loop()
    future = asyncio.run_coroutine_threadsafe(
        _pagedjs_pages_to_pdf(html_content, capture_html=capture_html), loop,
    )
    return future.result()


async def _native_html_to_pdf_bytes(html_content: str) -> bytes:
    """In HTML đề đảo bằng Chromium native, không dựng DOM sheet Paged.js."""
    browser = await _get_browser()
    page = await browser.new_page(viewport={'width': 794, 'height': 1123})
    asset_dir = os.path.join(os.path.dirname(__file__), 'assets')
    try:
        await page.route(
            'https://cdn.jsdelivr.net/npm/temml@0.11.3/dist/temml.min.js',
            lambda route: route.fulfill(
                path=os.path.join(asset_dir, 'temml.min.js'),
                content_type='application/javascript',
            ),
        )
        await page.route(
            'https://cdn.jsdelivr.net/npm/temml@0.11.3/dist/Temml-Local.css',
            lambda route: route.fulfill(
                path=os.path.join(asset_dir, 'Temml-Local.css'),
                content_type='text/css',
            ),
        )
        await page.route(
            '**/Temml.woff2',
            lambda route: route.fulfill(
                path=os.path.join(asset_dir, 'Temml.woff2'),
                content_type='font/woff2',
            ),
        )
        await page.route(
            f'{PDF_FONT_URL}/**',
            lambda route: route.fulfill(
                path=os.path.join(PDF_FONT_DIR, route.request.url.rsplit('/', 1)[-1]),
                content_type='font/ttf',
                headers={'Cache-Control': 'public, max-age=31536000, immutable'},
            ),
        )

        async def serve_exam_asset(route):
            parsed = urllib.parse.urlparse(route.request.url)
            stored_path = '/' + urllib.parse.unquote(parsed.path).lstrip('/')
            absolute, _matched = resolve_image_file(stored_path)
            if not os.path.isfile(absolute):
                await route.fulfill(status=404, body=b'')
                return
            ext = os.path.splitext(absolute)[1].lower()
            mime = {
                '.svg': 'image/svg+xml', '.png': 'image/png',
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.gif': 'image/gif', '.webp': 'image/webp',
            }.get(ext, 'application/octet-stream')
            await route.fulfill(
                path=absolute, content_type=mime,
                headers={'Cache-Control': 'public, max-age=31536000, immutable'},
            )

        await page.route('https://exam-assets.local/**', serve_exam_asset)
        await page.set_content(
            _with_pdf_print_style(html_content), wait_until='domcontentloaded',
        )
        try:
            await page.wait_for_function(
                "document.body.getAttribute('data-math-ready') === 'true'",
                timeout=30000,
            )
        except Exception:
            print('Warning: Math rendering may not have completed')
        await page.evaluate('document.fonts.ready')
        await page.emulate_media(media='print')
        return await _page_to_cropped_pdf_bytes(page)
    finally:
        await page.close()


def native_html_to_pdf_bytes_sync(html_content: str) -> bytes:
    """Wrapper đồng bộ cho đường in Chromium native của đề đảo."""
    loop = _ensure_browser_loop()
    future = asyncio.run_coroutine_threadsafe(
        _native_html_to_pdf_bytes(html_content), loop,
    )
    return future.result()


async def html_to_pdf(html_content: str, output_path: str = None, code: str = "000",
                      html_output_path: str = None):
    """Render một PDF; các API hội tụ dùng session riêng để tái sử dụng tab."""
    async def worker(page):

        cropped_pdf = await _page_to_cropped_pdf_bytes(page)

        if output_path:
            with open(output_path, 'wb') as output_file:
                output_file.write(cropped_pdf)

        # Ghi bản HTML đã render sẵn MathML: bỏ hết <script> để khi mở lại
        # Temml không chạy đè lên công thức đã render.
        if html_output_path:
            await page.evaluate(
                """document.querySelectorAll('script').forEach(function(s){ s.remove(); });
                document.getElementById('pdf-print-overflow-fix')?.remove();"""
            )
            rendered_html = await page.content()
            with open(html_output_path, 'w', encoding='utf-8') as f:
                f.write(rendered_html)
            print(f"HTML (MathML san, tu chua) saved to: {html_output_path}")
        return cropped_pdf

    cropped_pdf = await _run_pdf_page_session(html_content, worker)
    if output_path:
        print(f"PDF saved to: {output_path}")
    return cropped_pdf


def html_to_pdf_sync(html_content: str, output_path: str, code: str = "000",
                     html_output_path: str = None):
    """Wrapper đồng bộ — nộp việc vào event loop nền (giữ trình duyệt dùng
    chung sống xuyên suốt) thay vì tự mở loop + trình duyệt mới mỗi lần."""
    loop = _ensure_browser_loop()
    future = asyncio.run_coroutine_threadsafe(
        html_to_pdf(html_content, output_path, code, html_output_path), loop,
    )
    future.result()


def html_to_pdf_bytes_sync(html_content: str, code: str = "000") -> bytes:
    """Render giống hệt `html_to_pdf_sync`, nhưng trả PDF đã crop trong RAM.

    Dùng cho các lượt đo/dò phân trang; không tạo PDF trung gian trên đĩa.
    """
    loop = _ensure_browser_loop()
    future = asyncio.run_coroutine_threadsafe(
        html_to_pdf(html_content, None, code, None), loop,
    )
    return future.result()
