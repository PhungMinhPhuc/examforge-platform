import os
import io
import json
import base64
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

from google import genai
from google.genai import types
import PIL.Image
try:
    import openai
except ImportError:
    openai = None

API_KEY = os.getenv("GEMINI_API_KEY", os.getenv("API_KEY", ""))
TEMPERATURE = 0.0

# Parallel inference tuning. Small batches that run concurrently make a 4+ page
# document finish in roughly the time of a single page instead of the sum of all
# pages. Override with env vars if you hit Gemini rate limits.
BATCH_SIZE = int(os.getenv("AI_BATCH_SIZE", "2"))     # pages per Gemini request
MAX_WORKERS = int(os.getenv("AI_MAX_WORKERS", "10"))   # concurrent requests

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "type": {"type": "string", "enum": ["multi_choice", "true_false", "short_answer", "essay"]},
                    "latex_code": {"type": "string"}
                },
                "required": ["id", "type", "latex_code"]
            }
        }
    },
    "required": ["questions"]
}

# System prompt
# Loaded from prompts/latex_rules.txt so the rules can be edited without touching
# code. Falls back to a minimal inline rule if the file is missing.
_PROMPT_PATH = Path(__file__).resolve().parent / "prompts" / "latex_rules.txt"
try:
    RULE_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")
except OSError:
    RULE_PROMPT = (
        "Convert the provided document content into `extest` LaTeX. Do NOT solve the "
        "problem and NEVER invent a solution: output an empty \\loigiai{} when the "
        "source has no solution. Insert figures with \\includegraphics from the Asset "
        "Manifest; never write placeholders and never draw figures with TikZ."
    )


def init_client(user_api_key: str, ai_provider: str = "gemini", ai_base_url: str = None, batch_idx: int = None):
    if ai_provider == "local":
        if not openai:
            raise ValueError("Vui lòng cài đặt thư viện 'openai' (pip install openai) để dùng Local AI.")
        return {
            "provider": "local",
            "client": openai.OpenAI(base_url=ai_base_url, api_key=user_api_key or "local")
        }
    else:
        if not user_api_key:
            raise ValueError("Vui lòng cung cấp Gemini API Key.")
        
        # Parse multiple keys separated by comma
        keys = [k.strip() for k in user_api_key.split(",") if k.strip()]
        if not keys:
            raise ValueError("Vui lòng cung cấp ít nhất 1 Gemini API Key.")
            
        if batch_idx is not None:
            # Round-robin
            selected_key = keys[batch_idx % len(keys)]
        else:
            import random
            selected_key = random.choice(keys)
            
        return {
            "provider": "gemini",
            "client": genai.Client(api_key=selected_key)
        }


def _figure_manifest_text(figure_manifest: list) -> str:
    """Human-readable asset manifest the model uses to reference figures by name."""
    if not figure_manifest:
        return "No figures detected."
    lines = []
    for f in figure_manifest:
        name = f.get("filename") or os.path.basename(str(f.get("path", "")))
        vpos = f.get("vertical_position")
        page = f.get("page")
        vtxt = f"{vpos:.2f}" if isinstance(vpos, (int, float)) else "?"
        lines.append(f"- {name} (page {page}, vertical position {vtxt})")
    return "\n".join(lines)


def _open_image(src) -> "PIL.Image.Image | None":
    """Open an image from a path or raw bytes; return None if it can't be decoded."""
    try:
        if isinstance(src, (bytes, bytearray)):
            return PIL.Image.open(io.BytesIO(src))
        return PIL.Image.open(src)
    except Exception as e:
        print(f"Skipping invalid image in AI normalization: {e}")
        return None


def _image_to_base64(img: "PIL.Image.Image") -> str:
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{img_str}"

