"""Bộ đọc `.docx` -> cây tài liệu, KHÔNG đi vòng qua pandoc.

Đường cũ là `.docx → pandoc → LaTeX → CSDL`, mỗi lần dịch là một lần mất: bảng
Word thành `\\begin{array}` nên trên web nó là một công thức toán chứ không phải
bảng; ngắt mềm thành `\\\\`+`\\n` bị đếm hai lần; công thức MathType thành ảnh.

Đọc thẳng bỏ được cả ba, vì `.docx` **vốn đã có cấu trúc**: đoạn là `<w:p>`,
bảng là `<w:tbl>`, ngắt mềm là `<w:br/>`, công thức là `<m:oMath>`. Việc còn lại
chỉ là ánh xạ sang đúng loại nút, không phải đoán ngược từ chuỗi trình bày.
"""
import io
import os
import re
import zipfile
from xml.etree import ElementTree as ET

from ..figures import A4_REFERENCE_WIDTH_IN, FigureStore
from ..math import mathtype
from ..math.omml import omml_to_tex

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "v": "urn:schemas-microsoft-com:vml",
    "o": "urn:schemas-microsoft-com:office:office",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
}

EMU_PER_INCH = 914400.0


def q(name):
    p, t = name.split(":")
    return "{%s}%s" % (NS[p], t)


MARK_OF = {"b": "bold", "i": "italic", "u": "underline", "highlight": "highlight"}


def run_marks(r):
    pr = r.find(q("w:rPr"))
    if pr is None:
        return []
    return [mark for tag, mark in MARK_OF.items()
            if (el := pr.find(q("w:" + tag))) is not None
            and el.get(q("w:val")) not in ("0", "false", "none")]


def run_color(r):
    pr = r.find(q("w:rPr"))
    color = pr.find(q("w:color")) if pr is not None else None
    value = color.get(q("w:val"), "") if color is not None else ""
    return f"#{value.upper()}" if re.fullmatch(r"[0-9A-Fa-f]{6}", value) else None


class _Ctx:
    """Gói các thứ dùng chung khi đi qua một file, cho gọn chữ ký hàm."""

    def __init__(self, zf, rels, figs, media_dir, equations):
        self.z, self.rels, self.figs = zf, rels, figs
        self.media_dir, self.equations = media_dir, equations


def para_inline(p, ctx):
    """Một `<w:p>` -> danh sách nút chữ, gộp các run cùng định dạng."""
    out = []

    def push(text, marks, color=None):
        if not text:
            return
        if out and out[-1]["type"] == "text" and out[-1].get("marks", []) == marks and out[-1].get("color") == color:
            out[-1]["text"] += text
        else:
            node = {"type": "text", "text": text}
            if marks:
                node["marks"] = marks
            if color:
                node["color"] = color
            out.append(node)

    for child in p.iter():
        if child.tag == q("m:oMath"):
            tex = omml_to_tex(child)
            if tex:
                out.append({"type": "math", "tex": tex})

        elif child.tag == q("w:r") and not _inside(p, child, q("m:oMath")):
            marks = run_marks(child)
            color = run_color(child)
            for sub in child:
                if sub.tag == q("w:t"):
                    push(re.sub(r"\s+", " ", sub.text or ""), marks, color)
                elif sub.tag == q("w:br"):
                    out.append({"type": "hard_break"})
                elif sub.tag == q("w:tab"):
                    push(" ", marks, color)
                elif sub.tag == q("w:object"):
                    # Ưu tiên đọc thành công thức; chỉ khi không dịch được mới
                    # lui về ảnh như đường cũ. Không được làm cả hai.
                    tex = mathtype_tex(sub, ctx)
                    if tex:
                        out.append({"type": "math", "tex": tex})
                        continue
                    fid = grab_image(sub, ctx)
                    if fid:
                        out.append({"type": "image_inline", "figure_id": fid})
                elif sub.tag in (q("w:drawing"), q("w:pict")):
                    fid = grab_image(sub, ctx)
                    if fid:
                        out.append({"type": "image_inline", "figure_id": fid})
    return out


