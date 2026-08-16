"""Đường dẫn duy nhất tới bộ font production đóng gói cùng dự án."""

from __future__ import annotations

from pathlib import Path


FONT_ROOT = Path(__file__).resolve().parents[3] / "assets" / "fonts"
DOCUMENT_FONT_DIR = FONT_ROOT / "document"
MATH_FONT_DIR = FONT_ROOT / "math"
VECTOR_FONT_DIR = FONT_ROOT / "vector"
WEB_FONT_DIR = FONT_ROOT / "web"


def latex_font_path(path: Path) -> str:
    """Trả đường dẫn tuyệt đối dùng được trong fontspec trên Windows/Linux."""
    return path.resolve().as_posix().replace("#", r"\#")


def validate_font_package() -> list[str]:
    required = (
        DOCUMENT_FONT_DIR / "times.ttf",
        DOCUMENT_FONT_DIR / "timesbd.ttf",
        DOCUMENT_FONT_DIR / "timesi.ttf",
        DOCUMENT_FONT_DIR / "timesbi.ttf",
        DOCUMENT_FONT_DIR / "Cambria.ttf",
        MATH_FONT_DIR / "CambriaMath.ttf",
        MATH_FONT_DIR / "XITSMath-Regular.otf",
    )
    return [str(path) for path in required if not path.is_file()]
