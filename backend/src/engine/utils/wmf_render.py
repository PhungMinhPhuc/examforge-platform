"""Dựng ảnh WMF/EMF thành PNG.

MathType lưu công thức dưới dạng đối tượng OLE nhị phân; khi đi qua pandoc mỗi
công thức thành một ảnh `.wmf`. Hai hàm ở đây dựng ảnh đó ra PNG để hiển thị
trên web.

Đây là **đường lui**, không phải đường chính. Đường chính nay là
`doctree/math/mathtype.py` — dịch thẳng công thức MathType sang TeX, giữ được
chữ thay vì chụp thành ảnh. Chỉ khi đường đó không chạy được (thiếu Ruby) thì
công thức mới còn ở dạng ảnh và cần tới file này.
"""
import os
import struct

from PIL import Image
from PIL import _imaging as _pil_core

_WMF_ALDUS_MAGIC = 0x9AC6CDD7
_RENDER_DPI = 200   # đủ để nhìn, dựng nhanh


def render_wmf_to_pil(wmf_bytes: bytes, dpi: int = _RENDER_DPI) -> Image.Image:
    """Render a Placeable WMF to a padded white PIL Image."""
    magic = struct.unpack_from('<I', wmf_bytes)[0]
    if magic != _WMF_ALDUS_MAGIC:
        raise ValueError("Not a Placeable WMF")
    _, _, x0, y0, x1, y1, inch = struct.unpack_from('<IHhhhhH', wmf_bytes)
    if inch == 0:
        raise ValueError("WMF inch value is zero")

    w = max(4, round((x1 - x0) / inch * dpi))
    h = max(4, round((y1 - y0) / inch * dpi))

    raw = _pil_core.drawwmf(wmf_bytes, (w, h), (x0, y0, x1, y1))
    eq_img = Image.frombytes('RGB', (w, h), raw, 'raw', 'BGR', (w * 3 + 3) & ~3, -1)

    pad = max(6, min(w, h) // 6)
    padded = Image.new('RGB', (w + 2 * pad, h + 2 * pad), (255, 255, 255))
    padded.paste(eq_img, (pad, pad))
    return padded


def render_emf_to_pil(emf_bytes: bytes, dpi: int = _RENDER_DPI) -> Image.Image:
    """Render an EMF to a padded white PIL Image.
    Tries wand (ImageMagick) then magick subprocess with timeout — avoids GDI hangs in server context."""
    import tempfile
    import subprocess
    from io import BytesIO

    def _pad(img: Image.Image) -> Image.Image:
        p = max(6, min(img.width, img.height) // 6)
        out = Image.new('RGB', (img.width + 2 * p, img.height + 2 * p), (255, 255, 255))
        out.paste(img, (p, p))
        return out

    # wand (ImageMagick Python bindings)
    try:
        from wand.image import Image as _WandImage
        from wand.color import Color as _WandColor
        with _WandImage(blob=emf_bytes) as wi:
            wi.resolution = (dpi, dpi)
            wi.background_color = _WandColor('white')
            wi.alpha_channel = 'remove'
            png_bytes = wi.make_blob('png')
        return _pad(Image.open(BytesIO(png_bytes)).convert('RGB'))
    except Exception:
        pass

    # magick subprocess with explicit timeout
    tmp_emf = tmp_png = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.emf', delete=False) as f:
            f.write(emf_bytes)
            tmp_emf = f.name
        tmp_png = tmp_emf[:-4] + '.png'
        subprocess.run(
            ['magick', tmp_emf, '-density', str(dpi),
             '-background', 'white', '-flatten', tmp_png],
            check=True, timeout=20, capture_output=True,
        )
        if os.path.isfile(tmp_png):
            return _pad(Image.open(tmp_png).convert('RGB'))
    except Exception:
        pass
    finally:
        for p in (tmp_emf, tmp_png):
            if p:
                try:
                    os.unlink(p)
                except Exception:
                    pass

    raise ValueError("EMF rendering failed: install wand or ImageMagick (magick)")