def _inside(root, node, tag):
    """node có nằm trong một phần tử `tag` không — tránh đọc chữ hai lần."""
    for anc in root.iter(tag):
        for d in anc.iter():
            if d is node:
                return True
    return False


def mathtype_tex(obj, ctx):
    """`<w:object>` bọc một phương trình MathType -> TeX, nếu tra được."""
    if not ctx.equations:
        return None
    for ole in obj.iter(q("o:OLEObject")):
        key = os.path.splitext(os.path.basename(ctx.rels.get(ole.get(q("r:id")), "")))[0]
        if key in ctx.equations:
            return ctx.equations[key]
    return None


def grab_image(el, ctx):
    """Rút ảnh nhúng ra file, trả `figure_id`."""
    for blip in el.iter(q("a:blip")):
        rid = blip.get(q("r:embed"))
        if rid in ctx.rels:
            return _store(ctx, ctx.rels[rid], el)
    for shape in el.iter(q("v:imagedata")):
        rid = shape.get(q("r:id"))
        if rid in ctx.rels:
            return _store(ctx, ctx.rels[rid], el)
    return None


def _drawing_geometry(el):
    """Kích thước/crop/biến đổi mà Word áp lên media gốc.

    `wp:extent` là kích thước cuối cùng trên trang (scale đã nằm trong đó),
    còn `a:srcRect` và `a:xfrm` giữ crop/xoay/lật không phá hủy.
    """
    geometry = {
        "cx": None, "cy": None,
        "crop": (0.0, 0.0, 0.0, 0.0),
        "rotation": 0.0, "flip_h": False, "flip_v": False,
    }
    extent = next(el.iter(q("wp:extent")), None)
    if extent is not None:
        try:
            geometry["cx"] = int(extent.get("cx", "0")) or None
            geometry["cy"] = int(extent.get("cy", "0")) or None
        except (TypeError, ValueError):
            pass

    src_rect = next(el.iter(q("a:srcRect")), None)
    if src_rect is not None:
        def crop_value(side):
            try:
                return max(0.0, min(1.0, int(src_rect.get(side, "0")) / 100000.0))
            except (TypeError, ValueError):
                return 0.0
        geometry["crop"] = tuple(crop_value(side) for side in ("l", "t", "r", "b"))

    transform = next(el.iter(q("a:xfrm")), None)
    if transform is not None:
        try:
            geometry["rotation"] = int(transform.get("rot", "0")) / 60000.0
        except (TypeError, ValueError):
            pass
        geometry["flip_h"] = transform.get("flipH") in ("1", "true")
        geometry["flip_v"] = transform.get("flipV") in ("1", "true")
    return geometry


def _display_width_fraction(geometry):
    cx = geometry.get("cx")
    if not cx:
        return None
    return (cx / EMU_PER_INCH) / A4_REFERENCE_WIDTH_IN


def _apply_word_image_geometry(data, name, geometry):
    """Bake crop/xoay/lật/kéo giãn của Word vào ảnh raster được lưu.

    Nếu Pillow không đọc được loại media (WMF/EMF/SVG...), giữ nguyên file;
    `width` từ wp:extent vẫn được bảo toàn độc lập.
    """
    crop = geometry["crop"]
    rotation = geometry["rotation"]
    flip_h, flip_v = geometry["flip_h"], geometry["flip_v"]
    cx, cy = geometry["cx"], geometry["cy"]
    has_crop = any(value > 0 for value in crop)
    has_transform = has_crop or rotation or flip_h or flip_v

    try:
        from PIL import Image, ImageOps
        with Image.open(io.BytesIO(data)) as source:
            image = ImageOps.exif_transpose(source).convert("RGBA")
            left, top, right, bottom = crop
            if has_crop:
                x0 = round(image.width * left)
                y0 = round(image.height * top)
                x1 = round(image.width * (1.0 - right))
                y1 = round(image.height * (1.0 - bottom))
                if x1 > x0 and y1 > y0:
                    image = image.crop((x0, y0, x1, y1))
            if flip_h:
                image = ImageOps.mirror(image)
            if flip_v:
                image = ImageOps.flip(image)
            if rotation:
                # DrawingML dương là chiều kim đồng hồ; Pillow dương là ngược.
                image = image.rotate(-rotation, expand=True, resample=Image.Resampling.BICUBIC)

            # q_images chỉ lưu width. Bake tỷ lệ cx/cy vào pixel aspect để khi
            # dựng theo width, chiều cao cũng khớp khung người dùng thấy ở Word.
            if cx and cy and image.width and image.height:
                target_aspect = cx / cy
                current_aspect = image.width / image.height
                if target_aspect > 0 and abs(current_aspect / target_aspect - 1.0) > 0.002:
                    target_height = max(1, round(image.width / target_aspect))
                    image = image.resize((image.width, target_height), Image.Resampling.LANCZOS)
                    has_transform = True

            if not has_transform:
                return data, name
            output = io.BytesIO()
            image.save(output, format="PNG")
            return output.getvalue(), os.path.splitext(name)[0] + "_word.png"
    except Exception:
        return data, name


