"""Lược đồ cây tài liệu + bộ kiểm tra hợp lệ.

Đây là bản chốt của mục 3 trong docs/chuan-hoa-du-lieu.md, viết thành mã để
kiểm được tự động. `validate(doc)` trả về danh sách lỗi; rỗng nghĩa là hợp lệ.
"""
import re

SIDES = {"left", "right", "center"}
MARKS = {"bold", "italic", "underline", "highlight"}

# type -> (trường bắt buộc, trường được phép thêm)
BLOCK = {
    "paragraph":  ({"content"}, {"align"}),
    "math_block": ({"tex"}, set()),
    "table":      ({"rows"}, {"align", "widths", "row_heights"}),
    "list":       ({"items"}, {"ordered"}),
    "image":      ({"figure_id"}, {"caption"}),
    "code_block": ({"text"}, {"lang"}),
    "columns":    ({"columns"}, {"align", "gap"}),
}
INLINE = {
    "text":         ({"text"}, {"marks", "color"}),
    "math":         ({"tex"}, set()),
    "hard_break":   (set(), set()),
    "image_inline": ({"figure_id"}, set()),
}

# Ngắt dòng phải nằm ở cấu trúc, không được lẫn vào chuỗi — bất biến 2, mục 12.
FORBIDDEN_IN_TEXT = re.compile(r"\n|\\\\|\\newline|<br\s*/?>", re.I)
STRUCTURAL_TEX_IN_TEXT = re.compile(
    r"\\(?:begin|end)\{(?:itemize|enumerate|tabular|minipage)\}|\\item\b"
)


