"""Công thức Word (OMML) -> chuỗi TeX.

Đây là mảnh còn thiếu để đọc `.docx` mà không đi vòng qua pandoc. Word lưu công
thức ở hai dạng:

  * **OMML** (`<m:oMath>`) — dạng hiện hành, có cấu trúc, DỊCH ĐƯỢC sang TeX.
    File mẫu `01. ĐỀ 001...docx` có 525 công thức loại này.
  * **MathType OLE** (`oleObject*.bin`) — dạng cũ, là đối tượng nhị phân đóng
    kín. Không dịch được; đường hiện tại chỉ dựng nó thành ảnh WMF
    (`parse_docx_mathtype.py`). Bộ đọc này giữ nguyên cách đó, đánh dấu là hình.

Cách làm: đi đệ quy theo cây OMML. Mỗi phần tử `m:*` là một cấu trúc toán đã rõ
nghĩa, nên dịch thẳng, không phải đoán như khi bóc chuỗi LaTeX.
"""
import re

M = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"

# Ký hiệu Word gõ thẳng bằng Unicode -> lệnh TeX tương ứng.
SYMBOL = {
    "×": r"\times", "÷": r"\div", "±": r"\pm", "∓": r"\mp", "·": r"\cdot",
    "≤": r"\le", "≥": r"\ge", "≠": r"\ne", "≈": r"\approx", "≡": r"\equiv",
    "∞": r"\infty", "→": r"\to", "←": r"\leftarrow", "↔": r"\leftrightarrow",
    "⇒": r"\Rightarrow", "⇐": r"\Leftarrow", "⇔": r"\Leftrightarrow",
    "∈": r"\in", "∉": r"\notin", "⊂": r"\subset", "⊆": r"\subseteq",
    "∪": r"\cup", "∩": r"\cap", "∅": r"\emptyset", "∀": r"\forall",
    "∃": r"\exists", "∂": r"\partial", "∇": r"\nabla", "∠": r"\angle",
    "⊥": r"\perp", "∥": r"\parallel", "°": r"^\circ", "′": "'", "″": "''",
    "α": r"\alpha", "β": r"\beta", "γ": r"\gamma", "δ": r"\delta",
    "ε": r"\varepsilon", "ζ": r"\zeta", "η": r"\eta", "θ": r"\theta",
    "ι": r"\iota", "κ": r"\kappa", "λ": r"\lambda", "μ": r"\mu", "ν": r"\nu",
    "ξ": r"\xi", "π": r"\pi", "ρ": r"\rho", "σ": r"\sigma", "τ": r"\tau",
    "υ": r"\upsilon", "φ": r"\varphi", "χ": r"\chi", "ψ": r"\psi",
    "ω": r"\omega", "Γ": r"\Gamma", "Δ": r"\Delta", "Θ": r"\Theta",
    "Λ": r"\Lambda", "Ξ": r"\Xi", "Π": r"\Pi", "Σ": r"\Sigma", "Φ": r"\Phi",
    "Ψ": r"\Psi", "Ω": r"\Omega",
    "√": r"\sqrt", "∑": r"\sum", "∏": r"\prod", "∫": r"\int", "∬": r"\iint",
    "∭": r"\iiint", "∮": r"\oint", "…": r"\dots", "⋯": r"\cdots",
    "⃗": r"\vec",
    # Word hay chèn biến thể Unicode khác với ký tự quen thuộc — gom về một mối
    # `∘` gần như luôn nằm sẵn trong một `m:sup` của Word, nên chỉ trả `\circ`;
    # trả `^\circ` sẽ thành `^{^\circ}` — hai tầng mũ, KaTeX dựng sai.
    "∘": r"\circ", "℃": r"{}^\circ\mathrm{C}", "℉": r"{}^\circ\mathrm{F}",
    "⋅": r"\cdot", "∙": r"\cdot", "−": "-", "–": "-", "‐": "-",
    "∼": r"\sim", "≅": r"\cong", "⩽": r"\le", "⩾": r"\ge",
    "∆": r"\Delta", "ϕ": r"\phi", "ϵ": r"\epsilon", "ℓ": r"\ell",
    "ħ": r"\hbar", "％": r"\%", "​": "",
}

# Ký tự lớn của \nary -> lệnh, đã có sẵn trong SYMBOL nhưng để riêng cho rõ.
NARY = {"∑": r"\sum", "∏": r"\prod", "∫": r"\int", "∬": r"\iint",
        "∭": r"\iiint", "∮": r"\oint", "⋃": r"\bigcup", "⋂": r"\bigcap"}

