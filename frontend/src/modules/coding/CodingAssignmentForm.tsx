"use client";

import { useEffect, useState } from "react";
import LatexRenderer from "@/components/LatexRenderer";
import api from "@/lib/api";

type BankQuestion = {
  id: number;
  content: string;
  subject?: string;
  grade?: number;
  max_submissions?: number;
};
type ClassItem = { id: number; class_name: string };

export default function CodingAssignmentForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.getCodingQuestions(), api.getClasses()]).then(([q, c]) => {
      setQuestions(q);
      setClasses(c);
    });
  }, []);

  const save = async () => {
    if (!title.trim() || selected.length === 0) {
      setError("Nhập tên và chọn ít nhất một câu lập trình.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.createCodingAssignment({
        title,
        description: description || null,
        class_id: classId ? Number(classId) : null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        time_limit: timeLimit ? Number(timeLimit) : null,
        status: published ? "published" : "draft",
        allow_late_submission: false,
        questions: selected.map((question_id) => ({
          question_id,
          point_weight: 1,
        })),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tạo bài tập");
      setSaving(false);
    }
  };

  return (
    <section className="card" style={{ marginBottom: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "1rem",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.15rem" }}>Giao bài lập trình</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: ".85rem" }}>
            Có thể đặt thời gian làm bài hoặc để không giới hạn
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          Đóng
        </button>
      </div>
      <div style={{ display: "grid", gap: "1rem" }}>
        <input
          className="input"
          placeholder="Tên bài tập"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="textarea"
          placeholder="Mô tả (không bắt buộc)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label style={{ fontSize: ".85rem" }}>
          Thời gian làm bài (phút, để trống nếu không giới hạn)
          <input
            className="input"
            type="number"
            min="1"
            value={timeLimit}
            onChange={(e) => setTimeLimit(e.target.value)}
          />
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
          }}
        >
          <select
            className="select"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">Không giới hạn lớp</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.class_name}
              </option>
            ))}
          </select>
          <label style={{ fontSize: ".85rem" }}>
            Hạn nộp (không bắt buộc)
            <input
              className="input"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </label>
        </div>
        <label>
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />{" "}
          Giao bài ngay
        </label>
        <div
          style={{
            maxHeight: 360,
            overflowY: "auto",
            display: "grid",
            gap: ".5rem",
          }}
        >
          {questions.map((q) => (
            <label
              key={q.id}
              style={{
                display: "flex",
                gap: ".75rem",
                padding: ".75rem",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={selected.includes(q.id)}
                onChange={() =>
                  setSelected((s) =>
                    s.includes(q.id)
                      ? s.filter((id) => id !== q.id)
                      : [...s, q.id],
                  )
                }
              />
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: ".35rem" }}>
                  <span className="badge badge-cd">Lập trình</span>{" "}
                  <span
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: ".75rem",
                    }}
                  >
                    tối đa {q.max_submissions || 10} lượt
                  </span>
                </div>
                <LatexRenderer content={q.content} />
              </div>
            </label>
          ))}
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? "Đang tạo..." : "Tạo bài tập"}
          </button>
        </div>
      </div>
    </section>
  );
}
