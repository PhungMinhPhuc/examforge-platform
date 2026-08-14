import argparse
import ctypes
import hashlib
import os
import shutil
import struct
import tempfile
import time
import zipfile
import copy
from pathlib import Path, PurePosixPath

import olefile
from lxml import etree


NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "v": "urn:schemas-microsoft-com:vml",
    "o": "urn:schemas-microsoft-com:office:office",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
    "m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
}

MTXFM_LOCAL = -3
MTXFM_FILE = -4
MTXFM_MTEF = 4
MTXFM_PICT = 6
MTXFM_PREF_MTDEFAULT = 2
CACHE_VERSION = "mt6-factory-v1"
CACHE_HEADER = struct.Struct("<8siii")
CACHE_MAGIC = b"MTCACHE1"


def extract_mtef(ole_path: Path) -> bytes:
    with olefile.OleFileIO(ole_path) as ole:
        native = ole.openstream("Equation Native").read()
    header_size = struct.unpack_from("<H", native, 0)[0]
    data_size = struct.unpack_from("<I", native, 8)[0]
    return native[header_size : header_size + data_size]


def target_path(base: Path, target: str) -> Path:
    return base.joinpath(*PurePosixPath(target).parts)


def set_style_size(style: str, width_pt: float, height_pt: float) -> str:
    fields = [part for part in style.split(";") if part]
    output = []
    seen_width = seen_height = False
    for field in fields:
        key = field.split(":", 1)[0].strip().lower()
        if key == "width":
            output.append(f"width:{width_pt:.3f}pt")
            seen_width = True
        elif key == "height":
            output.append(f"height:{height_pt:.3f}pt")
            seen_height = True
        else:
            output.append(field)
    if not seen_width:
        output.append(f"width:{width_pt:.3f}pt")
    if not seen_height:
        output.append(f"height:{height_pt:.3f}pt")
    return ";".join(output)


def cache_key(mtef: bytes) -> str:
    digest = hashlib.sha256()
    digest.update(CACHE_VERSION.encode("ascii"))
    digest.update(b"\0")
    digest.update(mtef)
    return digest.hexdigest()


def read_cached_render(cache_root: Path, key: str, image_path: Path):
    cache_path = cache_root / key[:2] / f"{key}.mtcache"
    if not cache_path.is_file():
        return None
    try:
        payload = cache_path.read_bytes()
        if len(payload) <= CACHE_HEADER.size:
            return None
        magic, width_32, height_32, baseline_32 = CACHE_HEADER.unpack_from(payload)
        if magic != CACHE_MAGIC:
            return None
        image_path.write_bytes(payload[CACHE_HEADER.size:])
        return width_32, height_32, baseline_32
    except (OSError, ValueError, struct.error):
        return None


