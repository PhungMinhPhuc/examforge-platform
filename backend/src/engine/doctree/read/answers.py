r"""Đáp án đúng nằm ở đâu trong một đề `.docx`.

Đây là phần **kiến thức nghiệp vụ** còn lại sau khi bỏ pandoc: file `.docx` không
có ô nào ghi "đáp án là B", mà người soạn đánh dấu theo một trong ba quy ước.
Trước đây ba quy ước này nằm rải trong `parse_docx.py`, `parse_docx_standard.py`
và `parse_docx_standardized.py`, lẫn với mã dọn dẹp pandoc; phần dọn dẹp đó bỏ
được, phần này thì không.

| Quy ước | Nhận ra bằng | Đáp án ở đâu |
| --- | --- | --- |
| **BTPRO** | file có `\\begin{ex}` | `\\True` sẵn, không cần đoán — đi đường `read/tex.py` |
| **Bảng đáp án** | có bảng `Câu \| Chọn` | bảng cuối file |
| **Đánh dấu** | không có bảng đó | in đậm / gạch chân / tô màu trên nhãn `A.` |

Đọc thẳng `.docx` thì quy ước thứ ba dễ hẳn: `marks` đã nằm sẵn trên nút, chỉ
việc nhìn. Bản cũ phải bóc `\\textbf{\\ul{C.}}` qua ba tầng regex vì pandoc đã
dịch mất định dạng thành lệnh LaTeX.
"""
import re
import zipfile
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# Dấu nào trên nhãn phương án thì coi là đánh dấu đáp án đúng. In nghiêng KHÔNG
# tính: đề hay in nghiêng để nhấn chữ trong câu dẫn, không phải để chỉ đáp án.
ANSWER_MARKS = {"bold", "underline", "highlight"}


# ------------------------------------------------- quy ước 1: bảng đáp án ---

def read_answer_tables(docx_path):
    """Đọc bảng đáp án cuối file. Trả `{}` nếu không có bảng nào.

    Ba phần của đề chuẩn hóa:
      P1  trắc nghiệm    bảng hai hàng `Câu | Chọn`, ô là A/B/C/D
      P2  đúng/sai       hàng đầu là số câu, bốn hàng sau là `a) Đ`, `b) S`…
      P3  trả lời ngắn   cùng dạng P1 nhưng ô không phải A-D
    """
    out = {"P1": {}, "P2": {}, "P3": {}}
    try:
        with zipfile.ZipFile(docx_path) as z:
            doc = ET.fromstring(z.read("word/document.xml"))
    except Exception:
        return out

    for tbl in doc.iter(W + "tbl"):
        grid = [[_cell_text(tc) for tc in tr.findall(W + "tc")]
                for tr in tbl.findall(W + "tr")]
        if not grid or not grid[0]:
            continue

        # P1 và P3 cùng dạng "Câu / Chọn"; phân biệt bằng nội dung ô đáp án
        if grid[0][0].lower() == "câu" and len(grid) >= 2 and grid[1][0].lower() == "chọn":
            is_p3 = any(grid[1][c] and grid[1][c].upper() not in ("A", "B", "C", "D", "")
                        for c in range(1, len(grid[0])))
            for c in range(1, len(grid[0])):
                num, ans = grid[0][c], grid[1][c]
                if num.isdigit() and ans:
                    out["P3" if is_p3 else "P1"][num] = ans if is_p3 else ans.upper()
            continue

        # P2: hàng đầu là số câu, bốn hàng sau là a) b) c) d)
        if grid[0][0].isdigit() and len(grid) >= 5 and grid[1][0].lower().startswith("a)"):
            for c in range(len(grid[0])):
                num = grid[0][c]
                if not num.isdigit():
                    continue
                out["P2"][num] = {}
                for r in range(1, 5):
                    val = grid[r][c].upper() if c < len(grid[r]) else ""
                    if "Đ" in val or "D" in val:
                        out["P2"][num][r - 1] = True
                    elif "S" in val:
                        out["P2"][num][r - 1] = False
    return out


def _cell_text(tc):
    return "".join(t.text or "" for t in tc.iter(W + "t")).strip()


# --------------------------------------------- quy ước 2: đánh dấu tại chỗ ---

