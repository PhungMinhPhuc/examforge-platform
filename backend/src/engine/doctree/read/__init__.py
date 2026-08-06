"""Bộ ĐỌC: định dạng file -> cây tài liệu. Tên file là định dạng nó đọc."""
from .docx import read_docx, split_questions
from .tex import BadSource, UnknownCommand, read_field, read_tex_block, read_tex_file

__all__ = ["read_tex_block", "read_tex_file", "read_field",
           "read_docx", "split_questions", "UnknownCommand", "BadSource"]