def _generate(client_info, model_name, contents, is_json=True, schema=None, system_instruction=None):
    provider = client_info["provider"]
    client = client_info["client"]
    sys_prompt = system_instruction or RULE_PROMPT
    used_schema = schema or RESPONSE_SCHEMA

    if provider == "gemini":
        response = client.models.generate_content(
            model=model_name,
            contents=contents,
            config=types.GenerateContentConfig(
                temperature=TEMPERATURE,
                response_mime_type="application/json" if is_json else "text/plain",
                response_schema=used_schema if is_json else None,
                system_instruction=sys_prompt,
            ),
        )
        return json.loads(response.text) if is_json else response.text

    elif provider == "local":
        messages = [{"role": "system", "content": sys_prompt}]
        user_content = []
        for item in contents:
            if isinstance(item, str):
                user_content.append({"type": "text", "text": item})
            elif isinstance(item, PIL.Image.Image):
                user_content.append({"type": "image_url", "image_url": {"url": _image_to_base64(item)}})
        
        messages.append({"role": "user", "content": user_content})
        kwargs = {
            "model": model_name,
            "messages": messages,
            "temperature": TEMPERATURE,
        }
        if is_json:
            kwargs["response_format"] = {"type": "json_object"}
            
        # Give local AI a hint to return strictly JSON if required
        if is_json:
            messages[0]["content"] += "\nReturn strictly JSON data. Do not add markdown blocks like ```json."
            
        response = client.chat.completions.create(**kwargs)
        text = response.choices[0].message.content
        if is_json:
            text = text.strip()
            if text.startswith("```json"): text = text[7:]
            if text.startswith("```"): text = text[3:]
            if text.endswith("```"): text = text[:-3]
            return json.loads(text.strip())
        return text


def call_ai_normalization(user_api_key: str, file_bytes_list: list, file_mime_types: list,
                          text_content: str = "", model_name: str = "gemini-3.5-flash",
                          figure_manifest: list = None, ai_provider: str = "gemini", ai_base_url: str = None):
    """Single-shot normalization for raw text and/or a handful of images (used for
    pasted text, standalone image uploads, and DOCX-derived content)."""
    client_info = init_client(user_api_key, ai_provider, ai_base_url)

    contents = []
    for fb, mime in zip(file_bytes_list, file_mime_types):
        if mime and mime.startswith("image/"):
            img = _open_image(fb)
            if img is not None:
                contents.append(img)

    if text_content:
        contents.append(text_content)

    user_prompt = f"""
    IMPORTANT:
    - Do NOT invent answers or solutions if they are not present in the source.
    - Convert the content of the provided images or text into LaTeX following the system rules.
    - CRITICAL: If you see an answer key or answer table on any page (even at the very end), you MUST use it to map the correct answers back to the corresponding questions and mark them with \\True.
    - Return JSON strictly following the schema.

    Detected figures (Asset Manifest):
    {_figure_manifest_text(figure_manifest or [])}
    """
    contents.append(user_prompt)

    return _generate(client_info, model_name, contents)


def _call_ai_vision_batch(client_info, page_image_paths: list, figure_manifest: list,
                          model_name: str) -> list:
    """Normalize one batch of full page images (+ the figures on those pages).
    Returns a list of question dicts (may be empty)."""
    contents = []

    # Full page images first, then the cropped figures (the prompt tells the model
    # the cropped images come after the pages and to reference them by filename).
    for p in page_image_paths:
        img = _open_image(p)
        if img is not None:
            contents.append(img)
    for f in figure_manifest:
        img = _open_image(f.get("path"))
        if img is not None:
            contents.append(img)

    user_prompt = f"""
    IMPORTANT:
    - Do NOT invent answers or solutions if they are not present in the source.
    - Convert the content of the page images into LaTeX following the system rules.
    - Insert figures with \\includegraphics using the exact filename and scale from
      the Asset Manifest below. Never write placeholder text, never draw figures with TikZ.
    - Return JSON strictly following the schema.

    Detected figures (Asset Manifest):
    {_figure_manifest_text(figure_manifest)}
    """
    contents.append(user_prompt)

    parsed = _generate(client_info, model_name, contents)
    if isinstance(parsed, dict) and isinstance(parsed.get("questions"), list):
        return parsed["questions"]
    return []


