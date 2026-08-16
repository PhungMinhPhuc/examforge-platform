"""Bộ ghi OMML cho DOCX — mượn khả năng LaTeX->OMML sẵn có của
pandoc cho ĐÚNG phần công thức, không dựng cả đề qua pandoc như bộ cũ
(`word_exporter.py`). Gọi pandoc 1 LẦN cho MỖI mã đề xuất ra (gom mọi công
thức của toàn bộ câu hỏi mã đề đó vào 1 file `.tex` nhỏ), trích từng
`<m:oMath>`/`<m:oMathPara>` rồi deepcopy vào cây `python-docx` đang dựng dở.

Mỗi công thức được đặt TRỌN trong 1 đoạn riêng (cách nhau dòng trống trong
`.tex` nguồn), kèm sentinel văn bản duy nhất — khớp thứ tự bằng cách quét
từng đoạn TÌM công thức theo đúng thứ tự cần, không chỉ dựa suông vào việc
"phần tử thứ N trong toàn bộ tài liệu" (tránh lệch nếu pandoc lỡ gộp/tách 1
công thức bất thường) — kèm SOÁT SỐ LƯỢNG nghiêm ngặt, lỗi (thiếu pandoc,
timeout, lệch số lượng) thì ném `PandocMathError`, nơi gọi PHẢI bắt và lùi
về hiển thị TeX thô (không crash cả lượt xuất).
"""
import copy
import os
import subprocess
import tempfile
import zipfile

from lxml import etree

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"


class PandocMathError(Exception):
    pass


def _qn(tag):
    prefix, local = tag.split(":")
    ns = W_NS if prefix == "w" else M_NS
    return f"{{{ns}}}{local}"


def render_formulas(items):
    """`items`: `[(tex, display), ...]` theo đúng thứ tự cần trong TOÀN BỘ
    câu hỏi của 1 mã đề. Trả về list cùng độ dài: 1 phần tử `<m:oMath>`
    (display=False) hoặc `<m:oMathPara>` ĐÃ ép căn trái (display=True) cho
    mỗi công thức, sẵn sàng deepcopy vào tài liệu đích.
    """
    if not items:
        return []

    lines = ["\\documentclass{article}", "\\begin{document}"]
    for i, (tex, display) in enumerate(items):
        wrapped = f"$${tex}$$" if display else f"${tex}$"
        lines.append(f"\\noindent ZZFORMULA{i}ZZ {wrapped}")
        lines.append("")
    lines.append("\\end{document}")
    tex_src = "\n".join(lines)

    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = os.path.join(tmpdir, "batch.tex")
        docx_path = os.path.join(tmpdir, "batch.docx")
        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(tex_src)
        try:
            subprocess.run(
                ["pandoc", tex_path, "-f", "latex", "-o", docx_path, "--mathml"],
                check=True, timeout=90, capture_output=True, text=True,
            )
        except Exception as e:
            raise PandocMathError(f"pandoc thất bại khi dựng công thức: {e}") from e

        try:
            with zipfile.ZipFile(docx_path) as z:
                doc_xml = z.read("word/document.xml")
        except Exception as e:
            raise PandocMathError(f"không đọc được .docx pandoc vừa dựng: {e}") from e

    root = etree.fromstring(doc_xml)
    body = root.find(_qn("w:body"))
    paragraphs = list(body.findall(_qn("w:p")))

    results = []
    for i, (tex, display) in enumerate(items):
        omath_el = None
        for p in paragraphs:
            found = p.find(_qn("m:oMathPara")) if display else p.find(f".//{_qn('m:oMath')}")
            if found is not None:
                omath_el = found
                paragraphs.remove(p)
                break
        if omath_el is None:
            raise PandocMathError(
                f"không trích được công thức #{i} (display={display}, tex={tex[:60]!r}) "
                "— pandoc có thể đã gộp/rớt một công thức"
            )
        if display:
            _force_left_align(omath_el)
        results.append(copy.deepcopy(omath_el))

    return results


def _force_left_align(omath_para_el):
    """oMathPara mặc định căn giữa (pandoc/Word) — ép về trái, khớp
    `word_exporter.py:691-709`."""
    jc = omath_para_el.find(f"{_qn('m:oMathParaPr')}/{_qn('m:jc')}")
    if jc is not None:
        jc.set(_qn("m:val"), "left")
        return
    pr = etree.SubElement(omath_para_el, _qn("m:oMathParaPr"))
    omath_para_el.insert(0, pr)  # oMathParaPr phải là con ĐẦU TIÊN theo schema
    jc = etree.SubElement(pr, _qn("m:jc"))
    jc.set(_qn("m:val"), "left")


def insert_inline_omath(run, omath_el):
    """Thay `run` (đang chứa chữ nghiêng TeX thô) bằng `<m:oMath>` thật,
    đúng vị trí trong đoạn cha."""
    r = run._r
    parent = r.getparent()
    idx = list(parent).index(r)
    parent.insert(idx, omath_el)
    parent.remove(r)


def insert_display_omath(paragraph, omathpara_el):
    """Thay TOÀN BỘ nội dung `paragraph` (placeholder chữ nghiêng TeX thô)
    bằng `<m:oMathPara>` thật, giữ nguyên `w:pPr` (căn lề...) đã đặt."""
    p = paragraph._p
    for child in list(p):
        if child.tag != _qn("w:pPr"):
            p.remove(child)
    p.append(omathpara_el)


def set_default_math_alignment_left(doc):
    """`w:settings/m:mathPr/m:defJc = left` — ép mặc định Word tự chèn công
    thức mới cũng căn trái, khớp `word_exporter.py:783-793`. Gọi 1 lần cấp
    tài liệu."""
    settings = doc.settings.element
    math_pr = settings.find(_qn("m:mathPr"))
    if math_pr is None:
        math_pr = etree.SubElement(settings, _qn("m:mathPr"))
    def_jc = math_pr.find(_qn("m:defJc"))
    if def_jc is None:
        def_jc = etree.SubElement(math_pr, _qn("m:defJc"))
    def_jc.set(_qn("m:val"), "left")


def flush_omml_math_batch(doc, math_batch, logger=None):
    """Lượt 2 — gọi SAU khi đã dựng xong toàn bộ tài liệu (lượt 1 đã ghi
    placeholder chữ nghiêng TeX thô + gom `math_batch` qua `add_inline`/
    `add_blocks`). Gọi pandoc 1 LẦN cho CẢ batch, thay từng placeholder bằng
    OMML thật theo đúng thứ tự đã gom. Lỗi (thiếu pandoc/timeout/lệch số
    lượng) → log rồi GIỮ NGUYÊN placeholder chữ nghiêng cho cả batch, không
    ném lỗi tiếp — một lượt xuất không được phép crash vì 1 công thức hỏng.
    """
    if not math_batch:
        return
    items = [(tex, kind == "display") for kind, ref, tex in math_batch]
    try:
        omml_elements = render_formulas(items)
    except PandocMathError as e:
        if logger:
            logger.warning("Bỏ qua dựng công thức thật (giữ chữ nghiêng TeX thô): %s", e)
        return

    for (kind, ref, tex), omml_el in zip(math_batch, omml_elements):
        if kind == "inline":
            insert_inline_omath(ref, omml_el)
        else:
            insert_display_omath(ref, omml_el)

    set_default_math_alignment_left(doc)
