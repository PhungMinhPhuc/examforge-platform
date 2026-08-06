"""Bộ ghi: cây tài liệu -> HTML.

Dùng chung cho cả web lẫn bản dựng PDF từ HTML. Công thức để nguyên dạng
`\\(…\\)` để KaTeX ở phía trình duyệt dựng — bộ ghi không đụng vào phần toán.

Ảnh `side` là `left`/`right` thì dùng `float`, tức **chữ trôi quanh ảnh** — đây
là ý định gốc. Bản `pdf_latex` sẽ khác vì `wrapfig` hỏng trong môi trường
`ex_test.sty`; khác biệt đó là cố ý, xem mục 2 của docs/chuan-hoa-du-lieu.md.
"""
import html as _html

TAG_OF = {"bold": "strong", "italic": "em", "underline": "u", "highlight": "mark"}


def _img(fid, figures, cls="doc-figure"):
    row = (figures or {}).get(fid)
    if not row:
        return f'<span class="{cls} is-missing">[thiếu hình {fid}]</span>'
    w = row.get("width") or 0.45
    src = _html.escape(row.get("storage_path") or "")
    return (f'<img class="{cls}" src="{src}" alt="" '
            f'style="width:{float(w) * 100:.0f}%">')


def inline_html(nodes, figures=None):
    parts = []
    for n in nodes:
        t = n["type"]
        if t == "text":
            s = _html.escape(n["text"])
            for mark in n.get("marks", []):
                tag = TAG_OF[mark]
                s = f"<{tag}>{s}</{tag}>"
            parts.append(s)
        elif t == "math":
            parts.append(f"\\({_html.escape(n['tex'])}\\)")
        elif t == "hard_break":
            parts.append("<br>")
        elif t == "image_inline":
            parts.append(_img(n["figure_id"], figures, "doc-figure-inline"))
    return "".join(parts)


def block_html(nodes, figures=None):
    out = []
    for n in nodes:
        t = n["type"]
        if t == "paragraph":
            out.append(f"<p>{inline_html(n['content'], figures)}</p>")
        elif t == "math_block":
            out.append(f"<p class=\"doc-math\">\\[{_html.escape(n['tex'])}\\]</p>")
        elif t == "image":
            out.append(f'<figure class="doc-figure-block">'
                       f'{_img(n["figure_id"], figures)}</figure>')
        elif t == "table":
            rows = []
            for r in n["rows"]:
                cells = []
                for c in r:
                    span = f' colspan="{c["colspan"]}"' if c.get("colspan") else ""
                    cells.append(f"<td{span}>{inline_html(c['content'], figures)}</td>")
                rows.append("<tr>" + "".join(cells) + "</tr>")
            out.append('<table class="doc-table">' + "".join(rows) + "</table>")
        elif t == "list":
            tag = "ol" if n.get("ordered") else "ul"
            items = "".join(f"<li>{block_html(it, figures)}</li>" for it in n["items"])
            out.append(f"<{tag}>{items}</{tag}>")
        elif t == "code_block":
            lang = _html.escape(n.get("lang") or "")
            out.append(f'<pre class="doc-code" data-lang="{lang}">'
                       f"<code>{_html.escape(n['text'])}</code></pre>")
    return "".join(out)


def doc_to_html(doc, figures=None):
    """Ruột một trường -> HTML. Bọc `.doc-side-*` khi ảnh đặt bên."""
    body = block_html(doc.get("content", []), figures)
    side = doc.get("side", "center")
    if side in ("left", "right"):
        return f'<div class="doc-side doc-side-{side}">{body}</div>'
    return body


to_html = doc_to_html
