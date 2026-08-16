"""Provider MathType cho coordinator xuất công thức DOCX.

Pipeline Python không biết worker dùng MathType 7 trên Windows, một dịch vụ
Linux trong tương lai hay container. Worker nhận ba đường dẫn cuối lệnh:
``input.docx``, ``formulas.json`` và ``output.docx``. Tệp đầu vào luôn là một
DOCX OMML hoàn chỉnh. Worker phải giữ nguyên OMML ở từng công thức không thể
chuyển, vì vậy lỗi cục bộ không làm mất công thức hoặc hỏng cả tài liệu.

Biến ``MATHTYPE_WORKER_COMMAND_JSON`` là JSON array, ví dụ:
``["python", "services/mathtype-export-worker/worker.py"]``. Dùng array thay cho một
chuỗi shell để nội dung đề và đường dẫn không thể bị nội suy thành lệnh.
"""

from __future__ import annotations

import hashlib
import base64
import io
import json
import logging
import os
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path


LOGGER = logging.getLogger(__name__)
_worker_lock = threading.Lock()
_server_start_lock = threading.Lock()
_local_server_process: subprocess.Popen | None = None


def _worker_url() -> str | None:
    configured = os.getenv("MATHTYPE_WORKER_URL", "").strip().rstrip("/")
    if configured:
        return configured
    if os.name == "nt" and not os.getenv("MATHTYPE_WORKER_COMMAND_JSON", "").strip():
        port = int(os.getenv("MATHTYPE_SERVER_PORT", "18765"))
        return f"http://127.0.0.1:{port}"
    return None


