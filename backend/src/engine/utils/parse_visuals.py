import os
import shutil
import re
from datetime import datetime
from utils.tikz_converter import tikz_to_svg

import threading

try:
    import warnings
    import os
    os.environ["NO_ALBUMENTATIONS_UPDATE"] = "1"
    os.environ["KMP_DUPLICATE_LIB_OK"] = "True"
    warnings.filterwarnings("ignore", category=UserWarning)
    
    from PIL import Image
    from pix2tex.cli import LatexOCR
    _LATEX_OCR_MODEL = None
    _LATEX_OCR_LOCK = threading.Lock()
except ImportError:
    Image = None
    LatexOCR = None
    _LATEX_OCR_MODEL = None
    _LATEX_OCR_LOCK = None

def init_latex_ocr():
    global _LATEX_OCR_MODEL
    if LatexOCR is None:
        return
    if _LATEX_OCR_MODEL is None:
        with _LATEX_OCR_LOCK:
            if _LATEX_OCR_MODEL is None:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    _LATEX_OCR_MODEL = LatexOCR()

def get_latex_from_image(img_path):
    global _LATEX_OCR_MODEL
    if LatexOCR is None or Image is None:
        return None
        
    try:
        img = Image.open(img_path).convert('RGB')
        if img.width < 10 or img.height < 10:
            return None
        
        # Đảm bảo model đã được khởi tạo
        if _LATEX_OCR_MODEL is None:
            init_latex_ocr()
            
        # Chạy inference song song không cần lock vì PyTorch CPU inference là thread-safe
        latex = _LATEX_OCR_MODEL(img)
            
        return f"${latex}$"
    except Exception as e:
        print(f"Error OCR image {img_path}: {e}")
        return None

def is_graphic_content(block):
    # Nếu có ảnh hoặc TikZ thì lấy
    if "\\includegraphics" in block or "\\begin{tikzpicture}" in block or "\\tikz" in block:
        return True
    return False

def extract_graphic_scale(tex_code):
    width_match = re.search(r'width\s*=\s*([0-9.]+)', tex_code)
    if width_match:
        return float(width_match.group(1))
    return 1.0

