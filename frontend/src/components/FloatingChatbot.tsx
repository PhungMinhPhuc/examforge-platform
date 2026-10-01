"use client";

import { useState, useRef, useEffect } from "react";
import { aiApi, ChatMessage, NormalizeProgress } from "@/lib/ai-api";
import LatexRenderer from "@/components/LatexRenderer";
import { useAuth } from "@/lib/auth-context";
import { Icon } from "@/components/icons";
import { ProgressBar, Spinner } from "@/components/Loading";
import MessageBar from "@/components/MessageBar";

function FloatingChatbotContent() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "normalize">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [normalizeResult, setNormalizeResult] = useState<any>(null);
  const [progress, setProgress] = useState<NormalizeProgress | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [feedbackError, setFeedbackError] = useState("");
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
        setFeedbackError("Lỗi: " + (err as Error).message);
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
        setFeedbackError("Lỗi: " + (err as Error).message);
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
          color: white;
        }
        .chatbot-send.chat { background: #2563eb; }
        .chatbot-send.norm { background: #9333ea; }
        .chatbot-send:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      {/* Floating Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="chatbot-btn"
        aria-label={isOpen ? "Đóng trợ lý AI" : "Mở trợ lý AI"}
      >
        {isOpen ? (
          <Icon name="close" size="var(--icon-size-lg)" />
        ) : (
          <span style={{ fontWeight: "bold", fontSize: "var(--font-size-base)" }}>AI</span>
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
                  fontSize: "var(--font-size-base)",
                }}
              >
                AI
              </div>
              <div>
                <h3 style={{ fontWeight: "bold", margin: 0, fontSize: "var(--font-size-sm)" }}>
                  AI
                </h3>
                <p style={{ fontSize: "var(--font-size-2xs)", opacity: 0.8, margin: 0 }}>
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
                  fontSize: "var(--font-size-md)",
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
                {feedbackError && (
                  <MessageBar
                    className="ui-message-bar--section"
                    intent="error"
                    onDismiss={() => setFeedbackError("")}
                  >
                    {feedbackError}
                  </MessageBar>
                )}
                {mode === "chat" ? (
                  <>
                    {messages.length === 0 && (
                      <div
                        style={{
                          textAlign: "center",
                          color: "var(--text-placeholder)",
                          marginTop: "2.5rem",
                          fontSize: "var(--font-size-md)",
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
                        <div className="msg-bubble bot">
                          <Spinner size="small" label="Đang trả lời …" />
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
                          color: "var(--text-muted)",
                          padding: "var(--space-4)",
                        }}
                      >
                        <Spinner size="large" />
                        <p
                          style={{
                            fontSize: "var(--font-size-sm)",
                            fontWeight: "var(--font-weight-semibold)",
                            margin: "var(--space-4) 0 var(--space-2)",
                            color: "var(--text-primary)",
                          }}
                        >
                          {stageLabel(progress?.stage)}
                        </p>
                        {progress?.total ? (
                          <>
                            <div style={{ width: "100%", maxWidth: "240px" }}>
                              <ProgressBar
                                value={progress.progress || 0}
                                max={progress.total}
                                label="Tiến độ chuẩn hóa tài liệu"
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
                        <Icon
                          name="image"
                          size="var(--icon-size-illustration)"
                          style={{
                            marginBottom: "0.5rem",
                            color: "var(--icon-color-empty-state)",
                          }}
                        />
                        <p style={{ fontSize: "var(--font-size-md)" }}>
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
                          <Icon name="check" size="var(--icon-size-control)" />{" "}
                          Đã chuẩn hóa xong{" "}
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
                          <Icon name="clipboard" size="var(--icon-size-action)" />
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
                          fontSize: "var(--font-size-2xs)",
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
                          type="button"
                          aria-label={`Bỏ tệp ${f.name}`}
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
                          <Icon name="x" />
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
                        type="button"
                        aria-label="Đính kèm tệp"
                        style={{
                          padding: "0.5rem",
                          color: "#6b7280",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          borderRadius: "0.5rem",
                        }}
                      >
                        <Icon name="paper-clip" size="var(--icon-size-md)" />
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
                    className={`ui-button ui-button--icon chatbot-send ${mode === "chat" ? "chat" : "norm"}`}
                    type="button"
                    aria-label="Gửi"
                  >
                    {isLoading ? (
                      <Spinner size="small" />
                    ) : (
                      <Icon name="send" />
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
