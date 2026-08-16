"""Bộ đọc `.tex` -> cây tài liệu.

File `.tex` của dự án viết theo mẫu cố định trong `Sample/Project_Data_Structure.txt`,
nên **tập lệnh cần dịch là hữu hạn và biết trước** — đo trên 2180 khối `ex` chỉ
có 23 lệnh. Vì vậy bộ đọc này **không có nút "cất nguyên văn"**: gặp lệnh lạ thì
dừng và báo tên lệnh, để người bổ sung vào `KNOWN` rồi chạy lại, chứ không âm
thầm nuốt mất nội dung.
"""
import re

from ..figures import FigureStore

RE_EX = re.compile(r"\\begin\{ex\}(.*?)\\end\{ex\}", re.S)
RE_SOCHC = re.compile(r"\\sochc\s*\{(\d+)\}\s*\{")
RE_CHC = re.compile(r"\\begin\{chc\}(.*?)\\end\{chc\}", re.S)


class UnknownCommand(Exception):
    """Bộ đọc gặp lệnh chưa biết dịch."""


class BadSource(Exception):
    """File nguồn sai mẫu — để người sửa file, không đoán hộ."""


# Toàn bộ từ vựng bộ đọc hiểu. Xem mục 6 của docs/chuan-hoa-du-lieu.md.
KNOWN = {
    # cấu trúc đề — bóc ra thành cột quan hệ, không vào cây
    "begin", "end", "ex", "immini", "imminiL", "choice", "choiceTF", "shortans",
    "loigiai", "itemch", "itemchoice", "sochc", "chc", "True",
    # nội dung — thành nút trong cây
    "textbf", "textit", "underline", "hline", "item", "itemize", "enumerate",
    "tabular", "multicolumn", "includegraphics", "tikzpicture", "linewidth",
    # trình bày thuần — cố ý bỏ, xem "CSDL không chứa mẹo căn dòng"
    "vspace", "hspace", "centering", "raggedleft", "raggedright", "noindent", "center", "pandocbounded",
    "textcolor", "smallskip", "medskip", "bigskip", "par",
    "table", "multicols", "columnbreak",
    "minipage",
}


def unknown_commands(text):
    """Lệnh ngoài từ vựng, sau khi đã gỡ vùng toán và tikz."""
    t = re.sub(r"\\begin\{tikzpicture\}.*?\\end\{tikzpicture\}", " ", text, flags=re.S)
    t = re.sub(r"\$\$.*?\$\$|\$.*?\$", " ", t, flags=re.S)
    t = re.sub(r"\\\[.*?\\\]|\\\(.*?\\\)", " ", t, flags=re.S)
    t = re.sub(r"(?<!\\)%.*", "", t)
    t = re.sub(r"\\\\", " ", t)            # ngắt dòng, không phải lệnh
    t = re.sub(r"\\[_&%#${}]", " ", t)     # ký tự đã thoát
    found = {}
    for pat in (r"\\([a-zA-Z]+)", r"\\begin\{([a-zA-Z*]+)\}"):
        for m in re.finditer(pat, t):
            if m.group(1) not in KNOWN:
                found[m.group(1)] = found.get(m.group(1), 0) + 1
    return found


def check_source(block):
    """Chỗ file `.tex` vi phạm mẫu — bắt sớm còn hơn đoán bừa."""
    body = re.sub(r"\\loigiai\s*\{.*", "", block, flags=re.S)
    for cmd in ("shortans", "choiceTF", "choice"):
        n = len(re.findall(rf"\\{cmd}\b", body))
        if n > 1:
            raise BadSource(f"có {n} lệnh \\{cmd} trong một câu, mẫu chỉ cho phép 1")


# ---------------------------------------------------------------- tiện ích ---

