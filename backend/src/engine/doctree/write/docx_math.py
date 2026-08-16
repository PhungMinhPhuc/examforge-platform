"""Điều phối công thức cho bộ ghi DOCX.

Module này là public entry point duy nhất của tầng xuất Word. Nó không chứa
chi tiết Pandoc/OMML hoặc cách gọi MathType worker:

* :mod:`docx_math_omml` dựng nền OMML hợp lệ cho mọi công thức.
* :mod:`docx_math_mathtype` thay các OMML hỗ trợ được bằng MathType OLE.

Luôn dựng OMML trước là điều kiện để fallback theo từng công thức và fallback
toàn tài liệu không làm mất nội dung toán.
"""

from __future__ import annotations

import io

from .docx_math_omml import flush_omml_math_batch


VALID_EQUATION_FORMATS = frozenset({"omml", "mathtype"})


def flush_math_batch(doc, math_batch, logger=None):
    """API tương thích cho các writer chỉ cần OMML."""
    return flush_omml_math_batch(doc, math_batch, logger=logger)


def finalize_math_document(
    doc,
    math_batch,
    equation_format: str = "omml",
    logger=None,
) -> bytes:
    """Hoàn thiện công thức và serialize ``doc`` thành bytes DOCX.

    Với MathType, bản bytes đầu tiên luôn đã chứa OMML. Provider nhận bản đó
    cùng danh sách TeX và giữ OMML tại mọi vị trí không chuyển được.
    """
    if equation_format not in VALID_EQUATION_FORMATS:
        raise ValueError(f"Định dạng công thức Word không hợp lệ: {equation_format}")

    if math_batch:
        flush_omml_math_batch(doc, math_batch, logger=logger)

    output = io.BytesIO()
    doc.save(output)
    docx_bytes = output.getvalue()
    output.close()

    if equation_format == "mathtype" and math_batch:
        from .docx_math_mathtype import convert_docx_formulas

        formulas = [tex for _kind, _reference, tex in math_batch]
        return convert_docx_formulas(docx_bytes, formulas)
    return docx_bytes


def math_export_capabilities() -> dict:
    """Capability ổn định để API không import trực tiếp provider cụ thể."""
    from .docx_math_mathtype import mathtype_capability

    return {
        "omml": {"available": True, "provider": "pandoc"},
        "mathtype": mathtype_capability(),
    }
