"""Bộ ghi: cây tài liệu -> `.tex` theo đúng mẫu `ex_test.sty`.

Hai việc tách bạch:

* **Dựng nội dung** — nút thành lệnh LaTeX.
* **Định dạng lại** — dữ liệu không mang thụt lề (đã gỡ lúc ghi vào CSDL), nên
  bộ ghi tự đặt thụt lề theo quy tắc cố định, đúng vai `prettier` hay `gofmt`.
  Cùng một dữ liệu phải ra file giống hệt từng byte, để `git diff` giữa hai lần
  xuất chỉ hiện chỗ nội dung đổi.

Xem mục 6 của docs/chuan-hoa-du-lieu.md.
"""
import re

STEP = "    "          # 4 dấu cách một mức, không dùng ký tự tab
MARK_MACRO = {"bold": "textbf", "italic": "textit", "underline": "underline"}


def _figure(fid, figures):
    """Hình -> LaTeX. Luôn chèn mã TikZ nếu có; chỉ ảnh rời mới includegraphics."""
    row = (figures or {}).get(fid)
    if row and row.get("raw_code"):
        return row["raw_code"]
    if row and row.get("storage_path"):
        w = row.get("width")
        # NULL — chưa đặt tỉ lệ — bỏ hẳn `width=`, để `\includegraphics` lấy
        # đúng kích thước gốc khai trong file, giống cách TikZ (raw_code) đã
        # luôn làm ở nhánh trên.
        opt = f"[width={w}\\linewidth]" if w is not None else ""
        return f"\\includegraphics{opt}{{{row['storage_path']}}}"
    return f"% thiếu hình {fid}"


def inline_tex(nodes, figures=None):
    parts = []
    for n in nodes:
        t = n["type"]
        if t == "text":
            s = n["text"].replace("_", r"\_").replace("%", r"\%")
            for mark in n.get("marks", []):
                s = f"\\{MARK_MACRO[mark]}{{{s}}}"
            color = n.get("color")
            if color and re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
                s = f"\\textcolor[HTML]{{{color[1:].upper()}}}{{{s}}}"
            parts.append(s)
        elif t == "math":
            # "$a$$b$" khi đọc lại bị hiểu là $$…$$ — chèn dấu cách ngăn ra
            if parts and parts[-1].endswith("$"):
                parts.append(" ")
            parts.append(f"${n['tex']}$")
        elif t == "hard_break":
            parts.append("\\\\\n")
        elif t == "image_inline":
            parts.append(_figure(n["figure_id"], figures))
    return "".join(parts)


