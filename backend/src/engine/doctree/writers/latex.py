"""Bộ ghi: cây tài liệu -> `.tex` theo đúng mẫu `ex_test.sty`.

Hai việc tách bạch:

* **Dựng nội dung** — nút thành lệnh LaTeX.
* **Định dạng lại** — dữ liệu không mang thụt lề (đã gỡ lúc ghi vào CSDL), nên
  bộ ghi tự đặt thụt lề theo quy tắc cố định, đúng vai `prettier` hay `gofmt`.
  Cùng một dữ liệu phải ra file giống hệt từng byte, để `git diff` giữa hai lần
  xuất chỉ hiện chỗ nội dung đổi.

Xem mục 6 của docs/chuan-hoa-du-lieu.md.
"""
STEP = "    "          # 4 dấu cách một mức, không dùng ký tự tab
MARK_MACRO = {"bold": "textbf", "italic": "textit", "underline": "underline"}


def _figure(fid, figures):
    """Hình -> LaTeX. Luôn chèn mã TikZ nếu có; chỉ ảnh rời mới includegraphics."""
    row = (figures or {}).get(fid)
    if row and row.get("raw_code"):
        return row["raw_code"]
    if row and row.get("storage_path"):
        w = row.get("width") or 0.45
        return f"\\includegraphics[width={w}\\linewidth]{{{row['storage_path']}}}"
    return f"% thiếu hình {fid}"


def inline_tex(nodes, figures=None):
    parts = []
    for n in nodes:
        t = n["type"]
        if t == "text":
            s = n["text"].replace("_", r"\_").replace("%", r"\%")
            for mark in n.get("marks", []):
                s = f"\\{MARK_MACRO[mark]}{{{s}}}"
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
            out.append(indent + inline_tex(n["content"], figures))
        elif t == "math_block":
            out.append(f"{indent}$${n['tex']}$$")
        elif t == "image":
            out.append(indent + _figure(n["figure_id"], figures))
        elif t == "table":
            ncol = max(len(r) for r in n["rows"])
            spec = "|" + "|".join(n.get("align") or ["l"] * ncol) + "|"
            rows = []
            for r in n["rows"]:
                cells = []
                for c in r:
                    body = inline_tex(c["content"], figures)
                    if c.get("colspan"):
                        body = f"\\multicolumn{{{c['colspan']}}}{{|c|}}{{{body}}}"
                    cells.append(body)
                rows.append(f"{indent}{STEP}" + " & ".join(cells) + r" \\ \hline")
            out.append(f"{indent}\\begin{{tabular}}{{{spec}}}\n{indent}{STEP}\\hline\n"
                       + "\n".join(rows) + f"\n{indent}\\end{{tabular}}")
        elif t == "list":
            env = "enumerate" if n.get("ordered") else "itemize"
            items = "\n".join(f"{indent}{STEP}\\item "
                              + block_tex(it, figures).strip()
                              for it in n["items"])
            out.append(f"{indent}\\begin{{{env}}}\n{items}\n{indent}\\end{{{env}}}")
    return "\n\n".join(out)


def doc_to_latex(doc, figures=None):
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


def question_tex(rec, figures=None):
    """Một câu -> trọn khối `\\begin{ex}`."""
    lines = ["\\begin{ex}"]
    qt = rec["question_type"]
    opts = rec.get("options") or []

    def options(depth):
        if not opts:
            return
        if qt == "sa":
            ans = block_tex(opts[0]["content_doc"]["content"], figures).strip()
            lines.append(STEP * depth + "\\shortans{" + ans + "}")
            return
        if qt not in ("mc", "tf"):
            return
        lines.append(STEP * depth + ("\\choiceTF[1]" if qt == "tf" else "\\choice"))
        for o in opts:
            mark = "\\True " if o["is_correct"] else ""
            body = block_tex(o["content_doc"]["content"], figures).strip().replace("\n", " ")
            lines.append(STEP * depth + "{" + mark + body + "}")

    inside = rec.get("layout_type") == "immini_all"
    _field(lines, 1, rec["content_doc"], figures,
           opt="[thm]" if inside else "[]", inner=options if inside else None)
    if not inside:
        options(1)

    sol = rec.get("solution_doc") or {}
    if sol.get("content"):
        lines.append(STEP + "\\loigiai{")
        _field(lines, 2, sol, figures)
        lines.append(STEP + "}")

    lines.append("\\end{ex}")
    return "\n".join(ln.rstrip() for ln in lines)


def to_latex(recs, figures=None):
    """Một câu hoặc một chùm câu -> khối `\\begin{ex}`.

    Chùm câu (`\\sochc`) là **một** khối `ex` chứa câu cha và các câu con, nên
    phải dựng cả cụm một lượt chứ không nối từng câu.
    """
    if isinstance(recs, dict):
        return question_tex(recs, figures)
    if len(recs) == 1:
        return question_tex(recs[0], figures)

    parent, kids = recs[0], recs[1:]
    lines = ["\\begin{ex}", f"{STEP}\\sochc{{{len(kids)}}}{{"]
    _field(lines, 2, parent["content_doc"], figures)
    lines.append(f"{STEP}}}")
    for k in kids:
        body = question_tex(k, figures).split("\n")[1:-1]     # bỏ begin/end ex
        lines.append(f"{STEP}\\begin{{chc}}")
        lines += [STEP + ln if ln.strip() else "" for ln in body]
        lines.append(f"{STEP}\\end{{chc}}")
    lines.append("\\end{ex}")
    return "\n".join(ln.rstrip() for ln in lines)
