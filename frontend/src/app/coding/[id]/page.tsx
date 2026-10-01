"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import LatexRenderer from "@/components/LatexRenderer";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import useScrollRestoration from "@/lib/useScrollRestoration";
import { STATUS_BADGE, bestStatus } from "@/components/CodingQuestionNode";
import type {
  CodingAssignment,
  CodingQuestion,
  CodingStudentProgress,
} from "@/modules/coding/types";
import AddCodingQuestion from "@/modules/coding/AddCodingQuestion";
import CodingSubmissionHistory from "@/modules/coding/CodingSubmissionHistory";
import { QuestionEditor, QuestionDetail } from "@/components/QuestionEditor";
import { treeToPlainText } from "@/lib/docTree";
import { toast } from "@/lib/toastStore";
import { Icon } from "@/components/icons";
import DateTimePicker from "@/components/DateTimePicker";
import PageHeader from "@/components/PageHeader";
import Checkbox from "@/components/Checkbox";
import { confirmDialog } from "@/lib/confirmDialog";
import MessageBar from "@/components/MessageBar";

// một dòng trong bảng giao/gỡ lớp
type ClassAssignment = {
  id: number;
  class_name: string;
  assigned: boolean;
  assigned_at?: string | null;
  student_count: number;
  submitted_count: number;
};

const COMPLEXITY_LABELS: Record<number, string> = {
  1: "Nhận biết",
  2: "Thông hiểu",
  3: "Vận dụng",
  4: "Vận dụng cao",
};