def parse_visuals(block, source_file_path, target_dir, question_public_id):
    """Parse and replace all TikZ/includegraphics in block with markdown image tags.
    Returns: (q_images, modified_block)
    - q_images: list of image metadata dicts
    - modified_block: the block string with TikZ/graphics replaced by ![Hình vẽ](path)
    """
    if not is_graphic_content(block):
        return [], block
    
    q_images = []
    modified_block = block
    # date hiện tại
    date = datetime.now()
    year = str(date.year)
    month = f"{date.month:02d}"

    # Tạo thư mục theo year/month
    final_dir = os.path.join(target_dir, year, month)
    os.makedirs(final_dir, exist_ok=True)

    # Xử lý tikz - dùng finditer trên block gốc, thay thế trên modified_block
    tikz_matches = list(re.finditer(r'(\\begin\{tikzpicture\}.*?\\end\{tikzpicture\})', block, re.DOTALL))
    for idx, match in enumerate(tikz_matches, 1):
        tikz_code = match.group(1)
        visual_id = f"{question_public_id}_tikz_{idx}"
        svg_file_name = f"{visual_id}.svg"
        svg_dest_path = os.path.join(final_dir, svg_file_name)
        success = tikz_to_svg(tikz_code, svg_dest_path)
        if success:
            # Chuẩn hoá path để web hiểu (map target_dir thành /static/images/)
            try:
                rel_path = os.path.relpath(svg_dest_path, target_dir)
                url_path = f"/static/images/{rel_path}".replace("\\", "/")
            except:
                url_path = svg_dest_path.replace("\\", "/").replace("\\\\", "/")
                
            md_tag = f"![Hình vẽ]({url_path})"
            # Thử thay thế cả khối center bao quanh nếu có
            center_pattern = r'\\begin\{center\}\s*' + re.escape(tikz_code) + r'\s*\\end\{center\}'
            if re.search(center_pattern, modified_block, re.DOTALL):
                modified_block = re.sub(center_pattern, md_tag, modified_block, count=1, flags=re.DOTALL)
            else:
                modified_block = modified_block.replace(tikz_code, md_tag, 1)
            q_images.append({
                "id": None,
                "question_id": None,
                "storage_path": url_path,
                "img_type": "tikz",
                "img_scale": 1.0,
                "raw_code": tikz_code
            })

    if not os.path.exists(target_dir):
        os.makedirs(target_dir)

    # Xử lý includegraphics
    base_dir = os.path.dirname(source_file_path)
    
    img_matches = list(re.finditer(r'(\\includegraphics\s*(?:\[.*?\])?\s*\{(.*?)\})', block))
    img_count = 1

    for match in img_matches:
        full_cmd = match.group(1)
        img_path = match.group(2)
        src_path = os.path.join(base_dir, img_path)
        actual_src = None
        exts = ['.png', '.jpg', '.jpeg', '.pdf', '.svg', '.gif', '.wmf', '.emf', '.wdp']
        exts += [e.upper() for e in exts]

        if os.path.splitext(src_path)[1]:
            if os.path.exists(src_path):
                actual_src = src_path
        else:
            for ext in exts:
                if os.path.exists(src_path + ext):
                    actual_src = src_path + ext
                    break

        if actual_src:
            file_extension = os.path.splitext(actual_src)[1]
            
            # XỬ LÝ WDP (JPEG XR / Windows Media Photo) — convert to PNG for web display
            if file_extension.lower() == '.wdp':
                png_path = actual_src.rsplit('.', 1)[0] + '.png'
                converted = False
                try:
                    from PIL import Image as _PILImage
                    _PILImage.open(actual_src).convert('RGB').save(png_path)
                    converted = True
                except Exception:
                    pass
                if not converted:
                    try:
                        from wand.image import Image as _WandImage
                        with _WandImage(filename=actual_src) as _wi:
                            _wi.format = 'png'
                            _wi.save(filename=png_path)
                        converted = True
                    except Exception:
                        pass
                if converted and os.path.isfile(png_path):
                    actual_src = png_path
                    file_extension = '.png'
                else:
                    img_count += 1
                    continue

            # XỬ LÝ WMF/EMF (MathType equations) — convert to PNG for web display
            if file_extension.lower() in ('.wmf', '.emf'):
                png_path = actual_src.rsplit('.', 1)[0] + '.png'
                converted = False
                try:
                    if file_extension.lower() == '.emf':
                        from utils.wmf_render import render_emf_to_pil
                        with open(actual_src, 'rb') as _f:
                            _data = _f.read()
                        render_emf_to_pil(_data).save(png_path)
                    else:
                        from utils.wmf_render import render_wmf_to_pil
                        with open(actual_src, 'rb') as _f:
                            _data = _f.read()
                        render_wmf_to_pil(_data).save(png_path)
                    converted = True
                except Exception:
                    pass

                if converted and os.path.isfile(png_path):
                    image_id = f"{question_public_id}_eq_{img_count}"
                    new_file_name = f"{image_id}.png"
                    dest_path = os.path.join(final_dir, new_file_name)
                    shutil.copy2(png_path, dest_path)
                    try:
                        rel_path = os.path.relpath(dest_path, target_dir)
                        url_path = f"/static/images/{rel_path}".replace("\\", "/")
                    except Exception:
                        url_path = dest_path.replace("\\", "/")
                    md_tag = f"![Công thức]({url_path})"
                    modified_block = modified_block.replace(full_cmd, md_tag, 1)
                    q_images.append({
                        "id": None, "question_id": None,
                        "storage_path": dest_path,
                        "img_type": "formula", "img_scale": 1.0, "raw_code": None,
                    })
                    img_count += 1
                    continue
            
            # Xử lý ảnh bình thường
            image_id = f"{question_public_id}_graphic_{img_count}"
            new_file_name = f"{image_id}{file_extension}"
            dest_path = os.path.join(final_dir, new_file_name)
            # Copy và đổi tên
            shutil.copy2(actual_src, dest_path)
            
            try:
                rel_path = os.path.relpath(dest_path, target_dir)
                url_path = f"/static/images/{rel_path}".replace("\\", "/")
            except:
                url_path = dest_path.replace("\\", "/").replace("\\\\", "/")
                
            md_tag = f"![Hình vẽ]({url_path})"
            modified_block = modified_block.replace(full_cmd, md_tag, 1)
            
            q_images.append({
                "id": None,
                "question_id": None,
                "storage_path": url_path,
                "img_type": "graphic",
                "img_scale": extract_graphic_scale(full_cmd),
                "raw_code": None
            })
            img_count += 1
            
    return q_images, modified_block