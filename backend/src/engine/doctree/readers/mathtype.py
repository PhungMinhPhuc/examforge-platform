"""Công thức MathType nhúng trong `.docx` -> TeX.

    oleObject*.bin  ──gem `mathtype`──> MTEF-XML ──XSLT──> MathML ──mathml.py──> TeX
    (nhị phân đóng)              chặng Ruby                          chặng Python

Chặng đầu phải chạy bằng Ruby: phần đọc định dạng MTEF nằm trong gem `mathtype`,
chưa có bản Python nào. Đây là **phụ thuộc tạm** — khi nào rảnh thì chuyển phần
đọc nhị phân sang Python, còn bộ XSLT vốn là XSLT 1.0 nên `lxml` chạy được.

Cần có sẵn trên máy chủ:

    gem install mathtype nokogiri
    git clone https://github.com/jure/mathtype_to_mathml

rồi trỏ biến môi trường `MATHTYPE_GEM_PATH` vào thư mục `lib` của repo đó.
Thiếu bất cứ thứ gì thì `convert_docx_equations()` trả về `{}` và bộ đọc `.docx`
lui về giữ công thức dưới dạng ảnh, đúng như đường cũ — mất chữ nhưng không vỡ.
"""
import json
import os
import shutil
import subprocess
import tempfile
import zipfile

from .mathml import mathml_to_tex

HERE = os.path.dirname(os.path.abspath(__file__))
RUBY_SCRIPT = os.path.join(HERE, "mathtype_to_mathml.rb")

_warned = set()


def _warn_once(msg):
    if msg not in _warned:
        _warned.add(msg)
        print(f"[mathtype] {msg}")


def available():
    """Đủ điều kiện chạy chặng Ruby chưa?"""
    if not shutil.which("ruby"):
        _warn_once("không tìm thấy ruby trong PATH — công thức MathType sẽ giữ dạng ảnh")
        return False
    gem = os.getenv("MATHTYPE_GEM_PATH", "")
    if not gem or not os.path.isdir(gem):
        _warn_once("chưa đặt MATHTYPE_GEM_PATH — công thức MathType sẽ giữ dạng ảnh")
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
                env={**os.environ, "MATHTYPE_GEM_PATH": os.getenv("MATHTYPE_GEM_PATH", "")},
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