def bracket(text, start):
    """Đọc trọn cặp {...} bắt đầu tại dấu { ở `start`. Trả (ruột, vị trí })."""
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{" and (i == 0 or text[i - 1] != "\\"):
            depth += 1
        elif text[i] == "}" and text[i - 1] != "\\":
            depth -= 1
            if depth == 0:
                return text[start + 1:i], i
    return text[start + 1:], len(text)


def split_args(text, pos, n):
    """Đọc n cặp {...} liên tiếp kể từ `pos`."""
    args, i = [], pos
    for _ in range(n):
        b = text.find("{", i)
        if b < 0:
            break
        inner, end = bracket(text, b)
        args.append(inner)
        i = end + 1
    return args, i


# ------------------------------------------------------------------- hình ---

def extract_figures(text, figs):
    """Thay tikzpicture / includegraphics bằng ô giữ chỗ, đẩy hình sang kho."""
    holes = {}

    def keep(fid):
        key = f"\x00FIG{fid}\x00"
        holes[key] = fid
        return key

    text = re.sub(r"\\begin\{tikzpicture\}.*?\\end\{tikzpicture\}",
                  lambda m: keep(figs.add("tikz", raw_code=m.group(0))),
                  text, flags=re.S)

    def on_graphic(m):
        width = None
        ms = re.search(r"width\s*=\s*([\d.]+)\\linewidth", m.group(1) or "")
        if ms:
            width = float(ms.group(1))
        return keep(figs.add("graphic", storage_path=m.group(2), width=width))

    text = re.sub(r"\\includegraphics(\[[^\]]*\])?\{([^}]*)\}", on_graphic, text)

    # Thẻ `![](url)` do `utils/parse_visuals.py` đặt vào sau khi đã dựng TikZ ra
    # `.svg` và cất ảnh vào `storage/`. Tra ngược `url` ra hình đã có trong kho.
    text = re.sub(r"!\[[^\]]*\]\(([^)]+)\)",
                  lambda m: keep(figs.id_of(m.group(1))), text)
    return text, holes


# ------------------------------------------------------------ vùng bảo toàn ---

MATH_PATTERNS = [
    (r"\$\$(.*?)\$\$", True),
    (r"\\\[(.*?)\\\]", True),
    (r"\$(.*?)\$", False),
    (r"\\\((.*?)\\\)", False),
]


def protect_math(text):
    """Rút công thức ra khỏi dòng chữ trước khi đụng tới ngắt dòng."""
    store, n = {}, [0]

    def grab(display):
        def f(m):
            n[0] += 1
            key = f"\x00M{n[0]}\x00"
            store[key] = {"tex": m.group(1).strip(), "display": display}
            return key
        return f

    for pat, display in MATH_PATTERNS:
        text = re.sub(pat, grab(display), text, flags=re.S)
    return text, store


# --------------------------------------------------------------- nút nội dung ---

MARK_OF = {"textbf": "bold", "textit": "italic", "underline": "underline"}


def inline_nodes(text, math, holes):
    """Một đoạn -> danh sách nút chữ."""
    out = []

    def unescape(s):
        s = re.sub(r"\\([_&%#${}])", r"\1", s)
        return s.replace("``", "\u201c").replace("''", "\u201d")

    def push_text(s, marks):
        s = unescape(s)
        if s:
            node = {"type": "text", "text": s}
            if marks:
                node["marks"] = list(marks)
            out.append(node)

    def walk(s, marks):
        m = re.search(r"\\(textbf|textit|underline)\{", s)
        if m:
            inner, end = bracket(s, m.end() - 1)
            walk(s[:m.start()], marks)
            walk(inner, marks + [MARK_OF[m.group(1)]])
            walk(s[end + 1:], marks)
            return
        for piece in re.split(r"(\x00M\d+\x00|\x00FIG\d+\x00)", s):
            if not piece:
                continue
            if piece in math:
                out.append({"type": "math", "tex": math[piece]["tex"]})
            elif piece in holes:
                out.append({"type": "image_inline", "figure_id": holes[piece]})
            else:
                # `\n` đơn là pandoc bẻ dòng cho vừa cột, không phải ngắt dòng
                # — quy về dấu cách. Xem quy-uoc-noi-dung.md mục 4.
                push_text(re.sub(r"\s+", " ", piece), marks)

    for i, line in enumerate(re.split(r"\\\\", text)):
        if i:
            out.append({"type": "hard_break"})
        walk(line.strip(), [])
    return [n for n in out if n.get("type") != "text" or n["text"].strip()]


def parse_tabular(body, math, holes):
    """`tabular` -> nút table, giữ được `\\multicolumn`."""
    m = re.match(r"\s*\{([^}]*)\}", body)
    align = [c for c in m.group(1) if c in "lcr"] if m else []
    body = body[m.end():] if m else body

    rows = []
    for raw in re.split(r"\\\\", body):
        raw = raw.replace("\\hline", "").strip()
        if not raw:
            continue
        cells = []
        for cell in raw.split("&"):
            span = 1
            mc = re.search(r"\\multicolumn\{(\d+)\}\{[^}]*\}\{", cell)
            if mc:
                inner, _ = bracket(cell, mc.end() - 1)
                span, cell = int(mc.group(1)), inner
            c = {"content": inline_nodes(cell.strip(), math, holes)}
            if span > 1:
                c["colspan"] = span
            cells.append(c)
        rows.append(cells)

    node = {"type": "table", "rows": rows}
    if align:
        node["align"] = align
    return node


ENV_TOKEN_RE = re.compile(
    r"\\(?P<action>begin|end)\{(?P<kind>tabular|itemize|enumerate|minipage)\}"
)


def _top_level_items(body):
    """Tách `\\item` ở đúng cấp của list hiện tại.

    Regex `re.split(r"\\item")` cũ tách luôn item của list con, làm sót
    nguyên văn `\\begin{itemize}`/`\\end{itemize}` vào node text. Scanner này
    theo dõi stack môi trường nên chỉ nhận `\\item` khi stack đang rỗng.
    """
    token_re = re.compile(
        r"\\(?:(?P<action>begin|end)\{(?P<kind>tabular|itemize|enumerate)\}|(?P<item>item)\b)"
    )
    stack = []
    starts = []
    for m in token_re.finditer(body):
        if m.group("item"):
            if not stack:
                starts.append((m.start(), m.end()))
            continue
        if m.group("action") == "begin":
            stack.append(m.group("kind"))
        elif stack and stack[-1] == m.group("kind"):
            stack.pop()
    items = []
    for i, (_start, end) in enumerate(starts):
        stop = starts[i + 1][0] if i + 1 < len(starts) else len(body)
        item = body[end:stop].strip()
        if item:
            items.append(item)
    return items


def parse_list(body, ordered, math, holes):
    items = _top_level_items(body)
    return {
        "type": "list",
        "ordered": ordered,
        "items": [_parse_blocks(it, math, holes) for it in items],
    }


def _split_top_level_envs(text):
    """Trả các đoạn `(kind, body)`; hỗ trợ begin/end lồng nhau cân bằng."""
    out = []
    pos = 0
    tokens = list(ENV_TOKEN_RE.finditer(text))
    i = 0
    while i < len(tokens):
        opening = tokens[i]
        if opening.group("action") != "begin":
            i += 1
            continue
        out.append(("text", text[pos:opening.start()]))
        stack = [opening.group("kind")]
        j = i + 1
        while j < len(tokens):
            tok = tokens[j]
            kind = tok.group("kind")
            if tok.group("action") == "begin":
                stack.append(kind)
            elif stack and stack[-1] == kind:
                stack.pop()
                if not stack:
                    out.append((opening.group("kind"), text[opening.end():tok.start()]))
                    pos = tok.end()
                    i = j + 1
                    break
            j += 1
        else:
            # Môi trường không đóng: giữ nguyên để validation phát hiện lệnh
            # cấu trúc còn sót, không âm thầm nuốt phần cuối trường.
            out.append(("text", text[opening.start():]))
            pos = len(text)
            i = len(tokens)
    out.append(("text", text[pos:]))
    return out


def _parse_text_blocks(body, math, holes):
    content = []
    body = re.sub(r"\\(?:centering|raggedleft|raggedright)\b", "", body)
    # Một hình chiếm trọn dòng nguồn là một khối riêng, kể cả khi tác giả
    # không chèn dòng trống trước/sau nó. Nếu không tách tại đây, quy tắc
    # chuẩn hóa ``\n`` đơn trong ``inline_nodes`` sẽ ghép ``chữ / hình /
    # chữ`` thành một paragraph và biến hình thành ``image_inline``.
    # Hình thực sự nằm giữa chữ trên cùng một dòng vẫn giữ nguyên dạng inline.
    body = re.sub(
        r"(?m)^[ \t]*((?:\x00FIG\d+\x00[ \t]*)+)$",
        r"\n\n\1\n\n",
        body,
    )
    for para in re.split(r"\n[ \t]*\n", body):
        para = para.strip()
        if not para:
            continue
        if re.fullmatch(r"(\x00FIG\d+\x00\s*)+", para):
            for k in re.findall(r"\x00FIG\d+\x00", para):
                content.append({"type": "image", "figure_id": holes[k]})
            continue
        if para in math and math[para]["display"]:
            content.append({"type": "math_block", "tex": math[para]["tex"]})
            continue
        nodes = inline_nodes(para, math, holes)
        if nodes:
            content.append({"type": "paragraph", "content": nodes})
    return content


def _parse_blocks(text, math, holes):
    content = []
    parts = _split_top_level_envs(text)
    i = 0
    while i < len(parts):
        kind, body = parts[i]
        if kind == "minipage":
            columns = []
            while i < len(parts):
                current_kind, current_body = parts[i]
                if current_kind == "text" and not current_body.strip():
                    i += 1
                    continue
                if current_kind != "minipage":
                    break
                columns.append(_parse_minipage(current_body, math, holes))
                i += 1
            content.append({"type": "columns", "columns": columns})
            continue
        if kind == "tabular":
            content.append(parse_tabular(body, math, holes))
        elif kind in ("itemize", "enumerate"):
            content.append(parse_list(body, kind == "enumerate", math, holes))
        else:
            content.extend(_parse_text_blocks(body, math, holes))
        i += 1
    return content


def _parse_minipage(body, math, holes):
    """Một ``minipage`` -> một cột chuẩn hóa, không giữ mẹo LaTeX thô."""
    option_re = r"\s*(?:\[([^]]*)\])?\s*(?:\[([^]]*)\])?\s*\{([^}]*)\}"
    match = re.match(option_re, body)
    if not match:
        raise BadSource("minipage thiếu đối số chiều rộng")
    width_tex = match.group(3).strip()
    width_match = re.fullmatch(r"([0-9]*\.?[0-9]+)\s*\\(?:line|text)width", width_tex)
    if width_match:
        width = float(width_match.group(1))
    elif width_tex in (r"\linewidth", r"\textwidth"):
        width = 1.0
    else:
        raise BadSource(f"chiều rộng minipage chưa hỗ trợ: {width_tex}")

    inner = body[match.end():]
    if re.search(r"\\centering\b", inner):
        align = "center"
    elif re.search(r"\\raggedleft\b", inner):
        align = "right"
    else:
        align = "left"
    inner = re.sub(r"\\(?:centering|raggedleft|raggedright)\b", "", inner)
    valign = next((value for value in match.groups()[:2] if value in ("t", "c", "b")), "t")
    return {
        "width": width,
        "align": align,
        "valign": {"t": "top", "c": "center", "b": "bottom"}[valign],
        "content": _parse_blocks(inner, math, holes),
    }


def to_doc(text, holes=None, side="center"):
    """Ruột một trường (chuỗi LaTeX) -> cây tài liệu."""
    holes = holes or {}
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"(?<!\\)%.*", "", text)                               # chú thích
    text = re.sub(r"\\vspace\{[^}]*\}|\\noindent", "", text)  # mẹo căn dòng

    # Vỏ bọc trình bày: gỡ vỏ, giữ ruột. `center` vì các nút khối vốn đã căn
    # giữa; `table` vì nó chỉ bọc ngoài `tabular`; `multicols` vì chia cột là
    # việc của bộ ghi, không phải dữ liệu.
    text = re.sub(r"\\begin\{center\}|\\end\{center\}", "", text)
    text = re.sub(r"\\begin\{table\}(\[[^\]]*\])?|\\end\{table\}", "", text)
    text = re.sub(r"\\begin\{multicols\*?\}\{\d+\}|\\end\{multicols\*?\}", "", text)
    text = re.sub(r"\\columnbreak", "", text)

    text, math = protect_math(text)

    # `\centering` trong minipage được `_parse_minipage` đổi thành thuộc tính
    # cột. Lệnh còn lại ngoài minipage chưa mang ý nghĩa dữ liệu nên bỏ.
    # Không bỏ sớm hơn, nếu không sẽ mất căn giữa riêng của từng cột.

    content = _parse_blocks(text, math, holes)

    doc = {"type": "doc"}
    if side != "center":
        doc["side"] = side
    doc["content"] = content
    return doc


