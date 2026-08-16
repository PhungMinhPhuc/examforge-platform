"""Chuyển một câu lấy từ CSDL (dict phẳng, xem `api/routers/export.py`) thành
"rec" mà `write/tex.py` và `write/docx.py` dùng.

Viết một lần ở đây vì cả ba bộ ghi cần đúng một hình dạng —
`content_doc`, `solution_doc`, `options[].content_doc` (+ `explaination_doc`
nếu có) — và trước đây ba exporter tự tay bóc `q['content']` bằng regex theo
ba cách khác nhau.
"""
EMPTY_DOC = {"type": "doc", "content": []}


def question_to_rec(q):
    """`q` là một dòng `questions` đã JOIN thêm `options` (từ bảng chi tiết).

    Câu trả lời ngắn là ngoại lệ: `q_shortans_details.content` vẫn là `text`
    (đo trên dữ liệu thật thì toàn số thuần, không có đoạn/bảng/ảnh để cần
    cây) — nên phải tự bọc thành một cây một-nút-chữ ở đây.
    """
    qt = q.get("question_type")
    opts = []
    for i, o in enumerate(q.get("options") or []):
        row = {"order_index": o.get("order_index", i)}
        if qt == "sa":
            text = str(o.get("content") or "").strip()
            row["content_doc"] = {
                "type": "doc",
                "content": ([{"type": "paragraph",
                             "content": [{"type": "text", "text": text}]}]
                            if text else []),
            }
            row["is_correct"] = True
        else:
            row["content_doc"] = o.get("content") or EMPTY_DOC
            row["is_correct"] = bool(o.get("is_correct"))
            expl = o.get("explaination")
            if expl and expl.get("content"):
                row["explaination_doc"] = expl
        opts.append(row)

    return {
        "id": q.get("id"),
        "question_type": qt,
        "layout_type": q.get("layout_type") or "normal",
        "word_option_layout": q.get("word_option_layout"),
        "content_doc": q.get("content") or EMPTY_DOC,
        "solution_doc": q.get("solution") or EMPTY_DOC,
        "options": opts,
    }


def figures_by_id(images):
    """`[{id, storage_path, img_type, width, raw_code}, …]` -> `{id: row}`."""
    out = {}
    for img in images or []:
        row = dict(img)
        fid = img["id"]
        out[fid] = row
        out[str(fid)] = row  # tương thích cây cũ từng lưu ID số thành chuỗi
    return out


def normalize_figure_ids(node):
    """Đưa `figure_id="161"` về số `161`, giữ nguyên UUID/id tạm dạng chữ."""
    if isinstance(node, dict):
        if node.get("type") in ("image", "image_inline"):
            fid = node.get("figure_id")
            if isinstance(fid, str) and fid.strip().isdigit():
                node["figure_id"] = int(fid.strip())
        for value in node.values():
            normalize_figure_ids(value)
    elif isinstance(node, list):
        for value in node:
            normalize_figure_ids(value)
    return node


def content_len(value) -> int:
    """Độ dài chữ ước lượng của một trường — cây tài liệu hoặc chuỗi trơn (sa).

    Dùng khi cần đo "câu này dài cỡ nào" mà không quan tâm định dạng — ví dụ
    exporter chọn 1/2/4 phương án mỗi dòng theo độ dài.
    """
    from .write.text import doc_to_text
    text = doc_to_text(value) if isinstance(value, dict) else str(value or "")
    import re
    return len(re.sub(r"\s+", " ", text).strip())


def remap_figure_ids(node, mapping):
    """Viết đè `figure_id` trong cây theo `mapping`, sửa TẠI CHỖ.

    Cần vì `figure_id` lúc đọc file chỉ là id tạm do `FigureStore` cấp (bắt đầu
    từ 1 cho mỗi lần đọc), còn id thật là cột `id` do Postgres cấp sau khi
    `INSERT INTO q_images` — hai id này khác nhau, và cây phải trỏ đúng id thật
    thì đọc lại mới ra hình.
    """
    if isinstance(node, dict):
        normalize_figure_ids(node)
        if node.get("type") in ("image", "image_inline") and node.get("figure_id") in mapping:
            node["figure_id"] = mapping[node["figure_id"]]
        for k in ("content", "items", "rows", "columns"):
            for c in node.get(k) or []:
                remap_figure_ids(c, mapping)
    elif isinstance(node, list):
        for c in node:
            remap_figure_ids(c, mapping)
    return node


def has_image(node) -> bool:
    """Cây có nút `image`/`image_inline` ở đâu đó không."""
    if isinstance(node, dict):
        if node.get("type") in ("image", "image_inline"):
            return True
        return any(has_image(c) for k in ("content", "items", "rows", "columns")
                  for c in (node.get(k) or []))
    if isinstance(node, list):
        return any(has_image(c) for c in node)
    return False
