"""Bộ ghi: cây tài liệu -> HTML.

Dùng chung cho cả web lẫn bản dựng PDF từ HTML. Công thức mặc định để dạng
`\\(…\\)`/`\\[…\\]` cho KaTeX kiểu auto-render quét DOM. Nơi nào dùng cách nhúng
khác (dự án này dùng Temml qua `<span class="math">TEX</span>`, JS tự gọi
`temml.render`) thì truyền `math_fmt(tex, display) -> html` để ghi đè.

Ảnh `side` là `left`/`right` thì dùng `float`, tức **chữ trôi quanh ảnh** — đây
là ý định gốc. Bản `pdf_latex` sẽ khác vì `wrapfig` hỏng trong môi trường
`ex_test.sty`; khác biệt đó là cố ý, xem mục 2 của docs/chuan-hoa-du-lieu.md.
"""
import html as _html
import re
from ..figures import A4_REFERENCE_WIDTH_PT

TAG_OF = {"bold": "strong", "italic": "em", "underline": "u", "highlight": "mark"}


def _default_math(tex, display):
    return f"\\[{tex}\\]" if display else f"\\({tex}\\)"


def _img(fid, figures, cls="doc-figure"):
    row = (figures or {}).get(fid)
    if not row:
        return f'<span class="{cls} is-missing">[thiếu hình {fid}]</span>'
    w = row.get("width")
    if w is not None:
        # Không dùng CSS `%`: phần trăm sẽ lấy theo containing block (vùng chữ
        # đã trừ lề), trong khi q_images.width lấy theo TOÀN BỘ bề ngang A4.
        style = f' style="width:{float(w) * A4_REFERENCE_WIDTH_PT:.2f}pt"'
    elif row.get("native_width_pt") is not None:
        # Không có `width` (tỉ lệ) — nơi gọi (renderer.py) đã đọc đúng bề rộng
        # gốc của file (SVG: point ghi sẵn trong file; raster: pixel/DPI thật)
        # và quy ra pt — không dùng %, vì % là theo bề rộng trang, không phải
        # kích thước thật của ảnh.
        style = f' style="width:{row["native_width_pt"]:.1f}pt"'
    else:
        # Không đọc được kích thước gốc — nhúng thẳng, không bịa gì cả;
        # `.doc-figure-block img{max-width:100%}` đã chặn tràn trang.
        style = ""
    inline_svg = row.get("inline_svg")
    if inline_svg:
        # SVG nhúng thẳng thẻ <svg> (DOM gốc), KHÔNG qua <img src="data:...">
        # — Chromium in PDF (`page.pdf()`) âm thầm bỏ qua <img> nguồn SVG data
        # URI (đã kiểm chứng: DOM tải ảnh bình thường, chỉ riêng lúc IN PDF là
        # mất — PNG data URI thì in bình thường). Xem renderer.py::_html_figures.
        return f'<span class="{cls} doc-figure-svg"{style}>{inline_svg}</span>'
    src = _html.escape(row.get("storage_path") or "")
    return f'<img class="{cls}" src="{src}" alt=""{style}>'


def inline_html(nodes, figures=None, math_fmt=None):
    math_fmt = math_fmt or _default_math
    parts = []
    for n in nodes:
        t = n["type"]
        if t == "text":
            s = _html.escape(n["text"])
            for mark in n.get("marks", []):
                tag = TAG_OF[mark]
                s = f"<{tag}>{s}</{tag}>"
            color = n.get("color")
            if color and re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
                s = f'<span style="color:{color}">{s}</span>'
            parts.append(s)
        elif t == "math":
            parts.append(math_fmt(_html.escape(n["tex"]), False))
        elif t == "hard_break":
            parts.append("<br>")
        elif t == "image_inline":
            parts.append(_img(n["figure_id"], figures, "doc-figure-inline"))
    return "".join(parts)