def _store(ctx, name, drawing_el=None):
    try:
        data = ctx.z.read("word/" + name)
    except KeyError:
        return None
    geometry = _drawing_geometry(drawing_el) if drawing_el is not None else _drawing_geometry(ET.Element("empty"))
    data, stored_name = _apply_word_image_geometry(data, name, geometry)
    return ctx.figs.add(
        "graphic",
        data=data,
        media_dir=ctx.media_dir,
        name=stored_name,
        width=_display_width_fraction(geometry),
    )


# --------------------------------------------------------------- nút khối ---

def table_node(tbl, ctx):
    rows = []
    vertical = {}
    for tr in tbl.findall(q("w:tr")):
        cells = []
        next_vertical = {}
        logical_col = 0
        for tc in tr.findall(q("w:tc")):
            span = 1
            pr = tc.find(q("w:tcPr"))
            if pr is not None and (g := pr.find(q("w:gridSpan"))) is not None:
                span = int(g.get(q("w:val"), 1))
            vmerge = pr.find(q("w:vMerge")) if pr is not None else None
            is_continue = vmerge is not None and vmerge.get(q("w:val")) != "restart"
            if is_continue and logical_col in vertical:
                origin = vertical[logical_col]
                origin["rowspan"] = origin.get("rowspan", 1) + 1
                for col in range(logical_col, logical_col + span):
                    next_vertical[col] = origin
                logical_col += span
                continue
            content = []
            for p in tc.findall(q("w:p")):
                content += para_inline(p, ctx)
            cell = {"content": content}
            if span > 1:
                cell["colspan"] = span
            if vmerge is not None and not is_continue:
                for col in range(logical_col, logical_col + span):
                    next_vertical[col] = cell
            cells.append(cell)
            logical_col += span
        rows.append(cells)
        vertical = next_vertical
    return {"type": "table", "rows": rows} if rows else None


def numbering(p):
    """(numId, ilvl) nếu đoạn nằm trong danh sách đánh số của Word.

    Tín hiệu quan trọng nhất khi đọc đề Word: số câu thường **không phải chữ**
    mà do Word tự sinh từ `numPr`. Tìm chữ "Câu 1" trong nội dung sẽ không thấy
    gì — đề HSG Hải Dương trong `Sample/` đúng như vậy.
    """
    pr = p.find(q("w:pPr"))
    if pr is None:
        return None
    num = pr.find(q("w:numPr"))
    if num is None:
        return None
    nid, lvl = num.find(q("w:numId")), num.find(q("w:ilvl"))
    return (nid.get(q("w:val")) if nid is not None else "?",
            int(lvl.get(q("w:val"), 0)) if lvl is not None else 0)


def paragraph_alignment(p):
    pr = p.find(q("w:pPr"))
    jc = pr.find(q("w:jc")) if pr is not None else None
    value = jc.get(q("w:val")) if jc is not None else "left"
    return {
        "center": "center",
        "right": "right",
        "both": "justify",
        "distribute": "justify",
    }.get(value, "left")


