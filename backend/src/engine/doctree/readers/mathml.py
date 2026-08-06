"""MathML -> TeX. Mắt xích cuối để đọc được công thức MathType.

Đường đi trọn vẹn:

    oleObject*.bin  ──gem mathtype──>  MTEF-XML  ──XSLT──>  MathML  ──file này──>  TeX
    (nhị phân đóng)                                                     (vào nút math)

Hai chặng đầu do repo Ruby `mathtype_to_mathml` lo. Chặng cuối phải tự viết, vì
cây tài liệu lưu TeX chứ không lưu MathML (xem mục 5 docs/chuan-hoa-du-lieu.md).

Bề mặt cần dịch rất nhỏ: đo trên 448 công thức thật của đề HSG Hải Dương chỉ có
**16 loại thẻ**.
"""
import re
from xml.etree import ElementTree as ET

from .omml import ESCAPE, FUNCS, SYMBOL

ML = "{http://www.w3.org/1998/Math/MathML}"

# Toán tử hay gặp mà bảng ký hiệu chung chưa có.
OPER = {
    "{": r"\{", "}": r"\}", "|": r"\mid ",
    "’": "'", "‘": "'", "∗": "*", "·": r"\cdot ",
}


def tag(el):
    return el.tag[len(ML):] if el.tag.startswith(ML) else el.tag


def text_of(el):
    return "".join(el.itertext())


def sym(s):
    out = []
    for ch in s:
        if ch in SYMBOL:
            out.append(SYMBOL[ch] + " ")
        elif ch in OPER:
            out.append(OPER[ch])
        elif ch in ESCAPE:
            out.append(ESCAPE[ch])
        else:
            out.append(ch)
    return "".join(out)


def wrap(s):
    s = s.strip()
    return s if len(s) == 1 else "{" + s + "}"


def kids(el):
    """Dịch các con, gộp `mn`/`mi` liền nhau.

    MathType tách từng chữ số thành một `<mn>` riêng — "16" ra
    `<mn>1</mn><mn>6</mn>`. Không gộp thì `\\dfrac` nhận nhầm số hạng.
    """
    parts, run = [], ""
    for c in el:
        if tag(c) in ("mn", "mi") and len(text_of(c).strip()) <= 2:
            run += sym(text_of(c).strip())
            continue
        if run:
            parts.append(run)
            run = ""
        parts.append(conv(c))
    if run:
        parts.append(run)
    return "".join(parts)


# --------------------------------------------------------------- từng thẻ ---

def h_row(el):
    return kids(el)


def h_mi(el):
    return sym(text_of(el).strip())


def h_mn(el):
    return sym(text_of(el).strip())


def h_mo(el):
    return sym(text_of(el).strip())


def h_mtext(el):
    s = text_of(el)
    return f"\\text{{{s}}}" if s.strip() else s


def h_mfrac(el):
    a, b = list(el)[:2]
    return f"\\dfrac{{{conv(a)}}}{{{conv(b)}}}"


def h_msub(el):
    a, b = list(el)[:2]
    return f"{wrap(conv(a))}_{wrap(conv(b))}"


def h_msup(el):
    a, b = list(el)[:2]
    return f"{wrap(conv(a))}^{wrap(conv(b))}"


def h_msubsup(el):
    a, b, c = list(el)[:3]
    return f"{wrap(conv(a))}_{wrap(conv(b))}^{wrap(conv(c))}"


def h_msqrt(el):
    return f"\\sqrt{{{kids(el)}}}"


def h_mroot(el):
    a, b = list(el)[:2]
    return f"\\sqrt[{conv(b)}]{{{conv(a)}}}"


ACC_OVER = {"‾": r"\overline", "¯": r"\overline", "^": r"\hat",
            "→": r"\vec", "⃗": r"\vec", "~": r"\tilde", "˙": r"\dot"}


def h_mover(el):
    a, b = list(el)[:2]
    mark = text_of(b).strip()
    if mark in ACC_OVER:
        return f"{ACC_OVER[mark]}{{{conv(a)}}}"
    return f"\\overset{{{conv(b)}}}{{{conv(a)}}}"


def h_munder(el):
    a, b = list(el)[:2]
    if text_of(b).strip() in ("‾", "¯"):
        return f"\\underline{{{conv(a)}}}"
    return f"\\underset{{{conv(b)}}}{{{conv(a)}}}"


def h_munderover(el):
    a, b, c = list(el)[:3]
    return f"{conv(a)}_{wrap(conv(b))}^{wrap(conv(c))}"


def h_mtable(el):
    rows = [" & ".join(conv(td) for td in tr) for tr in el]
    env = "aligned" if "left" in (el.get("columnalign") or "") else "matrix"
    return f"\\begin{{{env}}}" + " \\\\ ".join(rows) + f"\\end{{{env}}}"


HANDLERS = {
    "math": h_row, "mrow": h_row, "mtr": h_row, "mtd": h_row,
    "mstyle": h_row, "mpadded": h_row, "menclose": h_row,
    "mi": h_mi, "mn": h_mn, "mo": h_mo, "mtext": h_mtext,
    "mfrac": h_mfrac, "msub": h_msub, "msup": h_msup, "msubsup": h_msubsup,
    "msqrt": h_msqrt, "mroot": h_mroot,
    "mover": h_mover, "munder": h_munder, "munderover": h_munderover,
    "mtable": h_mtable,
    "mspace": lambda el: r"\,", "mphantom": lambda el: "",
}


def conv(el):
    fn = HANDLERS.get(tag(el))
    return fn(el) if fn else kids(el)


# ----------------------------------------------------------- sửa sau cùng ---

RE_FUNC = re.compile(r"(?<![a-zA-Z\\])("
                     + "|".join(sorted(FUNCS, key=len, reverse=True))
                     + r")(?![a-zA-Z])")

RE_CASES = re.compile(r"\\\{\s*(\\begin\{aligned\}.*?\\end\{aligned\})", re.S)


def fix_funcs(s):
    """MathType tách "sin" thành ba thẻ `mi`; gộp xong mới nhận ra tên hàm.

    Chạy **một lần ở cuối**, không chạy trong `kids()` — `kids()` đệ quy, quét ở
    đó là quét lại cùng một chuỗi ở mọi tầng.
    """
    return RE_FUNC.sub(lambda m: "\\" + m.group(1) + " ", s)


def fix_cases(s):
    r"""`\{` mở đầu một hệ phương trình phải thành `\left\{ … \right.`.

    Không sửa thì ngoặc nhọn không cao bằng hệ, và KaTeX báo thiếu `\right`.
    """
    return RE_CASES.sub(lambda m: r"\left\{" + m.group(1) + r"\right.", s)


def pair_fences(s):
    """`( … )` do MathType sinh ra là hai `mo` rời — nối thành cặp co giãn."""
    if s.startswith("(") and s.endswith(")") and s.count("(") == s.count(")") == 1:
        return r"\left(" + s[1:-1] + r"\right)"
    return s


def mathml_to_tex(xml):
    """Chuỗi MathML -> chuỗi TeX đã gọn khoảng trắng."""
    if isinstance(xml, str):
        xml = re.sub(r"<\?xml[^>]*\?>", "", xml).strip()
        xml = ET.fromstring(xml)
    s = conv(xml)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\s+([,;.])", r"\1", s)
    return fix_cases(pair_fences(fix_funcs(s.strip())))
