"""Bộ ghi: cây tài liệu -> chữ trơn.

Dùng cho những chỗ **không** lưu cây: đáp án câu trả lời ngắn (cột
`q_shortans_details.content` vẫn là `text`, vì đo trên 350 đáp án trong
`Sample/` thì tất cả đều là số thuần), và cho tìm kiếm hay so khớp.

Công thức giữ nguyên chuỗi TeX, không bọc `$` — người đọc kết quả tìm kiếm cần
thấy `x^2`, không cần biết nó là toán.
"""
import re


def normalize_short_answer(value):
    """Chuẩn hóa đáp án ngắn trước khi ghi cột text trong CSDL.

    LaTeX thường nhóm dấu thập phân để kiểm soát spacing (`7{,}5`,
    `1{.}25`). Những ngoặc này chỉ là cú pháp trình bày, không phải một phần
    đáp án. Đồng thời gỡ một cặp delimiter toán/ngoặc bao ngoài nếu có.
    """
    if value is None:
        return ""
    text = str(value).strip()
    if len(text) >= 2 and text[0] == "$" and text[-1] == "$":
        text = text[1:-1].strip()
    elif text.startswith(r"\(") and text.endswith(r"\)"):
        text = text[2:-2].strip()
    text = re.sub(r"\{\s*([,.])\s*\}", r"\1", text)
    # Gỡ ngoặc nhóm bao trọn đáp án (`{7{,}5}`), không đụng ngoặc nằm trong
    # biểu thức như `\frac{1}{2}`.
    while text.startswith("{") and text.endswith("}"):
        depth = 0
        closes_at_end = False
        for i, char in enumerate(text):
            if char == "{" and (i == 0 or text[i - 1] != "\\"):
                depth += 1
            elif char == "}" and (i == 0 or text[i - 1] != "\\"):
                depth -= 1
                if depth == 0:
                    closes_at_end = i == len(text) - 1
                    break
        if not closes_at_end:
            break
        text = text[1:-1].strip()
    return text


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
        elif t == "columns":
            out.extend(block_text(column.get("content", [])) for column in n["columns"])
    return "\n".join(x for x in out if x)


def doc_to_text(doc):
    """Cây -> chữ trơn, đã cắt khoảng trắng thừa."""
    if not isinstance(doc, dict):
        return (doc or "").strip() if isinstance(doc, str) else ""
    return block_text(doc.get("content", [])).strip()
