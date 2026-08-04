import React, { useState } from "react";
import LatexRenderer from "@/components/LatexRenderer";
import Editor from "@monaco-editor/react";

import Combobox from "@/components/Combobox";

export default function CodingQuestionNode({
  node,
  ans, // this is a JSON string: '{"code": "...", "lang": "cpp"}'
  onCodeChange,
}: {
  node: any;
  ans: string;
  onCodeChange: (code: string, lang: string) => void;
}) {
  let initialCode = "";
  let initialLang = ""; // Default to empty so they are forced to pick

  if (ans) {
    try {
      const parsed = JSON.parse(ans);
      initialCode = parsed.code || "";
      initialLang = parsed.lang || "";
    } catch (e) {
      initialCode = ans;
    }
  }

  const [lang, setLang] = useState(initialLang);
  const [code, setCode] = useState(initialCode);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleLangChange = (newLang: string) => {
    setLang(newLang);
    onCodeChange(code, newLang);
  };

  const autoDetectLang = (text: string) => {
    if (lang !== "") return lang; // Don't auto-detect if already selected
    if (text.includes("public class ") || text.includes("System.out"))
      return "java";
    if (text.includes("#include <iostream>") || text.includes("std::"))
      return "cpp";
    if (text.includes("#include <stdio.h>") || text.includes("printf("))
      return "c";
    if (
      text.includes("def ") ||
      text.includes("import sys") ||
      text.includes("print(")
    )
      return "python";
    return "";
  };

  const handleCodeChange = (newCode: string | undefined) => {
    const c = newCode || "";
    let l = lang;
    if (l === "") {
      const detected = autoDetectLang(c);
      if (detected) {
        setLang(detected);
        l = detected;
      }
    }
    setCode(c);
    onCodeChange(c, l);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Auto detect lang by extension
    const ext = file.name.split(".").pop()?.toLowerCase();
    let detectedLang = lang;
    if (ext === "py") detectedLang = "python";
    else if (ext === "cpp" || ext === "cc" || ext === "cxx")
      detectedLang = "cpp";
    else if (ext === "c") detectedLang = "c";
    else if (ext === "java") detectedLang = "java";

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (detectedLang === "" && ext === "txt") {
        // Fallback if txt or unknown
        detectedLang = autoDetectLang(content) || detectedLang;
      }
      setLang(detectedLang);
      setCode(content);
      onCodeChange(content, detectedLang);
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = "";
  };

  const publicTestcases = (node.coding_testcases || []).filter(
    (tc: any) => tc.is_public,
  );
  const details = node.coding_details || {};

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "0",
        background: "var(--bg-card)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-md)",
        overflow: "hidden",
        minHeight: "600px",
        marginBottom: "2rem",
      }}
    >
      {/* Left side: Problem & Testcases */}
      <div
        style={{
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
          overflowY: "auto",
          maxHeight: "800px",
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: "1.2rem",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span className="badge badge-cd">Câu {node.qNum}</span>
          </div>
          <LatexRenderer
            content={node.content}
            layoutType={node.layout_type}
            images={node.images}
          />
        </div>

        {/* Limits */}
        <div
          style={{
            background: "#f8fafc",
            padding: "1rem",
            borderRadius: "0.5rem",
            fontSize: "0.85rem",
          }}
        >
          <div>
            <strong>Time Limit:</strong> C/C++ {details.time_limit_c_cpp}s, Java{" "}
            {details.time_limit_java}s, Python {details.time_limit_python}s
          </div>
          <div>
            <strong>Memory Limit:</strong> {details.memory_limit} MB
          </div>
        </div>

        {/* Public Testcases */}
        {publicTestcases.length > 0 && (
          <div>
            <h4
              style={{ marginBottom: "1rem", color: "var(--accent-primary)" }}
            >
              Ví dụ (Sample Testcases)
            </h4>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {publicTestcases.map((tc: any, i: number) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      background: "var(--bg-elevated)",
                      padding: "0.5rem 1rem",
                      borderBottom: "1px solid var(--border)",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                    }}
                  >
                    Ví dụ {i + 1}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        padding: "0.75rem 1rem",
                        borderRight: "1px solid var(--border)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-secondary)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Input
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          fontSize: "0.85rem",
                          fontFamily: "monospace",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {tc.input_data}
                      </pre>
                    </div>
                    <div style={{ flex: 1, padding: "0.75rem 1rem" }}>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-secondary)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Output
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          fontSize: "0.85rem",
                          fontFamily: "monospace",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {tc.output_data}
                      </pre>
                    </div>
                  </div>
                  {tc.description && (
                    <div
                      style={{
                        padding: "0.75rem 1rem",
                        fontSize: "0.85rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <strong>Giải thích:</strong> {tc.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right side: Editor */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid var(--border)",
          height: "100%",
          maxHeight: "800px",
          background: "var(--bg-elevated)",
        }}
      >
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "var(--bg-surface)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                Ngôn ngữ:
              </span>
              <Combobox
                className="select"
                style={{ width: "130px", margin: 0 }}
                value={lang}
                onChange={handleLangChange}
                options={[
                  { value: "", label: "Chưa chọn" },
                  { value: "cpp", label: "C++" },
                  { value: "c", label: "C" },
                  { value: "java", label: "Java" },
                  { value: "python", label: "Python" },
                ]}
              />
            </div>

            <input
              type="file"
              accept=".c,.cpp,.py,.java,.txt"
              style={{ display: "none" }}
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button
              className="btn btn-secondary"
              style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginRight: "4px", verticalAlign: "text-bottom" }}
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              Tải file lên
            </button>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Monaco Editor
          </div>
        </div>

        {lang === "" && code.trim() !== "" && (
          <div
            style={{
              padding: "0.5rem 1rem",
              background: "rgba(239, 68, 68, 0.1)",
              borderBottom: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#ef4444",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            Vui lòng chọn trình biên dịch (ngôn ngữ) trước khi nộp bài!
          </div>
        )}

        <div style={{ flex: 1, position: "relative" }}>
          <Editor
            height="100%"
            language={
              lang === "c"
                ? "c"
                : lang === "cpp"
                  ? "cpp"
                  : lang === "java"
                    ? "java"
                    : "python"
            }
            theme="vs-dark"
            value={code}
            onChange={handleCodeChange}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: "on",
            }}
          />
        </div>
      </div>
    </div>
  );
}
