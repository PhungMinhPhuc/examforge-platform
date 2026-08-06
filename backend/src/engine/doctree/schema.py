"""Lược đồ cây tài liệu + bộ kiểm tra hợp lệ.

Đây là bản chốt của mục 3 trong docs/chuan-hoa-du-lieu.md, viết thành mã để
kiểm được tự động. `validate(doc)` trả về danh sách lỗi; rỗng nghĩa là hợp lệ.
"""
import re

SIDES = {"left", "right", "center"}
MARKS = {"bold", "italic", "underline", "highlight"}

# type -> (trường bắt buộc, trường được phép thêm)
BLOCK = {
    "paragraph":  ({"content"}, set()),
    "math_block": ({"tex"}, set()),
    "table":      ({"rows"}, {"align"}),
    "list":       ({"items"}, {"ordered"}),
    "image":      ({"figure_id"}, {"caption"}),
    "code_block": ({"text"}, {"lang"}),
}
INLINE = {
    "text":         ({"text"}, {"marks"}),
    "math":         ({"tex"}, set()),
    "hard_break":   (set(), set()),
    "image_inline": ({"figure_id"}, set()),
}

# Ngắt dòng phải nằm ở cấu trúc, không được lẫn vào chuỗi — bất biến 2, mục 12.
FORBIDDEN_IN_TEXT = re.compile(r"\n|\\\\|\\newline|<br\s*/?>", re.I)


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
                for m in n.get("marks", []):
                    if m not in MARKS:
                        err(p, f"dấu định dạng lạ: {m!r}")
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

    def check_table(n, p):
        rows = n.get("rows")
        if not isinstance(rows, list) or not rows:
            return err(p, "table phải có ít nhất một hàng")
        widths = set()
        for r_i, row in enumerate(rows):
            w = 0
            for c_i, c in enumerate(row):
                cp = f"{p}.rows[{r_i}][{c_i}]"
                if not isinstance(c, dict) or "content" not in c:
                    err(cp, "ô bảng phải là {content: [...]}")
                    continue
                span = c.get("colspan", 1)
                if not isinstance(span, int) or span < 1:
                    err(cp, f"colspan không hợp lệ: {span!r}")
                    span = 1
                w += span
                check_inline(c["content"], cp + ".content")
            widths.add(w)
        if len(widths) > 1:
            err(p, f"các hàng có số cột khác nhau: {sorted(widths)}")
        align = n.get("align")
        if align is not None:
            if not isinstance(align, list) or any(a not in "lcr" for a in align):
                err(p, f"align không hợp lệ: {align!r}")
            elif widths and len(align) != next(iter(widths)):
                err(p, f"align có {len(align)} cột, bảng có {next(iter(widths))}")

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
