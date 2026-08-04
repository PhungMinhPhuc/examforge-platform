"use client";

import { use, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import LatexRenderer from "@/components/LatexRenderer";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import CodingWorkspace from "@/modules/coding/CodingWorkspace";
import type {
  CodingAssignment,
  CodingQuestion,
  CodingStudentProgress,
} from "@/modules/coding/types";
import AddCodingQuestion from "@/modules/coding/AddCodingQuestion";
import CodingSubmissionHistory from "@/modules/coding/CodingSubmissionHistory";
import { QuestionEditor, QuestionDetail } from "@/components/QuestionEditor";

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
  const [assignment, setAssignment] = useState<CodingAssignment | null>(null);
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [students, setStudents] = useState<CodingStudentProgress[]>([]);
  const [classes, setClasses] = useState<
    Array<{ id: number; class_name: string }>
  >([]);
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
  const [error, setError] = useState("");

  const load = async () => {
    const result = await api.getCodingAssignment(assignmentId);
    setAssignment(result.assignment);
    setQuestions(result.questions);
    setStudents(result.students || []);
  };
  useEffect(() => {
    if (user)
      load()
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
  }, [user, assignmentId]);
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
  const submit = async (
    questionId: number,
    sourceCode: string,
    language: string,
  ) => {
    const result = await api.submitCodingCode(assignmentId, questionId, {
      source_code: sourceCode,
      language,
    });
    await load();
    return result;
  };
  const assignToClasses = async () => {
    if (!selectedClassIds.length) return;
    setAssigningClasses(true);
    try {
      await Promise.all(
        selectedClassIds.map((classId) =>
          api.assignExistingToClass(classId, "coding", assignmentId),
        ),
      );
      setShowAssignModal(false);
      setSelectedClassIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể giao bài");
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
    setShowEditModal(true);
  };
  const saveMetadata = async () => {
    setSavingMetadata(true);
    setError("");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể cập nhật thông tin");
    } finally {
      setSavingMetadata(false);
    }
  };
  const removeQuestion = async (questionId: number) => {
    if (
      !confirm(
        "Gỡ bài này khỏi assignment? Câu hỏi vẫn được giữ trong ngân hàng.",
      )
    )
      return;
    setError("");
    try {
      await api.removeCodingAssignmentQuestion(assignmentId, questionId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể xóa bài");
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
      setError(e instanceof Error ? e.message : "Không thể tải câu hỏi");
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
          <div className="skeleton" style={{ height: 180 }} />
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : (
          assignment && (
            <>
              <div className="page-header">
                <div>
                  <div className="page-sub" style={{ marginBottom: ".3rem" }}>
                    Lập trình / Chi tiết
                  </div>
                  <h1 className="page-title">{assignment.title}</h1>
                  <p className="page-sub">
                    {questions.length} bài ·{" "}
                    {assignment.time_limit
                      ? `${assignment.time_limit} phút`
                      : "Không giới hạn thời gian"}
                  </p>
                </div>
                {user?.role === "student" ? (
                  <button className="btn btn-primary" onClick={start}>
                    Bắt đầu / tiếp tục
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: ".5rem" }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setSelectedClassIds([]);
                        setShowAssignModal(true);
                      }}
                    >
                      Giao bài
                    </button>
                    <AddCodingQuestion
                      assignmentId={assignmentId}
                      existingIds={questions.map((q) => q.id)}
                      onAdded={load}
                    />
                  </div>
                )}
              </div>
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
                          style={{ fontSize: "1rem", marginBottom: ".75rem" }}
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
                        <h3 style={{ marginBottom: "1rem", fontSize: "1rem" }}>
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
                                className="btn btn-danger btn-sm"
                                style={{ flexShrink: 0 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeQuestion(q.id);
                                }}
                              >
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
                            className="btn btn-ghost btn-sm"
                            onClick={openEdit}
                          >
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
                          <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", fontSize: ".825rem" }}>
                            <span style={{ color: "var(--text-secondary)" }}>Thời gian</span>
                            <strong>{assignment.time_limit ? `${assignment.time_limit} phút` : "Không giới hạn"}</strong>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", fontSize: ".825rem" }}>
                            <span style={{ color: "var(--text-secondary)" }}>Mở từ</span>
                            <strong style={{ textAlign: "right" }}>{assignment.available_from ? new Date(assignment.available_from).toLocaleString("vi-VN") : "Không giới hạn"}</strong>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", fontSize: ".825rem" }}>
                            <span style={{ color: "var(--text-secondary)" }}>Hạn nộp</span>
                            <strong style={{ textAlign: "right" }}>{assignment.due_at ? new Date(assignment.due_at).toLocaleString("vi-VN") : "Không giới hạn"}</strong>
                          </div>
                          {assignment.due_at && <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", fontSize: ".825rem" }}>
                            <span style={{ color: "var(--text-secondary)" }}>Nộp muộn</span>
                            <strong>{assignment.allow_late_submission ? "Cho phép" : "Không"}</strong>
                          </div>}
                          <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", fontSize: ".825rem" }}>
                            <span style={{ color: "var(--text-secondary)" }}>Trạng thái</span>
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
                        <h2 style={{ fontSize: "1rem", marginBottom: ".5rem" }}>
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
                              className="btn btn-secondary btn-sm"
                              style={{ width: "100%", marginBottom: ".5rem" }}
                              onClick={() =>
                                navigator.clipboard.writeText(
                                  `${window.location.origin}/coding/share/${assignment.public_id}`,
                                )
                              }
                            >
                              Sao chép link
                            </button>
                          </>
                        )}
                        <button
                          className={`btn btn-sm ${assignment.allow_link_access ? "btn-danger" : "btn-primary"}`}
                          style={{ width: "100%" }}
                          onClick={async () => {
                            await api.updateCodingAssignment(assignmentId, {
                              allow_link_access: !assignment.allow_link_access,
                            });
                            await load();
                          }}
                        >
                          {assignment.allow_link_access
                            ? "Dừng chia sẻ"
                            : "Chia sẻ"}
                        </button>
                      </div>
                      <div className="card">
                        <h2 style={{ fontSize: "1rem", marginBottom: ".5rem" }}>
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
                          className="btn btn-primary btn-sm"
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
                questions.map((q, i) => (
                  <CodingWorkspace
                    key={q.id}
                    question={q}
                    questionNumber={i + 1}
                    onSubmit={(code, lang) => submit(q.id, code, lang)}
                  />
                ))
              )}
              {showSubmissions && (
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 1250,
                    background: "rgba(0,0,0,.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "1rem",
                  }}
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget) setShowSubmissions(false);
                  }}
                >
                  <div
                    className="card modal-wide-responsive"
                    style={{
                      width: "90vw",
                      maxWidth: 1200,
                      height: "90vh",
                      display: "flex",
                      flexDirection: "column",
                      padding: 0,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "1.5rem",
                        borderBottom: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <h3 style={{ margin: 0 }}>
                        Danh sách bài nộp ({students.length})
                      </h3>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ width: 32, height: 32, padding: 0 }}
                        onClick={() => setShowSubmissions(false)}
                      >
                        ✕
                      </button>
                    </div>
                    <div
                      style={{ padding: "1.5rem", overflowY: "auto", flex: 1 }}
                    >
                      {students.length === 0 ? (
                        <div className="empty-state">
                          <p>Chưa có học sinh bắt đầu hoặc nộp bài.</p>
                        </div>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table
                            className="coding-student-table"
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                              fontSize: ".875rem",
                            }}
                          >
                            <thead>
                              <tr
                                style={{
                                  borderBottom: "1px solid var(--border)",
                                }}
                              >
                                <th style={{ padding: ".75rem" }}>Học sinh</th>
                                <th style={{ padding: ".75rem" }}>
                                  Trạng thái
                                </th>
                                <th style={{ padding: ".75rem" }}>Lượt nộp</th>
                                <th style={{ padding: ".75rem" }}>
                                  Lần nộp cuối
                                </th>
                                <th style={{ padding: ".75rem" }}>Thao tác</th>
                              </tr>
                            </thead>
                            <tbody>
                              {students.map((s) => (
                                <tr
                                  key={s.id}
                                  style={{
                                    borderBottom: "1px solid var(--border)",
                                  }}
                                >
                                  <td style={{ padding: ".75rem" }}>
                                    <strong>{s.student_name}</strong>
                                    <div
                                      style={{
                                        color: "var(--text-secondary)",
                                        fontSize: ".75rem",
                                      }}
                                    >
                                      {s.email}
                                    </div>
                                  </td>
                                  <td style={{ padding: ".75rem" }}>
                                    {s.status}
                                    {s.has_late_submission && (
                                      <span className="badge badge-late" style={{ marginLeft: ".5rem" }}>
                                        Nộp muộn
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ padding: ".75rem" }}>
                                    {s.submission_count}
                                  </td>
                                  <td style={{ padding: ".75rem" }}>
                                    {s.last_submission_at
                                      ? new Date(
                                          s.last_submission_at,
                                        ).toLocaleString("vi-VN")
                                      : "—"}
                                  </td>
                                  <td style={{ padding: ".75rem" }}>
                                    <button
                                      className="btn btn-secondary btn-sm"
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
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 1200,
                    background: "rgba(15,23,42,.58)",
                    display: "grid",
                    placeItems: "center",
                    padding: "2.5vh",
                  }}
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget) setShowAssignModal(false);
                  }}
                >
                  <div
                    className="card modal-wide-responsive"
                    style={{
                      width: "95vw",
                      maxWidth: 1400,
                      height: "95vh",
                      padding: 0,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "1.25rem 1.5rem",
                        borderBottom: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <h2 style={{ margin: 0 }}>Giao bài cho lớp</h2>
                        <p
                          className="page-sub"
                          style={{ margin: ".25rem 0 0" }}
                        >
                          {assignment.title}
                        </p>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowAssignModal(false)}
                      >
                        Đóng
                      </button>
                    </div>
                    <div
                      style={{
                        padding: "1.25rem 1.5rem",
                        overflowY: "auto",
                        flex: 1,
                      }}
                    >
                      <div className="assignment-class-list">
                        {classes.map((cls) => {
                          const assigned = assignment.assigned_class_ids?.includes(cls.id) || false;
                          return (
                            <label
                              key={cls.id}
                              className={`assignment-class-row${assigned ? " is-assigned" : selectedClassIds.includes(cls.id) ? " is-selected" : ""}`}
                            >
                              <input
                                type="checkbox"
                                disabled={assigned}
                                checked={assigned || selectedClassIds.includes(cls.id)}
                                onChange={(e) =>
                                  setSelectedClassIds((ids) =>
                                    e.target.checked
                                      ? [...ids, cls.id]
                                      : ids.filter((id) => id !== cls.id),
                                  )
                                }
                              />
                              <strong>{cls.class_name}</strong>
                              {assigned && <span className="badge badge-active" style={{ marginLeft: "auto" }}>Đã giao</span>}
                            </label>
                          );
                        })}
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
                      <strong>Đã chọn: {selectedClassIds.length} lớp</strong>
                      <button
                        className="btn btn-primary"
                        disabled={!selectedClassIds.length || assigningClasses}
                        onClick={assignToClasses}
                      >
                        {assigningClasses ? "Đang giao…" : "Giao đề"}
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
                    background: "rgba(15,23,42,.58)",
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
                        <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
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
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowEditModal(false)}
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ display: "grid", gap: "1rem" }}>
                      <label className="form-label">
                        Tên đề/bài
                        <input
                          className="input"
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
                          className="textarea"
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
                          className="input"
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
                          <input
                            type="datetime-local"
                            className="input"
                            style={{ width: "100%", minWidth: 0 }}
                            value={editData.available_from}
                            onChange={(e) =>
                              setEditData((v) => ({
                                ...v,
                                available_from: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="form-label">
                          Hạn nộp
                          <input
                            type="datetime-local"
                            className="input"
                            style={{ width: "100%", minWidth: 0 }}
                            value={editData.due_at}
                            onChange={(e) =>
                              setEditData((v) => ({
                                ...v,
                                due_at: e.target.value,
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
                        <input
                          type="checkbox"
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
                        className="btn btn-secondary"
                        onClick={() => setShowEditModal(false)}
                      >
                        Hủy
                      </button>
                      <button
                        className="btn btn-primary"
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
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 1350,
                    background: "rgba(0,0,0,.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "2.5vh 2.5vw",
                  }}
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget) setQuestionModal(null);
                  }}
                >
                  <div
                    className="modal-wide-responsive"
                    style={{
                      width: "95vw",
                      maxWidth: 1400,
                      height: "95vh",
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
                      <h3 style={{ margin: 0 }}>Chi tiết câu hỏi lập trình</h3>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setQuestionModal(null)}
                      >
                        ✕
                      </button>
                    </div>
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
                        <div
                          className="alert alert-error"
                          style={{ marginTop: "1rem" }}
                        >
                          {questionModal.error}
                        </div>
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
                        className="btn btn-secondary"
                        onClick={() => setQuestionModal(null)}
                      >
                        Đóng
                      </button>
                      <button
                        className="btn btn-primary"
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