def marked_as_answer(option):
    """Phương án này có được đánh dấu là đáp án đúng không?

    Nhìn **nhãn** ("A.", "b)") chứ không nhìn cả phương án: đề hay in đậm một
    cụm trong nội dung phương án để nhấn mạnh, mà đó không phải dấu đáp án.
    Nhãn đã bị `split_options()` cắt rời, nên dấu của nó nằm ở nút đầu tiên.
    """
    blocks = option.get("content") or []
    if not blocks:
        return False
    nodes = blocks[0].get("content") or []
    if not nodes:
        return False
    return bool(ANSWER_MARKS & set(nodes[0].get("marks") or []))


# ------------------------------------------------------------ gộp lại ---

RE_PART = re.compile(r"PHẦN\s+(I{1,3})\b", re.I)


def detect_answers(questions, answer_tables=None):
    """Điền `is_correct` cho từng phương án của từng câu.

    Ưu tiên bảng đáp án — đó là lời khẳng định của người soạn. Chỉ khi không có
    bảng mới đọc dấu định dạng, vì dấu có thể chỉ để nhấn mạnh.

    Tra bảng theo **(phần, số câu)** chứ không theo số thứ tự chạy suốt file: đề
    chuẩn hóa đánh số lại từ 1 ở mỗi phần, nên "Câu 1" xuất hiện ba lần với ba
    đáp án khác nhau.

    Sửa tại chỗ `questions` và trả lại luôn cho tiện.
    """
    tables = answer_tables or {}
    by_part = {"I": tables.get("P1") or {},
               "II": tables.get("P2") or {},
               "III": tables.get("P3") or {}}

    for q in questions:
        num = str(q.get("so", ""))
        phan = (q.get("phan") or "I").upper()
        opts = q.get("options") or []
        table = by_part.get(phan, {})

        if phan == "II" and num in table:          # đúng/sai
            for i, o in enumerate(opts):
                o["is_correct"] = bool(table[num].get(i, False))
            q["question_type"] = "tf"
            continue

        if phan == "III" and num in table:         # trả lời ngắn
            q["question_type"] = "sa"
            q["short_answer"] = table[num]
            continue

        if not opts:
            # Không có phương án: hoặc là tự luận, hoặc là câu đúng/sai mà mệnh
            # đề chưa bóc ra được. Phần II thì báo để người xem lại.
            q.setdefault("question_type", "tf" if phan == "II" else "oe")
            continue

        q["question_type"] = "tf" if phan == "II" else "mc"
        key = table.get(num) if phan == "I" else None
        if key:
            for o in opts:
                o["is_correct"] = (o.get("key", "").upper() == str(key).upper())
        else:
            for o in opts:
                o["is_correct"] = marked_as_answer(o)

    return questions


def unresolved(questions):
    """Câu nào chưa xác định được đáp án."""
    bad = []
    for q in questions:
        t = q.get("question_type")
        if t == "sa" and q.get("short_answer"):
            continue
        if t == "oe":
            continue
        opts = q.get("options") or []
        if not opts or not any(o.get("is_correct") for o in opts):
            bad.append((q.get("phan"), q.get("so")))
    return bad


def check_against_tables(questions, answer_tables):
    """So số câu tách được với số dòng trong bảng đáp án.

    Đây là phép kiểm **mạnh nhất** cho đường `.docx`, mạnh hơn hẳn việc dò xem
    câu nào thiếu đáp án. Lý do: bảng đáp án là **lời khai của người soạn về đề
    có bao nhiêu câu**. Tách ra ít hơn nghĩa là đã bỏ sót — chẳng hạn "Câu 2"
    nằm giữa đoạn sau một công thức thì mẫu neo đầu dòng không bắt được.

    Trả về danh sách lời cảnh báo, rỗng là khớp.
    """
    tables = answer_tables or {}
    dem = {}
    for q in questions:
        phan = (q.get("phan") or "I").upper()
        dem[phan] = dem.get(phan, 0) + 1

    ten = {"P1": "I", "P2": "II", "P3": "III"}
    out = []
    for key, phan in ten.items():
        can = len(tables.get(key) or {})
        co = dem.get(phan, 0)
        if can and co != can:
            out.append(f"PHẦN {phan}: bảng đáp án có {can} câu, tách được {co}")
    return out
