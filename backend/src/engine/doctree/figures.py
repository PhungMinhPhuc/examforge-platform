"""Kho hình dùng chung cho các bộ đọc.

Đóng vai bảng `q_images`: mọi thứ **về bản thân hình** nằm ở đây, còn cây chỉ
giữ `figure_id` — tức **hình nằm ở chỗ nào trong nội dung**, thứ duy nhất bảng
không diễn tả được. Xem mục 7 của docs/chuan-hoa-du-lieu.md.
"""
import os

DEFAULT_WIDTH = 0.45      # tỉ lệ so với bề rộng vùng chữ, xem cột q_images.width


class FigureStore:
    """Gom hình của một lần đọc. `rows` ánh xạ 1-1 sang các dòng `q_images`."""

    def __init__(self, first_id=1):
        self.rows = []
        self._next = first_id

    def add(self, img_type, raw_code="", storage_path="", width=DEFAULT_WIDTH,
            data=None, media_dir=None, name=""):
        """Thêm một hình, trả về `figure_id`.

        `data` + `media_dir`: hình nhúng trong `.docx` cần ghi ra file trước.
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
            "width": round(float(width), 3),
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
    """`img_scale` cũ -> cột `width` mới (tỉ lệ 0–1 so với bề rộng vùng chữ).

    Giá trị cũ có hai nguồn khác hẳn nhau:

    * Lấy từ `width=0.45\\linewidth` trong `.tex` — **đã đúng đơn vị mới**, giữ
      nguyên.
    * `1.0` do `parse_visuals` điền sẵn cho TikZ và cho ảnh không ghi `width`.
      Đây là **chỗ trống chưa đặt**, không phải phép đo. Hiểu nó là "ảnh rộng
      bằng cả vùng chữ" thì mọi hình TikZ sẽ phình hết cỡ, nên quy về mặc định.
    """
    try:
        v = float(scale)
    except (TypeError, ValueError):
        return DEFAULT_WIDTH
    if v <= 0 or v >= 1.0:
        return DEFAULT_WIDTH
    return max(v, 0.05)