def block_tex(nodes, figures=None, indent=""):
    out = []
    for n in nodes:
        t = n["type"]
        if t == "paragraph":
            body = inline_tex(n["content"], figures)
            align = n.get("align", "left")
            if align == "center":
                body = f"\\begin{{center}}{body}\\end{{center}}"
            elif align == "right":
                body = f"\\begin{{flushright}}{body}\\end{{flushright}}"
            out.append(indent + body)
        elif t == "math_block":
            out.append(f"{indent}$${n['tex']}$$")
        elif t == "image":
            # Hình đứng riêng luôn căn giữa — đúng cách bộ xuất cũ vẫn làm cho
            # ảnh "thường" (không phải immini, immini đã tách hình ra riêng ở
            # `_field`). Chỗ này KHÔNG áp cho `image_inline`.
            out.append(f"{indent}\\begin{{center}}\n{indent}{_figure(n['figure_id'], figures)}"
                       f"\n{indent}\\end{{center}}")
        elif t == "table":
            active_until = {}
            positioned = []
            ncol = 0
            for r_idx, row_data in enumerate(n["rows"]):
                cursor = 0
                row_positions = []
                for cell in row_data:
                    while active_until.get(cursor, -1) >= r_idx:
                        cursor += 1
                    colspan = int(cell.get("colspan", 1))
                    rowspan = int(cell.get("rowspan", 1))
                    row_positions.append((cursor, cell, colspan, rowspan))
                    if rowspan > 1:
                        for col in range(cursor, cursor + colspan):
                            active_until[col] = r_idx + rowspan - 1
                    cursor += colspan
                positioned.append(row_positions)
                ncol = max(ncol, cursor, max((c + 1 for c, end in active_until.items() if end >= r_idx), default=0))
            configured_widths = n.get("widths") or []
            if len(configured_widths) == ncol:
                # Giữ tỷ lệ cột do người dùng kéo trong editor. Hệ số .94 để
                # chừa khoảng đệm tabular và đường viền trong \linewidth.
                spec_cells = [
                    f"p{{{float(width) * 0.94:g}\\linewidth}}"
                    for width in configured_widths
                ]
            else:
                spec_cells = n.get("align") or ["l"] * ncol
            spec = "|" + "|".join(spec_cells) + "|"
            rows = []
            covered_until = {}
            for r_idx, row_positions in enumerate(positioned):
                cells = []
                by_col = {col: (c, colspan, rowspan) for col, c, colspan, rowspan in row_positions}
                col = 0
                while col < ncol:
                    if col not in by_col:
                        cells.append("")
                        col += 1
                        continue
                    c, colspan, rowspan = by_col[col]
                    body = inline_tex(c["content"], figures)
                    if rowspan > 1:
                        body = f"\\multirow{{{rowspan}}}{{*}}{{{body}}}"
                        for cc in range(col, col + colspan):
                            covered_until[cc] = r_idx + rowspan - 1
                    if colspan > 1:
                        body = f"\\multicolumn{{{colspan}}}{{|c|}}{{{body}}}"
                    cells.append(body)
                    col += colspan
                rows.append(f"{indent}{STEP}" + " & ".join(cells) + r" \\ \hline")
            out.append(f"{indent}\\begin{{tabular}}{{{spec}}}\n{indent}{STEP}\\hline\n"
                       + "\n".join(rows) + f"\n{indent}\\end{{tabular}}")
        elif t == "list":
            env = "enumerate" if n.get("ordered") else "itemize"
            items = "\n".join(f"{indent}{STEP}\\item "
                              + block_tex(it, figures).strip()
                              for it in n["items"])
            out.append(f"{indent}\\begin{{{env}}}\n{items}\n{indent}\\end{{{env}}}")
        elif t == "columns":
            rendered = []
            valign_of = {"top": "t", "center": "c", "bottom": "b"}
            for column in n["columns"]:
                width = f"{float(column['width']):g}"
                valign = valign_of.get(column.get("valign", "top"), "t")
                body = block_tex(column.get("content", []), figures, indent + STEP)
                align_command = {"center": "\\centering", "right": "\\raggedleft"}.get(
                    column.get("align")
                )
                centering = indent + STEP + align_command + "\n" if align_command else ""
                rendered.append(
                    f"{indent}\\begin{{minipage}}[{valign}]{{{width}\\linewidth}}\n"
                    f"{centering}{body}\n{indent}\\end{{minipage}}"
                )
            out.append("%\n".join(rendered))
    return "\n\n".join(out)


def doc_to_tex(doc, figures=None):
    """Chỉ ruột một trường, chưa bọc `\\immini` — dùng khi cần chuỗi trần."""
    return block_tex(doc.get("content", []), figures)


# ------------------------------------------------------- định dạng lại ---

def _emit(lines, depth, text):
    for ln in text.split("\n"):
        lines.append(STEP * depth + ln.strip() if ln.strip() else "")


def _field(lines, depth, doc, figures, opt="[]", inner=None):
    """Ghi ruột một trường, tự bọc `\\immini` khi `side` là left/right."""
    side = doc.get("side", "center")
    if side not in ("left", "right"):
        _emit(lines, depth, block_tex(doc.get("content", []), figures))
        if inner:
            inner(depth)
        return

    figs = [n for n in doc.get("content", []) if n["type"] == "image"]
    rest = [n for n in doc.get("content", []) if n["type"] != "image"]
    macro = "\\imminiL" if side == "left" else "\\immini"

    lines.append(STEP * depth + f"{macro}{opt}{{")
    _emit(lines, depth + 1, block_tex(rest, figures))
    if inner:
        inner(depth + 1)
    lines.append(STEP * depth + "}{")
    for f in figs:
        _emit(lines, depth + 1, _figure(f["figure_id"], figures))
    lines.append(STEP * depth + "}")


