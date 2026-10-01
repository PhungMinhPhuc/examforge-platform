"use client";

import { useState } from "react";
import CodingQuestionNode from "@/components/CodingQuestionNode";
import type { CodingQuestion } from "./types";
import { toast } from "@/lib/toastStore";
import MessageBar from "@/components/MessageBar";

export default function CodingWorkspace({
  question,
  questionNumber,
  onSubmit,
}: {
  question: CodingQuestion;
  questionNumber: number;
  onSubmit: (
    sourceCode: string,
    language: string,
  ) => Promise<{ remaining_submissions: number }>;
}) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState("");
  const used = question.submission_count || 0;
  const limit = question.coding_details.max_submissions || 10;

  const submit = async () => {
    let parsed: { code?: string; lang?: string } = {};
    try {
      parsed = JSON.parse(answer || "{}");
    } catch {
      /* handled below */
    }
    if (!parsed.code?.trim() || !parsed.lang) {
      setValidationError("Hãy nhập code và chọn ngôn ngữ trước khi nộp.");
      return;
    }
    setValidationError("");
    setSubmitting(true);
    try {
      const result = await onSubmit(parsed.code, parsed.lang);
      toast.success(`Đã nhận bài. Còn ${result.remaining_submissions} lần nộp.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể nộp bài");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <CodingQuestionNode
        node={{ ...question, qNum: questionNumber }}
        ans={answer}
        onCodeChange={(code, lang) => {
          setAnswer(JSON.stringify({ code, lang }));
          setValidationError("");
        }}
      />
      {validationError && (
        <MessageBar className="ui-message-bar--section" intent="warning" onDismiss={() => setValidationError("")}>
          {validationError}
        </MessageBar>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "1rem",
          marginTop: "-1rem",
          marginBottom: "2rem",
        }}
      >
        <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          Đã dùng {used}/{limit} lượt
        </span>
        <button
          className="ui-button ui-button--primary"
          disabled={submitting || used >= limit}
          onClick={submit}
        >
          {submitting ? "Đang gửi..." : "Nộp code"}
        </button>
      </div>
    </section>
  );
}