def body_blocks(body, ctx):
    out = []
    for el in body:
        if el.tag == q("w:p"):
            nodes = para_inline(el, ctx)
            if not nodes:
                continue
            if len(nodes) == 1 and nodes[0]["type"] == "image_inline":
                blk = {"type": "image", "figure_id": nodes[0]["figure_id"]}
            else:
                blk = {"type": "paragraph", "content": nodes}
                align = paragraph_alignment(el)
                if align != "left":
                    blk["align"] = align
            if numbering(el):
                blk["_num"] = True      # khóa tạm, bộ tách câu dùng xong sẽ gỡ
            out.append(blk)
        elif el.tag == q("w:tbl"):
            t = table_node(el, ctx)
            if t:
                out.append(t)
    return out


# ------------------------------------------------------------------ đọc ---

def read_docx(path, media_dir=None, figs=None, with_mathtype=True):
    """`.docx` -> (cây tài liệu của cả file, kho hình)."""
    figs = figs if figs is not None else FigureStore()
    media_dir = media_dir or os.path.join(os.path.dirname(path), "media")
    equations = mathtype.convert_docx_equations(path) if with_mathtype else {}

    with zipfile.ZipFile(path) as z:
        rels = {r.get("Id"): r.get("Target")
                for r in ET.fromstring(z.read("word/_rels/document.xml.rels"))}
        doc = ET.fromstring(z.read("word/document.xml"))
        ctx = _Ctx(z, rels, figs, media_dir, equations)
        blocks = body_blocks(doc.find(q("w:body")), ctx)
    return {"type": "doc", "content": blocks}, figs


# -------------------------------------------------------- tách thành câu ---

RE_CAU = re.compile(r"^\s*(?:Câu|Bài)\s*(\d+)\s*[:.)]", re.I)
# "PHẦN I/II/III" — đề chuẩn hóa đánh SỐ CÂU LẠI TỪ 1 ở mỗi phần, nên không biết
# đang ở phần nào thì không tra được bảng đáp án.
RE_PHAN = re.compile(r"^\s*PHẦN\s+(I{1,3})\b", re.I)
# Sau vạch "HẾT" là bảng đáp án, không còn câu nào. `read_answer_tables()` đã
# đọc mấy bảng đó rồi; đọc lại ở đây sẽ đẻ ra câu ma.
RE_HET = re.compile(r"^[\s\-–—]*HẾT[\s\-–—]*$", re.I)
# Phương án trắc nghiệm "A." và mệnh đề đúng/sai "a)" — hai lối viết khác nhau,
# và cùng một đoạn có thể chứa cả bốn hoặc chỉ một.
RE_OPT = re.compile(r"(?:(?<=^)|(?<=\s))([A-D])[.)]\s")
RE_OPT_TF = re.compile(r"(?:(?<=^)|(?<=\s))([a-d])\)\s")


def plain(nodes):
    """Chuỗi phẳng của danh sách nút, kèm bản đồ vị trí để cắt lại được."""
    out, span, pos = [], [], 0
    for i, n in enumerate(nodes):
        t = (n.get("text", "") if n["type"] == "text"
             else ("\x01" if n["type"] in ("math", "image_inline") else " "))
        span.append((pos, pos + len(t), i))
        out.append(t)
        pos += len(t)
    return "".join(out), span


def slice_nodes(nodes, span, lo, hi):
    """Các nút phủ khoảng ký tự [lo, hi) của chuỗi phẳng.

    Cắt trên chuỗi GỐC một lần, không cắt dần — cắt dần thì mọi vị trí sau đó
    lệch đi.
    """
    out = []
    for st, en, i in span:
        if en <= lo or st >= hi:
            continue
        n = nodes[i]
        if n["type"] == "text":
            t = n["text"][max(0, lo - st): max(0, hi - st)]
            if t:
                out.append({**n, "text": t})
        else:
            out.append(n)
    return out