def block_html(nodes, figures=None, math_fmt=None):
    math_fmt = math_fmt or _default_math
    out = []
    for n in nodes:
        t = n["type"]
        if t == "paragraph":
            align = n.get("align", "left")
            style = f' style="text-align:{align}"' if align != "left" else ""
            out.append(f"<p{style}>{inline_html(n['content'], figures, math_fmt)}</p>")
        elif t == "math_block":
            out.append(f'<p class="doc-math">{math_fmt(_html.escape(n["tex"]), True)}</p>')
        elif t in ("image", "image_inline"):
            fid = _html.escape(str(n["figure_id"]), quote=True)
            out.append(f'<figure class="doc-figure-block" data-figure-id="{fid}">'
                       f'{_img(n["figure_id"], figures)}</figure>')
        elif t == "table":
            widths = n.get("widths") or []
            columns = ("<colgroup>" + "".join(
                f'<col style="width:{float(width) * 100:g}%">' for width in widths
            ) + "</colgroup>") if widths else ""
            rows = []
            heights = n.get("row_heights") or []
            for row_index, r in enumerate(n["rows"]):
                cells = []
                for c in r:
                    colspan = f' colspan="{c["colspan"]}"' if c.get("colspan") else ""
                    rowspan = f' rowspan="{c["rowspan"]}"' if c.get("rowspan") else ""
                    cells.append(f"<td{colspan}{rowspan}>{inline_html(c['content'], figures, math_fmt)}</td>")
                height = heights[row_index] if row_index < len(heights) else None
                style = f' style="height:{float(height):g}px"' if height else ""
                rows.append(f"<tr{style}>" + "".join(cells) + "</tr>")
            out.append('<table class="doc-table">' + columns + "".join(rows) + "</table>")
        elif t == "list":
            tag = "ol" if n.get("ordered") else "ul"
            items = "".join(f"<li>{block_html(it, figures, math_fmt)}</li>" for it in n["items"])
            out.append(f"<{tag}>{items}</{tag}>")
        elif t == "columns":
            widths = " ".join(f"{float(c['width']) * 100:g}%" for c in n["columns"])
            gap = float(n.get("gap", 0))
            cells = []
            for column in n["columns"]:
                align = column.get("align", "left")
                valign = {"top": "start", "center": "center", "bottom": "end"}.get(
                    column.get("valign", "top"), "start"
                )
                cells.append(
                    f'<div class="doc-column" style="text-align:{align};align-self:{valign}">'
                    f'{block_html(column.get("content", []), figures, math_fmt)}</div>'
                )
            out.append(
                '<div class="doc-columns" '
                f'style="display:grid;grid-template-columns:{widths};gap:{gap:g}%;'
                'break-inside:avoid;page-break-inside:avoid">'
                + "".join(cells) + "</div>"
            )
        elif t == "code_block":
            lang = _html.escape(n.get("lang") or "")
            out.append(f'<pre class="doc-code" data-lang="{lang}">'
                       f"<code>{_html.escape(n['text'])}</code></pre>")
    return "".join(out)


def doc_to_html(doc, figures=None, math_fmt=None):
    """Ruột một trường -> HTML.

    Khi `side` là `left`/`right`, ảnh được xuất TRƯỚC chữ — bất kể thứ tự lưu
    trong cây (bộ đọc luôn đặt nút ảnh ở cuối) — để `float` nổi đúng hàng đầu
    tiên thay vì rơi xuống dưới đoạn văn. Không tự bọc `<div class="doc-side-*">`
    nữa: gắn class đó lên khối chứa CẢ đáp án/lời giải là việc của nơi gọi
    (xem `renderer.py::_render_single_question`), để `float` còn ảnh hưởng
    tới cả phần sau đoạn văn đầu, không riêng nó."""
    nodes = doc.get("content", [])
    if doc.get("side") in ("left", "right"):
        imgs = [n for n in nodes if n["type"] in ("image", "image_inline")]
        rest = [n for n in nodes if n["type"] not in ("image", "image_inline")]
        nodes = imgs + rest
    return block_html(nodes, figures, math_fmt)


to_html = doc_to_html
