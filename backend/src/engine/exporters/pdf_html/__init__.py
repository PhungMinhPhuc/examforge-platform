"""HTML/Paged.js PDF exporter.

The preview and the exported PDF intentionally share the same HTML document so
their pagination and visual output stay in sync.
"""

from .preview import render_exam_preview_html
from .renderer import html_to_pdf_sync, measure_unit_heights_html_sync

__all__ = (
    "render_exam_preview_html",
    "html_to_pdf_sync",
    "measure_unit_heights_html_sync",
)
