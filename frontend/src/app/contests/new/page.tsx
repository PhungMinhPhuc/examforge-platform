"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import LatexRenderer from "@/components/LatexRenderer";
import Combobox from "@/components/Combobox";
import NumberInput from "@/components/NumberInput";
import api from "@/lib/api";
import { toast } from "@/lib/toastStore";

type Question = {
  id: number;
  content: any; // cây tài liệu (jsonb) — xem frontend/src/lib/docTree.ts
  question_type: string;
  chapter?: string;
  subject?: string;
  grade?: number;
  complexity?: number;
  options?: any[];
  layout_type?: string;
  images?: any;
  children?: any[];
  parent_id?: number | null;
};

// Thang điểm mặc định theo quy chế thi THPT: TN 0.25/câu, ĐS 1.0/câu (chấm bậc
// thang 1 ý=0.1, 2 ý=0.25, 3 ý=0.5, 4 ý=1.0), TLN 0.5/câu, TL 1.0/câu.
const DEFAULT_SCORES = { mc: 0.25, tf: 1.0, sa: 0.5, oe: 1.0 };
const SCORING_STORAGE_KEY = "contest_scoring_config";

const TYPE_LABELS_SHORT: Record<string, string> = {
  mc: "TN",
  tf: "ĐS",
  sa: "TLN",
  oe: "TL",
  st: "Chung giả thiết",
};
const TYPE_LABELS_FULL: Record<string, string> = {
  mc: "Trắc nghiệm",
  tf: "Đúng/Sai",
  sa: "Trả lời ngắn",
  oe: "Tự luận",
  st: "Chung giả thiết",
};
const COMPLEXITY_LABELS: Record<number, string> = {
  1: "Nhận biết",
  2: "Thông hiểu",
  3: "Vận dụng",
  4: "Vận dụng cao",
};

