from psycopg2.extras import Json


def to_jsonb(value):
    """Bọc cây tài liệu (dict/list) cho cột jsonb.

    psycopg2 không tự biết một `dict`/`list` là jsonb, phải nói bằng `Json()`.
    Giá trị khác (str, int, None...) để nguyên — an toàn dùng cho mọi value,
    kể cả cột vẫn là text thường (vd q_shortans_details.content).
    """
    return Json(value) if isinstance(value, (dict, list)) else value
