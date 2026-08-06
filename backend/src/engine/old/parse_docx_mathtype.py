"""
MathType equation handling for DOCX imports.

MathType stores equations as OLE objects; pandoc converts each one to a WMF
image reference.  This module replaces those WMF references with PNG images
rendered at screen resolution — no ML / pix2tex involved.

Speed: ~2 ms per equation (PIL WMF renderer on Windows).
The resulting \includegraphics{...png} references are then handled by
parse_visuals.parse_visuals(), which copies them to the question image
store and inserts an inline markdown image tag.
"""

import os
import re
import struct
import zipfile

from PIL import Image
from PIL import _imaging as _pil_core

_WMF_ALDUS_MAGIC = 0x9AC6CDD7
_RENDER_DPI = 200   # fast render; sufficient for visual inspection


# Pandoc image-reference patterns

_IMG_PANDOCBOUNDED = re.compile(
    r'\\pandocbounded\{\\includegraphics\[keepaspectratio\]\{([^}]+\.(?:wmf|emf))\}\}'
)
_IMG_PLAIN = re.compile(
    r'\\includegraphics\[keepaspectratio\]\{([^}]+\.(?:wmf|emf))\}'
)


def _all_wmf_paths(content: str) -> list[str]:
    seen: dict[str, None] = {}
    for path in _IMG_PANDOCBOUNDED.findall(content) + _IMG_PLAIN.findall(content):
        seen[path] = None
    return list(seen)


def has_mathtype_equations(docx_path: str) -> bool:
    try:
        with zipfile.ZipFile(docx_path) as z:
            xml = z.read('word/document.xml').decode('utf-8', errors='replace')
        return 'Equation.DSMT' in xml or '"Equation.3"' in xml
    except Exception:
        return False


# WMF renderer

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


# Main conversion entry point

def replace_wmf_with_latex(content: str, media_dir: str,
                            progress_cb=None) -> str:
    """
    Convert every WMF/EMF equation image to a PNG file and replace the
    \\pandocbounded{\\includegraphics{...wmf}} reference with a plain
    \\includegraphics{...png}.

    The PNG references are later handled by parse_visuals.parse_visuals(),
    which copies them to the question image store and inserts inline
    markdown image tags.  This path is ~1000× faster than pix2tex OCR.
    """
    img_paths = _all_wmf_paths(content)
    if not img_paths:
        return content

    # Map wmf filename → absolute png path (or '' on failure)
    cache: dict[str, str] = {}
    total = len(img_paths)

    for i, img_path in enumerate(img_paths):
        img_name = os.path.basename(img_path)
        if img_name in cache:
            if progress_cb:
                progress_cb(i + 1, total)
            continue

        candidate = img_path if os.path.isfile(img_path) \
            else os.path.join(media_dir, 'media', img_name)

        if not os.path.isfile(candidate):
            cache[img_name] = ''
        else:
            try:
                with open(candidate, 'rb') as f:
                    img_data = f.read()
                if img_name.lower().endswith('.emf'):
                    pil_img = render_emf_to_pil(img_data)
                else:
                    pil_img = render_wmf_to_pil(img_data)
                png_path = candidate.rsplit('.', 1)[0] + '.png'
                pil_img.save(png_path)
                cache[img_name] = png_path
            except Exception:
                cache[img_name] = ''

        if progress_cb:
            progress_cb(i + 1, total)

    def _sub(m: re.Match) -> str:
        img_name = os.path.basename(m.group(1))
        png_path = cache.get(img_name, '')
        if not png_path:
            return ''
        return f'\\includegraphics{{{png_path}}}'

    content = _IMG_PANDOCBOUNDED.sub(_sub, content)
    content = _IMG_PLAIN.sub(_sub, content)
    return content