def strip_edges(nodes):
    ns = [dict(n) for n in nodes]
    if ns and ns[0]["type"] == "text":
        ns[0]["text"] = ns[0]["text"].lstrip()
    if ns and ns[-1]["type"] == "text":
        ns[-1]["text"] = ns[-1]["text"].rstrip().rstrip(".").rstrip()
    return [n for n in ns if n["type"] != "text" or n["text"]]


def split_options(block, tf=False):
    """Đoạn chứa phương án -> [{key, content}]. None nếu không phải.

    Đề Word có hai kiểu, file mẫu có cả hai: bốn phương án chung một đoạn
    ("A. … B. … C. … D. …"), hoặc mỗi phương án một đoạn riêng.
    `tf=True` thì tìm mệnh đề đúng/sai "a) … b) …" thay cho "A. … B. …".
    """
    nodes = block.get("content", [])
    text, span = plain(nodes)
    hits = list((RE_OPT_TF if tf else RE_OPT).finditer(text))
    if not hits or hits[0].start() > 2:
        return None

    out = []
    for k, m in enumerate(hits):
        end = hits[k + 1].start() if k + 1 < len(hits) else len(text)
        body = strip_edges(slice_nodes(nodes, span, m.end(), end))
        out.append({"key": m.group(1),
                    "content": [{"type": "paragraph", "content": body}] if body else []})
    return out


def strip_prefix(block, n):
    """Bỏ n ký tự đầu ("Câu 3: ") mà giữ nguyên các nút sau."""
    nodes = list(block.get("content", []))
    while n > 0 and nodes and nodes[0]["type"] == "text":
        t = nodes[0]["text"]
        if len(t) <= n:
            n -= len(t)
            nodes.pop(0)
        else:
            nodes[0] = {**nodes[0], "text": t[n:].lstrip()}
            n = 0
    if not nodes:
        return None
    result = {"type": "paragraph", "content": nodes}
    if block.get("align"):
        result["align"] = block["align"]
    return result


def split_questions(tree):
    """Cắt cây của cả file thành từng câu.

    Ba tín hiệu, theo thứ tự tin cậy:
      1. `_num` — Word đánh số tự động. Chắc, vì nằm trong cấu trúc file.
      2. Chữ "Câu n" đầu đoạn — dùng khi file không đánh số tự động.
      3. "PHẦN I/II/III" — **không** phải câu, mà là mốc đổi phần. Cần nó vì đề
         chuẩn hóa đánh số câu **lại từ 1** ở mỗi phần, nên chỉ số câu thôi thì
         không tra được bảng đáp án.

    Đây vẫn là phần **đoán**, khác hẳn `.tex` có `\begin{ex}` rõ ràng. Tách
    xong phải cho người xem lại trước khi lưu.
    """
    blocks = tree["content"]
    by_num = any("_num" in b for b in blocks)

    qs, cur, phan = [], None, "I"
    for raw in blocks:
        b = {k: v for k, v in raw.items() if k != "_num"}
        text = plain(b.get("content", []))[0] if b["type"] == "paragraph" else ""

        if RE_HET.match(text.strip()):
            break

        mp = RE_PHAN.match(text)
        if mp:
            if cur:                     # đóng nốt câu cuối của phần trước
                qs.append(cur)
                cur = None
            phan = mp.group(1).upper()
            continue

        if by_num:
            head, so = "_num" in raw, None
        else:
            m = RE_CAU.match(text)
            head = bool(m)
            so = int(m.group(1)) if m else None
            if m:
                b = strip_prefix(b, m.end()) or {"type": "paragraph", "content": []}

        if head:
            if cur:
                qs.append(cur)
            cur = {"so": so if so is not None else len(qs) + 1,
                   "phan": phan, "content": [b], "options": []}
            continue
        if cur is None:
            continue

        # Phần II là câu đúng/sai, mệnh đề viết "a) …"; phần khác là "A. …"
        opts = None
        if b["type"] == "paragraph":
            opts = split_options(b, tf=(phan == "II")) or split_options(b)
        if opts:
            cur["options"] += opts
        else:
            cur["content"].append(b)

    if cur:
        qs.append(cur)
    for b in blocks:
        b.pop("_num", None)
    return qs