// content giờ là cây tài liệu (jsonb) — lấy chữ trơn ra rồi mới cắt ngắn.
function questionSummary(content: unknown) {
  const text = treeToPlainText(content).replace(/\s+/g, " ").trim();
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

// coding_assignment_students.status
const PROGRESS_LABELS: Record<string, string> = {
  not_started: "Chưa bắt đầu",
  in_progress: "Đang làm",
  completed: "Đã hoàn thành",
};

export default function CodingAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } =
    params instanceof Promise
      ? use(params)
      : (params as unknown as { id: string });
  const assignmentId = Number(id);
  const { user } = useAuth();
  const router = useRouter();
  const [assignment, setAssignment] = useState<CodingAssignment | null>(null);
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [students, setStudents] = useState<CodingStudentProgress[]>([]);
  const [classes, setClasses] = useState<ClassAssignment[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [editData, setEditData] = useState({
    title: "",
    description: "",
    time_limit: "",
    available_from: "",
    due_at: "",
    allow_late_submission: false,
  });
  const [questionModal, setQuestionModal] = useState<{
    question: QuestionDetail;
    saving: boolean;
    error: string;
  } | null>(null);
  const [subjects, setSubjects] = useState<Record<string, unknown>>({});
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [assigningClasses, setAssigningClasses] = useState(false);
  const [viewStudentId, setViewStudentId] = useState<number | null>(null);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [assignError, setAssignError] = useState("");
  const [editError, setEditError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const load = async () => {
    const result = await api.getCodingAssignment(assignmentId);
    setAssignment(result.assignment);
    setQuestions(result.questions);
    setStudents(result.students || []);
  };
  useEffect(() => {
    if (user)
      load()
        .catch((e) => setLoadError(e.message))
        .finally(() => setLoading(false));
  }, [user, assignmentId]);

  useScrollRestoration(!loading);
  useEffect(() => {
    if (user?.role === "teacher") api.getClasses().then(setClasses);
  }, [user]);
  useEffect(() => {
    if (user?.role === "teacher")
      api
        .getSubjects()
        .then(setSubjects)
        .catch(() => {});
  }, [user]);

  const start = async () => {
    await api.startCodingAssignment(assignmentId);
    await load();
  };
  const copyPublicLink = async () => {
    if (!assignment?.public_id) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/coding/share/${assignment.public_id}`,
      );
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setLinkCopied(false);
      toast.error("Không thể sao chép đường dẫn");
    }
  };
  // ô tích = lớp đang được giao bài, bỏ tích là gỡ
  const openAssignModal = async () => {
    setShowAssignModal(true);
    setAssignError("");
    try {
      const data = (await api.getCodingClasses(assignmentId)) as {
        classes: ClassAssignment[];
      };
      setClasses(data.classes);
      setSelectedClassIds(
        data.classes.filter((c) => c.assigned).map((c) => c.id),
      );
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Không thể tải danh sách lớp");
    }
  };

  const allClassesSelected =
    classes.length > 0 &&
    classes.every((cls) => selectedClassIds.includes(cls.id));
  const toggleClassId = (id: number, on: boolean) =>
    setSelectedClassIds((ids) =>
      on ? [...new Set([...ids, id])] : ids.filter((x) => x !== id),
    );
  const classesToAdd = classes.filter(
    (cls) => !cls.assigned && selectedClassIds.includes(cls.id),
  );
  const classesToRemove = classes.filter(
    (cls) => cls.assigned && !selectedClassIds.includes(cls.id),
  );

  const assignToClasses = async () => {
    if (!classesToAdd.length && !classesToRemove.length) return;
    if (
      classesToRemove.length &&
      !(await confirmDialog(
        `Gỡ bài khỏi ${classesToRemove.length} lớp: ${classesToRemove
          .map((c) => c.class_name)
          .join(", ")}?\n\n` +
          "Học sinh các lớp đó sẽ không còn thấy và không vào làm được bài này nữa. " +
          "Bài đã nộp vẫn giữ nguyên.",
        { title: "Gỡ bài khỏi lớp", confirmLabel: "Gỡ bài", intent: "danger" },
      ))
    )
      return;
    setAssigningClasses(true);
    try {
      await api.setCodingClasses(assignmentId, selectedClassIds);
      setShowAssignModal(false);
      setAssignError("");
      await load();
      toast.success("Đã lưu thay đổi");
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Không thể lưu thay đổi");
    } finally {
      setAssigningClasses(false);
    }
  };
  const openEdit = () => {
    if (!assignment) return;
    const localValue = (value?: string | null) =>
      value
        ? new Date(
            new Date(value).getTime() -
              new Date(value).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : "";
    setEditData({
      title: assignment.title,
      description: assignment.description || "",
      time_limit: assignment.time_limit ? String(assignment.time_limit) : "",
      available_from: localValue(assignment.available_from),
      due_at: localValue(assignment.due_at),
      allow_late_submission: assignment.allow_late_submission,
    });
    setEditError("");
    setShowEditModal(true);
  };
  const saveMetadata = async () => {
    setSavingMetadata(true);
    setEditError("");
    try {
      await api.updateCodingAssignment(assignmentId, {
        ...editData,
        time_limit: editData.time_limit ? Number(editData.time_limit) : null,
        available_from: editData.available_from
          ? new Date(editData.available_from).toISOString()
          : null,
        due_at: editData.due_at
          ? new Date(editData.due_at).toISOString()
          : null,
      });
      setShowEditModal(false);
      await load();
      toast.success("Đã cập nhật thông tin");
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Không thể cập nhật thông tin");
    } finally {
      setSavingMetadata(false);
    }
  };
  const removeQuestion = async (questionId: number) => {
    if (
      !(await confirmDialog(
        "Gỡ bài này khỏi assignment? Câu hỏi vẫn được giữ trong ngân hàng.",
        { title: "Gỡ câu hỏi", confirmLabel: "Gỡ câu hỏi", intent: "danger" },
      ))
    )
      return;
    try {
      await api.removeCodingAssignmentQuestion(assignmentId, questionId);
      await load();
      toast.success("Đã gỡ bài");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thể xóa bài");
    }
  };
  const openQuestion = async (questionId: number) => {
    try {
      setQuestionModal({
        question: await api.getQuestion(questionId),
        saving: false,
        error: "",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thể tải câu hỏi");
    }
  };
  const saveQuestion = async () => {
    if (!questionModal) return;
    setQuestionModal((v) => (v ? { ...v, saving: true, error: "" } : v));
    try {
      const q = questionModal.question;
      await api.updateQuestion(q.id!, {
        subject: q.subject,
        grade: q.grade,
        chapter: q.chapter,
        lesson: q.lesson,
        complexity: q.complexity,
        content: q.content,
        solution: q.solution,
        coding_details: q.coding_details,
        coding_testcases: q.coding_testcases,
      });
      setQuestionModal(null);
      await load();
      toast.success("Đã lưu câu hỏi");
    } catch (e) {
      setQuestionModal((v) =>
        v
          ? {
              ...v,
              saving: false,
              error: e instanceof Error ? e.message : "Không thể lưu câu hỏi",
            }
          : v,
      );
    }
  };

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        {loading ? (
          <div className="ui-skeleton" style={{ height: 180 }} />
        ) : loadError ? (
          <MessageBar className="ui-message-bar--section" intent="error" onDismiss={() => router.push("/coding")}>
            {loadError}
          </MessageBar>
        ) : (
          assignment && (
            <>
              <PageHeader
                breadcrumbs={[{ label: "Lập trình", href: "/coding" }, { label: assignment.title, truncate: true }]}
                title={assignment.title}
                description={
                  <>
                    {questions.length} bài ·{" "}
                    {assignment.time_limit
                      ? `${assignment.time_limit} phút`
                      : "Không giới hạn thời gian"}
                  </>
                }
                actions={user?.role === "student" ? (
                  <button className="ui-button ui-button--primary" onClick={start}>
                    Bắt đầu / tiếp tục
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: ".5rem" }}>
                    <button
                      className="ui-button ui-button--secondary"
                      onClick={openAssignModal}
                    >
                      Lớp áp dụng
                    </button>
                    <AddCodingQuestion
                      assignmentId={assignmentId}
                      existingIds={questions.map((q) => q.id)}
                      onAdded={load}
                    />
                  </div>
                )}
              />
              {user?.role === "teacher" ? (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0,1fr) 320px",
                      gap: "1rem",
                      alignItems: "start",
                      marginBottom: "1rem",
                    }}
                  >
                    <div style={{ display: "grid", gap: "1rem" }}>
                      <div className="card" style={{ padding: "1.25rem" }}>
                        <h2
                          style={{
                            fontSize: "var(--font-size-sm)",
                            marginBottom: ".75rem",
                          }}
                        >
                          Mô tả
                        </h2>
                        <p
                          style={{ color: "var(--text-secondary)", margin: 0 }}
                        >
                          {assignment.description ||
                            "Chưa có mô tả cho bài lập trình này."}
                        </p>
                      </div>
                      <div className="card">
                        <h3
                          style={{
                            marginBottom: "1rem",
                            fontSize: "var(--font-size-sm)",
                          }}
                        >
                          Danh sách bài tập ({questions.length} bài)
                        </h3>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: ".625rem",
                          }}
                        >
                          {questions.map((q, i) => (
                            <div
                              key={q.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => openQuestion(q.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ")
                                  openQuestion(q.id);
                              }}
                              style={{
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: ".875rem",
                                padding: ".875rem",
                                background: "var(--bg-elevated)",
                                borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--border)",
                              }}
                            >
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: "50%",
                                  flexShrink: 0,
                                  background: "rgba(6,182,212,.12)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "#0891b2",
                                  fontSize: ".75rem",
                                  fontWeight: 700,
                                }}
                              >
                                {i + 1}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: ".4rem",
                                    marginBottom: ".35rem",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <span
                                    className="badge badge-cd"
                                    style={{
                                      fontSize: ".7rem",
                                      padding: ".15rem .45rem",
                                    }}
                                  >
                                    Lập trình
                                  </span>
                                  <span
                                    style={{
                                      color: "var(--text-muted)",
                                      fontSize: ".7rem",
                                    }}
                                  >
                                    {q.coding_details.max_submissions} lượt nộp
                                  </span>
                                </div>
                                <div
                                  style={{
                                    fontSize: ".825rem",
                                    color: "var(--text-secondary)",
                                    lineHeight: 1.5,
                                    maxHeight: "6em",
                                    overflow: "hidden",
                                    display: "-webkit-box",
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: "vertical",
                                  }}
                                >
                                  <LatexRenderer
                                    content={q.content}
                                    preserveLineBreaks
                                  />
                                </div>
                              </div>
                              <button
                                className="ui-button ui-button--danger ui-button--small"
                                style={{ flexShrink: 0 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeQuestion(q.id);
                                }}
                              >
                                <Icon name="trash" />
                                Xóa
                              </button>
                            </div>
                          ))}
                          {questions.length === 0 && (
                            <div
                              className="empty-state"
                              style={{ padding: "2rem" }}
                            >
                              <p>Chưa có bài lập trình nào</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: "1rem" }}>
                      <div className="card">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: ".75rem",
                            marginBottom: ".75rem",
                          }}
                        >
                          <h2 style={{ fontSize: ".9rem", margin: 0 }}>
                            Thông tin chung
                          </h2>
                          <button
                            className="ui-button ui-button--ghost ui-button--small"
                            onClick={openEdit}
                          >
                            <Icon name="edit" />
                            Chỉnh sửa
                          </button>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: ".5rem",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: ".75rem",
                              fontSize: ".825rem",
                            }}
                          >
                            <span style={{ color: "var(--text-secondary)" }}>
                              Thời gian
                            </span>
                            <strong>
                              {assignment.time_limit
                                ? `${assignment.time_limit} phút`
                                : "Không giới hạn"}
                            </strong>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: ".75rem",
                              fontSize: ".825rem",
                            }}
                          >
                            <span style={{ color: "var(--text-secondary)" }}>
                              Mở từ
                            </span>
                            <strong style={{ textAlign: "right" }}>
                              {assignment.available_from
                                ? new Date(
                                    assignment.available_from,
                                  ).toLocaleString("vi-VN")
                                : "Không giới hạn"}
                            </strong>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: ".75rem",
                              fontSize: ".825rem",
                            }}
                          >
                            <span style={{ color: "var(--text-secondary)" }}>
                              Hạn nộp
                            </span>
                            <strong style={{ textAlign: "right" }}>
                              {assignment.due_at
                                ? new Date(assignment.due_at).toLocaleString(
                                    "vi-VN",
                                  )
                                : "Không giới hạn"}
                            </strong>
                          </div>
                          {assignment.due_at && (
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: ".75rem",
                                fontSize: ".825rem",
                              }}
                            >
                              <span style={{ color: "var(--text-secondary)" }}>
                                Nộp muộn
                              </span>
                              <strong>
                                {assignment.allow_late_submission
                                  ? "Cho phép"
                                  : "Không"}
                              </strong>
                            </div>
                          )}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: ".75rem",
                              fontSize: ".825rem",
                            }}
                          >
                            <span style={{ color: "var(--text-secondary)" }}>
                              Trạng thái
                            </span>
                            <strong style={{ textAlign: "right" }}>
                              {assignment.status === "published"
                                ? "Đang mở"
                                : assignment.status === "closed"
                                  ? "Đã đóng"
                                  : "Bản nháp"}
                            </strong>
                          </div>
                        </div>
                      </div>
                      <div className="card">
                        <h2
                          style={{
                            fontSize: "var(--font-size-sm)",
                            marginBottom: ".5rem",
                          }}
                        >
                          Chia sẻ bài làm
                        </h2>
                        <p
                          style={{
                            color: "var(--text-secondary)",
                            fontSize: ".8rem",
                            marginBottom: ".75rem",
                          }}
                        >
                          {assignment.allow_link_access
                            ? "Đang chia sẻ. Người làm bắt buộc đăng nhập."
                            : "Bài lập trình hiện chưa được chia sẻ bằng link."}
                        </p>
                        {assignment.allow_link_access && (
                          <>
                            <div
                              style={{
                                background: "var(--bg-elevated)",
                                border: "1px solid var(--border)",
                                borderRadius: "var(--radius-sm)",
                                padding: ".6rem",
                                fontSize: ".72rem",
                                wordBreak: "break-all",
                                marginBottom: ".5rem",
                              }}
                            >{`${typeof window !== "undefined" ? window.location.origin : ""}/coding/share/${assignment.public_id}`}</div>
                            <button
                              className="ui-button ui-button--secondary ui-button--small"
                              style={{ width: "100%", marginBottom: ".5rem" }}
                              onClick={copyPublicLink}
                            >
                              <Icon name={linkCopied ? "check" : "copy"} />
                              {linkCopied ? "Đã sao chép" : "Sao chép link"}
                            </button>
                          </>
                        )}
                        <button
                          className={`ui-button ui-button--small ${assignment.allow_link_access ? "ui-button--danger" : "ui-button--primary"}`}
                          style={{ width: "100%" }}
                          onClick={async () => {
                            await api.updateCodingAssignment(assignmentId, {
                              allow_link_access: !assignment.allow_link_access,
                            });
                            await load();
                          }}
                        >
                          <Icon name={assignment.allow_link_access ? "link-off" : "share"} />
                          {assignment.allow_link_access
                            ? "Dừng chia sẻ"
                            : "Chia sẻ"}
                        </button>
                      </div>
                      <div className="card">
                        <h2
                          style={{
                            fontSize: "var(--font-size-sm)",
                            marginBottom: ".5rem",
                          }}
                        >
                          Bài đã nộp
                        </h2>
                        <p
                          style={{
                            color: "var(--text-secondary)",
                            fontSize: ".82rem",
                            marginBottom: ".75rem",
                          }}
                        >
                          {students.length} học sinh đã bắt đầu hoặc nộp bài.
                        </p>
                        <button
                          className="ui-button ui-button--primary ui-button--small"
                          style={{ width: "100%" }}
                          onClick={() => setShowSubmissions(true)}
                        >
                          Xem danh sách bài nộp
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="card" style={{ padding: "1.25rem" }}>
                    <h2
                      style={{
                        fontSize: "var(--font-size-sm)",
                        marginBottom: ".75rem",
                      }}
                    >
                      Danh sách bài ({questions.length})
                    </h2>
                    <div style={{ overflowX: "auto" }}>
                      <table className="problem-table">
                        <colgroup>
                          <col style={{ width: "34%" }} />
                          <col style={{ width: "20%" }} />
                          <col style={{ width: "14%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "12%" }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Câu</th>
                            <th>Chương</th>
                            <th>Mức độ</th>
                            <th>Lượt nộp</th>
                            <th>Điểm</th>
                            <th>Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody>
                          {questions.map((q, i) => {
                            const used = q.submission_count || 0;
                            const limit =
                              q.coding_details.max_submissions || 10;
                            const status = bestStatus(q.statuses);
                            const open = () =>
                              router.push(`/coding/${assignmentId}/${q.id}`);
                            return (
                              <tr
                                key={q.id}
                                className="is-clickable"
                                role="link"
                                tabIndex={0}
                                onClick={open}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    open();
                                  }
                                }}
                              >
                                <td className="col-text">
                                  <strong>Câu {i + 1}</strong>
                                  <span className="cell-sub">
                                    {questionSummary(q.content)}
                                  </span>
                                </td>
                                <td className="col-text">
                                  {[q.chapter, q.lesson]
                                    .filter(Boolean)
                                    .join(" · ") || "—"}
                                </td>
                                <td>
                                  {q.complexity ? (
                                    <span
                                      className={`badge complexity-${q.complexity}`}
                                    >
                                      {COMPLEXITY_LABELS[q.complexity]}
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td>
                                  {used}/{limit}
                                </td>
                                <td className="cell-score">
                                  {q.best_score != null
                                    ? Number(q.best_score).toFixed(2)
                                    : "—"}
                                  <small>
                                    /{Number(q.point_weight ?? 1).toFixed(2)}
                                  </small>
                                </td>
                                <td>
                                  <span
                                    className={`badge ${STATUS_BADGE[status] || "badge-inactive"}`}
                                  >
                                    {status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
              {showSubmissions && (
                <div
                  className="ui-modal-backdrop"
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget) setShowSubmissions(false);
                  }}
                >
                  <div
                    className="ui-modal ui-modal--large"
                  >
                    <header className="ui-modal__header">
                      <h3 className="ui-modal__title">
                        Danh sách bài nộp ({students.length})
                      </h3>
                      <button
                        className="ui-modal__close"
                        type="button"
                        aria-label="Đóng"
                        onClick={() => setShowSubmissions(false)}
                      >
                        <Icon name="close" />
                      </button>
                    </header>
                    <div
                      style={{ padding: "1.5rem", overflowY: "auto", flex: 1 }}
                    >
                      {students.length === 0 ? (
                        <div className="empty-state">
                          <p>Chưa có học sinh bắt đầu hoặc nộp bài.</p>
                        </div>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table className="problem-table people-table">
                            <colgroup>
                              <col style={{ width: "34%" }} />
                              <col style={{ width: "15%" }} />
                              <col style={{ width: "18%" }} />
                              <col style={{ width: "18%" }} />
                              <col style={{ width: "15%" }} />
                            </colgroup>
                            <thead>
                              <tr>
                                <th>Học sinh</th>
                                <th>Trạng thái</th>
                                <th>Lượt nộp</th>
                                <th>Lần nộp cuối</th>
                                <th>Thao tác</th>
                              </tr>
                            </thead>
                            <tbody>
                              {students.map((s) => (
                                <tr key={s.id}>
                                  <td className="col-text">
                                    <strong>{s.student_name}</strong>
                                    <span className="cell-sub">
                                      {s.email || "Thí sinh tự do"}
                                    </span>
                                  </td>
                                  <td>
                                    {s.has_late_submission ? (
                                      <span className="badge badge-late">
                                        Nộp muộn
                                      </span>
                                    ) : (
                                      <span
                                        className={`badge ${s.status === "completed" ? "badge-active" : "badge-inactive"}`}
                                      >
                                        {PROGRESS_LABELS[s.status] || s.status}
                                      </span>
                                    )}
                                  </td>
                                  <td>{s.submission_count}</td>
                                  <td>
                                    {s.last_submission_at
                                      ? new Date(
                                          s.last_submission_at,
                                        ).toLocaleString("vi-VN")
                                      : "—"}
                                  </td>
                                  <td>
                                    <button
                                      className="ui-button ui-button--secondary ui-button--small"
                                      onClick={() =>
                                        setViewStudentId(s.student_id)
                                      }
                                    >
                                      Chi tiết
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {viewStudentId !== null && (
                <CodingSubmissionHistory
                  assignmentId={assignmentId}
                  studentId={viewStudentId}
                  onClose={() => setViewStudentId(null)}
                />
              )}
              {showAssignModal && (
                <div
                  className="ui-modal-backdrop"
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget) setShowAssignModal(false);
                  }}
                >
                  <div
                    className="ui-modal ui-modal--large"
                  >
                    <header className="ui-modal__header">
                      <div className="ui-modal__heading">
                        <h2 className="ui-modal__title">Giao bài cho lớp</h2>
                        <p
                          className="ui-modal__description"
                        >
                          {assignment.title} · tích để giao, bỏ tích để gỡ. Lớp
                          bị gỡ sẽ không truy cập được bài nữa, bài đã nộp vẫn
                          giữ.
                        </p>
                      </div>
                      <button
                        className="ui-modal__close"
                        type="button"
                        aria-label="Đóng"
                        onClick={() => setShowAssignModal(false)}
                      >
                        <Icon name="close" />
                      </button>
                    </header>
                    <div
                      style={{
                        padding: "1.25rem 1.5rem",
                        overflowY: "auto",
                        flex: 1,
                      }}
                    >
                      {assignError && (
                        <MessageBar className="ui-message-bar--section" intent="error" onDismiss={() => setAssignError("")}>
                          {assignError}
                        </MessageBar>
                      )}
                      <div style={{ overflowX: "auto" }}>
                        <table className="problem-table pick-table">
                          <colgroup>
                            <col className="pick-col" />
                            <col style={{ width: "34%" }} />
                            <col style={{ width: "18%" }} />
                            <col style={{ width: "14%" }} />
                            <col style={{ width: "20%" }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>
                                <Checkbox
                                  aria-label="Chọn tất cả"
                                  disabled={!classes.length}
                                  checked={allClassesSelected}
                                  onChange={(e) =>
                                    setSelectedClassIds(
                                      e.target.checked
                                        ? classes.map((cls) => cls.id)
                                        : [],
                                    )
                                  }
                                />
                              </th>
                              <th>Lớp</th>
                              <th>Ngày giao</th>
                              <th>Đã nộp</th>
                              <th>Thay đổi</th>
                            </tr>
                          </thead>
                          <tbody>
                            {classes.map((cls) => {
                              const selected = selectedClassIds.includes(
                                cls.id,
                              );
                              const willAdd = selected && !cls.assigned;
                              const willRemove = !selected && cls.assigned;
                              return (
                                <tr
                                  key={cls.id}
                                  className={
                                    willRemove
                                      ? "is-removing"
                                      : willAdd
                                        ? "is-selected"
                                        : undefined
                                  }
                                  onClick={() =>
                                    toggleClassId(cls.id, !selected)
                                  }
                                >
                                  <td onClick={(e) => e.stopPropagation()}>
                                    <Checkbox
                                      aria-label={`Chọn lớp ${cls.class_name}`}
                                      checked={selected}
                                      onChange={(e) =>
                                        toggleClassId(cls.id, e.target.checked)
                                      }
                                    />
                                  </td>
                                  <td className="col-text">
                                    <strong>{cls.class_name}</strong>
                                  </td>
                                  <td>
                                    {cls.assigned_at
                                      ? new Date(
                                          cls.assigned_at,
                                        ).toLocaleDateString("vi-VN")
                                      : "—"}
                                  </td>
                                  <td>
                                    {cls.assigned
                                      ? `${cls.submitted_count}/${cls.student_count}`
                                      : "—"}
                                  </td>
                                  <td>
                                    {willRemove ? (
                                      <span className="badge badge-remove">
                                        Sẽ gỡ
                                      </span>
                                    ) : willAdd ? (
                                      <span className="badge badge-add">
                                        Sẽ giao
                                      </span>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "1rem 1.5rem",
                        borderTop: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <strong>
                        {classesToAdd.length || classesToRemove.length
                          ? [
                              classesToAdd.length &&
                                `Giao thêm ${classesToAdd.length} lớp`,
                              classesToRemove.length &&
                                `Gỡ ${classesToRemove.length} lớp`,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : `Đang ở ${selectedClassIds.length} lớp`}
                      </strong>
                      <button
                        className="ui-button ui-button--primary"
                        disabled={
                          (!classesToAdd.length && !classesToRemove.length) ||
                          assigningClasses
                        }
                        onClick={assignToClasses}
                      >
                        {assigningClasses ? "Đang lưu…" : "Lưu thay đổi"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {showEditModal && (
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 1250,
                    background: "var(--overlay)",
                    display: "grid",
                    placeItems: "center",
                    padding: "1rem",
                  }}
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget) setShowEditModal(false);
                  }}
                >
                  <div
                    className="card"
                    style={{
                      width: "min(680px,95vw)",
                      maxHeight: "90vh",
                      overflowY: "auto",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "1.25rem",
                      }}
                    >
                      <div>
                        <h2
                          style={{ margin: 0, fontSize: "var(--font-size-base)" }}
                        >
                          Chỉnh sửa thông tin
                        </h2>
                        <p
                          className="page-sub"
                          style={{ margin: ".25rem 0 0" }}
                        >
                          Metadata của đề/bài lập trình
                        </p>
                      </div>
                      <button
                        className="ui-modal__close"
                        type="button"
                        aria-label="Đóng"
                        onClick={() => setShowEditModal(false)}
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                    <div style={{ display: "grid", gap: "1rem" }}>
                      {editError && (
                        <MessageBar className="ui-message-bar--section" intent="error" onDismiss={() => setEditError("")}>
                          {editError}
                        </MessageBar>
                      )}
                      <label className="form-label">
                        Tên đề/bài
                        <input
                          className="ui-input-native"
                          value={editData.title}
                          onChange={(e) =>
                            setEditData((v) => ({
                              ...v,
                              title: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="form-label">
                        Mô tả
                        <textarea
                          className="ui-textarea"
                          rows={5}
                          value={editData.description}
                          onChange={(e) =>
                            setEditData((v) => ({
                              ...v,
                              description: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="form-label">
                        Thời gian làm bài (phút)
                        <input
                          type="number"
                          min="1"
                          className="ui-input-native"
                          placeholder="Để trống nếu không giới hạn"
                          value={editData.time_limit}
                          onChange={(e) =>
                            setEditData((v) => ({
                              ...v,
                              time_limit: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                          gap: "1rem",
                        }}
                      >
                        <label className="form-label">
                          Thời điểm mở
                          <DateTimePicker
                            value={editData.available_from}
                            onChange={(value) =>
                              setEditData((v) => ({
                                ...v,
                                available_from: value,
                              }))
                            }
                          />
                        </label>
                        <label className="form-label">
                          Hạn nộp
                          <DateTimePicker
                            value={editData.due_at}
                            onChange={(value) =>
                              setEditData((v) => ({
                                ...v,
                                due_at: value,
                              }))
                            }
                          />
                        </label>
                      </div>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: ".6rem",
                        }}
                      >
                        <Checkbox
                          checked={editData.allow_late_submission}
                          onChange={(e) =>
                            setEditData((v) => ({
                              ...v,
                              allow_late_submission: e.target.checked,
                            }))
                          }
                        />
                        Cho phép nộp sau hạn
                      </label>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: ".5rem",
                        marginTop: "1.5rem",
                      }}
                    >
                      <button
                        className="ui-button ui-button--secondary"
                        onClick={() => setShowEditModal(false)}
                      >
                        Hủy
                      </button>
                      <button
                        className="ui-button ui-button--primary"
                        disabled={savingMetadata || !editData.title.trim()}
                        onClick={saveMetadata}
                      >
                        {savingMetadata ? "Đang lưu…" : "Lưu thay đổi"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {questionModal && (
                <div
                  className="ui-modal-backdrop"
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget) setQuestionModal(null);
                  }}
                >
                  <div
                    className="ui-modal ui-modal--large"
                  >
                    <header className="ui-modal__header">
                      <h3 className="ui-modal__title">Chi tiết câu hỏi lập trình</h3>
                      <button
                        className="ui-modal__close"
                        type="button"
                        aria-label="Đóng"
                        onClick={() => setQuestionModal(null)}
                      >
                        <Icon name="close" />
                      </button>
                    </header>
                    <div
                      style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}
                    >
                      <QuestionEditor
                        qData={questionModal.question}
                        onChange={(question) =>
                          setQuestionModal((v) => (v ? { ...v, question } : v))
                        }
                        curriculum={subjects}
                        imageEditable
                      />
                      {questionModal.error && (
                        <MessageBar
                          intent="error"
                          className="ui-message-bar--spaced"
                          onDismiss={() =>
                            setQuestionModal((value) =>
                              value ? { ...value, error: "" } : value,
                            )
                          }
                        >
                          {questionModal.error}
                        </MessageBar>
                      )}
                    </div>
                    <div
                      style={{
                        padding: "1rem 1.5rem",
                        borderTop: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: ".5rem",
                      }}
                    >
                      <button
                        className="ui-button ui-button--secondary"
                        onClick={() => setQuestionModal(null)}
                      >
                        Đóng
                      </button>
                      <button
                        className="ui-button ui-button--primary"
                        disabled={questionModal.saving}
                        onClick={saveQuestion}
                      >
                        {questionModal.saving ? "Đang lưu…" : "Lưu và cập nhật"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )
        )}
      </main>
    </div>
  );
}
