"""Nhập một file `.tex` thành các bản ghi sẵn sàng ghi vào CSDL.

Thay `parsers/logic_manager.py`. Cùng hình dạng đầu ra, khác ở ruột: `content`
và `solution` nay là **cây tài liệu** chứ không phải chuỗi LaTeX.

Việc dựng hình vẫn để `utils/parse_visuals.py` lo — dựng TikZ ra `.svg` bằng
xelatex, chép ảnh vào `storage/`, đặt tên theo `public_id`. Đó là quản lý file,
không dính gì tới cây, và mã cũ đã chạy đúng. Trình tự vì vậy là:

    khối ex ──parse_visuals──> khối có thẻ ![](url) + danh sách hình
                │
                └──read_tex_block──> cây, nút ảnh trỏ `figure_id` tra từ url
"""
import concurrent.futures
import re
import uuid

from utils.get_bracket_content import get_bracket_content
from utils.parse_visuals import parse_visuals
from utils.utils import replace_math_macros

from .figures import FigureStore
from .read.tex import RE_EX, RE_SOCHC, read_tex_block
from .write.text import doc_to_text, normalize_short_answer

DETAILS_TABLE = {
    "mc": "q_choice_details",
    "tf": "q_truefalse_details",
    "sa": "q_shortans_details",
}
ENCODINGS = ("utf-8-sig", "utf-8", "cp1252", "latin-1")


def read_source(file_path):
    """Đọc file `.tex`, thử vài encoding hay gặp ở file tiếng Việt."""
    for enc in ENCODINGS:
        try:
            with open(file_path, "r", encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, LookupError):
            continue
    raise ValueError("Không đọc được file .tex — encoding không hỗ trợ")


def clean_source(content):
    """Bỏ preamble và chú thích, giữ nguyên phần trong tikzpicture."""
    doc = re.search(r"\\begin\{document\}(.*?)(?:\\end\{document\}|$)", content, re.S)
    if doc:
        content = doc.group(1)

    # Cất tikzpicture ra trước khi xóa chú thích: bên trong TikZ dấu `%` là
    # chú thích thật của mã vẽ, xóa đi là vỡ hình.
    kept = []

    def stash(m):
        kept.append(m.group(0))
        return f"__TIKZ_BLOCK_{len(kept) - 1}__"

    content = re.sub(r"\\begin\{tikzpicture\}.*?\\end\{tikzpicture\}", stash, content, flags=re.S)
    content = re.sub(r"(?<!\\)(?<!\d)(?<!\\\\)%[^\n]*", "", content)
    for i, block in enumerate(kept):
        content = content.replace(f"__TIKZ_BLOCK_{i}__", block)

    return replace_math_macros(content)


def _question_record(rec, figs, ctx, public_id, parent_public_id=None):
    """Một câu đã đọc -> bộ ba bản ghi cho questions / q_images / bảng chi tiết."""
    question = {
        "teacher_id": ctx["teacher_id"],
        "public_id": public_id,
        "subject": ctx["subject"],
        "grade": ctx["grade"],
        "parent_id": parent_public_id,
        "question_type": rec["question_type"],
        "layout_type": rec["layout_type"],
        "content": rec["content_doc"],
        "solution": rec["solution_doc"],
        "chapter": ctx["chapter"],
        "lesson": ctx["lesson"],
        "complexity": ctx["complexity"],
        "is_shufflable": True,
    }

    used = _figure_ids(rec)
    images = [
        # "id" ở đây là id TẠM của FigureStore (bắt đầu từ 1 mỗi lần đọc), khác
        # với id thật Postgres cấp sau khi INSERT. Giữ lại để nơi ghi vào CSDL
        # ánh xạ ngược lại và sửa `figure_id` trong cây — xem
        # doctree.adapt.remap_figure_ids().
        {"id": r["id"], "storage_path": r["storage_path"], "img_type": r["img_type"],
         "width": r["width"], "raw_code": r["raw_code"]}
        for r in figs.rows if r["id"] in used
    ]

    details = []
    for o in rec["options"]:
        row = {"order_index": o["order_index"], "is_shufflable": True}
        if rec["question_type"] == "sa":
            # q_shortans_details.content vẫn là `text` — đáp án ngắn là số thuần,
            # không có đoạn, bảng hay ảnh để mà cần cây.
            row["content"] = normalize_short_answer(doc_to_text(o["content_doc"]))
        else:
            row["content"] = o["content_doc"]
            row["is_correct"] = o["is_correct"]
        if "explaination_doc" in o:
            row["explaination"] = o["explaination_doc"]
        details.append(row)

    return {
        "table_question": question,
        "table_images": images,
        "table_details": {"target_table": DETAILS_TABLE.get(rec["question_type"]),
                          "records": details},
    }


