"""Kho hình dùng chung cho các bộ đọc.

Đóng vai bảng `q_images`: mọi thứ **về bản thân hình** nằm ở đây, còn cây chỉ
giữ `figure_id` — tức **hình nằm ở chỗ nào trong nội dung**, thứ duy nhất bảng
không diễn tả được. Xem mục 7 của docs/chuan-hoa-du-lieu.md.
"""
import os
import re

DEFAULT_WIDTH = 0.50    # chỉ dùng lúc HIỂN THỊ khi không biết cả width lẫn
                          # kích thước gốc (xem write/html.py, write/tex.py) —
                          # KHÔNG dùng làm giá trị mặc định ghi vào CSDL nữa.

# Hệ quy chiếu duy nhất của `q_images.width`: TOÀN BỘ bề ngang tờ A4,
# không phải vùng chữ sau khi trừ lề. Khai đủ đơn vị để debug các bộ xuất.
A4_REFERENCE_WIDTH_MM = 210.0
A4_REFERENCE_WIDTH_IN = A4_REFERENCE_WIDTH_MM / 25.4
A4_REFERENCE_WIDTH_PT = A4_REFERENCE_WIDTH_IN * 72.0
A4_REFERENCE_WIDTH_PX = A4_REFERENCE_WIDTH_IN * 96.0


class FigureStore:
    """Gom hình của một lần đọc. `rows` ánh xạ 1-1 sang các dòng `q_images`."""

    def __init__(self, first_id=1):
        self.rows = []
        self._next = first_id

    def add(self, img_type, raw_code="", storage_path="", width=None,
            data=None, media_dir=None, name=""):
        """Thêm một hình, trả về `figure_id`.

        `data` + `media_dir`: hình nhúng trong `.docx` cần ghi ra file trước.
        `width=None` nghĩa là **chưa biết** nên chiếm bao nhiêu % bề ngang
        trang — khác với "biết là chiếm 45%". Cột `q_images.width` cho phép
        NULL đúng để giữ khác biệt này; nơi hiển thị (HTML/tex/docx) tự quyết
        định lấy kích thước gốc của ảnh khi gặp NULL, xem write/*.py.
        """
        if data is not None and media_dir:
            os.makedirs(media_dir, exist_ok=True)
            storage_path = os.path.join(media_dir,
                                        f"{self._next}_{os.path.basename(name)}")
            with open(storage_path, "wb") as f:
                f.write(data)
            storage_path = storage_path.replace("\\", "/")

        row = {
            "id": self._next,
            "img_type": img_type,          # 'tikz' hoặc 'graphic' — xem CHECK
            "width": round(float(width), 3) if width is not None else None,
            "raw_code": (raw_code or "").strip(),
            "storage_path": storage_path,
        }
        self.rows.append(row)
        self._next += 1
        return row["id"]

    def seed(self, rows):
        """Nạp sẵn hình do `utils/parse_visuals.py` đã dựng và cất.

        Việc dựng TikZ ra `.svg` bằng xelatex và chép ảnh vào `storage/` **không
        thuộc về cây** — đó là quản lý file, và `parse_visuals` đã làm đúng từ
        lâu. Nên đường nhập chạy `parse_visuals` trước; nó trả lại chuỗi có thẻ
        `![](url)`, rồi bộ đọc chỉ việc tra `url` ra `figure_id` ở đây.
        """
        for r in rows or []:
            kind = r.get("img_type") or "graphic"
            self.rows.append({
                "id": self._next,
                # 'formula' là ảnh WMF của MathType do đường cũ dựng ra. CSDL chỉ
                # nhận 'tikz' và 'graphic' (xem CHECK q_images_type), nên quy về
                # 'graphic'. Đường mới dịch MathType thành nút math, không ra ảnh.
                "img_type": "tikz" if kind == "tikz" else "graphic",
                "width": _as_width(r.get("img_scale")),
                "raw_code": (r.get("raw_code") or "").strip(),
                "storage_path": r.get("storage_path") or "",
            })
            self._next += 1
        return self

    def id_of(self, storage_path):
        """Tra `figure_id` theo đường dẫn, thêm mới nếu chưa có."""
        for r in self.rows:
            if r["storage_path"] == storage_path:
                return r["id"]
        return self.add("graphic", storage_path=storage_path)

    def by_id(self):
        return {r["id"]: r for r in self.rows}