def write_cached_render(cache_root: Path, key: str, image_path: Path, dimensions) -> None:
    bucket = cache_root / key[:2]
    bucket.mkdir(parents=True, exist_ok=True)
    cache_path = bucket / f"{key}.mtcache"
    temporary_path = bucket / f"{key}.{os.getpid()}.tmp"
    payload = CACHE_HEADER.pack(CACHE_MAGIC, *dimensions) + image_path.read_bytes()
    temporary_path.write_bytes(payload)
    os.replace(temporary_path, cache_path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--fallback-omml",
        type=Path,
        help="DOCX OMML gốc; công thức native lỗi sẽ được phục hồi riêng từ đây",
    )
    args = parser.parse_args()
    source = args.input.resolve()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    cache_root = Path(
        os.getenv(
            "MATHTYPE_FORMULA_CACHE_PATH",
            str(output.parent / ".mathtype-formula-cache"),
        )
    ).resolve()

    dll_path = os.getenv(
        "MATHTYPE_MT6_DLL",
        r"C:\Program Files (x86)\MathType\System\64\MT6.dll",
    )
    dll = ctypes.WinDLL(dll_path)
    dll.MTAPIConnect.argtypes = [ctypes.c_int16, ctypes.c_int16]
    dll.MTAPIConnect.restype = ctypes.c_int32
    dll.MTAPIDisconnect.restype = ctypes.c_int32
    dll.MTXFormReset.restype = ctypes.c_int32
    dll.MTXFormSetPrefs.argtypes = [ctypes.c_int16, ctypes.c_char_p]
    dll.MTXFormSetPrefs.restype = ctypes.c_int32
    dll.MTXFormEqn.argtypes = [
        ctypes.c_int16, ctypes.c_int16, ctypes.c_void_p, ctypes.c_int32,
        ctypes.c_int16, ctypes.c_int16, ctypes.c_void_p, ctypes.c_int32,
        ctypes.c_char_p, ctypes.c_void_p,
    ]
    dll.MTXFormEqn.restype = ctypes.c_int32
    dll.MTGetLastDimension.argtypes = [ctypes.c_int16]
    dll.MTGetLastDimension.restype = ctypes.c_int32

    started = time.perf_counter()
    rendered = 0
    skipped = []
    with tempfile.TemporaryDirectory(prefix="mathtype-docx-") as temp_name:
        root = Path(temp_name)
        with zipfile.ZipFile(source) as archive:
            archive.extractall(root)

        rels_path = root / "word" / "_rels" / "document.xml.rels"
        doc_path = root / "word" / "document.xml"
        rels_tree = etree.parse(str(rels_path))
        relationships = {
            element.get("Id"): element.get("Target")
            for element in rels_tree.xpath("//pr:Relationship", namespaces=NS)
        }
        parser_xml = etree.XMLParser(remove_blank_text=False, huge_tree=True)
        doc_tree = etree.parse(str(doc_path), parser_xml)
        objects = doc_tree.xpath("//w:object[o:OLEObject and v:shape/v:imagedata]", namespaces=NS)
        fallback_nodes = []
        if args.fallback_omml:
            with zipfile.ZipFile(args.fallback_omml.resolve()) as fallback_archive:
                fallback_xml = fallback_archive.read("word/document.xml")
            fallback_tree = etree.fromstring(fallback_xml, parser_xml)
            fallback_nodes = fallback_tree.xpath(
                "//m:oMathPara | //m:oMath[not(ancestor::m:oMathPara)]",
                namespaces=NS,
            )
            if len(fallback_nodes) != len(objects):
                raise RuntimeError(
                    f"OMML fallback count={len(fallback_nodes)} không khớp MathType object count={len(objects)}"
                )

        connect = dll.MTAPIConnect(1, 30)
        if connect != 0:
            raise RuntimeError(f"MTAPIConnect failed: {connect}")
        try:
            if dll.MTXFormReset() != 0 or dll.MTXFormSetPrefs(MTXFM_PREF_MTDEFAULT, None) != 0:
                raise RuntimeError("Could not select MathType default preferences")
            for index, obj in enumerate(objects, 1):
                ole_node = obj.xpath("./o:OLEObject", namespaces=NS)[0]
                image_node = obj.xpath("./v:shape/v:imagedata", namespaces=NS)[0]
                shape = obj.xpath("./v:shape", namespaces=NS)[0]
                ole_target = relationships[ole_node.get(f"{{{NS['r']}}}id")]
                image_target = relationships[image_node.get(f"{{{NS['r']}}}id")]
                ole_path = target_path(root / "word", ole_target)
                image_path = target_path(root / "word", image_target)
                mtef = extract_mtef(ole_path)
                key = cache_key(mtef)
                cached_dimensions = read_cached_render(cache_root, key, image_path)
                if cached_dimensions is None:
                    src_buffer = ctypes.create_string_buffer(mtef)
                    try:
                        status = dll.MTXFormEqn(
                            MTXFM_LOCAL, MTXFM_MTEF, ctypes.cast(src_buffer, ctypes.c_void_p), len(mtef),
                            MTXFM_FILE, MTXFM_PICT, None, 0,
                            str(image_path).encode("mbcs"), None,
                        )
                    except OSError as exc:
                        status = -1
                        skipped.append({"index": index, "reason": f"native error: {exc}"})
                    if status != 0 or not image_path.exists():
                        if not fallback_nodes:
                            raise RuntimeError(f"Formula {index}: render={status}, output={image_path.exists()}")
                        run = obj.getparent()
                        while run is not None and run.tag != f"{{{NS['w']}}}r":
                            run = run.getparent()
                        if run is None or run.getparent() is None:
                            raise RuntimeError(f"Formula {index}: không tìm được run để phục hồi OMML")
                        run.getparent().replace(run, copy.deepcopy(fallback_nodes[index - 1]))
                        if not any(item.get("index") == index for item in skipped):
                            skipped.append({"index": index, "reason": f"render status={status}"})
                        continue
                    width_32 = dll.MTGetLastDimension(1)
                    height_32 = dll.MTGetLastDimension(2)
                    baseline_32 = dll.MTGetLastDimension(3)
                    write_cached_render(
                        cache_root, key, image_path,
                        (width_32, height_32, baseline_32),
                    )
                else:
                    width_32, height_32, baseline_32 = cached_dimensions
                width_pt = width_32 / 32.0
                height_pt = height_32 / 32.0
                shape.set("style", set_style_size(shape.get("style", ""), width_pt, height_pt))
                obj.set(f"{{{NS['w']}}}dxaOrig", str(round(width_pt * 20)))
                obj.set(f"{{{NS['w']}}}dyaOrig", str(round(height_pt * 20)))

                run = obj.getparent()
                while run is not None and run.tag != f"{{{NS['w']}}}r":
                    run = run.getparent()
                if run is not None:
                    run_props = run.find(f"{{{NS['w']}}}rPr")
                    if run_props is None:
                        run_props = etree.Element(f"{{{NS['w']}}}rPr")
                        run.insert(0, run_props)
                    position = run_props.find(f"{{{NS['w']}}}position")
                    if position is None:
                        position = etree.SubElement(run_props, f"{{{NS['w']}}}position")
                    position.set(f"{{{NS['w']}}}val", str(round(-baseline_32 / 16.0)))

                rendered += 1
                if index == 1 or index % 50 == 0 or index == len(objects):
                    print(f"Rendered {index}/{len(objects)}", flush=True)
        finally:
            try:
                dll.MTAPIDisconnect()
            except OSError:
                pass

        doc_tree.write(str(doc_path), encoding="UTF-8", xml_declaration=True, standalone=True)
        temp_docx = output.with_suffix(".building.docx")
        temp_docx.unlink(missing_ok=True)
        with zipfile.ZipFile(temp_docx, "w", zipfile.ZIP_DEFLATED) as archive:
            for file_path in root.rglob("*"):
                if file_path.is_file():
                    archive.write(file_path, file_path.relative_to(root).as_posix())
        os.replace(temp_docx, output)

    with zipfile.ZipFile(output) as check:
        bad = check.testzip()
        if bad:
            raise RuntimeError(f"Corrupt DOCX entry: {bad}")
    elapsed = time.perf_counter() - started
    print(f"DONE formulas={rendered} skipped={skipped} seconds={elapsed:.2f} output={output} bytes={output.stat().st_size}")


if __name__ == "__main__":
    main()