def _figure_ids(rec, node=None, acc=None):
    """Các `figure_id` mà một câu dùng tới, để chia hình đúng câu."""
    acc = set() if acc is None else acc
    if node is None:
        for tree in [rec["content_doc"], rec["solution_doc"]] + \
                    [o["content_doc"] for o in rec["options"]] + \
                    [o["explaination_doc"] for o in rec["options"]
                     if o.get("explaination_doc")]:
            _figure_ids(rec, tree, acc)
        return acc
    if isinstance(node, dict):
        if node.get("type") in ("image", "image_inline"):
            acc.add(node["figure_id"])
        for k in ("content", "items", "rows", "columns"):
            for c in node.get(k, []) or []:
                _figure_ids(rec, c, acc)
    elif isinstance(node, list):
        for c in node:
            _figure_ids(rec, c, acc)
    return acc


def import_block(block, ctx, source_path, img_dir):
    """Một khối `\\begin{ex}` -> danh sách bản ghi.

    Câu chùm ra nhiều bản ghi: một câu cha, rồi các câu con nối qua `parent_id`.
    """
    is_group = bool(RE_SOCHC.search(block))
    parent_uuid = str(uuid.uuid4()) if is_group else None

    # parse_visuals cần một public_id để đặt tên file ảnh; câu chùm thì dùng của cha.
    first_uuid = parent_uuid or str(uuid.uuid4())
    q_images, block = parse_visuals(block, source_path, img_dir, first_uuid)

    figs = FigureStore().seed(q_images)
    group, _ = read_tex_block(block, figs, strict=False)

    out = []
    for i, rec in enumerate(group):
        if is_group and i == 0:
            out.append(_question_record(rec, figs, ctx, parent_uuid))
        else:
            out.append(_question_record(rec, figs, ctx, str(uuid.uuid4()), parent_uuid))
    return out


def import_docx(file_path, teacher_id, subject, grade, chapter, lesson,
                complexity, target_img_dir):
    """Nhập `.docx` **đọc thẳng**, không đi vòng qua pandoc.

    Khác `.tex` ở một điểm cốt tử: `.tex` có `\\begin{ex}` nên biết chắc câu bắt
    đầu ở đâu, còn `.docx` thì **phải đoán** — theo đánh số tự động của Word,
    hoặc theo chữ "Câu n". Vì vậy hàm trả thêm khóa `can_review`: danh sách câu
    chưa xác định được đáp án, để giao diện bắt người dùng xem lại.
    """
    from .read.answers import (check_against_tables, detect_answers,
                           read_answer_tables, unresolved)
    from .read.docx import read_docx, split_questions

    try:
        grade_int = int(grade) if grade else 12
    except (ValueError, TypeError):
        grade_int = 12
    ctx = {"teacher_id": teacher_id, "subject": subject, "grade": grade_int,
           "chapter": chapter, "lesson": lesson, "complexity": int(complexity)}

    tables = read_answer_tables(file_path)
    tree, figs = read_docx(file_path, media_dir=target_img_dir)
    questions = detect_answers(split_questions(tree), tables)

    out = []
    for q in questions:
        rec = {
            "question_type": q.get("question_type", "oe"),
            "layout_type": "normal",
            "content_doc": {"type": "doc", "content": q["content"]},
            "solution_doc": {"type": "doc", "content": []},
            "options": [
                {"order_index": i,
                 "is_correct": bool(o.get("is_correct")),
                 "content_doc": {"type": "doc",
                                 "content": o["content"][0]["content"] if o["content"] else []}}
                for i, o in enumerate(q.get("options") or [])
            ],
        }
        if q.get("short_answer"):
            rec["options"] = [{"order_index": 0, "is_correct": True,
                               "content_doc": {"type": "doc", "content": [
                                   {"type": "paragraph",
                                    "content": [{"type": "text", "text": q["short_answer"]}]}]}}]
        out.append(_question_record(rec, figs, ctx, str(uuid.uuid4())))

    canh_bao = check_against_tables(questions, tables)
    chua_ro = unresolved(questions)
    if chua_ro:
        canh_bao.append(f"{len(chua_ro)} câu chưa rõ đáp án: {chua_ro[:12]}")
    for msg in canh_bao:
        print(f"[import_docx] {msg}")
    if canh_bao and out:
        out[0].setdefault("warnings", []).extend(canh_bao)
    return out


def import_tex(file_path, teacher_id, subject, grade, chapter, lesson,
               complexity, target_img_dir, max_workers=8):
    """Điểm vào, thay `logic_manager.run_parser` với cùng hình dạng đầu ra."""
    try:
        grade_int = int(grade) if grade else 12
    except (ValueError, TypeError):
        grade_int = 12

    ctx = {"teacher_id": teacher_id, "subject": subject, "grade": grade_int,
           "chapter": chapter, "lesson": lesson, "complexity": int(complexity)}

    content = clean_source(read_source(file_path))
    blocks = RE_EX.findall(content)

    out = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
        for records in pool.map(
                lambda b: import_block(b, ctx, file_path, target_img_dir), blocks):
            out.extend(records)
    return out
