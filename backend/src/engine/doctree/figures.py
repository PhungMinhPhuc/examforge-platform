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

    def by_id(self):
        return {r["id"]: r for r in self.rows}