def read_field(text, figs=None):
    """Điểm vào cho MỘT trường đã tách sẵn (cột trong CSDL, ô soạn thảo)."""
    figs = figs if figs is not None else FigureStore()
    clean, holes = extract_figures(text or "", figs)
    return to_doc(clean, holes), figs


# ------------------------------------------------------------- bóc một câu ---

def parse_one(block, holes, qtype=None):
    """Ruột MỘT câu — đã gỡ hình, đã tách khỏi `\\sochc`."""
    rec = {"layout_type": "normal", "side": "center", "solution_side": "center"}

    # 1. lời giải ra trước. Bóc sót thì lời giải lọt vào content, lộ đáp án.
    solution = ""
    m = re.search(r"\\loigiai\s*\{", block)
    if m:
        solution, end = bracket(block, m.end() - 1)
        block = block[:m.start()] + block[end + 1:]

    # 2. immini bao ngoài phần đề
    mi = re.search(r"\\immini(L?)\s*(\[[^\]]*\])?\s*\{", block)
    if mi:
        rec["side"] = "left" if mi.group(1) == "L" else "right"
        args, end = split_args(block, mi.end() - 1, 2)
        body, figure = (args + ["", ""])[:2]
        rec["layout_type"] = ("immini_all"
                              if re.search(r"\\choice|\\choiceTF|\\shortans", body)
                              else "immini_content")
        # dòng TRỐNG chứ không phải một \n: hình phải là đoạn riêng, nếu không
        # nó lọt vào cùng đoạn với chữ và thành image_inline
        block = block[:mi.start()] + body + "\n\n" + figure + "\n\n" + block[end + 1:]

    ms = re.search(r"\\immini(L?)\s*(\[[^\]]*\])?\s*\{", solution)
    if ms:
        rec["solution_side"] = "left" if ms.group(1) == "L" else "right"
        args, end = split_args(solution, ms.end() - 1, 2)
        body, figure = (args + ["", ""])[:2]
        solution = solution[:ms.start()] + body + "\n\n" + figure + "\n\n" + solution[end + 1:]

    # 3. phương án. Câu cha `st` chỉ mang phần dẫn.
    options = []
    if qtype == "st":
        rec.update(question_type="st",
                   content_doc=to_doc(block, holes, rec["side"]),
                   solution_doc=to_doc(solution, holes, rec["solution_side"]),
                   options=[])
        return rec

    qtype = qtype or "oe"
    mc = re.search(r"\\choiceTF\s*(\[[^\]]*\])?", block)
    if mc:
        qtype = "tf"
        options, end = split_args(block, mc.end(), 4)
        block = block[:mc.start()] + block[end + 1:]
    else:
        mc = re.search(r"\\choice\b\s*(\[[^\]]*\])?", block)
        if mc:
            qtype = "mc"
            options, end = split_args(block, mc.end(), 4)
            block = block[:mc.start()] + block[end + 1:]
        else:
            msa = re.search(r"\\shortans\s*(\[[^\]]*\])?\s*\{", block)
            if msa:
                qtype = "sa"
                ans, end = bracket(block, msa.end() - 1)
                options = [ans]
                block = block[:msa.start()] + block[end + 1:]

    # 4. \itemch trong lời giải -> giải thích từng ý
    explains = []
    mi2 = re.search(r"\\begin\{itemchoice\}(.*?)\\end\{itemchoice\}", solution, re.S)
    if mi2:
        explains = [x.strip() for x in re.split(r"\\itemch\b", mi2.group(1))][1:]
        solution = solution[:mi2.start()] + solution[mi2.end():]

    rec["question_type"] = qtype
    rec["content_doc"] = to_doc(block, holes, rec["side"])
    rec["solution_doc"] = to_doc(solution, holes, rec["solution_side"])
    rec["options"] = []
    for i, opt in enumerate(options):
        row = {"order_index": i,
               "is_correct": "\\True" in opt,
               "content_doc": to_doc(opt.replace("\\True", ""), holes)}
        if i < len(explains):
            row["explaination_doc"] = to_doc(explains[i], holes)
        rec["options"].append(row)
    return rec


