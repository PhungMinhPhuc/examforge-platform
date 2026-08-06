"""Bộ ghi: cây tài liệu -> chữ trơn.

Dùng cho những chỗ **không** lưu cây: đáp án câu trả lời ngắn (cột
`q_shortans_details.content` vẫn là `text`, vì đo trên 350 đáp án trong
`Sample/` thì tất cả đều là số thuần), và cho tìm kiếm hay so khớp.

Công thức giữ nguyên chuỗi TeX, không bọc `$` — người đọc kết quả tìm kiếm cần
thấy `x^2`, không cần biết nó là toán.
"""


def inline_text(nodes):
    out = []
    for n in nodes or []:
        t = n["type"]
        if t == "text":
            out.append(n["text"])
        elif t == "math":
            out.append(n["tex"])
        elif t == "hard_break":
            out.append("\n")
    return "".join(out)


def block_text(nodes):
    out = []
    for n in nodes or []:
        t = n["type"]
        if t == "paragraph":
            out.append(inline_text(n["content"]))
        elif t == "math_block":
            out.append(n["tex"])
        elif t == "code_block":
            out.append(n["text"])
        elif t == "table":
            for row in n["rows"]:
                out.append(" | ".join(inline_text(c["content"]) for c in row))
        elif t == "list":
            for item in n["items"]:
                out.append(block_text(item))
    return "\n".join(x for x in out if x)


def doc_to_text(doc):
    """Cây -> chữ trơn, đã cắt khoảng trắng thừa."""
    if not isinstance(doc, dict):
        return (doc or "").strip() if isinstance(doc, str) else ""
    return block_text(doc.get("content", [])).strip()
