"""Cây tài liệu — dạng lưu trung lập cho ruột của từng trường câu hỏi.

Xem `docs/chuan-hoa-du-lieu.md`. Tóm tắt: trước đây LaTeX vừa là một định dạng
nhập vừa là dạng lưu, nên mọi đầu ra phải đoán ngược từ một chuỗi trình bày.
Nay CSDL lưu cây mang cấu trúc, và mỗi định dạng chỉ còn **một bộ đọc** ở đầu
vào, **một bộ ghi** ở đầu ra.

    .docx ─┐    bộ đọc                  bộ ghi    ┌─> HTML
    .tex  ─┼──> ────────> CÂY TÀI LIỆU ────────> ─┼─> .tex
    .txt  ─┤              (jsonb trong DB)        ├─> .docx
    ô soạn ┘                                      └─> PDF

Dùng nhanh:

    from doctree import read_tex_block, to_latex, to_html, validate

    cauhoi = read_tex_block(khoi_ex)      # -> danh sách câu, mỗi câu có cây
    tex    = to_latex(cauhoi)             # dựng lại .tex đúng mẫu ex_test
"""
from .schema import check_layout_consistency, validate
from .readers.tex import BadSource, UnknownCommand, read_field, read_tex_block
from .readers.docx import read_docx, split_questions
from .writers.html import to_html, doc_to_html
from .writers.latex import to_latex, doc_to_latex

__all__ = [
    "validate", "check_layout_consistency",
    "read_tex_block", "read_field", "UnknownCommand", "BadSource",
    "read_docx", "split_questions",
    "to_latex", "doc_to_latex", "to_html", "doc_to_html",
]
