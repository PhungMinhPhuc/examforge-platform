"""Bộ GHI: cây tài liệu -> định dạng file. Tên file là định dạng nó ghi."""
from .docx import to_docx, add_question
from .html import block_html, doc_to_html, inline_html, to_html
from .tex import doc_to_tex, question_tex, to_tex
from .text import doc_to_text

__all__ = ["to_tex", "doc_to_tex", "question_tex",
           "to_html", "doc_to_html", "block_html", "inline_html",
           "to_docx", "add_question", "doc_to_text"]