export default function NewContestPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [timeLimit, setTimeLimit] = useState(45);
  const [availableFrom, setAvailableFrom] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [allowLateSubmission, setAllowLateSubmission] = useState(false);
  const [classId, setClassId] = useState<number | "">("");
  const [status, setStatus] = useState("inactive");
  const [scores, setScores] = useState(DEFAULT_SCORES);
  const [scoresLoaded, setScoresLoaded] = useState(false);
  const [classes, setClasses] = useState<{ id: number; class_name: string }[]>(
    [],
  );

  // Đề thi
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Tạo đề ngẫu nhiên theo số câu
  const [randomCount, setRandomCount] = useState(10);
  const [randomType, setRandomType] = useState("");
  const [randomLoading, setRandomLoading] = useState(false);

  // Modal chọn câu (giao diện ngân hàng)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [subjects, setSubjects] = useState<Record<string, unknown>>({});
  const [filters, setFilters] = useState({
    subject: "",
    grade: "",
    chapter: "",
    question_type: "",
    complexity: "",
    search: "",
  });
  const [bankQuestions, setBankQuestions] = useState<Question[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [bankTotal, setBankTotal] = useState(0);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "teacher"))
      router.replace("/dashboard");
  }, [user, isLoading, router]);

  useEffect(() => {
    api
      .getClasses()
      .then((r) => setClasses(r as { id: number; class_name: string }[]))
      .catch(() => {});
    api
      .getSubjects()
      .then(setSubjects)
      .catch(() => {});
  }, []);

  const fetchBank = useCallback(() => {
    setBankLoading(true);
    api
      .getQuestions({ ...filters, page, page_size: 20 })
      .then((r: any) => {
        const examQuestions = (r.data as Question[]).filter(
          (q) => q.question_type !== "cd",
        );
        setBankQuestions(examQuestions);
        setTotalPages(r.total_pages || 1);
        setBankTotal(
          Math.max(
            0,
            (r.total || 0) -
              ((r.data as Question[]).length - examQuestions.length),
          ),
        );
      })
      .catch(() => {})
      .finally(() => setBankLoading(false));
  }, [filters, page]);

  useEffect(() => {
    if (user && pickerOpen) fetchBank();
  }, [user, pickerOpen, fetchBank]);

  const setFilter = (key: string, val: string) => {
    setFilters((f) => ({ ...f, [key]: val }));
    setPage(1);
  };

  const toggle = async (q: Question) => {
    const isSelected = selectedQuestions.some((x) => x.id === q.id);
    if (isSelected) {
      setSelectedQuestions((prev) => {
        let newSelected = prev.filter((x) => x.id !== q.id);
        if (q.question_type === "st" && q.children) {
          const childIds = q.children.map((c) => c.id);
          newSelected = newSelected.filter((x) => !childIds.includes(x.id));
        } else if (q.parent_id) {
          newSelected = newSelected.filter(
            (x) => x.id !== q.parent_id && x.parent_id !== q.parent_id,
          );
        }
        return newSelected;
      });
    } else {
      if (q.question_type === "st") {
        setSelectedQuestions((prev) => {
          let newSelected = [...prev, q];
          if (q.children) {
            q.children.forEach((c) => {
              if (!newSelected.some((x) => x.id === c.id)) newSelected.push(c);
            });
          }
          return newSelected;
        });
      } else if (q.parent_id) {
        try {
          const parentQ = (await api.getQuestion(q.parent_id)) as Question;
          setSelectedQuestions((prev) => {
            let newSelected = [...prev];
            if (!newSelected.some((x) => x.id === parentQ.id))
              newSelected.push(parentQ);
            if (parentQ.children) {
              parentQ.children.forEach((c: any) => {
                if (!newSelected.some((x) => x.id === c.id))
                  newSelected.push(c);
              });
            }
            return newSelected;
          });
        } catch (err) {
          console.error(err);
          toast.error("Lỗi khi tải câu hỏi liên quan");
        }
      } else {
        setSelectedQuestions((prev) => [...prev, q]);
      }
    }
  };

  // Lần đầu: dùng thang điểm mặc định; nếu người dùng đã từng nhập thì khôi phục
  // lại config gần nhất họ đã lưu.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SCORING_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          setScores((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {
      /* bỏ qua */
    }
    setScoresLoaded(true);
  }, []);

  // Lưu lại thang điểm gần nhất người dùng nhập.
  useEffect(() => {
    if (!scoresLoaded) return;
    try {
      localStorage.setItem(SCORING_STORAGE_KEY, JSON.stringify(scores));
    } catch {
      /* bỏ qua */
    }
  }, [scores, scoresLoaded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedQuestions.length === 0) {
      const msg = "Vui lòng chọn ít nhất 1 câu hỏi";
      setError(msg);
      toast.error(msg);
      return;
    }
    setLoading(true);
    setError("");
    let parsed: Record<string, unknown> = { ...scores };
    try {
      // Sort selected questions: mc -> tf -> sa -> oe -> st
      const order = { mc: 1, tf: 2, sa: 3, oe: 4, st: 5 };

      const getSortType = (q: Question) => {
        if (q.question_type === "st" && q.children && q.children.length > 0) {
          return q.children[0].question_type;
        }
        return q.question_type;
      };

      const flattenedIds: number[] = [];
      const sortedSelected = [...selectedQuestions].sort(
        (a, b) =>
          (order[getSortType(a) as keyof typeof order] || 99) -
          (order[getSortType(b) as keyof typeof order] || 99),
      );

      sortedSelected.forEach((q) => {
        flattenedIds.push(q.id);
        if (q.question_type === "st" && q.children) {
          q.children.forEach((c) => flattenedIds.push(c.id));
        }
      });

      const sortedIds = Array.from(new Set(flattenedIds));

      const res = await api.createContest({
        class_id: classId || null,
        title,
        time_limit: timeLimit,
        scoring_config: parsed,
        question_ids: sortedIds,
        status,
        available_from: availableFrom
          ? new Date(availableFrom).toISOString()
          : null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        allow_late_submission: allowLateSubmission,
      });
      setSuccess(` Tạo đề thi thành công! ID: ${res.id}`);
      toast.success("Tạo đề thi thành công!");
      setTimeout(() => router.push("/contests"), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi tạo đề thi");
      toast.error(err instanceof Error ? err.message : "Lỗi tạo đề thi");
    } finally {
      setLoading(false);
    }
  };

  const handleRandom = async () => {
    if (!title.trim()) {
      const msg = "Vui lòng nhập tên đề thi trước khi tạo ngẫu nhiên";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (randomCount < 1) {
      const msg = "Số câu ngẫu nhiên phải lớn hơn 0";
      setError(msg);
      toast.error(msg);
      return;
    }
    setRandomLoading(true);
    setError("");
    try {
      const res = await api.createRandomContest({
        class_id: classId || null,
        title,
        time_limit: timeLimit,
        scoring_config: { ...scores },
        count: randomCount,
        status,
        available_from: availableFrom
          ? new Date(availableFrom).toISOString()
          : null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        allow_late_submission: allowLateSubmission,
        question_type: randomType || undefined,
      });
      setSuccess(`Đã tạo đề ngẫu nhiên (${res.count} câu)! ID: ${res.id}`);
      toast.success(`Đã tạo đề ngẫu nhiên (${res.count} câu)!`);
      setTimeout(() => router.push("/contests"), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi tạo đề ngẫu nhiên");
      toast.error(err instanceof Error ? err.message : "Lỗi tạo đề ngẫu nhiên");
    } finally {
      setRandomLoading(false);
    }
  };

  // Tổng hợp số liệu đã chọn
  const typeCounts: Record<string, number> = { mc: 0, tf: 0, sa: 0, oe: 0 };
  let totalQs = 0;
  selectedQuestions.forEach((q) => {
    if (q.question_type !== "st") {
      totalQs++;
      if (typeCounts[q.question_type] !== undefined) {
        typeCounts[q.question_type]++;
      }
    }
  });
  const summaryParts = [];
  if (typeCounts.mc > 0) summaryParts.push(`${typeCounts.mc} TN`);
  if (typeCounts.tf > 0) summaryParts.push(`${typeCounts.tf} ĐS`);
  if (typeCounts.sa > 0) summaryParts.push(`${typeCounts.sa} TLN`);
  if (typeCounts.oe > 0) summaryParts.push(`${typeCounts.oe} TL`);
  const summaryText =
    totalQs > 0
      ? `${totalQs} câu` +
        (summaryParts.length > 0 ? ` (${summaryParts.join(", ")})` : "")
      : "0 câu";

  // Điểm tối đa có thể đạt = tổng điểm tối đa từng câu theo thang điểm (bỏ câu 'st')
  const maxScore = selectedQuestions.reduce((sum, q) => {
    if (q.question_type === "st") return sum;
    const w = scores[q.question_type as keyof typeof scores];
    return sum + (typeof w === "number" ? w : 0);
  }, 0);
  const maxScoreText = (Math.round(maxScore * 100) / 100).toString();

  // Mục cấp cao đã chọn (st hoặc câu đơn không phải con)
  const topLevelSelected = selectedQuestions.filter(
    (q) => q.question_type === "st" || !q.parent_id,
  );
  const topLevelCount = topLevelSelected.length;

  const subjectList = Object.keys(subjects);
  const gradeList = filters.subject
    ? Object.keys(
        (subjects as Record<string, Record<string, unknown>>)[
          filters.subject
        ] || {},
      )
    : ["10", "11", "12"];

  // Render nội dung 1 câu (badges + nội dung + đáp án) trong modal
  const renderOptions = (node: Question) => {
    if (
      node.question_type === "mc" &&
      node.options &&
      node.options.length > 0
    ) {
      return (
        <div
          style={{
            marginTop: "0.6rem",
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "0.4rem",
          }}
        >
          {node.options.map((opt: any, oi: number) => (
            <div
              key={opt.id ?? oi}
              style={{
                display: "flex",
                gap: "0.4rem",
                alignItems: "baseline",
                padding: "0.3rem 0.6rem",
                background: opt.is_correct
                  ? "rgba(107,203,119,0.1)"
                  : "var(--bg-elevated)",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${opt.is_correct ? "var(--accent-success)" : "transparent"}`,
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  color: opt.is_correct
                    ? "var(--accent-success)"
                    : "var(--text-secondary)",
                }}
              >
                {String.fromCharCode(65 + oi)}.
              </span>
              <LatexRenderer content={opt.content} images={node.images} />
            </div>
          ))}
        </div>
      );
    }
    if (
      node.question_type === "tf" &&
      node.options &&
      node.options.length > 0
    ) {
      return (
        <div
          style={{
            marginTop: "0.6rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}
        >
          {node.options.map((opt: any, oi: number) => (
            <div
              key={opt.id ?? oi}
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                padding: "0.3rem 0.6rem",
                background: opt.is_correct
                  ? "rgba(107,203,119,0.1)"
                  : "rgba(255,107,107,0.1)",
                border: `1px solid ${opt.is_correct ? "var(--accent-success)" : "var(--accent-danger)"}`,
                borderRadius: "var(--radius-sm)",
              }}
            >
              <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>
                {String.fromCharCode(97 + oi)})
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <LatexRenderer content={opt.content} images={node.images} />
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (
      node.question_type === "sa" &&
      node.options &&
      node.options.length > 0
    ) {
      const rawAns = String(node.options[0].content || "")
        .replace(/\$/g, "")
        .replace(/[{}]/g, "")
        .trim();
      return (
        <div
          style={{
            marginTop: "0.6rem",
            fontSize: "0.8rem",
            color: "var(--accent-primary)",
            fontWeight: 600,
          }}
        >
          Đáp án: {rawAns}
        </div>
      );
    }
    return null;
  };

  const renderPickerCard = (q: Question) => {
    const selected = selectedQuestions.some((sq) => sq.id === q.id);
    let stTags: string[] = [];
    if (q.question_type === "st" && q.children) {
      stTags = Array.from(
        new Set(
          q.children.map(
            (c: any) => TYPE_LABELS_FULL[c.question_type] || c.question_type,
          ),
        ),
      ) as string[];
    }
    return (
      <div
        key={q.id}
        onClick={() => toggle(q)}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.75rem",
          padding: "0.9rem",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          background: selected ? "rgba(30,63,170,0.08)" : "var(--bg-surface)",
          border: `1px solid ${selected ? "var(--accent-primary)" : "var(--border)"}`,
          transition: "all 0.15s",
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            flexShrink: 0,
            marginTop: 2,
            background: selected ? "var(--accent-primary)" : "transparent",
            border: `2px solid ${selected ? "var(--accent-primary)" : "var(--border)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-on-accent)",
            fontSize: "0.8rem",
            fontWeight: 700,
          }}
        >
          {selected ? "✓" : ""}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              marginBottom: "0.6rem",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span className={`badge badge-${q.question_type}`}>
              {TYPE_LABELS_FULL[q.question_type] || q.question_type}
            </span>
            {stTags.map((tag, i) => {
              const typeKey =
                Object.keys(TYPE_LABELS_FULL).find(
                  (k) => TYPE_LABELS_FULL[k] === tag,
                ) || tag;
              return (
                <span key={i} className={`badge badge-${typeKey}`}>
                  {tag}
                </span>
              );
            })}
            {q.question_type !== "st" && q.complexity !== undefined && (
              <span className={`badge complexity-${q.complexity}`}>
                {COMPLEXITY_LABELS[q.complexity]}
              </span>
            )}
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              ID: {q.id}
            </span>
            {q.subject && (
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                {q.subject}
                {q.grade ? ` · Lớp ${q.grade}` : ""}
              </span>
            )}
            {q.chapter && (
              <span
                style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}
                title={q.chapter}
              >
                {q.chapter.slice(0, 40)}
                {q.chapter.length > 40 ? "…" : ""}
              </span>
            )}
          </div>
          <div style={{ pointerEvents: "none" }}>
            {q.question_type === "st" &&
              q.children &&
              q.children.length > 0 && (
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    marginBottom: "0.4rem",
                  }}
                >
                  Dựa vào thông tin sau để trả lời từ câu 1 đến câu{" "}
                  {q.children.length}:
                </div>
              )}
            <LatexRenderer
              content={q.content || ""}
              layoutType={q.layout_type}
              images={q.images}
              className="question-content"
            />
            {q.question_type !== "st" && renderOptions(q)}
            {q.question_type === "st" &&
              q.children &&
              q.children.map((child: any, ci: number) => (
                <div
                  key={child.id}
                  style={{
                    marginTop: "0.6rem",
                    paddingLeft: "0.75rem",
                    borderLeft: "2px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "var(--accent-primary)",
                      marginBottom: "0.2rem",
                    }}
                  >
                    Câu {ci + 1}{" "}
                    <span
                      className={`badge badge-${child.question_type}`}
                      style={{ fontSize: "0.65rem" }}
                    >
                      {TYPE_LABELS_FULL[child.question_type] ||
                        child.question_type}
                    </span>
                  </div>
                  <LatexRenderer
                    content={child.content || ""}
                    layoutType={child.layout_type}
                    images={child.images}
                    className="question-content"
                  />
                  {renderOptions(child)}
                </div>
              ))}
          </div>
        </div>
      </div>
    );
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="pagination" style={{ justifyContent: "center" }}>
        <button
          className="page-btn"
          onClick={() => setPage(1)}
          disabled={page === 1}
        >
          «
        </button>
        <button
          className="page-btn"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          ‹
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
          return (
            <button
              key={p}
              className={`page-btn ${page === p ? "active" : ""}`}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          );
        })}
        <button
          className="page-btn"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
        >
          ›
        </button>
        <button
          className="page-btn"
          onClick={() => setPage(totalPages)}
          disabled={page === totalPages}
        >
          »
        </button>
      </div>
    );
  };

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Tạo đề thi mới</h1>
            <p className="page-sub">
              Chọn câu hỏi từ ngân hàng và cấu hình đề thi
            </p>
          </div>
        </div>

        {error && <div className="alert alert-error"> {error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1.5rem",
            alignItems: "start",
          }}
        >
          {/* Left: Info */}
          <div className="card">
            <h3 style={{ marginBottom: "1.25rem" }}>Thông tin đề thi</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Tên đề thi</label>
                <input
                  className="input"
                  placeholder="VD: Kiểm tra 15 phút - Chương I"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Thời gian (phút)</label>
                <NumberInput
                  className="input"
                  min={1}
                  max={300}
                  value={timeLimit}
                  onChange={setTimeLimit}
                  required
                />
              </div>
              <div
                className="form-group"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                }}
              >
                <label className="form-label">
                  Thời điểm mở
                  <input
                    className="input"
                    type="datetime-local"
                    style={{ width: "100%" }}
                    value={availableFrom}
                    onChange={(e) => setAvailableFrom(e.target.value)}
                  />
                </label>
                <label className="form-label">
                  Hạn nộp
                  <input
                    className="input"
                    type="datetime-local"
                    style={{ width: "100%" }}
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                  />
                </label>
              </div>
              <label
                className="form-group"
                style={{ display: "flex", alignItems: "center", gap: ".6rem" }}
              >
                <input
                  type="checkbox"
                  checked={allowLateSubmission}
                  onChange={(e) => setAllowLateSubmission(e.target.checked)}
                />
                Cho phép nộp sau hạn
              </label>
              <div className="form-group">
                <label className="form-label">Giao cho lớp (tùy chọn)</label>
                <Combobox
                  className="select"
                  value={String(classId)}
                  onChange={(val) => setClassId(val ? +val : "")}
                  options={[
                    { value: "", label: "— Tất cả / Không giới hạn —" },
                    ...classes.map((c) => ({
                      value: String(c.id),
                      label: c.class_name,
                    })),
                  ]}
                  placeholder="— Tất cả / Không giới hạn —"
                />
              </div>
              <div className="form-group">
                <label
                  className="form-label"
                  style={{ marginBottom: "0.75rem" }}
                >
                  Thang điểm
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span style={{ fontSize: "0.85rem", width: "50px" }}>
                      TN:
                    </span>
                    <NumberInput
                      step="0.01"
                      className="input"
                      value={scores.mc}
                      onChange={(v) => setScores({ ...scores, mc: v })}
                      style={{ padding: "0.4rem", fontSize: "0.9rem" }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span style={{ fontSize: "0.85rem", width: "50px" }}>
                      ĐS:
                    </span>
                    <NumberInput
                      step="0.01"
                      className="input"
                      value={scores.tf}
                      onChange={(v) => setScores({ ...scores, tf: v })}
                      style={{ padding: "0.4rem", fontSize: "0.9rem" }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span style={{ fontSize: "0.85rem", width: "50px" }}>
                      TLN:
                    </span>
                    <NumberInput
                      step="0.01"
                      className="input"
                      value={scores.sa}
                      onChange={(v) => setScores({ ...scores, sa: v })}
                      style={{ padding: "0.4rem", fontSize: "0.9rem" }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span style={{ fontSize: "0.85rem", width: "50px" }}>
                      TL:
                    </span>
                    <NumberInput
                      step="0.01"
                      className="input"
                      value={scores.oe}
                      onChange={(v) => setScores({ ...scores, oe: v })}
                      style={{ padding: "0.4rem", fontSize: "0.9rem" }}
                    />
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: "var(--text-muted)",
                    marginTop: "0.5rem",
                  }}
                >
                  TN=Trắc nghiệm, ĐS=Đúng/Sai, TLN=Trả lời ngắn, TL=Tự luận
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Trạng thái</label>
                <Combobox
                  className="select"
                  value={status}
                  onChange={(val) => setStatus(val)}
                  options={[
                    { value: "inactive", label: "Chưa mở" },
                    { value: "active", label: "Mở ngay" },
                  ]}
                />
              </div>

              <div
                style={{
                  padding: "0.875rem",
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--radius-sm)",
                  marginBottom: "1.25rem",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                  Đã chọn: {topLevelCount} mục ({summaryText})
                </div>
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--accent-primary)",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  Điểm tối đa: {maxScoreText} điểm
                </div>
                <div
                  style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}
                >
                  Thời gian dự kiến: {timeLimit} phút
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-block btn-lg"
                disabled={loading || selectedQuestions.length === 0}
              >
                {loading ? (
                  <>
                    <span className="spinner" /> Đang tạo...
                  </>
                ) : (
                  " Tạo đề thi"
                )}
              </button>
            </form>

            <div
              style={{
                marginTop: "1.25rem",
                paddingTop: "1.25rem",
                borderTop: "1px dashed var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginBottom: "1rem",
                }}
              >
                <label style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                  Thêm nhanh ngẫu nhiên:
                </label>
                <Combobox
                  className="select"
                  style={{ width: "150px" }}
                  value={randomType}
                  onChange={(val) => setRandomType(val)}
                  options={[
                    { value: "", label: "Mọi loại" },
                    { value: "mc", label: "Trắc nghiệm" },
                    { value: "tf", label: "Đúng/Sai" },
                    { value: "sa", label: "Trả lời ngắn" },
                    { value: "oe", label: "Tự luận" },
                    { value: "st", label: "Chung giả thiết" },
                  ]}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <NumberInput
                  className="input"
                  min={1}
                  max={200}
                  value={randomCount}
                  onChange={setRandomCount}
                  style={{ width: "80px" }}
                />
                <span
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  câu
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={handleRandom}
                  disabled={randomLoading}
                >
                  {randomLoading ? (
                    <>
                      <span className="spinner" /> Đang tạo...
                    </>
                  ) : (
                    "Tạo đề ngẫu nhiên"
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Câu hỏi đã chọn */}
          <div className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h3 style={{ margin: 0 }}>
                Câu hỏi đã chọn ({topLevelCount} mục)
              </h3>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setPickerOpen(true)}
              >
                + Thêm câu hỏi
              </button>
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                marginBottom: "0.75rem",
              }}
            >
              {summaryText} · Điểm tối đa: {maxScoreText}
            </div>

            {topLevelSelected.length === 0 ? (
              <div
                onClick={() => setPickerOpen(true)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  padding: "2.5rem 1rem",
                  cursor: "pointer",
                  border: "2px dashed var(--border)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-muted)",
                }}
              >
                <div style={{ fontSize: "var(--font-size-xl)" }}>＋</div>
                <div style={{ fontSize: "var(--font-size-base)" }}>
                  Chưa chọn câu hỏi nào — bấm để mở ngân hàng câu hỏi
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  maxHeight: "520px",
                  overflowY: "auto",
                }}
              >
                {topLevelSelected.map((q, idx) => {
                  const childCount =
                    q.question_type === "st" && q.children
                      ? q.children.length
                      : 0;
                  return (
                    <div
                      key={q.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.6rem",
                        padding: "0.6rem 0.75rem",
                        background: "var(--bg-elevated)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          flexShrink: 0,
                          fontSize: "0.85rem",
                        }}
                      >
                        {idx + 1}.
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.4rem",
                            flexWrap: "wrap",
                            alignItems: "center",
                            marginBottom: "0.2rem",
                          }}
                        >
                          <span
                            className={`badge badge-${q.question_type}`}
                            style={{ fontSize: "0.68rem" }}
                          >
                            {TYPE_LABELS_SHORT[q.question_type] ||
                              q.question_type}
                          </span>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              color: "var(--text-muted)",
                            }}
                          >
                            ID: {q.id}
                          </span>
                          {childCount > 0 && (
                            <span
                              style={{
                                fontSize: "0.68rem",
                                color: "var(--text-muted)",
                              }}
                            >
                              {childCount} câu con
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--text-secondary)",
                            maxHeight: "2.6em",
                            overflow: "hidden",
                            pointerEvents: "none",
                          }}
                        >
                          <LatexRenderer content={q.content || ""} />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggle(q)}
                        title="Bỏ chọn"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--accent-danger)",
                          fontSize: "1.1rem",
                          lineHeight: 1,
                          flexShrink: 0,
                          padding: "0 0.2rem",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal chọn câu (giao diện ngân hàng) */}
        {pickerOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2.5vh 2.5vw",
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setPickerOpen(false);
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
              }}
            >
              {/* Header */}
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
                  Chọn câu hỏi{" "}
                  {bankTotal > 0 ? `· ${bankTotal.toLocaleString()} mục` : ""}
                </h3>
                <button
                  onClick={() => setPickerOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 20,
                    color: "var(--text-secondary)",
                    lineHeight: 1,
                    padding: 4,
                  }}
                >
                  ✕
                </button>
              </div>

              <div
                className="filter-bar"
                style={{
                  padding: "1rem 1.5rem",
                  background: "var(--bg-hover)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <input
                  className="input search-input"
                  placeholder=" Tìm kiếm..."
                  value={filters.search}
                  onChange={(e) => setFilter("search", e.target.value)}
                />
                <select
                  className="select"
                  value={filters.subject}
                  onChange={(e) => setFilter("subject", e.target.value)}
                >
                  <option value="">Tất cả môn</option>
                  {subjectList.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  value={filters.grade}
                  onChange={(e) => setFilter("grade", e.target.value)}
                >
                  <option value="">Tất cả khối</option>
                  {gradeList.map((g) => (
                    <option key={g} value={g}>
                      Lớp {g}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  value={filters.question_type}
                  onChange={(e) => setFilter("question_type", e.target.value)}
                >
                  <option value="">Tất cả loại</option>
                  {Object.entries(TYPE_LABELS_FULL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  value={filters.complexity}
                  onChange={(e) => setFilter("complexity", e.target.value)}
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
                    setFilters({
                      subject: "",
                      grade: "",
                      chapter: "",
                      question_type: "",
                      complexity: "",
                      search: "",
                    });
                    setPage(1);
                  }}
                >
                  Xóa lọc
                </button>
              </div>

              {/* List */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "1rem 1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {bankLoading ? (
                  Array(4)
                    .fill(0)
                    .map((_, i) => (
                      <div
                        key={i}
                        className="skeleton"
                        style={{
                          height: "90px",
                          borderRadius: "var(--radius-md)",
                        }}
                      />
                    ))
                ) : bankQuestions.length === 0 ? (
                  <div className="empty-state" style={{ padding: "2rem" }}>
                    <p>Không tìm thấy câu hỏi. Thử đổi bộ lọc.</p>
                  </div>
                ) : (
                  bankQuestions.map((q) => renderPickerCard(q))
                )}
                {!bankLoading && renderPagination()}
              </div>

              {/* Footer */}
              <div
                style={{
                  padding: "1rem 1.5rem",
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  Đã chọn: {topLevelCount} mục ({summaryText})
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => setPickerOpen(false)}
                >
                  Xong
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