def _map_answers_pass(client_info, model_name: str, questions: list, page_images: list) -> list:
    import re
    if not questions or len(page_images) <= 3:
        return questions
        
    ref_images = page_images[-2:]
    contents = []
    for p in ref_images:
        img = _open_image(p)
        if img: contents.append(img)
        
    user_prompt = """
    Hãy nhìn vào các hình ảnh đính kèm (có thể chứa Bảng đáp án ở trang cuối).
    Hãy trích xuất bảng đáp án đó thành JSON.
    Đối với câu trắc nghiệm (mc): Trả về ký tự A, B, C, D.
    Đối với câu đúng/sai (tf): Trả về mảng 4 giá trị boolean (true/false) tương ứng với a, b, c, d.
    Đối với câu trả lời ngắn (sa): Trả về chuỗi kết quả.
    
    Chỉ trả về JSON dựa theo schema.
    """
    contents.append(user_prompt)
    
    MAP_SCHEMA = {
        "type": "object",
        "properties": {
            "answers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "question_number": {"type": "integer"},
                        "type": {"type": "string", "enum": ["mc", "tf", "sa"]},
                        "answer_mc": {"type": "string"},
                        "answer_tf": {
                            "type": "array",
                            "items": {"type": "boolean"}
                        },
                        "answer_sa": {"type": "string"}
                    }
                }
            }
        }
    }
    
    try:
        parsed = _generate(client_info, model_name, contents, is_json=True, schema=MAP_SCHEMA, system_instruction="")
        ans_list = parsed.get("answers", [])
        ans_map = {item["question_number"]: item for item in ans_list if "question_number" in item}
        
        # Now apply the answers to the questions
        for n, q in enumerate(questions, 1):
            if n in ans_map:
                ans = ans_map[n]
                q_type = q.get("type", "multi_choice")
                latex = q.get("latex_code", "")
                
                if q_type == "multi_choice" and ans.get("answer_mc"):
                    letter = ans["answer_mc"].strip().upper()
                    # A=0, B=1, C=2, D=3
                    idx = ord(letter) - ord('A') if len(letter) == 1 and 'A' <= letter <= 'D' else -1
                    if idx >= 0:
                        # Find all {Option} blocks after \choice
                        parts = re.split(r'(\{[^{}]*\})', latex)
                        opt_count = 0
                        for i in range(len(parts)):
                            if parts[i].startswith('{') and parts[i].endswith('}'):
                                if '\\choice' in ''.join(parts[:i]):
                                    # this might be an option
                                    if not parts[i].startswith('{\\True'):
                                        if opt_count == idx:
                                            parts[i] = '{\\True ' + parts[i][1:]
                                    opt_count += 1
                                    if opt_count >= 4:
                                        break
                        q["latex_code"] = "".join(parts)
                        
                elif q_type == "true_false" and ans.get("answer_tf") and len(ans["answer_tf"]) == 4:
                    parts = re.split(r'(\{[^{}]*\})', latex)
                    opt_count = 0
                    for i in range(len(parts)):
                        if parts[i].startswith('{') and parts[i].endswith('}'):
                            if '\\choiceTF' in ''.join(parts[:i]):
                                if not parts[i].startswith('{\\True'):
                                    if opt_count < 4 and ans["answer_tf"][opt_count]:
                                        parts[i] = '{\\True ' + parts[i][1:]
                                opt_count += 1
                                if opt_count >= 4:
                                    break
                    q["latex_code"] = "".join(parts)
                    
                elif q_type == "short_answer" and ans.get("answer_sa"):
                    val = ans["answer_sa"]
                    q["latex_code"] = re.sub(r'\\shortans\{[^\}]*\}', f'\\shortans{{{val}}}', latex)
                    
        return questions
    except Exception as e:
        print("Warning: Answer mapping pass failed:", e)
        return questions

