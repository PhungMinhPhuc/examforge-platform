"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/lib/toastStore";
import Combobox from "@/components/Combobox";
import { Icon } from "@/components/icons";

export default function AISettingsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [provider, setProvider] = useState("gemini");
  const [geminiApiKeys, setGeminiApiKeys] = useState<string[]>([""]);
  const [geminiModel, setGeminiModel] = useState("gemini-3.5-flash");

  useEffect(() => {
    if (!isLoading && user?.role !== "teacher") router.replace("/dashboard");
  }, [isLoading, user?.role, router]);

  const [localBaseUrl, setLocalBaseUrl] = useState("");
  const [localApiKey, setLocalApiKey] = useState("");
  const [localModel, setLocalModel] = useState("qwen2-vl-7b-instruct");

  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    // Load existing settings
    const p = localStorage.getItem("ai_provider");
    if (p) setProvider(p);

    const gk = localStorage.getItem("gemini_api_key");
    if (gk) {
      const keys = gk
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      if (keys.length > 0) setGeminiApiKeys(keys);
    }

    const gm = localStorage.getItem("gemini_model");
    const validModels = [
      "gemini-3.5-flash",
      "gemini-3.5-live-translate-preview",
      "gemini-3.1-flash-lite",
      "gemini-3-flash-preview",
    ];
    if (gm && validModels.includes(gm)) {
      setGeminiModel(gm);
    }

    const lb = localStorage.getItem("ai_base_url");
    if (lb) setLocalBaseUrl(lb);

    const la = localStorage.getItem("ai_api_key");
    if (la) setLocalApiKey(la);

    const lm = localStorage.getItem("ai_model");
    if (lm) setLocalModel(lm);
  }, []);

  const handleSave = () => {
    localStorage.setItem("ai_provider", provider);

    const validKeys = geminiApiKeys.map((k) => k.trim()).filter(Boolean);
    if (validKeys.length > 0)
      localStorage.setItem("gemini_api_key", validKeys.join(","));
    else localStorage.removeItem("gemini_api_key");
    localStorage.setItem("gemini_model", geminiModel);

    if (localBaseUrl.trim())
      localStorage.setItem("ai_base_url", localBaseUrl.trim());
    else localStorage.removeItem("ai_base_url");

    if (localApiKey.trim())
      localStorage.setItem("ai_api_key", localApiKey.trim());
    else localStorage.removeItem("ai_api_key");

    if (localModel.trim()) localStorage.setItem("ai_model", localModel.trim());
    else localStorage.removeItem("ai_model");

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);

    // Reload the page to ensure the floating chatbot catches the new key
    window.location.reload();
  };

  const handleClear = () => {
    localStorage.removeItem("ai_provider");
    localStorage.removeItem("gemini_api_key");
    localStorage.removeItem("gemini_model");
    localStorage.removeItem("ai_base_url");
    localStorage.removeItem("ai_api_key");
    localStorage.removeItem("ai_model");
    toast.success("Đã xóa toàn bộ cấu hình AI!");
    setTimeout(() => window.location.reload(), 600);
  };

  if (isLoading || user?.role !== "teacher") return null;

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        <PageHeader
          title="Cài đặt AI"
          description="Cấu hình kết nối AI cho tài khoản của bạn"
        />

        <div className="card" style={{ maxWidth: "800px", margin: "0 auto" }}>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            {/* Provider Tabs */}
            <div
              style={{
                display: "flex",
                gap: "1rem",
                borderBottom: "1px solid var(--border)",
                paddingBottom: "1rem",
              }}
            >
              <button
                onClick={() => setProvider("gemini")}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "var(--radius-md)",
                  fontWeight: 600,
                  backgroundColor:
                    provider === "gemini"
                      ? "var(--accent-primary)"
                      : "transparent",
                  color:
                    provider === "gemini" ? "white" : "var(--text-secondary)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Google Gemini API
              </button>
              <button
                onClick={() => setProvider("local")}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "var(--radius-md)",
                  fontWeight: 600,
                  backgroundColor:
                    provider === "local"
                      ? "var(--accent-primary)"
                      : "transparent",
                  color:
                    provider === "local" ? "white" : "var(--text-secondary)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Local AI (OpenAI Compatible)
              </button>
            </div>

            {provider === "gemini" && (
              <div
                style={{
                  background: "var(--bg-hover)",
                  padding: "1.5rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <label style={{ fontWeight: "600" }}>Gemini API Keys</label>
                  <button
                    className="ui-button ui-button--primary ui-button--small"
                    type="button"
                    onClick={() => setGeminiApiKeys([...geminiApiKeys, ""])}
                  >
                    <Icon name="plus" />
                    <span>Thêm Key</span>
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      flex: 2,
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      maxHeight: "160px",
                      overflowY: "auto",
                      paddingRight: "0.5rem",
                    }}
                  >
                    {geminiApiKeys.map((key, index) => (
                      <div
                        key={index}
                        style={{ display: "flex", gap: "0.5rem" }}
                      >
                        <input
                          type="password"
                          value={key}
                          onChange={(e) => {
                            const newKeys = [...geminiApiKeys];
                            newKeys[index] = e.target.value;
                            setGeminiApiKeys(newKeys);
                          }}
                          placeholder="Nhập API Key (VD: AIzaSy...)"
                          className="ui-input-native"
                          style={{ flex: 1, fontFamily: "monospace" }}
                        />
                        <button
                          className="ui-button ui-button--danger ui-button--icon"
                          type="button"
                          aria-label="Xóa API key"
                          onClick={() => {
                            if (geminiApiKeys.length > 1) {
                              setGeminiApiKeys(
                                geminiApiKeys.filter((_, i) => i !== index),
                              );
                            } else {
                              setGeminiApiKeys([""]);
                            }
                          }}
                        >
                          <Icon name="x" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{ position: "relative", flex: 1, minWidth: "160px" }}
                  >
                    <Combobox
                      value={geminiModel}
                      onChange={(value) => setGeminiModel(String(value))}
                      options={[
                        {
                          value: "gemini-3.5-flash",
                          label: "Gemini 3.5 Flash",
                        },
                        {
                          value: "gemini-3.5-live-translate-preview",
                          label: "Gemini 3.5 Live Translate",
                        },
                        {
                          value: "gemini-3.1-flash-lite",
                          label: "Gemini 3.1 Flash Lite",
                        },
                        {
                          value: "gemini-3-flash-preview",
                          label: "Gemini 3 Flash",
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>
            )}

            {provider === "local" && (
              <div
                style={{
                  background: "var(--bg-hover)",
                  padding: "1.5rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontWeight: "600",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Base URL
                  </label>
                  <input
                    type="text"
                    value={localBaseUrl}
                    onChange={(e) => setLocalBaseUrl(e.target.value)}
                    placeholder="VD: http://localhost:11434/v1 (Ollama) hoặc http://localhost:1234/v1 (LM Studio)"
                    className="ui-input-native"
                    style={{ width: "100%", fontFamily: "monospace" }}
                  />
                </div>
                <div style={{ display: "flex", gap: "1rem" }}>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        display: "block",
                        fontWeight: "600",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Tên Model (Model Name)
                    </label>
                    <input
                      type="text"
                      value={localModel}
                      onChange={(e) => setLocalModel(e.target.value)}
                      placeholder="VD: qwen2-vl-7b-instruct"
                      className="ui-input-native"
                      style={{ width: "100%", fontFamily: "monospace" }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        display: "block",
                        fontWeight: "600",
                        marginBottom: "0.5rem",
                      }}
                    >
                      API Key (Tuỳ chọn)
                    </label>
                    <input
                      type="password"
                      value={localApiKey}
                      onChange={(e) => setLocalApiKey(e.target.value)}
                      placeholder="Thường là lm-studio hoặc ollama"
                      className="ui-input-native"
                      style={{ width: "100%", fontFamily: "monospace" }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
              <button
                onClick={handleSave}
                className="ui-button ui-button--primary"
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                {isSaved ? "Đã lưu" : "Lưu cài đặt"}
              </button>
              <button
                onClick={handleClear}
                className="ui-button ui-button--danger-tonal"
              >
                <Icon name="trash" />
                Xóa cấu hình
              </button>
            </div>

            {/* Instruction Guide */}
            <div>
              {provider === "gemini" ? (
                <>
                  <h3
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: "bold",
                      marginBottom: "1rem",
                    }}
                  >
                    Hướng dẫn lấy Gemini API Key
                  </h3>
                  <ol
                    style={{
                      paddingLeft: "1.5rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <li>
                      Truy cập vào{" "}
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "var(--accent-primary)",
                          textDecoration: "underline",
                        }}
                      >
                        Google AI Studio
                      </a>
                    </li>
                    <li>Đăng nhập và tạo API key mới.</li>
                  </ol>
                  <p
                    style={{
                      marginTop: "1rem",
                      fontSize: "0.9rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    * Mẹo: Bạn có thể nhập <strong>nhiều API Keys</strong> cách
                    nhau bằng dấu phẩy (,) để hệ thống gộp sức mạnh và vượt qua
                    giới hạn Rate Limit!
                  </p>
                </>
              ) : (
                <>
                  <h3
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: "bold",
                      marginBottom: "1rem",
                    }}
                  >
                    Hướng dẫn kết nối Local AI
                  </h3>
                  <ol
                    style={{
                      paddingLeft: "1.5rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <li>
                      Mở phần mềm <strong>LM Studio</strong> hoặc{" "}
                      <strong>Ollama</strong>.
                    </li>
                    <li>
                      Tải về một mô hình Vision, ví dụ:{" "}
                      <strong>Qwen2-VL-7B</strong> (được khuyên dùng cho
                      Toán/Lý).
                    </li>
                    <li>
                      Bật Local Server (chạy ở cổng mặc định 1234 cho LM Studio
                      hoặc 11434 cho Ollama).
                    </li>
                    <li>
                      Đảm bảo Base URL có hậu tố <code>/v1</code>, ví dụ:{" "}
                      <code>http://localhost:1234/v1</code>
                    </li>
                  </ol>
                  <p
                    style={{
                      marginTop: "1rem",
                      fontSize: "0.9rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    * Lợi ích: Không giới hạn tốc độ, không tốn tiền API, hoàn
                    toàn riêng tư.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