def _as_width(scale):
    """`img_scale` (đọc từ `parse_visuals`) -> cột `width` mới.

    `None` — TikZ (không có gì để đo) hoặc `\\includegraphics` không ghi
    `width=` — giữ nguyên `None`, KHÔNG đoán thành một tỉ lệ nào cả; nơi hiển
    thị sẽ tự lấy kích thước gốc của ảnh (xem `svg_native_width_in` bên dưới
    và write/html.py, write/tex.py, write/docx.py). Một giá trị số thật, kể cả
    >= 1.0 (ai đó cố ý `width=1\\linewidth` hoặc phóng to hơn), được giữ
    nguyên — không còn coi >= 1.0 là "chưa đặt" như trước, vì làm vậy sẽ xoá
    mất calib thật của người soạn đề.
    """
    if scale is None:
        return None
    try:
        v = float(scale)
    except (TypeError, ValueError):
        return None
    return v if v > 0 else None


def get_image_storage_root() -> str:
    """Thư mục lưu ảnh thật trên đĩa, độc lập với cwd. Production override
    bằng biến môi trường `IMG_STORAGE_PATH`; mặc định suy từ chính file này
    lên gốc repo (không suy từ working directory của tiến trình).
    Chuyển từ `exporters/common.py` sang đây (dùng chung cho MỌI bộ ghi
    doctree — web/tex/docx đều cần resolve `storage_path` thành file thật —
    `exporters/common.py` giữ lại 1 wrapper mỏng cùng tên cho code cũ)."""
    configured = os.getenv("IMG_STORAGE_PATH")
    if configured:
        return os.path.abspath(os.path.expanduser(configured))
    project_root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")
    )
    return os.path.join(project_root, "storage")


def resolve_image_file(url: str, images=None):
    """`storage_path` lưu trong CSDL là URL web (vd `/static/images/2026/08/
    xxx.svg`), KHÔNG phải đường dẫn file thật — bộ ghi nào cần TỰ MỞ FILE
    (docx: `add_picture()`/đọc SVG đo kích thước; html preview: nhúng base64)
    đều phải resolve qua đây trước, không được dùng thẳng `storage_path`.
    Trả `(đường_dẫn_tuyệt_đối, dict_ảnh_khớp_hoặc_None)`.
    """
    import urllib.parse

    storage_root = get_image_storage_root()
    clean_url = urllib.parse.unquote(str(url or '')).split('?', 1)[0]
    canonical_url = validate_public_image_path(clean_url)
    relative_url = canonical_url[len(PUBLIC_IMAGE_PREFIX):]
    relative_url = os.path.normpath(relative_url)
    if relative_url == '..' or relative_url.startswith('..' + os.sep):
        relative_url = os.path.basename(relative_url)

    target_name = os.path.basename(relative_url).lower()
    matched = None
    candidates = []
    for image in images or []:
        stored = str(image.get('storage_path') or '').split('?', 1)[0]
        stored_normalized = stored.replace('\\', '/')
        if target_name and os.path.basename(stored_normalized).lower() != target_name:
            continue
        matched = image
        if '/static/images/' in stored_normalized:
            candidates.append(os.path.join(storage_root, stored_normalized.split('/static/images/', 1)[1]))
        break

    candidates.extend([
        os.path.join(storage_root, relative_url),
    ])
    real_storage_root = os.path.realpath(storage_root)
    for candidate in candidates:
        absolute = os.path.realpath(candidate)
        try:
            inside_storage = os.path.commonpath([real_storage_root, absolute]) == real_storage_root
        except ValueError:
            inside_storage = False
        if inside_storage and os.path.isfile(absolute):
            return absolute.replace('\\', '/'), matched
    image = matched or next(iter(images or []), None)
    raise MissingImageFileError(str(url or ''), image)


def image_file_exists(storage_path: str) -> bool:
    """Return whether a DB image URL currently has a readable backing file."""
    try:
        validate_public_image_path(storage_path)
        resolve_image_file(storage_path)
        return True
    except (InvalidImageStoragePath, MissingImageFileError, OSError):
        return False


