"use client";

import { useState, useRef, useEffect } from "react";
import { aiApi, ChatMessage, NormalizeProgress } from "@/lib/ai-api";
import LatexRenderer from "@/components/LatexRenderer";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/lib/toastStore";

function FloatingChatbotContent() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "normalize">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [normalizeResult, setNormalizeResult] = useState<any>(null);
  const [progress, setProgress] = useState<NormalizeProgress | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check if API Key or Local AI is configured
  const isConfigured =
    typeof window !== "undefined" &&
    (() => {
      const p = localStorage.getItem("ai_provider") || "gemini";
      if (p === "gemini") return !!localStorage.getItem("gemini_api_key");
      return !!localStorage.getItem("ai_base_url");
    })();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSendMessage = async () => {
    if (!input.trim() && selectedFiles.length === 0) return;

    if (mode === "chat") {
      const newUserMsg: ChatMessage = { role: "user", content: input };
      setMessages((prev) => [...prev, newUserMsg]);
      setInput("");
      setIsLoading(true);

      try {
        const data = await aiApi.chat(newUserMsg.content, messages);
        setMessages((prev) => [
          ...prev,
          { role: "model", content: data.response },
        ]);
      } catch (err) {
        toast.error("Lỗi: " + (err as Error).message);
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsLoading(true);
      setProgress({ status: "processing", stage: "queued" });
      try {
        const data = await aiApi.normalize(input, selectedFiles, setProgress);
        setNormalizeResult(data);
        setInput("");
        setSelectedFiles([]);
      } catch (err) {
        toast.error("Lỗi: " + (err as Error).message);
      } finally {
        setIsLoading(false);
        setProgress(null);
      }
    }
  };

  const stageLabel = (s?: string) =>
    s === "layout"
      ? "Đang phân tích bố cục (YOLO)"
      : s === "ai"
        ? "Đang chuẩn hóa bằng AI"
        : "Đang chuẩn bị";

  return (
    <>
      <style>{`
        .chatbot-btn {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          width: 3.5rem;
          height: 3.5rem;
          background: linear-gradient(to right, #2563eb, #9333ea);
          border-radius: 9999px;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          cursor: pointer;
          border: none;
          z-index: 9999;
          transition: transform 0.2s;
        }
        .chatbot-btn:hover {
          transform: scale(1.1);
        }
        .chatbot-window {
          position: fixed;
          bottom: 6rem;
          right: 1.5rem;
          width: 400px;
          max-width: calc(100vw - 3rem);
          height: 600px;
          max-height: 80vh;
          background: white;
          border-radius: 1rem;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
          border: 1px solid #e5e7eb;
          display: flex;
          flex-direction: column;
          z-index: 9999;
          overflow: hidden;
        }
        .chatbot-header {
          background: linear-gradient(to right, #2563eb, #9333ea);
          padding: 1rem;
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .chatbot-tabs {
          display: flex;
          border-bottom: 1px solid #e5e7eb;
        }
        .chatbot-tab {
          flex: 1;
          padding: 0.75rem;
          font-size: 0.875rem;
          font-weight: 500;
          background: none;
          border: none;
          cursor: pointer;
          color: #6b7280;
        }
        .chatbot-tab.active-chat {
          border-bottom: 2px solid #2563eb;
          color: #2563eb;
        }
        .chatbot-tab.active-norm {
          border-bottom: 2px solid #9333ea;
          color: #9333ea;
        }
        .chatbot-body {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          background: #f9fafb;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .msg-row {
          display: flex;
        }
        .msg-user { justify-content: flex-end; }
        .msg-bot { justify-content: flex-start; }
        .msg-bubble {
          max-width: 85%;
          border-radius: 1rem;
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
        }
        .msg-bubble.user {
          background: #2563eb;
          color: white;
          border-bottom-right-radius: 0;
        }
        .msg-bubble.bot {
          background: white;
          color: #1f2937;
          border: 1px solid #e5e7eb;
          border-bottom-left-radius: 0;
        }
        .chatbot-input-area {
          padding: 0.75rem;
          background: white;
          border-top: 1px solid #e5e7eb;
          display: flex;
          align-items: flex-end;
          gap: 0.5rem;
        }
        .chatbot-input {
          flex: 1;
          background: #f3f4f6;
          border-radius: 0.75rem;
          padding: 0.75rem;
          font-size: 0.875rem;
          border: none;
          outline: none;
          resize: none;
          min-height: 40px;
          max-height: 100px;
        }
        .chatbot-send {
          padding: 0.5rem;
          border-radius: 0.75rem;
          color: white;
          border: none;
          cursor: pointer;
        }
        .chatbot-send.chat { background: #2563eb; }
        .chatbot-send.norm { background: #9333ea; }
        .chatbot-send:disabled { opacity: 0.5; cursor: not-allowed; }
        @keyframes bounce {
          0%, 100% { transform: translateY(-25%); animation-timing-function: cubic-bezier(0.8, 0, 1, 1); }
          50% { transform: translateY(0); animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .dot {
          width: 6px; height: 6px; background: #9ca3af; border-radius: 50%;
          animation: bounce 1s infinite;
        }
      `}</style>

      {/* Floating Button */}
      <button onClick={() => setIsOpen(!isOpen)} className="chatbot-btn">
        {isOpen ? (
          <svg
            style={{ width: "24px", height: "24px" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <span style={{ fontWeight: "bold", fontSize: "var(--font-size-lg)" }}>AI</span>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="chatbot-window">
          {/* Header */}
          <div className="chatbot-header">
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  background: "rgba(255,255,255,0.2)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--font-size-lg)",
                }}
              >
                AI
              </div>
              <div>
                <h3 style={{ fontWeight: "bold", margin: 0, fontSize: "var(--font-size-md)" }}>
                  AI
                </h3>
                <p style={{ fontSize: "var(--font-size-xs)", opacity: 0.8, margin: 0 }}>
                  {typeof window !== "undefined"
                    ? (() => {
                        const p =
                          localStorage.getItem("ai_provider") || "gemini";
                        if (p === "gemini") {
                          const m = localStorage.getItem("gemini_model");
                          const valid = [
                            "gemini-3.5-flash",
                            "gemini-3.5-live-translate-preview",
                            "gemini-3.1-flash-lite",
                            "gemini-3-flash-preview",
                          ];
                          return m && valid.includes(m)
                            ? m
                            : "gemini-3.5-flash";
                        } else {
                          return (
                            localStorage.getItem("ai_model") || "Local AI Model"
                          );
                        }
                      })()
                    : "gemini-3.5-flash"}
                </p>
              </div>
            </div>
          </div>

          {!isConfigured ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "1.5rem",
                textAlign: "center",
              }}
            >
              <h3
                style={{
                  fontSize: "1.125rem",
                  fontWeight: "bold",
                  color: "#1f2937",
                  margin: "0 0 0.5rem 0",
                }}
              >
                Chưa cấu hình AI
              </h3>
              <p
                style={{
                  fontSize: "var(--font-size-base)",
                  color: "#6b7280",
                  margin: "0 0 1rem 0",
                }}
              >
                Bạn cần thiết lập API Key hoặc cấu hình Local AI để sử dụng tính
                năng này.
              </p>
              <a
                href="/ai"
                style={{
                  background: "var(--accent-primary)",
                  color: "var(--text-on-accent)",
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Đến trang Cài đặt AI
              </a>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="chatbot-tabs">
                <button
                  className={`chatbot-tab ${mode === "chat" ? "active-chat" : ""}`}
                  onClick={() => setMode("chat")}
                >
                  Trò chuyện
                </button>
                <button
                  className={`chatbot-tab ${mode === "normalize" ? "active-norm" : ""}`}
                  onClick={() => setMode("normalize")}
                >
                  Chuẩn hóa
                </button>
              </div>

              {/* Body */}
              <div className="chatbot-body">
                {mode === "chat" ? (
                  <>
                    {messages.length === 0 && (
                      <div
                        style={{
                          textAlign: "center",
                          color: "#9ca3af",
                          marginTop: "2.5rem",
                          fontSize: "var(--font-size-base)",
                        }}
                      >
                        <p>
                          Hãy yêu cầu mình tạo một đề thi hoặc giải thích bài
                          tập nhé!
                        </p>
                      </div>
                    )}
                    {messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`msg-row ${msg.role === "user" ? "msg-user" : "msg-bot"}`}
                      >
                        <div
                          className={`msg-bubble ${msg.role === "user" ? "user" : "bot"}`}
                        >
                          <LatexRenderer content={msg.content} />
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="msg-row msg-bot">
                        <div
                          className="msg-bubble bot"
                          style={{
                            display: "flex",
                            gap: "4px",
                            padding: "0.75rem 1rem",
                          }}
                        >
                          <div
                            className="dot"
                            style={{ animationDelay: "0s" }}
                          ></div>
                          <div
                            className="dot"
                            style={{ animationDelay: "0.2s" }}
                          ></div>
                          <div
                            className="dot"
                            style={{ animationDelay: "0.4s" }}
                          ></div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                ) : (
                  <div
                    style={{
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {isLoading ? (
                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          color: "#6b7280",
                          padding: "1rem",
                        }}
                      >
                        <div
                          style={{
                            width: "40px",
                            height: "40px",
                            border: "3px solid #e5e7eb",
                            borderTopColor: "#9333ea",
                            borderRadius: "50%",
                            animation: "spin 0.8s linear infinite",
                            marginBottom: "1rem",
                          }}
                        />
                        <p
                          style={{
                            fontSize: "0.9rem",
                            fontWeight: 600,
                            margin: "0 0 0.5rem 0",
                            color: "#374151",
                          }}
                        >
                          {stageLabel(progress?.stage)}
                        </p>
                        {progress?.total ? (
                          <>
                            <div
                              style={{
                                width: "100%",
                                maxWidth: "240px",
                                height: "8px",
                                background: "var(--border)",
                                borderRadius: "9999px",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.round(((progress.progress || 0) / progress.total) * 100)}%`,
                                  height: "100%",
                                  background:
                                    "linear-gradient(to right,#2563eb,#9333ea)",
                                  transition: "width 0.3s",
                                }}
                              />
                            </div>
                            <p
                              style={{
                                fontSize: "0.8rem",
                                marginTop: "0.5rem",
                              }}
                            >
                              {progress.progress || 0}/{progress.total} trang
                            </p>
                          </>
                        ) : (
                          <p style={{ fontSize: "0.8rem" }}>
                            Vui lòng đợi, đề nhiều trang có thể mất một lúc…
                          </p>
                        )}
                      </div>
                    ) : !normalizeResult ? (
                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          color: "#9ca3af",
                        }}
                      >
                        <svg
                          style={{
                            width: "48px",
                            height: "48px",
                            marginBottom: "0.5rem",
                            color: "#d1d5db",
                          }}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <p style={{ fontSize: "var(--font-size-base)" }}>
                          Tải ảnh/PDF/Word lên hoặc paste text thô vào ô bên
                          dưới để chuẩn hóa.
                        </p>
                      </div>
                    ) : (
                      <div style={{ marginTop: "1rem" }}>
                        <div
                          style={{
                            padding: "0.75rem",
                            background: "rgba(52,211,153,0.1)",
                            border: "1px solid var(--accent-success)",
                            borderRadius: "0.5rem",
                            color: "var(--accent-success)",
                            fontWeight: 500,
                            marginBottom: "0.75rem",
                          }}
                        >
                          ✓ Đã chuẩn hóa xong{" "}
                          {normalizeResult?.questions?.length ??
                            (Array.isArray(normalizeResult)
                              ? normalizeResult.length
                              : 1)}{" "}
                          câu hỏi.
                        </div>
                        <button
                          onClick={() => {
                            localStorage.setItem(
                              "ai_normalized_questions",
                              JSON.stringify(normalizeResult),
                            );
                            window.location.href =
                              "/questions/upload?source=ai";
                          }}
                          style={{
                            width: "100%",
                            padding: "0.75rem",
                            background: "var(--accent-primary)",
                            color: "var(--text-on-accent)",
                            border: "none",
                            borderRadius: "0.5rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <svg
                            style={{ width: "18px", height: "18px" }}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                            />
                          </svg>
                          Xem trước & Lưu câu hỏi
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Input Area */}
              <div
                style={{
                  padding: "0.75rem",
                  background: "var(--bg-surface)",
                  borderTop: "1px solid var(--border)",
                }}
              >
                {selectedFiles.length > 0 && mode === "normalize" && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    {selectedFiles.map((f, i) => (
                      <div
                        key={i}
                        style={{
                          background: "var(--tone-purple-bg)",
                          color: "var(--tone-purple-text)",
                          fontSize: "var(--font-size-xs)",
                          padding: "0.25rem 0.5rem",
                          borderRadius: "0.25rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "80px",
                          }}
                        >
                          {f.name}
                        </span>
                        <button
                          onClick={() =>
                            setSelectedFiles((files) =>
                              files.filter((_, idx) => idx !== i),
                            )
                          }
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontWeight: "bold",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "0.5rem",
                  }}
                >
                  {mode === "normalize" && (
                    <>
                      <input
                        type="file"
                        multiple
                        accept="image/*,.pdf,.docx"
                        style={{ display: "none" }}
                        ref={fileInputRef}
                        onChange={(e) => {
                          if (e.target.files)
                            setSelectedFiles(Array.from(e.target.files));
                        }}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          padding: "0.5rem",
                          color: "#6b7280",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          borderRadius: "0.5rem",
                        }}
                      >
                        <svg
                          style={{ width: "20px", height: "20px" }}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                          />
                        </svg>
                      </button>
                    </>
                  )}

                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={
                      mode === "chat"
                        ? "Nhập tin nhắn..."
                        : "Paste văn bản thô..."
                    }
                    className="chatbot-input"
                  />

                  <button
                    onClick={handleSendMessage}
                    disabled={
                      isLoading || (!input.trim() && selectedFiles.length === 0)
                    }
                    className={`chatbot-send ${mode === "chat" ? "chat" : "norm"}`}
                  >
                    {isLoading ? (
                      <span style={{ fontSize: "var(--font-size-xs)" }}>...</span>
                    ) : (
                      <svg
                        style={{ width: "20px", height: "20px" }}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default function FloatingChatbot() {
  const { user, isLoading } = useAuth();

  if (isLoading || user?.role !== "teacher") return null;
  return <FloatingChatbotContent />;
}
