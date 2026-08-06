"""Công thức từ các định dạng nhập -> TeX.

Cây tài liệu lưu công thức ở dạng TeX (mục 5 của docs/chuan-hoa-du-lieu.md), nên
mọi định dạng nhập đều phải quy về đây. Ba nguồn, ba mức khó:

| Nguồn | Nằm ở đâu | Dịch bằng |
| --- | --- | --- |
| LaTeX `$…$` | file `.tex` | không phải dịch, đã là TeX |
| OMML `<m:oMath>` | `.docx` hiện hành | `omml.py`, thuần Python |
| MathType OLE | `.docx` cũ | `mathtype.py` -> Ruby -> `mathml.py` |
"""
from .mathml import mathml_to_tex
from .mathtype import convert_docx_equations
from .omml import omml_to_tex

__all__ = ["omml_to_tex", "mathml_to_tex", "convert_docx_equations"]