def question_tex(rec, figures=None, show_answers=True, include_solution=True):
    """Một câu -> trọn khối `\\begin{ex}`.

    `show_answers=False` bỏ đánh dấu `\\True` và để trống đáp án ngắn — dùng khi
    xuất đề sạch cho học sinh. `include_solution=False` bỏ hẳn `\\loigiai{…}`.
    Khi `True`, `\\loigiai{…}` luôn xuất hiện dù trống — `ex_test.sty` chỉ in
    nhãn "Lời giải", không lỗi nếu rỗng.
    """
    lines = ["\\begin{ex}"]
    qt = rec["question_type"]
    opts = rec.get("options") or []

    def options(depth):
        if not opts:
            return
        if qt == "sa":
            ans = block_tex(opts[0]["content_doc"]["content"], figures).strip() \
                if show_answers else ""
            lines.append(STEP * depth + "\\shortans{" + ans + "}")
            return
        if qt not in ("mc", "tf"):
            return
        lines.append(STEP * depth + ("\\choiceTF[1]" if qt == "tf" else "\\choice"))
        for o in opts:
            mark = "\\True " if (show_answers and o["is_correct"]) else ""
            body = block_tex(o["content_doc"]["content"], figures).strip().replace("\n", " ")
            lines.append(STEP * depth + "{" + mark + body + "}")

    inside = rec.get("layout_type") == "immini_all"
    _field(lines, 1, rec["content_doc"], figures,
           opt="[thm]" if inside else "[]", inner=options if inside else None)
    if not inside:
        options(1)

    if include_solution:
        lines.append(STEP + "\\loigiai{")
        _field(lines, 2, rec.get("solution_doc") or {}, figures)
        # Dòng "Chọn X" cuối lời giải câu trắc nghiệm — tự tính từ `is_correct`,
        # không lưu vào CSDL, khớp quy ước đã có ở word_exporter.py:250-252 và
        # pdf_html/renderer.py:188-191 (bản xem trước), bộ xuất PDF/LaTeX thật
        # này trước đó chưa có.
        if qt == "mc" and show_answers:
            correct = next((o for o in opts if o["is_correct"]), None)
            if correct is not None:
                label = chr(65 + opts.index(correct))
                lines.append(STEP * 2 + f"\\textbf{{Chọn {label}}}")
        # Giải thích từng mệnh đề đúng/sai nằm TRONG lời giải chung, sau phần
        # chữ — đúng vị trí bộ xuất cũ chèn `\begin{itemchoice}`.
        if qt == "tf" and any(o.get("explaination_doc") for o in opts):
            lines.append(STEP * 2 + "\\begin{itemchoice}")
            for o in opts:
                expl = o.get("explaination_doc") or {}
                txt = block_tex(expl.get("content", []), figures).strip()
                lines.append(STEP * 3 + "\\itemch " + txt)
            lines.append(STEP * 2 + "\\end{itemchoice}")
        lines.append(STEP + "}")

    lines.append("\\end{ex}")
    return "\n".join(ln.rstrip() for ln in lines)


def to_tex(recs, figures=None, show_answers=True, include_solution=True):
    """Một câu hoặc một chùm câu -> khối `\\begin{ex}`.

    Chùm câu (`\\sochc`) là **một** khối `ex` chứa câu cha và các câu con, nên
    phải dựng cả cụm một lượt chứ không nối từng câu.
    """
    if isinstance(recs, dict):
        return question_tex(recs, figures, show_answers, include_solution)
    if len(recs) == 1:
        return question_tex(recs[0], figures, show_answers, include_solution)

    parent, kids = recs[0], recs[1:]
    lines = ["\\begin{ex}", f"{STEP}\\sochc{{{len(kids)}}}{{"]
    _field(lines, 2, parent["content_doc"], figures)
    lines.append(f"{STEP}}}")
    for k in kids:
        body = question_tex(k, figures, show_answers, include_solution).split("\n")[1:-1]
        lines.append(f"{STEP}\\begin{{chc}}")
        lines += [STEP + ln if ln.strip() else "" for ln in body]
        lines.append(f"{STEP}\\end{{chc}}")
    lines.append("\\end{ex}")
    return "\n".join(ln.rstrip() for ln in lines)
