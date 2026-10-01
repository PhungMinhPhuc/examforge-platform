"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LatexRenderer from "@/components/LatexRenderer";
import api from "@/lib/api";
import { toast } from "@/lib/toastStore";
import { Icon } from "@/components/icons";
import Checkbox from "@/components/Checkbox";
import MessageBar from "@/components/MessageBar";
import QuestionFilters from "@/components/QuestionFilters";

type BankQuestion = {
  id: number;
  content: any; // cây tài liệu (jsonb)
  subject?: string;
  grade?: number;
  complexity?: number;
  max_submissions?: number;
};
const COMPLEXITY_LABELS: Record<number, string> = {
  1: "Nhận biết",
  2: "Thông hiểu",
  3: "Vận dụng",
  4: "Vận dụng cao",
};

export default function AddCodingQuestion({
  assignmentId,
  existingIds,
  onAdded,
}: {
  assignmentId: number;
  existingIds: number[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [complexity, setComplexity] = useState("");
  useEffect(() => {
    if (open) api.getCodingQuestions().then(setQuestions);
  }, [open]);
  const available = useMemo(
    () => questions.filter((q) => !existingIds.includes(q.id)),
    [questions, existingIds],
  );
  const filtered = useMemo(
    () =>
      available.filter(
        (q) =>
          (!search ||
            q.content.toLowerCase().includes(search.toLowerCase()) ||
            String(q.id).includes(search)) &&
          (!subject || q.subject === subject) &&
          (!grade || String(q.grade) === grade) &&
          (!complexity || String(q.complexity) === complexity),
      ),
    [available, search, subject, grade, complexity],
  );
  const subjects = useMemo(
    () =>
      Array.from(
        new Set(available.map((q) => q.subject).filter(Boolean)),
      ) as string[],
    [available],
  );

  const add = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    setError("");
    try {
      await Promise.all(
        selected.map((questionId) =>
          api.addCodingAssignmentQuestion(assignmentId, {
            question_id: questionId,
            point_weight: 1,
          }),
        ),
      );
      const addedCount = selected.length;
      setSelected([]);
      setOpen(false);
      onAdded();
      toast.success(`Đã thêm ${addedCount} bài`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể thêm bài");
      setSaving(false);
    }
  };

  if (!open)
    return (
      <button className="ui-button ui-button--primary" onClick={() => setOpen(true)}>
        <Icon name="plus" />
        Thêm bài
      </button>
    );
  return (
    <div
      className="ui-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="ui-modal ui-modal--large"
      >
        <header className="ui-modal__header">
          <h3 className="ui-modal__title">
            Chọn bài lập trình · {available.length} mục
          </h3>
          <button className="ui-modal__close" type="button" aria-label="Đóng" onClick={() => setOpen(false)}>
            <Icon name="close" />
          </button>
        </header>
        <QuestionFilters
          variant="embedded"
          search={search}
          searchPlaceholder="Tìm nội dung hoặc ID..."
          onChange={(key, value) => {
            if (key === "search") setSearch(value);
            else if (key === "subject") setSubject(value);
            else if (key === "grade") setGrade(value);
            else if (key === "complexity") setComplexity(value);
          }}
          onReset={() => {
            setSearch("");
            setSubject("");
            setGrade("");
            setComplexity("");
          }}
          selects={[
            { key: "subject", value: subject, options: [{ value: "", label: "Tất cả môn" }, ...subjects.map((item) => ({ value: item, label: item }))] },
            { key: "grade", value: grade, options: [{ value: "", label: "Tất cả khối" }, ...[10, 11, 12].map((item) => ({ value: item, label: `Lớp ${item}` }))] },
            { key: "complexity", value: complexity, options: [{ value: "", label: "Tất cả mức" }, ...Object.entries(COMPLEXITY_LABELS).map(([value, label]) => ({ value, label }))] },
          ]}
        />
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: ".75rem",
          }}
        >
          {filtered.length === 0 ? (
            <div className="empty-state">
              <h3>
                {available.length === 0
                  ? "Chưa có bài lập trình để thêm"
                  : "Không tìm thấy bài phù hợp"}
              </h3>
              <p>
                {available.length === 0
                  ? "Tạo một câu lập trình mới rồi quay lại để thêm vào đề này."
                  : "Hãy thay đổi hoặc xóa bộ lọc hiện tại."}
              </p>
              {available.length === 0 ? (
                <Link
                  className="ui-button ui-button--primary"
                  style={{ marginTop: ".75rem" }}
                  href={`/questions/create?type=cd&returnTo=${encodeURIComponent(`/coding/${assignmentId}`)}`}
                >
                  <Icon name="plus" />
                  Tạo câu lập trình
                </Link>
              ) : (
                <button
                  className="ui-button ui-button--secondary"
                  onClick={() => {
                    setSearch("");
                    setSubject("");
                    setGrade("");
                    setComplexity("");
                  }}
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          ) : (
            filtered.map((q) => (
              <label
                key={q.id}
                style={{
                  display: "flex",
                  gap: ".75rem",
                  padding: "1rem",
                  border: `1px solid ${selected.includes(q.id) ? "var(--accent-primary)" : "var(--border)"}`,
                  background:
                    selected.includes(q.id)
                      ? "rgba(6,182,212,.07)"
                      : "var(--bg-surface)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                }}
              >
                <Checkbox
                  checked={selected.includes(q.id)}
                  onChange={() =>
                    setSelected((current) =>
                      current.includes(q.id)
                        ? current.filter((id) => id !== q.id)
                        : [...current, q.id],
                    )
                  }
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: ".4rem",
                      alignItems: "center",
                      marginBottom: ".5rem",
                    }}
                  >
                    <span className="badge badge-cd">Lập trình</span>
                    <span
                      style={{
                        color: "var(--text-secondary)",
                        fontSize: ".75rem",
                      }}
                    >
                      ID: {q.id} · {q.subject || "Chưa có môn"}
                      {q.grade ? ` · Lớp ${q.grade}` : ""} ·{" "}
                      {COMPLEXITY_LABELS[q.complexity || 0] || ""} · tối đa{" "}
                      {q.max_submissions || 10} lượt
                    </span>
                  </div>
                  <LatexRenderer content={q.content} preserveLineBreaks />
                </div>
              </label>
            ))
          )}
        </div>
        {error && (
          <div style={{ margin: "0 1.5rem" }}>
            <MessageBar intent="error" onDismiss={() => setError("")}>
              {error}
            </MessageBar>
          </div>
        )}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <strong>Đã chọn: {selected.length} bài</strong>
          <div style={{ display: "flex", gap: ".5rem" }}>
            <button
              className="ui-button ui-button--secondary"
              onClick={() => setOpen(false)}
            >
              Hủy
            </button>
            <button
              className="ui-button ui-button--primary"
              disabled={selected.length === 0 || saving}
              onClick={add}
            >
              {!saving && <Icon name="plus" />}
              {saving ? "Đang thêm..." : "Thêm bài"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
