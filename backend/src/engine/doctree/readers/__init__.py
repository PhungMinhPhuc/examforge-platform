"""Bộ đọc: mỗi định dạng nhập một file."""
from .tex import read_field, read_tex_block, read_tex_file, UnknownCommand, BadSource
from .docx import read_docx, split_questions
from .omml import omml_to_tex
from .mathml import mathml_to_tex

__all__ = ["read_field", "read_tex_block", "read_tex_file", "read_docx",
           "split_questions", "omml_to_tex", "mathml_to_tex",
           "UnknownCommand", "BadSource"]