ACCENT = {"̂": r"\hat", "⃗": r"\vec", "̄": r"\bar", "̃": r"\tilde",
          "̇": r"\dot", "̈": r"\ddot", "⏞": r"\overbrace"}

FUNCS = {"sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "lg", "exp",
         "lim", "max", "min", "arcsin", "arccos", "arctan", "sinh", "cosh",
         "tanh", "det", "gcd", "deg", "arg"}

ESCAPE = {"%": r"\%", "&": r"\&", "#": r"\#", "_": r"\_", "{": r"\{", "}": r"\}"}


def escape_text(s):
    out = []
    for ch in s:
        if ch in SYMBOL:
            out.append(SYMBOL[ch] + " ")
        elif ch in ESCAPE:
            out.append(ESCAPE[ch])
        else:
            out.append(ch)
    return "".join(out)


def _kids(el, tag):
    return el.findall(M + tag)


def _one(el, tag):
    return el.find(M + tag)


def _chr(el, prop, attr="val", default=""):
    """Đọc thuộc tính ký tự trong khối thuộc tính, ví dụ m:naryPr/m:chr/@m:val."""
    pr = _one(el, prop)
    if pr is None:
        return default
    c = _one(pr, "chr")
    if c is None:
        return default
    return c.get(M + attr, default)


def _wrap(s):
    """Bọc {} nếu không phải một ký hiệu đơn — tránh `x^12` khi ý là `x^{12}`."""
    s = s.strip()
    if len(s) == 1 or (s.startswith("{") and s.endswith("}")):
        return s if len(s) == 1 else s
    return "{" + s + "}"


def convert(el):
    """Một phần tử OMML -> chuỗi TeX."""
    tag = el.tag[len(M):] if el.tag.startswith(M) else el.tag
    fn = HANDLERS.get(tag)
    if fn:
        return fn(el)
    if tag in ("oMath", "oMathPara", "e", "num", "den", "sup", "sub", "deg",
               "lim", "fName", "argPr"):
        return children(el)
    if tag.endswith("Pr"):        # khối thuộc tính, không sinh nội dung
        return ""
    return children(el)


def children(el):
    return "".join(convert(c) for c in el)


# --------------------------------------------------------------- từng loại ---

def h_r(el):
    """m:r — một đoạn chữ trong công thức."""
    parts = []
    for t in el.iter():
        if t.tag == M + "t":
            parts.append(escape_text(t.text or ""))
    s = "".join(parts)
    # Word ghi tên hàm như chữ thường: sin, cos... -> đưa về lệnh TeX
    for f in sorted(FUNCS, key=len, reverse=True):
        s = re.sub(rf"(?<![a-zA-Z\\]){f}(?![a-zA-Z])", "\\\\" + f + " ", s)
    return s


def h_f(el):
    """m:f — phân số. Kiểu 'lin' là a/b viết thẳng."""
    num = convert(_one(el, "num")) if _one(el, "num") is not None else ""
    den = convert(_one(el, "den")) if _one(el, "den") is not None else ""
    pr = _one(el, "fPr")
    typ = ""
    if pr is not None:
        t = _one(pr, "type")
        typ = t.get(M + "val", "") if t is not None else ""
    if typ == "lin":
        return f"{_wrap(num)}/{_wrap(den)}"
    if typ == "noBar":
        return f"\\binom{{{num}}}{{{den}}}"
    return f"\\dfrac{{{num}}}{{{den}}}"


def h_sSup(el):
    return f"{_wrap(convert(_one(el, 'e')))}^{_wrap(convert(_one(el, 'sup')))}"


def h_sSub(el):
    return f"{_wrap(convert(_one(el, 'e')))}_{_wrap(convert(_one(el, 'sub')))}"


def h_sSubSup(el):
    return (f"{_wrap(convert(_one(el, 'e')))}"
            f"_{_wrap(convert(_one(el, 'sub')))}"
            f"^{_wrap(convert(_one(el, 'sup')))}")


def h_sPre(el):
    """Chỉ số đặt TRƯỚC — dùng cho ký hiệu hạt nhân kiểu ²³⁵₉₂U."""
    return (f"{{}}_{_wrap(convert(_one(el, 'sub')))}"
            f"^{_wrap(convert(_one(el, 'sup')))}{convert(_one(el, 'e'))}")