def read_tex_block(block, figs=None, strict=True):
    """Một `\\begin{ex}` -> DANH SÁCH câu.

    Câu thường ra một phần tử. Câu chùm `\\sochc{n}{dẫn}` ra n+1 phần tử: một
    câu cha mang phần dẫn, và n câu con nối qua `parent_id`.
    """
    figs = figs if figs is not None else FigureStore()
    if strict:
        bad = unknown_commands(block)
        if bad:
            raise UnknownCommand(", ".join(f"\\{k}\u00d7{v}" for k, v in sorted(bad.items())))
        if not RE_SOCHC.search(block):
            check_source(block)

    block, holes = extract_figures(block, figs)

    m = RE_SOCHC.search(block)
    if not m:
        return [parse_one(block, holes)], figs

    stem, end = bracket(block, m.end() - 1)
    parent = parse_one(stem, holes, qtype="st")
    parent["is_parent"] = True
    kids = [parse_one(c, holes) for c in RE_CHC.findall(block[end + 1:])]
    return [parent] + kids, figs


def read_tex_file(path_or_text, strict=True):
    """Cả file `.tex` -> danh sách (danh sách câu, kho hình) theo từng khối ex."""
    text = path_or_text
    if "\n" not in text and len(text) < 400:
        with open(text, encoding="utf-8", errors="replace") as f:
            text = f.read()
    return [read_tex_block(b, strict=strict) for b in RE_EX.findall(text)]