def validate(doc, figure_ids=None):
    """doc -> danh sách lỗi dạng chuỗi. figure_ids: các id có thật trong q_images."""
    errs = []

    def err(path, msg):
        errs.append(f"{path}: {msg}")

    def check_inline(nodes, path):
        if not isinstance(nodes, list):
            return err(path, "content phải là mảng")
        for i, n in enumerate(nodes):
            p = f"{path}[{i}]"
            t = n.get("type")
            if t not in INLINE:
                err(p, f"loại nút chữ không hợp lệ: {t!r}")
                continue
            need, opt = INLINE[t]
            check_keys(n, need, opt, p)
            if t == "text":
                if FORBIDDEN_IN_TEXT.search(n.get("text", "")):
                    err(p, "nút text chứa ký hiệu ngắt dòng — phải dùng hard_break")
                if STRUCTURAL_TEX_IN_TEXT.search(n.get("text", "")):
                    err(p, "nút text chứa lệnh cấu trúc LaTeX — phải là node list/table/columns")
                for m in n.get("marks", []):
                    if m not in MARKS:
                        err(p, f"dấu định dạng lạ: {m!r}")
                color = n.get("color")
                if color is not None and not re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
                    err(p, "color phải có dạng #RRGGBB")
            if t == "math":
                tex = n.get("tex", "")
                if tex.startswith("$") or tex.endswith("$"):
                    err(p, "nút math không được kèm $ bao ngoài")
            if t == "image_inline":
                check_fig(n, p)

    def check_fig(n, p):
        if figure_ids is not None and n.get("figure_id") not in figure_ids:
            err(p, f"figure_id {n.get('figure_id')} không có trong q_images")

    def check_keys(n, need, opt, p):
        keys = set(n) - {"type"}
        for k in need - keys:
            err(p, f"thiếu trường bắt buộc {k!r}")
        for k in keys - need - opt:
            err(p, f"trường lạ {k!r}")

    def check_block(nodes, path):
        if not isinstance(nodes, list):
            return err(path, "content phải là mảng")
        for i, n in enumerate(nodes):
            p = f"{path}[{i}]"
            t = n.get("type")
            if t not in BLOCK:
                err(p, f"loại nút khối không hợp lệ: {t!r}")
                continue
            need, opt = BLOCK[t]
            check_keys(n, need, opt, p)
            if t == "paragraph":
                check_inline(n.get("content", []), p + ".content")
                if n.get("align", "left") not in ("left", "center", "right", "justify"):
                    err(p, f"align đoạn không hợp lệ: {n.get('align')!r}")
            elif t == "math_block":
                if n.get("tex", "").startswith("$"):
                    err(p, "math_block không được kèm $ bao ngoài")
            elif t == "table":
                check_table(n, p)
            elif t == "list":
                for j, item in enumerate(n.get("items", [])):
                    check_block(item, f"{p}.items[{j}]")
            elif t == "image":
                check_fig(n, p)
            elif t == "columns":
                check_columns(n, p)

    def check_columns(n, p):
        columns = n.get("columns")
        if not isinstance(columns, list) or not columns:
            return err(p, "columns phải có ít nhất một cột")
        total = 0.0
        for i, column in enumerate(columns):
            cp = f"{p}.columns[{i}]"
            if not isinstance(column, dict):
                err(cp, "cột phải là object")
                continue
            extra = set(column) - {"width", "align", "valign", "content"}
            if extra:
                err(cp, f"trường lạ: {sorted(extra)}")
            width = column.get("width")
            if not isinstance(width, (int, float)) or isinstance(width, bool) or width <= 0:
                err(cp, f"width không hợp lệ: {width!r}")
            else:
                total += float(width)
            if column.get("align", "left") not in ("left", "center", "right"):
                err(cp, f"align không hợp lệ: {column.get('align')!r}")
            if column.get("valign", "top") not in ("top", "center", "bottom"):
                err(cp, f"valign không hợp lệ: {column.get('valign')!r}")
            check_block(column.get("content", []), cp + ".content")
        if total > 1.000001:
            err(p, f"tổng width các cột vượt 1: {total:g}")

    def check_table(n, p):
        rows = n.get("rows")
        if not isinstance(rows, list) or not rows:
            return err(p, "table phải có ít nhất một hàng")
        widths = set()
        carried = {}
        for r_i, row in enumerate(rows):
            occupied = {col for col, remaining in carried.items() if remaining > 0}
            next_carried = {
                col: remaining - 1
                for col, remaining in carried.items()
                if remaining > 1
            }
            cursor = 0
            for c_i, c in enumerate(row):
                cp = f"{p}.rows[{r_i}][{c_i}]"
                if not isinstance(c, dict) or "content" not in c:
                    err(cp, "ô bảng phải là {content: [...]}")
                    continue
                check_keys(c, {"content"}, {"colspan", "rowspan"}, cp)
                span = c.get("colspan", 1)
                if not isinstance(span, int) or span < 1:
                    err(cp, f"colspan không hợp lệ: {span!r}")
                    span = 1
                rowspan = c.get("rowspan", 1)
                if not isinstance(rowspan, int) or rowspan < 1:
                    err(cp, f"rowspan không hợp lệ: {rowspan!r}")
                    rowspan = 1
                while cursor in occupied:
                    cursor += 1
                for col in range(cursor, cursor + span):
                    if col in occupied:
                        err(cp, "ô chồng lên vùng rowspan của hàng trước")
                    occupied.add(col)
                    if rowspan > 1:
                        next_carried[col] = rowspan - 1
                cursor += span
                check_inline(c["content"], cp + ".content")
            widths.add(max(occupied, default=-1) + 1)
            carried = next_carried
        if len(widths) > 1:
            err(p, f"các hàng có số cột khác nhau: {sorted(widths)}")
        if carried:
            err(p, "rowspan vượt quá số hàng của bảng")
        logical_width = next(iter(widths)) if len(widths) == 1 else None
        align = n.get("align")
        if align is not None:
            if not isinstance(align, list) or any(a not in "lcr" for a in align):
                err(p, f"align không hợp lệ: {align!r}")
            elif widths and len(align) != next(iter(widths)):
                err(p, f"align có {len(align)} cột, bảng có {next(iter(widths))}")
        column_widths = n.get("widths")
        if column_widths is not None:
            if (
                not isinstance(column_widths, list)
                or logical_width is None
                or len(column_widths) != logical_width
                or any(not isinstance(value, (int, float)) or value <= 0 for value in column_widths)
            ):
                err(p, "widths phải là mảng số dương, đủ số cột")
            elif abs(sum(column_widths) - 1) > 0.001:
                err(p, "tổng widths của bảng phải bằng 1")
        row_heights = n.get("row_heights")
        if row_heights is not None and (
            not isinstance(row_heights, list)
            or len(row_heights) != len(rows)
            or any(not isinstance(value, (int, float)) or value <= 0 for value in row_heights)
        ):
            err(p, "row_heights phải là mảng số dương, đủ số hàng")

    # ---- gốc ----
    if not isinstance(doc, dict) or doc.get("type") != "doc":
        return ["gốc: phải là {type: 'doc', ...}"]
    check_keys(doc, {"content"}, {"side"}, "gốc")
    if "side" in doc and doc["side"] not in SIDES:
        err("gốc", f"side không hợp lệ: {doc['side']!r}")
    if doc.get("side") == "center":
        err("gốc", "side='center' là mặc định, không ghi vào cây")
    check_block(doc.get("content", []), "content")
    return errs


def check_layout_consistency(layout_type, side):
    """Bất biến 6, mục 12: cột layout_type và nhãn side phải khớp nhau."""
    lt = (layout_type or "normal").strip() or "normal"
    if lt == "normal" and side != "center":
        return f"layout_type='normal' nhưng side='{side}'"
    if lt.startswith("immini") and side not in ("left", "right"):
        return f"layout_type='{lt}' nhưng side='{side}'"
    return None
