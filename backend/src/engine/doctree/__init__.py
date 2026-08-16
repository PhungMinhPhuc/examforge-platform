"""Cây tài liệu — dạng lưu trung lập cho ruột của từng trường câu hỏi.

Xem `docs/chuan-hoa-du-lieu.md`. Trước đây LaTeX vừa là một định dạng nhập vừa
là dạng lưu, nên mọi đầu ra phải đoán ngược từ một chuỗi trình bày. Nay CSDL lưu
cây mang cấu trúc, mỗi định dạng chỉ còn **một bộ đọc** và **một bộ ghi**.

    .docx ─┐    read/                     write/    ┌─> HTML
    .tex  ─┼──> ────────> CÂY TÀI LIỆU ────────> ─┼─> .tex
    .txt  ─┤              (jsonb trong DB)         ├─> .docx
    ô soạn ┘                                       └─> PDF

Thư mục nói CHIỀU, tên file nói ĐỊNH DẠNG:

    doctree/
      schema.py          lược đồ cây + validate()      ← mục 3 của tài liệu
      figures.py         kho hình, đóng vai q_images   ← mục 7
      read/tex.py        .tex   ──> cây
      read/docx.py       .docx  ──> cây
      write/tex.py       cây ──> .tex
      write/html.py      cây ──> HTML
      write/docx.py      cây ──> .docx
      math/omml.py       công thức Word    ──> TeX
      math/mathml.py     MathML            ──> TeX
      math/mathtype.py   MathType (Ruby)   ──> TeX
      math/vendor/       bản sao repo mathtype_to_mathml
      selfcheck.py       bốn phép đo, chạy độc lập

Nên `read/tex.py` đối xứng với `write/tex.py` — nhìn đường dẫn là biết ngay file
đó đọc hay ghi, và cho định dạng nào.

Dùng nhanh:

    from doctree import read_tex_block, to_tex, to_html, validate
    from doctree.figures import FigureStore

    figs = FigureStore()                       # MỘT kho cho cả lần nhập
    cauhoi, _ = read_tex_block(khoi_ex, figs)  # -> danh sách câu, mỗi câu có cây
    tex = to_tex(cauhoi, figs.by_id())         # dựng lại .tex đúng mẫu ex_test
"""
from .adapt import content_len, figures_by_id, has_image, question_to_rec
from .figures import FigureStore
from .read.docx import read_docx, split_questions
from .read.tex import BadSource, UnknownCommand, read_field, read_tex_block, read_tex_file
from .schema import check_layout_consistency, validate
from .write.docx import to_docx
from .write.html import doc_to_html, to_html
from .write.tex import doc_to_tex, to_tex
from .write.text import doc_to_text

__all__ = [
    # lược đồ
    "validate", "check_layout_consistency", "FigureStore",
    # đọc
    "read_tex_block", "read_tex_file", "read_field", "read_docx",
    "split_questions", "UnknownCommand", "BadSource",
    # ghi
    "to_tex", "doc_to_tex", "to_html", "doc_to_html", "to_docx", "doc_to_text",
    # chuyển đổi từ dòng CSDL
    "question_to_rec", "figures_by_id", "content_len", "has_image",
]
