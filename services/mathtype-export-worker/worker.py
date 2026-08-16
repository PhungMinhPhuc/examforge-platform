"""Windows MathType export worker command.

Đây là adapter triển khai đầu tiên của contract provider. Nó cố ý đứng ngoài
FastAPI để sau này có thể thay bằng HTTP worker hoặc container mà không đổi
pipeline xuất đề. Worker tạo bản trung gian bằng Java MTEF encoder, sau đó gọi
MathType Native API để tạo preview theo Factory Settings.

Java encoder và native renderer nằm cùng service production này. Runtime không
đọc hoặc thực thi mã trong ``temp``; hai biến command chỉ dùng khi triển khai
provider thay thế trên máy hoặc container khác.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


def _command_from_env(name: str) -> list[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        raise RuntimeError(f"Chưa cấu hình {name}")
    value = json.loads(raw)
    if not isinstance(value, list) or not value or not all(isinstance(item, str) and item for item in value):
        raise RuntimeError(f"{name} phải là JSON array các chuỗi không rỗng")
    return value


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _service_root() -> Path:
    return Path(__file__).resolve().parent


def _default_converter_command() -> list[str]:
    jar = _service_root() / "target" / "mathtype-export-worker.jar"
    mathjax_script = _service_root() / "tools" / "mathjax" / "render_mathjax_svg.cjs"
    return [
        os.getenv("JAVA_COMMAND", "java"),
        f"-Dpaperword.mathjax.script={mathjax_script}",
        "-cp", str(jar),
        "com.lz.paperword.tools.DocxOmmlToMathTypeConverter",
    ]


def _default_native_command() -> list[str]:
    return [sys.executable, str(_service_root() / "native" / "export_docx_factory.py")]


def _optional_command(name: str) -> list[str] | None:
    return _command_from_env(name) if os.getenv(name, "").strip() else None


def _run(command: list[str], timeout: int, cwd: Path | None = None) -> str:
    completed = subprocess.run(
        command,
        check=False,
        timeout=timeout,
        capture_output=True,
        text=True,
        shell=False,
        cwd=cwd,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout)[-2000:]
        raise RuntimeError(f"Lệnh worker thất bại ({completed.returncode}): {detail}")
    return completed.stdout or ""


def _write_converter_tex(path: Path, formulas: list[str]) -> None:
    # Converter Java hiện đọc các công thức \(...\) theo đúng thứ tự OMML.
    # Không chèn nội dung vào shell; đây chỉ là tệp dữ liệu UTF-8 trong temp.
    path.write_text("\n".join(f"\\({formula}\\)" for formula in formulas), encoding="utf-8")


def convert(
    input_docx: Path,
    manifest_path: Path,
    output_docx: Path,
    *,
    persistent_native: bool = False,
) -> None:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    formulas = manifest.get("formulas")
    if manifest.get("version") != 1 or not isinstance(formulas, list) or not all(isinstance(x, str) for x in formulas):
        raise RuntimeError("Manifest công thức không hợp lệ")

    converter_command = _optional_command("MATHTYPE_CONVERTER_COMMAND_JSON")
    native_command = _optional_command("MATHTYPE_NATIVE_RENDERER_COMMAND_JSON")
    converter_command = converter_command or _default_converter_command()
    native_command = native_command or _default_native_command()
    timeout = max(30, int(os.getenv("MATHTYPE_STAGE_TIMEOUT_SECONDS", "300")))

    runtime_root = Path(
        os.getenv("APP_RUNTIME_PATH", str(_repo_root() / ".runtime"))
    ).resolve()
    shared_cache = Path(
        os.getenv("MATHTYPE_CACHE_PATH", str(runtime_root / "mathtype" / "cache"))
    ).resolve()
    work_root = Path(
        os.getenv("MATHTYPE_WORK_PATH", str(runtime_root / "mathtype" / "work"))
    ).resolve()
    work_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="mathtype-worker-", dir=work_root) as temp_name:
        temp_dir = Path(temp_name)
        formulas_tex = temp_dir / "formulas.tex"
        ole_docx = temp_dir / "ole.docx"
        rendered_docx = temp_dir / "rendered.docx"
        _write_converter_tex(formulas_tex, formulas)

        _run([*converter_command, str(input_docx), str(formulas_tex), str(ole_docx)], timeout)
        os.environ.setdefault(
            "MATHTYPE_FORMULA_CACHE_PATH",
            str(shared_cache / "formulas"),
        )
        if persistent_native and native_command == _default_native_command():
            os.environ["MATHTYPE_PERSISTENT_NATIVE"] = "1"
            from native.export_docx_factory import main as render_native

            render_native([
                str(ole_docx),
                str(rendered_docx),
                "--fallback-omml",
                str(input_docx),
            ])
            native_output = ""
        else:
            native_output = _run(
                [
                    *native_command,
                    str(ole_docx),
                    str(rendered_docx),
                    "--fallback-omml",
                    str(input_docx),
                ],
                timeout,
            )
        if native_output:
            # Native renderer chỉ in số lượng/chỉ số, không in LaTeX đầy đủ.
            print(native_output.strip(), flush=True)

        with zipfile.ZipFile(rendered_docx) as archive:
            broken_entry = archive.testzip()
            if broken_entry:
                raise RuntimeError(f"DOCX MathType hỏng tại entry {broken_entry}")
        output_docx.parent.mkdir(parents=True, exist_ok=True)
        temporary_output = output_docx.with_suffix(".building.docx")
        shutil.copyfile(rendered_docx, temporary_output)
        os.replace(temporary_output, output_docx)


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--health":
        try:
            converter = _optional_command("MATHTYPE_CONVERTER_COMMAND_JSON") or _default_converter_command()
            native = _optional_command("MATHTYPE_NATIVE_RENDERER_COMMAND_JSON") or _default_native_command()
            if "-cp" in converter:
                jar = Path(converter[converter.index("-cp") + 1])
                if not jar.is_file():
                    raise RuntimeError(f"Chưa build Java worker: {jar}")
            native_script = Path(native[1]) if len(native) > 1 and native[0] == sys.executable else None
            if native_script is not None and not native_script.is_file():
                raise RuntimeError(f"Không tìm thấy native renderer: {native_script}")
            _run([sys.executable, "-c", "import olefile; import lxml"], 10)
            if os.name != "nt":
                raise RuntimeError("Windows MathType worker chỉ chạy trên Windows")
            dll_path = Path(os.getenv(
                "MATHTYPE_MT6_DLL",
                r"C:\Program Files (x86)\MathType\System\64\MT6.dll",
            ))
            if not dll_path.is_file():
                raise RuntimeError(f"Không tìm thấy MT6.dll tại {dll_path}")
            print(json.dumps({"available": True, "provider": "windows-mathtype-7"}))
            return 0
        except Exception as exc:
            print(str(exc), file=sys.stderr)
            return 1
    if len(sys.argv) != 4:
        print("Usage: worker.py <input.docx> <formulas.json> <output.docx>", file=sys.stderr)
        return 2
    try:
        convert(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve())
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
