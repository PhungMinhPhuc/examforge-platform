"""Công thức MathType nhúng trong `.docx` -> TeX.

    oleObject*.bin  ──gem `mathtype`──> MTEF-XML ──XSLT──> MathML ──mathml.py──> TeX
    (nhị phân đóng)              chặng Ruby                          chặng Python

Chặng đầu phải chạy bằng Ruby: phần đọc định dạng MTEF nằm trong gem `mathtype`,
chưa có bản Python nào. Đây là **phụ thuộc tạm** — khi nào rảnh thì chuyển phần
đọc nhị phân sang Python, còn bộ XSLT vốn là XSLT 1.0 nên `lxml` chạy được.

Mã Ruby và bộ XSLT đã **chép hẳn vào `vendor/`** (giấy phép MIT, xem
`vendor/LICENSE.txt`), nên không phải clone repo ngoài. Chỉ còn hai gem là phụ
thuộc hệ thống, vì chúng có phần biên dịch sẵn:

    gem install mathtype nokogiri

Thiếu Ruby hoặc thiếu gem thì `convert_docx_equations()` trả về `{}`, và bộ đọc
`.docx` lui về giữ công thức dưới dạng ảnh đúng như đường cũ — mất chữ nhưng
không vỡ. Đặt `MATHTYPE_GEM_PATH` nếu muốn dùng một bản `mathtype_to_mathml`
khác thay cho bản trong `vendor/`.
"""
import json
import os
import shutil
import subprocess
import tempfile
import zipfile

from .mathml import mathml_to_tex

HERE = os.path.dirname(os.path.abspath(__file__))
RUBY_SCRIPT = os.path.join(HERE, "mathtype.rb")
VENDOR = os.path.join(HERE, "vendor")

_warned = set()


def _warn_once(msg):
    if msg not in _warned:
        _warned.add(msg)
        print(f"[mathtype] {msg}")


def gem_path():
    """Thư mục chứa `mathtype_to_mathml.rb` — bản vendor, trừ khi có biến môi trường."""
    return os.getenv("MATHTYPE_GEM_PATH") or VENDOR


def available():
    """Đủ điều kiện chạy chặng Ruby chưa?"""
    if not shutil.which("ruby"):
        _warn_once("không tìm thấy ruby trong PATH — công thức MathType sẽ giữ dạng ảnh")
        return False
    if not os.path.isfile(os.path.join(gem_path(), "mathtype_to_mathml.rb")):
        _warn_once(f"không thấy mathtype_to_mathml.rb trong {gem_path()}")
        return False
    return True


def convert_docx_equations(docx_path, timeout=600):
    """`.docx` -> {tên oleObject: chuỗi TeX}. Rỗng nếu không chạy được.

    Chạy MỘT lần cho cả file thay vì mỗi công thức một lần: khởi động Ruby tốn
    khoảng một giây, mà một đề có thể có hàng trăm công thức.
    """
    if not available():
        return {}

    with zipfile.ZipFile(docx_path) as z:
        oles = [n for n in z.namelist() if "oleObject" in n and n.endswith(".bin")]
        if not oles:
            return {}
        tmp = tempfile.mkdtemp(prefix="mathtype_")
        try:
            for n in oles:
                with open(os.path.join(tmp, os.path.basename(n)), "wb") as f:
                    f.write(z.read(n))

            out_json = os.path.join(tmp, "mathml.json")
            # Dấu `\` trên Windows là ký tự THOÁT trong glob của Ruby, nên
            # `Dir["C:\tmp\*.bin"]` không khớp gì. Luôn đưa sang dấu `/`.
            r = subprocess.run(
                ["ruby", RUBY_SCRIPT, tmp.replace("\\", "/"),
                 out_json.replace("\\", "/")],
                env={**os.environ, "MATHTYPE_GEM_PATH": gem_path().replace("\\", "/")},
                capture_output=True, text=True, timeout=timeout)
            if r.returncode != 0 or not os.path.exists(out_json):
                _warn_once(f"chặng Ruby lỗi: {(r.stderr or '')[-200:]}")
                return {}

            with open(out_json, encoding="utf-8") as f:
                data = json.load(f)

            tex, bad = {}, 0
            for key, mathml in data.get("ok", {}).items():
                try:
                    tex[key] = mathml_to_tex(mathml)
                except Exception:
                    bad += 1
            if bad:
                _warn_once(f"{bad} công thức dịch MathML sang TeX không được")
            return tex
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