def h_rad(el):
    body = convert(_one(el, "e"))
    pr = _one(el, "radPr")
    hide = False
    if pr is not None:
        d = _one(pr, "degHide")
        hide = d is not None and d.get(M + "val") in ("1", "true", "on", None)
    deg_el = _one(el, "deg")
    deg = convert(deg_el).strip() if deg_el is not None else ""
    if deg and not hide:
        return f"\\sqrt[{deg}]{{{body}}}"
    return f"\\sqrt{{{body}}}"


def h_nary(el):
    op = NARY.get(_chr(el, "naryPr"), r"\int")
    sub = convert(_one(el, "sub")).strip() if _one(el, "sub") is not None else ""
    sup = convert(_one(el, "sup")).strip() if _one(el, "sup") is not None else ""
    s = op
    if sub:
        s += f"_{_wrap(sub)}"
    if sup:
        s += f"^{_wrap(sup)}"
    return s + " " + convert(_one(el, "e"))


PAIRS = {"(": ")", "[": "]", "{": "}", "|": "|", "‖": r"\|", "⟨": "⟩"}
BIG = {"{": r"\{", "}": r"\}", "‖": r"\|", "⟨": r"\langle", "⟩": r"\rangle"}


def h_d(el):
    """m:d — dấu ngoặc bao quanh."""
    pr = _one(el, "dPr")
    beg, end, sep = "(", ")", "|"
    if pr is not None:
        b = _one(pr, "begChr")
        e = _one(pr, "endChr")
        if b is not None:
            beg = b.get(M + "val", "")
        if e is not None:
            end = e.get(M + "val", "")
        elif b is not None:
            end = PAIRS.get(beg, ")")
    inner = sep.join(convert(x) for x in _kids(el, "e"))
    if not inner.strip():
        return ""                       # ngoặc rỗng: Word chèn làm chỗ giữ, bỏ
    lb = BIG.get(beg, beg) if beg else "."
    rb = BIG.get(end, end) if end else "."
    if lb == "." and rb == ".":
        return inner                    # không có ngoặc thật thì khỏi \left.\right.
    return f"\\left{lb}{inner}\\right{rb}"


def h_func(el):
    name = convert(_one(el, "fName")).strip()
    return f"{name}{{{convert(_one(el, 'e'))}}}" if name.startswith("\\") \
        else f"\\operatorname{{{name}}}({convert(_one(el, 'e'))})"


def h_acc(el):
    ch = _chr(el, "accPr", default="̂")
    return f"{ACCENT.get(ch, r'\hat')}{{{convert(_one(el, 'e'))}}}"


def h_bar(el):
    pr = _one(el, "barPr")
    pos = ""
    if pr is not None:
        p = _one(pr, "pos")
        pos = p.get(M + "val", "") if p is not None else ""
    cmd = r"\underline" if pos == "bot" else r"\overline"
    return f"{cmd}{{{convert(_one(el, 'e'))}}}"


def h_limLow(el):
    return f"\\underset{{{convert(_one(el, 'lim'))}}}{{{convert(_one(el, 'e'))}}}"


def h_limUpp(el):
    return f"\\overset{{{convert(_one(el, 'lim'))}}}{{{convert(_one(el, 'e'))}}}"


def h_m(el):
    """m:m — ma trận."""
    rows = []
    for mr in _kids(el, "mr"):
        rows.append(" & ".join(convert(e) for e in _kids(mr, "e")))
    return "\\begin{matrix}" + " \\\\ ".join(rows) + "\\end{matrix}"


def h_eqArr(el):
    rows = [convert(e) for e in _kids(el, "e")]
    return "\\begin{aligned}" + " \\\\ ".join(rows) + "\\end{aligned}"


def h_box(el):
    return convert(_one(el, "e"))


HANDLERS = {
    "r": h_r, "f": h_f, "sSup": h_sSup, "sSub": h_sSub, "sSubSup": h_sSubSup,
    "sPre": h_sPre, "rad": h_rad, "nary": h_nary, "d": h_d, "func": h_func,
    "acc": h_acc, "bar": h_bar, "limLow": h_limLow, "limUpp": h_limUpp,
    "m": h_m, "eqArr": h_eqArr, "box": h_box, "borderBox": h_box,
    "groupChr": h_box, "phant": lambda el: "",
}


def omml_to_tex(el):
    """Điểm vào: một `<m:oMath>` -> chuỗi TeX đã gọn khoảng trắng."""
    s = convert(el)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\s+([,;.])", r"\1", s)
    return s.strip()
