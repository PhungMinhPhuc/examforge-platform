"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LatexRenderer from "@/components/LatexRenderer";
import api from "@/lib/api";
import { toast } from "@/lib/toastStore";

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
  const [selected, setSelected] = useState<number | null>(null);
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
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await api.addCodingAssignmentQuestion(assignmentId, {
        question_id: selected,
        point_weight: 1,
      });
      setSelected(null);
      setOpen(false);
      onAdded();
      toast.success("Đã thêm bài");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể thêm bài");
      toast.error(e instanceof Error ? e.message : "Không thể thêm bài");
      setSaving(false);
    }
  };

  if (!open)
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        Thêm bài
      </button>
    );
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2.5vh 2.5vw",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="modal-wide-responsive"
        style={{
          width: "95vw",
          maxWidth: 1400,
          height: "95vh",
          maxHeight: "95vh",
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3 style={{ margin: 0 }}>
            Chọn bài lập trình · {available.length} mục
          </h3>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              color: "var(--text-secondary)",
            }}
          >
            ✕
          </button>
        </div>
        <div
          className="filter-bar"
          style={{
            padding: "1rem 1.5rem",
            background: "var(--bg-elevated)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <input
            className="input search-input"
            placeholder="Tìm nội dung hoặc ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="select"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            <option value="">Tất cả môn</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          >
            <option value="">Tất cả khối</option>
            {[10, 11, 12].map((g) => (
              <option key={g} value={g}>
                Lớp {g}
              </option>
            ))}
          </select>
          <select className="select" value="cd" disabled>
            <option value="cd">Lập trình</option>
          </select>
          <select
            className="select"
            value={complexity}
            onChange={(e) => setComplexity(e.target.value)}
          >
            <option value="">Tất cả mức</option>
            {Object.entries(COMPLEXITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setSearch("");
              setSubject("");
              setGrade("");
              setComplexity("");
            }}
          >
            Xóa lọc
          </button>
        </div>
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
                  className="btn btn-primary"
                  style={{ marginTop: ".75rem" }}
                  href={`/questions/create?type=cd&returnTo=${encodeURIComponent(`/coding/${assignmentId}`)}`}
                >
                  Tạo câu lập trình
                </Link>
              ) : (
                <button
                  className="btn btn-secondary"
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
                  border: `1px solid ${selected === q.id ? "var(--accent-primary)" : "var(--border)"}`,
                  background:
                    selected === q.id
                      ? "rgba(6,182,212,.07)"
                      : "var(--bg-surface)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="coding-question"
                  checked={selected === q.id}
                  onChange={() => setSelected(q.id)}
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
          <div className="alert alert-error" style={{ margin: "0 1.5rem" }}>
            {error}
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
          <strong>Đã chọn: {selected ? 1 : 0} bài</strong>
          <div style={{ display: "flex", gap: ".5rem" }}>
            <button
              className="btn btn-secondary"
              onClick={() => setOpen(false)}
            >
              Hủy
            </button>
            <button
              className="btn btn-primary"
              disabled={!selected || saving}
              onClick={add}
            >
              {saving ? "Đang thêm..." : "Thêm bài"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