def _http_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json; charset=utf-8"}
    token = os.getenv("MATHTYPE_SERVER_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _http_json(url: str, payload: dict | None = None, timeout: int = 5) -> dict:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers=_http_headers(),
        method="GET" if payload is None else "POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _ensure_local_server(url: str) -> None:
    global _local_server_process
    try:
        _http_json(f"{url}/health", timeout=1)
        return
    except (OSError, urllib.error.URLError, ValueError):
        pass
    if os.name != "nt" or not url.startswith("http://127.0.0.1:"):
        return
    with _server_start_lock:
        try:
            _http_json(f"{url}/health", timeout=1)
            return
        except (OSError, urllib.error.URLError, ValueError):
            pass
        repo_root = Path(__file__).resolve().parents[5]
        server_script = repo_root / "services" / "mathtype-export-worker" / "server.py"
        if not server_script.is_file():
            raise RuntimeError(f"Không tìm thấy MathType server: {server_script}")
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        _local_server_process = subprocess.Popen(
            [sys.executable, str(server_script)],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            shell=False,
            creationflags=creationflags,
        )
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if _local_server_process.poll() is not None:
                raise RuntimeError("MathType server dừng ngay sau khi khởi động")
            try:
                _http_json(f"{url}/health", timeout=1)
                return
            except (OSError, urllib.error.URLError, ValueError):
                time.sleep(0.25)
        raise RuntimeError("MathType server không sẵn sàng sau 15 giây")


def _worker_command() -> list[str] | None:
    raw = os.getenv("MATHTYPE_WORKER_COMMAND_JSON", "").strip()
    if not raw:
        if os.name != "nt":
            return None
        repo_root = Path(__file__).resolve().parents[5]
        default_worker = repo_root / "services" / "mathtype-export-worker" / "worker.py"
        return [sys.executable, str(default_worker)] if default_worker.is_file() else None
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("MATHTYPE_WORKER_COMMAND_JSON không phải JSON hợp lệ") from exc
    if not isinstance(value, list) or not value or not all(isinstance(part, str) and part for part in value):
        raise ValueError("MATHTYPE_WORKER_COMMAND_JSON phải là JSON array các chuỗi không rỗng")
    return value


def mathtype_capability() -> dict:
    """Trạng thái cấu hình provider, dùng cho API capability và vận hành."""
    url = _worker_url()
    if url:
        try:
            _ensure_local_server(url)
            result = _http_json(f"{url}/health", timeout=5)
            return {
                "available": bool(result.get("available")),
                "provider": result.get("provider", "http"),
                "reason": None,
            }
        except Exception as exc:
            return {"available": False, "provider": "http", "reason": str(exc)}
    try:
        command = _worker_command()
    except ValueError as exc:
        return {"available": False, "provider": "external", "reason": str(exc)}
    if not command:
        return {
            "available": False,
            "provider": "external",
            "reason": "Chưa cấu hình MATHTYPE_WORKER_COMMAND_JSON",
        }
    try:
        completed = subprocess.run(
            [*command, "--health"],
            check=False,
            timeout=5,
            capture_output=True,
            text=True,
            shell=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return {"available": False, "provider": "external", "reason": str(exc)}
    if completed.returncode != 0:
        return {
            "available": False,
            "provider": "external",
            "reason": (completed.stderr or completed.stdout or "Worker health check thất bại")[-500:],
        }
    return {"available": True, "provider": "external", "reason": None}


def _runtime_root() -> Path:
    configured = os.getenv("APP_RUNTIME_PATH", "").strip()
    if configured:
        return Path(configured).resolve()
    repo_root = Path(__file__).resolve().parents[5]
    return (repo_root / ".runtime").resolve()


def _cache_root() -> Path:
    configured = os.getenv("MATHTYPE_CACHE_PATH", "").strip()
    if configured:
        return Path(configured).resolve()
    return _runtime_root() / "mathtype" / "cache"


def _work_root() -> Path:
    configured = os.getenv("MATHTYPE_WORK_PATH", "").strip()
    if configured:
        return Path(configured).resolve()
    return _runtime_root() / "mathtype" / "work"


def _document_cache_key(docx_bytes: bytes, formulas: list[str]) -> str:
    digest = hashlib.sha256()
    # v2 bắt buộc MTEF dùng template DSMT7 đóng gói. Không tái sử dụng các
    # DOCX v1 đã cache khi production worker còn thiếu template OLE.
    digest.update(b"mathtype-docx-provider-v4-no-forced-spacer\0")
    digest.update(docx_bytes)
    digest.update(json.dumps(formulas, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    return digest.hexdigest()


def _mathtype_object_count(docx_bytes: bytes) -> int:
    try:
        with zipfile.ZipFile(io.BytesIO(docx_bytes)) as archive:
            return archive.read("word/document.xml").count(b"Equation.DSMT4")
    except (OSError, KeyError, zipfile.BadZipFile):
        return 0


def convert_docx_formulas(docx_bytes: bytes, formulas: list[str]) -> bytes:
    """Trả DOCX hỗn hợp MathType/OMML; mọi lỗi provider trả bản OMML gốc.

    Fallback toàn tài liệu ở tầng này chỉ xảy ra khi worker không khởi động,
    timeout hoặc trả DOCX hỏng. Fallback *từng công thức* được worker thực hiện
    và ghi trong manifest kết quả.
    """
    if not formulas:
        return docx_bytes
    url = _worker_url()
    command = None
    if not url:
        try:
            command = _worker_command()
        except ValueError as exc:
            LOGGER.warning("Không dùng được MathType provider: %s", exc)
            return docx_bytes
        if not command:
            LOGGER.warning("Chưa cấu hình MathType provider; giữ nguyên OMML")
            return docx_bytes

    cache_root = _cache_root()
    cache_key = _document_cache_key(docx_bytes, formulas)
    cached_docx = cache_root / "documents" / f"{cache_key}.docx"
    try:
        if cached_docx.is_file():
            cached_bytes = cached_docx.read_bytes()
            if _mathtype_object_count(cached_bytes) > 0:
                return cached_bytes
            LOGGER.warning("Bỏ cache MathType không chứa đối tượng OLE: %s", cached_docx)
    except OSError:
        LOGGER.warning("Không đọc được cache MathType %s", cached_docx, exc_info=True)

    timeout_seconds = max(10, int(os.getenv("MATHTYPE_WORKER_TIMEOUT_SECONDS", "300")))
    try:
        work_root = _work_root()
        work_root.mkdir(parents=True, exist_ok=True)
        with _worker_lock, tempfile.TemporaryDirectory(
            prefix="mathtype-export-", dir=work_root
        ) as temp_name:
            temp_dir = Path(temp_name)
            input_path = temp_dir / "input.docx"
            manifest_path = temp_dir / "formulas.json"
            output_path = temp_dir / "output.docx"
            input_path.write_bytes(docx_bytes)
            manifest_path.write_text(
                json.dumps({"version": 1, "formulas": formulas}, ensure_ascii=False),
                encoding="utf-8",
            )
            if url:
                _ensure_local_server(url)
                response = _http_json(
                    f"{url}/convert",
                    {
                        "input_docx_b64": base64.b64encode(docx_bytes).decode("ascii"),
                        "formulas": formulas,
                    },
                    timeout=timeout_seconds,
                )
                converted = base64.b64decode(response["output_docx_b64"], validate=True)
                mathtype_objects = int(response.get("mathtype_objects", 0))
            else:
                completed = subprocess.run(
                    [*command, str(input_path), str(manifest_path), str(output_path)],
                    check=False,
                    timeout=timeout_seconds,
                    capture_output=True,
                    text=True,
                    shell=False,
                )
                if completed.returncode != 0 or not output_path.is_file():
                    LOGGER.warning(
                        "MathType worker thất bại (exit=%s): %s",
                        completed.returncode,
                        completed.stderr[-1000:],
                    )
                    return docx_bytes
                if completed.stdout:
                    LOGGER.info("MathType worker: %s", completed.stdout[-1000:].strip())
                converted = output_path.read_bytes()
                mathtype_objects = _mathtype_object_count(converted)
            # DOCX là ZIP; kiểm tra magic trước khi cho dữ liệu worker đi tiếp.
            if not converted.startswith(b"PK"):
                LOGGER.warning("MathType worker trả dữ liệu không phải DOCX; giữ nguyên OMML")
                return docx_bytes
            try:
                if mathtype_objects <= 0:
                    LOGGER.warning(
                        "MathType worker không chuyển được công thức nào; "
                        "giữ bản OMML fallback và không cache kết quả"
                    )
                    return converted
                cached_docx.parent.mkdir(parents=True, exist_ok=True)
                temporary_cache = cached_docx.with_suffix(".tmp")
                temporary_cache.write_bytes(converted)
                os.replace(temporary_cache, cached_docx)
            except OSError:
                LOGGER.warning("Không ghi được cache MathType %s", cached_docx, exc_info=True)
            return converted
    except (OSError, subprocess.SubprocessError, ValueError):
        LOGGER.warning("Không chuyển được DOCX sang MathType; giữ nguyên OMML", exc_info=True)
        return docx_bytes