def svg_native_width_pt(filepath):
    """Đọc bề rộng gốc của SVG pdftocairo theo point; lỗi thì trả ``None``.

    Tách bản không-fallback này để luồng nhập chỉ ghi CSDL khi thật sự đo được,
    không biến giá trị dự phòng hiển thị thành dữ liệu tưởng là chính xác.
    """
    try:
        import re
        import xml.etree.ElementTree as ET
        root = ET.parse(filepath).getroot()
        w_str = root.attrib.get("width", "")
        if not w_str:
            vb = root.attrib.get("viewBox", "")
            if vb:
                parts = vb.replace(",", " ").split()
                if len(parts) >= 4:
                    w_str = parts[2]
        if w_str:
            m = re.search(r"([\d.]+)", w_str)
            if m:
                value = float(m.group(1))
                return value if value > 0 else None
    except Exception:
        pass
    return None


def svg_width_fraction(filepath, page_width_pt=A4_REFERENCE_WIDTH_PT):
    """Tỉ lệ bề rộng SVG gốc so với toàn bộ bề ngang tờ A4."""
    width_pt = svg_native_width_pt(filepath)
    if width_pt is None or page_width_pt <= 0:
        return None
    return round(width_pt / page_width_pt, 3)


def svg_native_width_in(filepath, default_inches=2.6):
    """Bề rộng THẬT của một file `.svg` do `pdftocairo -svg` dựng ra (đơn vị
    inch) — CHỈ dùng cho DOCX (python-docx/Pillow không tự mở được SVG nên
    buộc phải có một con số tường minh; HTML thì nhúng thẳng, không gọi hàm
    này — xem `write/html.py::_img()`).

    Số trong thuộc tính `width`/`viewBox` là POINT (kế thừa từ PDF, 1pt =
    1/72 inch) — KHÔNG phải CSS px (1/96 inch) như quy ước SVG/web thường
    gặp, vì `pdftocairo` giữ nguyên hệ tọa độ PDF gốc khi xuất SVG.
    """
    width_pt = svg_native_width_pt(filepath)
    return width_pt / 72.0 if width_pt is not None else default_inches
PUBLIC_IMAGE_PREFIX = "/static/images/"
_WINDOWS_ABSOLUTE_RE = re.compile(r"^[A-Za-z]:[/\\\\]")


class InvalidImageStoragePath(ValueError):
    """Raised when a database image path is not a canonical public URL."""


class MissingImageFileError(FileNotFoundError):
    """A canonical image URL could not be mapped to an existing file."""

    def __init__(self, storage_path: str, image=None):
        self.storage_path = storage_path
        self.image = image or {}
        super().__init__(f"Không tìm thấy tệp ảnh: {storage_path}")


def validate_public_image_path(storage_path: str) -> str:
    """Validate and return the only path form allowed in ``q_images``."""
    value = str(storage_path or "").strip().replace("\\", "/")
    if not value.startswith(PUBLIC_IMAGE_PREFIX):
        raise InvalidImageStoragePath(
            "q_images.storage_path phải có dạng /static/images/..."
        )
    relative = value[len(PUBLIC_IMAGE_PREFIX):]
    normalized = os.path.normpath(relative).replace("\\", "/")
    if (
        not relative
        or relative.startswith("/")
        or normalized in ("", ".", "..")
        or normalized.startswith("../")
        or _WINDOWS_ABSOLUTE_RE.match(relative)
    ):
        raise InvalidImageStoragePath("Đường dẫn ảnh không hợp lệ")
    return PUBLIC_IMAGE_PREFIX + normalized


def image_path_to_public_url(file_path: str) -> str:
    """Convert a file below the configured storage root to its public URL."""
    root = os.path.realpath(get_image_storage_root())
    target = os.path.realpath(file_path)
    try:
        inside = os.path.commonpath([root, target]) == root
    except ValueError:
        inside = False
    if not inside:
        raise InvalidImageStoragePath("Tệp ảnh nằm ngoài thư mục lưu trữ")
    return validate_public_image_path(
        PUBLIC_IMAGE_PREFIX + os.path.relpath(target, root).replace(os.sep, "/")
    )
