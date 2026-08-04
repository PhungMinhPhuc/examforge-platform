import { API_URL as API_BASE_URL } from "./api";

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export interface NormalizeProgress {
  status: "processing" | "done" | "error";
  stage?: string; // "queued" | "layout" | "ai"
  progress?: number;
  total?: number;
}

export function getAiHeaders() {
  const provider = localStorage.getItem("ai_provider") || "gemini";
  const headers: Record<string, string> = {
    "X-AI-Provider": provider,
  };

  if (provider === "gemini") {
    const apiKey = localStorage.getItem("gemini_api_key");
    if (!apiKey)
      throw new Error(
        "Vui lòng thiết lập Gemini API Key trong phần cài đặt AI.",
      );
    let model = localStorage.getItem("gemini_model") || "gemini-3.5-flash";
    const valid = [
      "gemini-3.5-flash",
      "gemini-3.5-live-translate-preview",
      "gemini-3.1-flash-lite",
      "gemini-3-flash-preview",
    ];
    if (!valid.includes(model)) model = "gemini-3.5-flash";

    headers["X-Gemini-API-Key"] = apiKey;
    headers["X-Gemini-Model"] = model;
  } else {
    const baseUrl = localStorage.getItem("ai_base_url");
    const apiKey = localStorage.getItem("ai_api_key");
    const model = localStorage.getItem("ai_model") || "qwen2-vl-7b-instruct";
    if (!baseUrl) throw new Error("Vui lòng thiết lập Base URL cho Local AI.");

    headers["X-AI-Base-URL"] = baseUrl;
    if (apiKey) headers["X-AI-API-Key"] = apiKey;
    headers["X-AI-Model"] = model;
  }

  return headers;
}

export const aiApi = {
  /**
   * Normalizes text/images/docx/pdf into structured JSON/LaTeX using AI.
   *
   * The backend runs the work as a job and may return a job_id to poll, so this
   * starts the job, then polls until done while reporting progress via onProgress.
   * Returns the result object `{ questions: [...] }`.
   */
  normalize: async (
    text?: string,
    files?: File[],
    onProgress?: (p: NormalizeProgress) => void,
  ) => {
    const formData = new FormData();
    if (text) {
      formData.append("text", text);
    }
    if (files) {
      for (const file of files) {
        formData.append("files", file);
      }
    }

    const authHeaders = {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
      ...getAiHeaders(),
    };

    const res = await fetch(`${API_BASE_URL}/ai/normalize`, {
      method: "POST",
      body: formData,
      headers: authHeaders,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || "Normalization failed");
    }

    const started = await res.json();
    if (started.status === "done") return started.data;

    // Poll the job until it finishes (max ~10 minutes), reporting progress.
    const jobId = started.job_id;
    onProgress?.({
      status: "processing",
      stage: started.stage,
      progress: started.progress,
      total: started.total,
    });

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 400; i++) {
      await sleep(1500);
      const pr = await fetch(`${API_BASE_URL}/ai/normalize/job/${jobId}`, {
        headers: authHeaders,
      });
      if (!pr.ok) {
        const e = await pr.json().catch(() => ({}));
        throw new Error(e.detail || "Normalization failed");
      }
      const pj = await pr.json();
      onProgress?.(pj);
      if (pj.status === "done") return pj.data;
      if (pj.status === "error") throw new Error("Normalization failed");
    }
    throw new Error("Quá thời gian chờ chuẩn hóa (timeout).");
  },

  /**
   * Conversational endpoint for chatting or generating questions.
   */
  chat: async (prompt: string, history: ChatMessage[] = []) => {
    const res = await fetch(`${API_BASE_URL}/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        ...getAiHeaders(),
      },
      body: JSON.stringify({ prompt, history }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || "Chat failed");
    }

    return res.json();
  },
};