def normalize_pages_parallel(user_api_key: str, page_images: list, figure_manifest: list,
                             model_name: str = "gemini-3.5-flash", progress_cb=None,
                             ai_provider: str = "gemini", ai_base_url: str = None) -> dict:
    """Normalize a multi-page document using overlapping batches and a two-pass mapping strategy."""
    client_info_default = init_client(user_api_key, ai_provider, ai_base_url)

    total_pages = len(page_images)
    BATCH_SIZE = 2
    STRIDE = 1
    
    batches = []
    batch_indices = []
    i = 0
    while i < total_pages:
        end = min(i + BATCH_SIZE, total_pages)
        batches.append(page_images[i:end])
        batch_indices.append((i, end))
        if end == total_pages:
            break
        i += STRIDE

    results_map: dict[int, list] = {}
    errors: list[str] = []
    done_pages = 0

    def run_batch(batch_idx: int):
        client_info_batch = init_client(user_api_key, ai_provider, ai_base_url, batch_idx=batch_idx)
        start, end = batch_indices[batch_idx]
        batch_figs = [f for f in figure_manifest if start <= f.get("page", -1) < end]
        return _call_ai_vision_batch(client_info_batch, batches[batch_idx], batch_figs, model_name)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(run_batch, i): i for i in range(len(batches))}
        for future in as_completed(futures):
            idx = futures[future]
            try:
                results_map[idx] = future.result()
            except Exception as e:
                errors.append(f"batch {idx}: {type(e).__name__}: {e}")
                results_map[idx] = []
            done_pages += len(batches[idx])
            if progress_cb:
                try:
                    progress_cb(done_pages, sum(len(b) for b in batches))
                except Exception:
                    pass

    if errors and not any(results_map.values()):
        raise RuntimeError("; ".join(errors))

    import re
    from difflib import SequenceMatcher
    
    def normalize_text(t):
        return re.sub(r'[^a-zA-Z0-9]', '', t).lower()
        
    def get_digits(t):
        return re.sub(r'[^0-9]', '', t)

    questions = []
    for idx in sorted(results_map.keys()):
        batch_qs = results_map[idx]
        for q in batch_qs:
            q_str = (q.get("content", "") or "") + (q.get("latex_code", "") or "")
            q_norm = normalize_text(q_str)
            if not q_norm:
                questions.append(q)
                continue
                
            is_dup = False
            # Check against the last 20 questions only.
            # This safely merges overlapping duplicates but PRESERVES the Solution section 
            # (which appears much later) as distinct questions.
            start_idx = max(0, len(questions) - 20)
            for prev_idx in range(start_idx, len(questions)):
                prev_q = questions[prev_idx]
                prev_str = (prev_q.get("content", "") or "") + (prev_q.get("latex_code", "") or "")
                prev_norm = normalize_text(prev_str)
                min_len = min(len(q_norm), len(prev_norm))
                
                if min_len < 30:
                    if len(q_norm) > 0 and len(prev_norm) > 0:
                        sim = SequenceMatcher(None, q_norm, prev_norm).ratio()
                        if sim > 0.9 and get_digits(q_norm[:30]) == get_digits(prev_norm[:30]):
                            if len(q_norm) > len(prev_norm):
                                questions[prev_idx] = q
                            is_dup = True
                            break
                else:
                    prefix_q = q_norm[:min_len]
                    prefix_p = prev_norm[:min_len]
                    prefix_sim = SequenceMatcher(None, prefix_q, prefix_p).ratio()
                    if prefix_sim > 0.85 and get_digits(prefix_q[:30]) == get_digits(prefix_p[:30]):
                        if len(q_norm) > len(prev_norm):
                            questions[prev_idx] = q
                        is_dup = True
                        break
            
            if not is_dup:
                questions.append(q)

    # Renumber sequentially
    for n, q in enumerate(questions, 1):
        q["id"] = n
        
    # Pass 2: Map answers if there were multiple batches and we have enough pages
    if len(batches) > 1:
        questions = _map_answers_pass(client_info_default, model_name, questions, page_images)

    return {"questions": questions}


def call_ai_chat(user_api_key: str, prompt: str, history: list = [], model_name: str = "gemini-3.5-flash",
                 ai_provider: str = "gemini", ai_base_url: str = None):
    client_info = init_client(user_api_key, ai_provider, ai_base_url)

    contents = []
    for msg in history:
        contents.append(
            types.Content(
                role=msg["role"],
                parts=[types.Part.from_text(text=msg["content"])]
            )
        )

    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=prompt)]
        )
    )

    sys_inst = "You are a helpful teaching assistant AI. You help teachers format questions in LaTeX, generate new math/physics questions, and explain solutions. Respond in Vietnamese."
    
    # We want text response here
    return _generate(client_info, model_name, contents, is_json=False, system_instruction=sys_inst)
