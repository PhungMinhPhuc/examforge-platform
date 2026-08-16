"""HTTP supervisor thường trú cho Windows MathType export worker."""

from __future__ import annotations

import base64
import json
import os
import queue
import subprocess
import sys
import tempfile
import threading
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from worker import convert


SERVICE_ROOT = Path(__file__).resolve().parent
MAX_REQUEST_BYTES = max(1, int(os.getenv("MATHTYPE_SERVER_MAX_REQUEST_MB", "100"))) * 1024 * 1024
CONVERSION_QUEUE: queue.Queue = queue.Queue()


class ConversionJob:
    def __init__(self, input_bytes: bytes, formulas: list[str]) -> None:
        self.input_bytes = input_bytes
        self.formulas = formulas
        self.done = threading.Event()
        self.result: dict | None = None
        self.error: Exception | None = None


def _mathtype_object_count(docx_path: Path) -> int:
    with zipfile.ZipFile(docx_path) as archive:
        document_xml = archive.read("word/document.xml")
    return document_xml.count(b"Equation.DSMT4")


def _start_mathtype_server() -> None:
    if os.name != "nt":
        return
    executable = Path(os.getenv(
        "MATHTYPE_EXE",
        r"C:\Program Files (x86)\MathType\MathType.exe",
    ))
    if not executable.is_file():
        raise RuntimeError(f"Không tìm thấy MathType.exe tại {executable}")
    subprocess.Popen(
        [str(executable), "-server"],
        cwd=str(executable.parent),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
    )


def _convert_on_main_thread(job: ConversionJob) -> dict:
    runtime_root = Path(os.getenv(
        "MATHTYPE_WORK_PATH",
        str(SERVICE_ROOT / ".runtime" / "server-work"),
    )).resolve()
    runtime_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="request-", dir=runtime_root) as temp_name:
        temp_dir = Path(temp_name)
        input_path = temp_dir / "input.docx"
        manifest_path = temp_dir / "formulas.json"
        output_path = temp_dir / "output.docx"
        input_path.write_bytes(job.input_bytes)
        manifest_path.write_text(
            json.dumps({"version": 1, "formulas": job.formulas}, ensure_ascii=False),
            encoding="utf-8",
        )
        # Native API chạy tuần tự trên main thread và giữ một session. Template
        # DSMT7 đã được đóng gói nên MathType không còn đọc MTEF fallback lỗi.
        convert(input_path, manifest_path, output_path, persistent_native=True)
        output_bytes = output_path.read_bytes()
        return {
            "output_docx_b64": base64.b64encode(output_bytes).decode("ascii"),
            "mathtype_objects": _mathtype_object_count(output_path),
            "requested_formulas": len(job.formulas),
        }


class Handler(BaseHTTPRequestHandler):
    server_version = "MathTypeExportWorker/1.0"

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        token = os.getenv("MATHTYPE_SERVER_TOKEN", "").strip()
        return not token or self.headers.get("Authorization") == f"Bearer {token}"

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/health":
            self._json(404, {"error": "not_found"})
            return
        if not self._authorized():
            self._json(401, {"error": "unauthorized"})
            return
        self._json(200, {
            "available": True,
            "provider": "windows-mathtype-7-persistent",
            "pid": os.getpid(),
        })

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/convert":
            self._json(404, {"error": "not_found"})
            return
        if not self._authorized():
            self._json(401, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_BYTES:
                raise ValueError("Kích thước request không hợp lệ")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            formulas = payload.get("formulas")
            if not isinstance(formulas, list) or not all(isinstance(item, str) for item in formulas):
                raise ValueError("Danh sách công thức không hợp lệ")
            input_bytes = base64.b64decode(payload["input_docx_b64"], validate=True)
            if not input_bytes.startswith(b"PK"):
                raise ValueError("Đầu vào không phải DOCX")
            job = ConversionJob(input_bytes, formulas)
            CONVERSION_QUEUE.put(job)
            timeout = max(10, int(os.getenv("MATHTYPE_WORKER_TIMEOUT_SECONDS", "300")))
            if not job.done.wait(timeout):
                raise TimeoutError(f"MathType worker quá thời gian {timeout} giây")
            if job.error is not None:
                raise job.error
            if job.result is None:
                raise RuntimeError("MathType worker không trả kết quả")
            self._json(200, job.result)
        except Exception as exc:
            self._json(500, {"error": "conversion_failed", "message": str(exc)})

    def log_message(self, format: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}", flush=True)


def main() -> int:
    host = os.getenv("MATHTYPE_SERVER_HOST", "127.0.0.1")
    port = int(os.getenv("MATHTYPE_SERVER_PORT", "18765"))
    if host not in {"127.0.0.1", "localhost", "::1"} and not os.getenv("MATHTYPE_SERVER_TOKEN", "").strip():
        raise RuntimeError("Worker ngoài loopback bắt buộc cấu hình MATHTYPE_SERVER_TOKEN")
    _start_mathtype_server()
    server = ThreadingHTTPServer((host, port), Handler)
    server_thread = threading.Thread(
        target=server.serve_forever,
        kwargs={"poll_interval": 0.5},
        name="mathtype-http",
        daemon=True,
    )
    server_thread.start()
    print(json.dumps({"listening": f"http://{host}:{port}", "pid": os.getpid()}), flush=True)
    try:
        while True:
            job = CONVERSION_QUEUE.get()
            try:
                job.result = _convert_on_main_thread(job)
            except Exception as exc:
                job.error = exc
            finally:
                job.done.set()
                CONVERSION_QUEUE.task_done()
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()
        server.server_close()
        server_thread.join(timeout=5)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
