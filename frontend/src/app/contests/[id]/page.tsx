"use client";

import { useEffect, useState, use } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import LatexRenderer from "@/components/LatexRenderer";
import api from "@/lib/api";
import Link from "next/link";
import { QuestionEditor, QuestionDetail } from "@/components/QuestionEditor";
import ExportContestModal from "@/components/ExportContestModal";
import NumberInput from "@/components/NumberInput";
import useScrollRestoration from "@/lib/useScrollRestoration";
import { toast } from "@/lib/toastStore";
import DateTimePicker from "@/components/DateTimePicker";
import { Icon } from "@/components/icons";
import PageHeader from "@/components/PageHeader";
import Checkbox from "@/components/Checkbox";
import MessageBar from "@/components/MessageBar";
import { confirmDialog } from "@/lib/confirmDialog";

type QuestionInContest = {
  id: number;
  question_type: string;
  content: any; // cây tài liệu (jsonb) — xem frontend/src/lib/docTree.ts
  layout_type: string;
  original_order: number;
  point_weight: number;
  chapter?: string;
  lesson?: string;
  complexity?: number;
  parent_id?: number | null;
  children?: QuestionInContest[];
  images?: {
    id?: number;
    storage_path: string;
    width?: number;
    img_type?: string;
  }[];
};

type Contest = {
  id: number;
  title: string;
  time_limit: number;
  status: string;
  public_id: string;
  assigned_class_ids?: number[];
  scoring_config?: Record<string, number>;
  allow_guest_link: boolean;
  available_from?: string | null;
  due_at?: string | null;
  allow_late_submission?: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  mc: "Trắc nghiệm",
  tf: "Đúng/Sai",
  sa: "Trả lời ngắn",
  oe: "Tự luận",
  st: "Chung giả thiết",
  cd: "Lập trình",
};

const TYPE_COLORS: Record<string, string> = {
  mc: "var(--type-mc)",
  tf: "var(--type-tf)",
  sa: "var(--type-sa)",
  oe: "var(--type-oe)",
  st: "var(--tone-purple-text)",
  cd: "var(--type-cd)",
};
const TYPE_SOFT: Record<string, string> = {
  mc: "var(--type-mc-soft)",
  tf: "var(--type-tf-soft)",
  sa: "var(--type-sa-soft)",
  oe: "var(--type-oe-soft)",
  cd: "var(--type-cd-soft)",
};
const TYPE_BORDER: Record<string, string> = {
  mc: "var(--type-mc-border)",
  tf: "var(--type-tf-border)",
  sa: "var(--type-sa-border)",
  oe: "var(--type-oe-border)",
  cd: "var(--type-cd-border)",
};

const typeBackground = (type: string) =>
  type === "st"
    ? "var(--tone-purple-bg)"
    : TYPE_SOFT[type] || "var(--type-mc-soft)";
const typeBorder = (type: string) =>
  type === "st"
    ? "var(--tone-purple-border)"
    : TYPE_BORDER[type] || "var(--type-mc-border)";

const COMPLEXITY_LABELS: Record<number, string> = {
  1: "Nhận biết",
  2: "Thông hiểu",
  3: "Vận dụng",
  4: "Vận dụng cao",
};

// một dòng trong bảng giao/gỡ lớp
type ClassAssignment = {
  id: number;
  class_name: string;
  assigned: boolean;
  assigned_at?: string | null;
  student_count: number;
  submitted_count: number;
};

export default function ContestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  // Safe unwrap for params in Next.js 14 vs 15
  const { id } = params instanceof Promise ? use(params) : (params as any);
  const contestId = parseInt(id);

  const [contest, setContest] = useState<Contest | null>(null);
  const [questions, setQuestions] = useState<QuestionInContest[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [contestMaxScore, setContestMaxScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [showEditContestModal, setShowEditContestModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [classOptions, setClassOptions] = useState<ClassAssignment[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [assigningClasses, setAssigningClasses] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [editContestError, setEditContestError] = useState("");
  const [showQuestionMutationWarning, setShowQuestionMutationWarning] =
    useState(true);
  const [editContestData, setEditContestData] = useState({
    title: "",
    time_limit: 0,
    available_from: "",
    due_at: "",
    allow_late_submission: false,
  });
  const [detailModal, setDetailModal] = useState<{
    question: QuestionDetail;
    saving: boolean;
    error: string;
    displayNumStr: string;
  } | null>(null);
  const [subjects, setSubjects] = useState<Record<string, unknown>>({});

  useEffect(() => {
    api
      .getSubjects()
      .then(setSubjects)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/");
    if (!isLoading && user?.role !== "teacher") router.replace("/contests");
  }, [user, isLoading, router]);

  useScrollRestoration(!loading);

  useEffect(() => {
    Promise.all([
      api.getContest(contestId),
      api.getContestSubmissions(contestId).catch(() => ({ submissions: [] })),
    ])
      .then(([res, subRes]) => {
        setContest(res.contest as Contest);
        setQuestions((res.questions || []) as QuestionInContest[]);
        setSubmissions(subRes.submissions || []);
        setContestMaxScore(subRes.max_score ?? null);
      })
      .catch((err) =>
        setLoadError(err.message || "Không thể tải thông tin đề thi"),
      )
      .finally(() => setLoading(false));
  }, [contestId]);

  const toggleStatus = async () => {
    if (!contest) return;
    setToggling(true);
    const newStatus = contest.status === "active" ? "inactive" : "active";
    try {
      await api.updateContestStatus(contest.id, newStatus);
      setContest((prev) => (prev ? { ...prev, status: newStatus } : prev));
      toast.success("Đã cập nhật trạng thái");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi cập nhật trạng thái");
    } finally {
      setToggling(false);
    }
  };

  const handleOpenEditContest = () => {
    if (!contest) return;
    setEditContestError("");
    const localValue = (value?: string | null) =>
      value
        ? new Date(
            new Date(value).getTime() -
              new Date(value).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : "";
    setEditContestData({
      title: contest.title,
      time_limit: contest.time_limit,
      available_from: localValue(contest.available_from),
      due_at: localValue(contest.due_at),
      allow_late_submission: contest.allow_late_submission || false,
    });
    setShowEditContestModal(true);
  };

  const handleSaveContest = async () => {
    if (!contest) return;
    try {
      const payload = {
        ...editContestData,
        available_from: editContestData.available_from
          ? new Date(editContestData.available_from).toISOString()
          : null,
        due_at: editContestData.due_at
          ? new Date(editContestData.due_at).toISOString()
          : null,
      };
      await api.updateContest(contest.id, payload);
      setContest({
        ...contest,
        title: editContestData.title,
        time_limit: editContestData.time_limit,
        available_from: payload.available_from,
        due_at: payload.due_at,
        allow_late_submission: editContestData.allow_late_submission,
      });
      setShowEditContestModal(false);
    } catch (e: unknown) {
      setEditContestError(
        e instanceof Error ? e.message : "Lỗi cập nhật đề thi",
      );
    }
  };

  const examUrl =
    typeof window !== "undefined" && contest
      ? `${window.location.origin}/exam/share/${contest.public_id}`
      : "";

  const copyLink = () => {
    navigator.clipboard.writeText(examUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const toggleGuestLink = async () => {
    if (!contest) return;
    const enabled = !contest.allow_guest_link;
    await api.updateContest(contest.id, { allow_guest_link: enabled });
    setContest({ ...contest, allow_guest_link: enabled });
  };

  // ô tích = lớp đang được giao đề, bỏ tích là gỡ
  const openAssignModal = async () => {
    setAssignError("");
    setShowAssignModal(true);
    try {
      const data = (await api.getContestClasses(contestId)) as {
        classes: ClassAssignment[];
      };
      setClassOptions(data.classes);
      setSelectedClassIds(
        data.classes.filter((c) => c.assigned).map((c) => c.id),
      );
    } catch (e) {
      setAssignError(
        e instanceof Error ? e.message : "Không thể tải danh sách lớp",
      );
    }
  };

  const allClassesSelected =
    classOptions.length > 0 &&
    classOptions.every((cls) => selectedClassIds.includes(cls.id));
  const toggleClassId = (id: number, on: boolean) =>
    setSelectedClassIds((ids) =>
      on ? [...new Set([...ids, id])] : ids.filter((x) => x !== id),
    );
  const classesToAdd = classOptions.filter(
    (cls) => !cls.assigned && selectedClassIds.includes(cls.id),
  );
  const classesToRemove = classOptions.filter(
    (cls) => cls.assigned && !selectedClassIds.includes(cls.id),
  );

  const assignToClasses = async () => {
    if (!classesToAdd.length && !classesToRemove.length) return;
    if (
      classesToRemove.length &&
      !(await confirmDialog(
        `Gỡ đề khỏi ${classesToRemove.length} lớp: ${classesToRemove
          .map((c) => c.class_name)
          .join(", ")}?\n\n` +
          "Học sinh các lớp đó sẽ không còn thấy và không vào làm được đề này nữa. " +
          "Bài đã nộp vẫn giữ nguyên.",
        { title: "Gỡ đề khỏi lớp", confirmLabel: "Gỡ đề", intent: "danger" },
      ))
    )
      return;
    setAssigningClasses(true);
    try {
      await api.setContestClasses(contestId, selectedClassIds);
      setContest((current) =>
        current
          ? { ...current, assigned_class_ids: [...selectedClassIds] }
          : current,
      );
      setShowAssignModal(false);
      toast.success("Đã lưu thay đổi");
    } catch (e) {
      setAssignError(
        e instanceof Error ? e.message : "Không thể lưu thay đổi",
      );
    } finally {
      setAssigningClasses(false);
    }
  };

  const openDetail = async (questionId: number, displayNumStr: string) => {
    if (user?.role !== "teacher") return;
    try {
      const q = await api.getQuestion(questionId);
      setShowQuestionMutationWarning(true);
      setDetailModal({ question: q, saving: false, error: "", displayNumStr });
    } catch {
      /* ignore */
    }
  };

  const saveDetail = async () => {
    if (!detailModal) return;
    if (
      !(await confirmDialog(
        "Bạn có chắc chắn muốn lưu?\n\nLưu ý: Việc thay đổi sẽ ảnh hưởng đến TOÀN BỘ các đề thi khác đang chứa câu hỏi này!",
        { title: "Lưu thay đổi câu hỏi gốc", confirmLabel: "Lưu thay đổi" },
      ))
    )
      return;

    setDetailModal((d) => (d ? { ...d, saving: true, error: "" } : d));
    try {
      const q = detailModal.question;
      await api.updateQuestion(q.id!, {
        subject: q.subject,
        grade: q.grade,
        chapter: q.chapter,
        lesson: q.lesson,
        complexity: q.complexity,
        content: q.content,
        solution: q.solution,
        details: q.details?.map((d: any) => ({
          id: d.id,
          content: d.content,
          is_correct: d.is_correct,
        })),
      });

      if (q.question_type === "st" && q.children && q.children.length > 0) {
        for (const child of q.children) {
          if (child.id) {
            await api.updateQuestion(child.id, {
              subject: child.subject,
              grade: child.grade,
              chapter: child.chapter,
              lesson: child.lesson,
              complexity: child.complexity,
              content: child.content,
              solution: child.solution,
              details: child.details?.map((d: any) => ({
                id: d.id,
                content: d.content,
                is_correct: d.is_correct,
              })),
            });
          }
        }
      }

      setDetailModal(null);
      const res = await api.getContest(contestId);
      setQuestions(res.questions as QuestionInContest[]);
      toast.success("Đã lưu câu hỏi");
    } catch (e: any) {
      setDetailModal((d) =>
        d ? { ...d, saving: false, error: e.message || "Lỗi lưu câu hỏi" } : d,
      );
    }
  };

  const questionCounts = questions.reduce(
    (acc, q) => {
      acc[q.question_type] = (acc[q.question_type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const actualQuestions = questions.filter((q) => q.question_type !== "st");
  const summaryParts = [];
  if (questionCounts.mc > 0) summaryParts.push(`${questionCounts.mc} TN`);
  if (questionCounts.tf > 0) summaryParts.push(`${questionCounts.tf} ĐS`);
  if (questionCounts.sa > 0) summaryParts.push(`${questionCounts.sa} TLN`);
  if (questionCounts.oe > 0) summaryParts.push(`${questionCounts.oe} TL`);
  const summaryText =
    actualQuestions.length > 0
      ? `${actualQuestions.length} câu` +
        (summaryParts.length > 0 ? ` (${summaryParts.join(", ")})` : "")
      : "0 câu";

  const topLevelQs = questions.filter(
    (q) => q.question_type === "st" || !q.parent_id,
  );
  topLevelQs.forEach((q) => {
    if (q.question_type === "st") {
      q.children = questions.filter((c) => c.parent_id === q.id);
    }
  });

  const sortOrder = { mc: 1, tf: 2, sa: 3, oe: 4, st: 5 };
  const getSortType = (q: any) => {
    if (q.question_type === "st" && q.children && q.children.length > 0) {
      return q.children[0].question_type;
    }
    return q.question_type;
  };
  const sortedTopLevelQs = [...topLevelQs].sort(
    (a, b) =>
      (sortOrder[getSortType(a) as keyof typeof sortOrder] || 99) -
      (sortOrder[getSortType(b) as keyof typeof sortOrder] || 99),
  );

  let currentQuestionIndex = 1;
  const renderedQuestions = sortedTopLevelQs.map((q) => {
    const isSt = q.question_type === "st";
    const childCount = q.children ? q.children.length : 0;
    const startIdx = currentQuestionIndex;
    const endIdx = isSt
      ? currentQuestionIndex + childCount - 1
      : currentQuestionIndex;

    if (isSt) {
      currentQuestionIndex += childCount;
    } else {
      currentQuestionIndex += 1;
    }

    return { ...q, startIdx, endIdx };
  });

  if (loading)
    return (
      <div className="page-wrapper">
        <Sidebar />
        <main className="main-content">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              paddingTop: "2rem",
            }}
          >
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="ui-skeleton"
                style={{ height: "80px", borderRadius: "var(--radius-lg)" }}
              />
            ))}
          </div>
        </main>
      </div>
    );

  if (loadError || !contest)
    return (
      <div className="page-wrapper">
        <Sidebar />
        <main className="main-content">
          <MessageBar
            intent="error"
            onDismiss={() => router.push("/contests")}
          >
            {loadError || "Không tìm thấy đề thi"}
          </MessageBar>
          <Link
            href="/contests"
            className="ui-button ui-button--ghost"
            style={{ marginTop: "1rem" }}
          >
            Quay lại
          </Link>
        </main>
      </div>
    );

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        {/* Header */}
        <PageHeader
          breadcrumbs={[{ label: "Đề thi", href: "/contests" }, { label: contest.title, truncate: true }]}
          title={contest.title}
          actions={<>
            <Link
              href={`/exam/${contestId}`}
              className="ui-button ui-button--ghost ui-button--small"
              target="_blank"
            >
              <Icon name="eye" />
              Xem trước
            </Link>
            <button
              className={`ui-button ui-button--small ${contest.status === "active" ? "ui-button--danger" : "ui-button--primary"}`}
              onClick={toggleStatus}
              disabled={toggling}
            >
              {toggling ? (
                <span className="ui-spinner" />
              ) : contest.status === "active" ? (
                " Đóng đề"
              ) : (
                " Mở đề"
              )}
            </button>
          </>}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 320px",
            gap: "1.5rem",
            alignItems: "start",
          }}
        >
          {/* Question list */}
          <div className="card">
            <h3
              style={{ marginBottom: "1rem", fontSize: "var(--font-size-sm)" }}
            >
              Danh sách câu hỏi ({topLevelQs.length} mục -{" "}
              {actualQuestions.length} câu)
            </h3>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.625rem",
              }}
            >
              {renderedQuestions.map((q) => (
                <div key={q.id}>
                  <div
                    onClick={() => {
                      if (q.question_type === "st")
                        openDetail(q.id, `${q.startIdx} - ${q.endIdx}`);
                      else openDetail(q.id, `${q.startIdx}`);
                    }}
                    style={{
                      cursor: user?.role === "teacher" ? "pointer" : "default",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.875rem",
                      padding: "0.875rem",
                      background: "var(--bg-elevated)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                      marginBottom:
                        q.question_type === "st" &&
                        q.children &&
                        q.children.length > 0
                          ? "0.5rem"
                          : "0",
                    }}
                  >
                    {/* Order number */}
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: typeBackground(q.question_type),
                        border: `1px solid ${typeBorder(q.question_type)}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "var(--font-size-2xs)",
                        fontWeight: 700,
                        color:
                          TYPE_COLORS[q.question_type] ||
                          "var(--accent-primary)",
                      }}
                    >
                      {q.question_type === "st" ? "" : q.startIdx}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          gap: "0.4rem",
                          marginBottom: "0.35rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "var(--font-size-3xs)",
                            fontWeight: 600,
                            padding: "0.15rem 0.45rem",
                            borderRadius: 99,
                            background: typeBackground(q.question_type),
                            color:
                              TYPE_COLORS[q.question_type] ||
                              "var(--accent-primary)",
                            border: `1px solid ${typeBorder(q.question_type)}`,
                          }}
                        >
                          {TYPE_LABELS[q.question_type] || q.question_type}
                        </span>
                        {q.question_type === "st" &&
                          q.children &&
                          q.children.length > 0 &&
                          Array.from(
                            new Set(q.children.map((c) => c.question_type)),
                          ).map((type: any) => (
                            <span
                              key={type}
                              style={{
                                fontSize: "var(--font-size-3xs)",
                                fontWeight: 600,
                                padding: "0.15rem 0.45rem",
                                borderRadius: 99,
                                background: typeBackground(type),
                                color:
                                  TYPE_COLORS[type] || "var(--accent-primary)",
                                border: `1px solid ${typeBorder(type)}`,
                              }}
                            >
                              {TYPE_LABELS[type] || type}
                            </span>
                          ))}
                        {q.chapter && (
                          <span
                            style={{
                              fontSize: "var(--font-size-3xs)",
                              color: "var(--text-muted)",
                            }}
                          >
                            {q.chapter}
                          </span>
                        )}
                        {q.complexity && (
                          <span
                            style={{
                              fontSize: "var(--font-size-3xs)",
                              color: "var(--text-muted)",
                            }}
                          >
                            • {COMPLEXITY_LABELS[q.complexity] || q.complexity}
                          </span>
                        )}
                      </div>
                      {q.question_type === "st" &&
                        q.children &&
                        q.children.length > 0 && (
                          <div
                            style={{
                              fontSize: "0.85rem",
                              fontWeight: 600,
                              marginBottom: "0.5rem",
                              color: "var(--text-primary)",
                            }}
                          >
                            Dựa vào thông tin sau để trả lời từ câu {q.startIdx}{" "}
                            đến câu {q.endIdx}:
                          </div>
                        )}
                      <div
                        style={{
                          // Chữ thật nằm trong LatexRenderer (con), tự set
                          // font-size riêng qua class .latex-content — nên
                          // "fontSize" đặt ở div cha này không có tác dụng.
                          // Ghi đè thẳng biến --font-size-base mà .latex-content
                          // đang dùng, chỉ trong phạm vi div này — không đụng
                          // .question-content/.latex-content ở nơi khác.
                          ["--font-size-base" as string]: "var(--font-size-xs)",
                          color: "var(--text-primary)",
                          lineHeight: 1.5,
                          maxHeight: "6em",
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        <LatexRenderer
                          content={q.content || ""}
                          layoutType={q.layout_type}
                          images={q.images}
                        />
                      </div>
                    </div>

                    {/* Weight */}
                    <div
                      style={{
                        fontSize: "var(--font-size-2xs)",
                        color: "var(--text-muted)",
                        flexShrink: 0,
                        textAlign: "right",
                      }}
                    >
                      {q.point_weight > 0 ? `×${q.point_weight}` : ""}
                    </div>
                  </div>

                  {/* Children of ST */}
                  {q.question_type === "st" &&
                    q.children &&
                    q.children.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem",
                          marginBottom: "1rem",
                        }}
                      >
                        {q.children.map((child, cIdx) => (
                          <div
                            key={child.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetail(q.id, `${q.startIdx} - ${q.endIdx}`);
                            }}
                            style={{
                              cursor:
                                user?.role === "teacher"
                                  ? "pointer"
                                  : "default",
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "0.75rem",
                              padding: "0.75rem",
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
                                background: typeBackground(child.question_type),
                                border: `1px solid ${typeBorder(child.question_type)}`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "var(--font-size-2xs)",
                                fontWeight: 700,
                                color:
                                  TYPE_COLORS[child.question_type] ||
                                  "var(--accent-primary)",
                              }}
                            >
                              {q.startIdx + cIdx}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: "var(--font-size-xs)",
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
                                  content={child.content || ""}
                                  layoutType={child.layout_type}
                                  images={child.images}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              ))}
              {questions.length === 0 && (
                <div className="empty-state" style={{ padding: "2rem" }}>
                  <div className="empty-state-icon"></div>
                  <p>Chưa có câu hỏi nào trong đề thi</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar info */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            {/* General info */}
            <div className="card" style={{ padding: "1.25rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: ".75rem",
                  marginBottom: ".875rem",
                }}
              >
                <h4 style={{ margin: 0, fontSize: "0.9rem" }}>
                  Thông tin chung
                </h4>
                <button
                  className="ui-button ui-button--ghost ui-button--small"
                  onClick={handleOpenEditContest}
                >
                  <Icon name="edit" />
                  Chỉnh sửa
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "var(--font-size-xs)",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Thời gian
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {contest.time_limit} phút
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: ".75rem",
                    fontSize: "var(--font-size-xs)",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>Mở từ</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>
                    {contest.available_from
                      ? new Date(contest.available_from).toLocaleString("vi-VN")
                      : "Không giới hạn"}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: ".75rem",
                    fontSize: "var(--font-size-xs)",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Hạn nộp
                  </span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>
                    {contest.due_at
                      ? new Date(contest.due_at).toLocaleString("vi-VN")
                      : "Không giới hạn"}
                  </span>
                </div>
                {contest.due_at && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "var(--font-size-xs)",
                    }}
                  >
                    <span style={{ color: "var(--text-secondary)" }}>
                      Nộp muộn
                    </span>
                    <span style={{ fontWeight: 600 }}>
                      {contest.allow_late_submission ? "Cho phép" : "Không"}
                    </span>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "var(--font-size-xs)",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Trạng thái
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color:
                        contest.status === "active"
                          ? "var(--accent-primary)"
                          : "var(--text-muted)",
                    }}
                  >
                    {contest.status === "active" ? "Đang mở" : "Đóng"}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="card" style={{ padding: "1.25rem" }}>
              <h4 style={{ marginBottom: "0.875rem", fontSize: "0.9rem" }}>
                {" "}
                Thao tác
              </h4>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <button
                  onClick={() => setShowSubmissions(true)}
                  className="ui-button ui-button--primary ui-button--small"
                  style={{ width: "100%" }}
                >
                  Danh sách đã nộp ({submissions.length})
                </button>
                <button
                  className="ui-button ui-button--secondary ui-button--small"
                  style={{ width: "100%" }}
                  onClick={openAssignModal}
                >
                  Lớp áp dụng
                </button>
                <button
                  className="ui-button ui-button--secondary ui-button--small"
                  style={{ width: "100%" }}
                  onClick={() => setShowExportModal(true)}
                >
                  <Icon name="export" />
                  Xuất đề thi
                </button>
              </div>
            </div>

            {/* Share link */}
            <div className="card" style={{ padding: "1.25rem" }}>
              <h4 style={{ marginBottom: "0.875rem", fontSize: "0.9rem" }}>
                Chia sẻ đề thi
              </h4>
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: ".8rem",
                  marginBottom: ".75rem",
                }}
              >
                {contest.allow_guest_link
                  ? "Đang chia sẻ. Người làm chỉ cần nhập tên."
                  : "Đề thi hiện chưa được chia sẻ bằng link."}
              </p>
              {contest.allow_guest_link && (
                <div
                  style={{
                    background: "var(--bg-elevated)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.625rem 0.75rem",
                    fontSize: "var(--font-size-2xs)",
                    color: "var(--text-secondary)",
                    wordBreak: "break-all",
                    border: "1px solid var(--border)",
                    marginBottom: "0.75rem",
                  }}
                >
                  {examUrl || `…/exam/share/${contest.public_id}`}
                </div>
              )}
              {contest.allow_guest_link && (
                <button
                  className={`ui-button ui-button--small ${copied ? "ui-button--secondary" : "ui-button--primary"}`}
                  style={{ width: "100%" }}
                  onClick={copyLink}
                >
                  <Icon name={copied ? "check" : "copy"} />
                  {copied ? "Đã sao chép" : "Sao chép đường dẫn"}
                </button>
              )}
              <button
                className={`ui-button ui-button--small ${contest.allow_guest_link ? "ui-button--danger" : "ui-button--primary"}`}
                style={{ width: "100%", marginTop: ".5rem" }}
                onClick={toggleGuestLink}
              >
                <Icon name={contest.allow_guest_link ? "link-off" : "share"} />
                {contest.allow_guest_link ? "Dừng chia sẻ" : "Chia sẻ"}
              </button>
            </div>

            {/* Question type breakdown */}
            <div className="card" style={{ padding: "1.25rem" }}>
              <h4 style={{ marginBottom: "0.875rem", fontSize: "0.9rem" }}>
                {" "}
                Phân loại câu hỏi
              </h4>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                {["mc", "tf", "sa", "oe"]
                  .filter((type) => questionCounts[type] > 0)
                  .map((type) => (
                    <div
                      key={type}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.625rem",
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background:
                            TYPE_COLORS[type] || "var(--accent-primary)",
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: "var(--font-size-xs)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {TYPE_LABELS[type] || type}
                      </span>
                      <span
                        style={{
                          fontSize: "var(--font-size-xs)",
                          fontWeight: 600,
                        }}
                      >
                        {questionCounts[type]}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Scoring config */}
            {contest.scoring_config && (
              <div className="card" style={{ padding: "1.25rem" }}>
                <h4 style={{ marginBottom: "0.875rem", fontSize: "0.9rem" }}>
                  {" "}
                  Thang điểm
                </h4>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.4rem",
                  }}
                >
                  {["mc", "tf", "sa", "oe"]
                    .filter(
                      (type) =>
                        questionCounts[type] > 0 &&
                        contest.scoring_config![type] !== undefined,
                    )
                    .map((type) => (
                      <div
                        key={type}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "var(--font-size-xs)",
                        }}
                      >
                        <span style={{ color: "var(--text-secondary)" }}>
                          {TYPE_LABELS[type] || type}
                        </span>
                        <span style={{ fontWeight: 600 }}>
                          {contest.scoring_config![type]} điểm/câu
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal Submissions */}
      {showSubmissions && (
        <div
          className="ui-modal-backdrop"
        >
          <div
            className="ui-modal ui-modal--large"
          >
            <header className="ui-modal__header">
              <h3 className="ui-modal__title">
                Danh sách bài thi đã nộp ({submissions.length})
              </h3>
              <button
                onClick={() => setShowSubmissions(false)}
                className="ui-modal__close"
                type="button"
                aria-label="Đóng"
              >
                <Icon name="close" />
              </button>
            </header>
            <div style={{ padding: "1.5rem", overflowY: "auto" }}>
              {submissions.length === 0 ? (
                <div
                  className="empty-state"
                  style={{ minHeight: "auto", padding: "2rem 0" }}
                >
                  <p>Chưa có bài nộp nào</p>
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
                        <th>Thí sinh</th>
                        <th>Trạng thái</th>
                        <th>Thời gian nộp</th>
                        <th>Điểm số</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((sub) => {
                        const endTime = sub.end_time
                          ? new Date(sub.end_time).toLocaleString("vi-VN")
                          : "—";
                        return (
                          <tr key={sub.result_id}>
                            <td className="col-text">
                              <strong>{sub.student_name}</strong>
                              <span className="cell-sub">
                                {sub.student_email || "Thí sinh tự do"}
                              </span>
                            </td>
                            <td>
                              {!sub.end_time ? (
                                <span className="badge badge-inactive">
                                  Đang làm
                                </span>
                              ) : sub.submitted_late ? (
                                <span className="badge badge-late">
                                  Nộp muộn
                                </span>
                              ) : (
                                <span className="badge badge-active">
                                  Đã nộp
                                </span>
                              )}
                            </td>
                            <td>{endTime}</td>
                            <td className="cell-score">
                              {sub.total_score != null
                                ? Number(sub.total_score).toFixed(2)
                                : "—"}
                              {contestMaxScore != null && (
                                <small>
                                  /{Number(contestMaxScore).toFixed(2)}
                                </small>
                              )}
                            </td>
                            <td>
                              <Link
                                href={`/results/${sub.result_id}`}
                                className="ui-button ui-button--secondary ui-button--small"
                              >
                                Chi tiết
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Question Edit Modal */}
      {detailModal && (
        <div
          className="ui-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetailModal(null);
          }}
        >
          <div
            className="ui-modal ui-modal--large"
          >
            <header className="ui-modal__header">
              <h3 className="ui-modal__title">
                Đang chỉnh sửa: Câu {detailModal.displayNumStr}
              </h3>
              <button
                className="ui-modal__close"
                type="button"
                aria-label="Đóng"
                onClick={() => setDetailModal(null)}
              >
                <Icon name="close" />
              </button>
            </header>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {showQuestionMutationWarning && (
                <div style={{ padding: "1rem 1.5rem 0 1.5rem" }}>
                  <MessageBar
                    intent="warning"
                    title="Bạn đang sửa câu hỏi gốc trong ngân hàng"
                    onDismiss={() => setShowQuestionMutationWarning(false)}
                  >
                    Việc thay đổi sẽ ảnh hưởng đến TOÀN BỘ các đề thi khác đang
                    chứa câu hỏi này!
                  </MessageBar>
                </div>
              )}

              {detailModal.error && (
                <div style={{ padding: "1rem 1.5rem 0" }}>
                  <MessageBar
                    intent="error"
                    onDismiss={() =>
                      setDetailModal((current) =>
                        current ? { ...current, error: "" } : current,
                      )
                    }
                  >
                    {detailModal.error}
                  </MessageBar>
                </div>
              )}

              <div style={{ padding: "1.5rem" }}>
                <QuestionEditor
                  qData={detailModal.question}
                  onChange={(q) =>
                    setDetailModal((d) => (d ? { ...d, question: q } : d))
                  }
                  curriculum={subjects}
                  imageEditable={true}
                />
              </div>
            </div>

            <div
              style={{
                padding: "1rem 1.5rem",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.75rem",
                flexShrink: 0,
              }}
            >
              <button
                className="ui-button ui-button--secondary"
                onClick={() => setDetailModal(null)}
              >
                Đóng
              </button>
              <button
                className="ui-button ui-button--primary"
                onClick={saveDetail}
                disabled={detailModal.saving}
              >
                {detailModal.saving ? "Đang lưu..." : "Lưu và Cập nhật toàn bộ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Contest Modal */}
      {showExportModal && contest && (
        <ExportContestModal
          contest={{ id: contest.id, title: contest.title }}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {showEditContestModal && contest && (
        <div className="ui-modal-backdrop">
          <div className="ui-modal ui-modal--medium">
            <header className="ui-modal__header">
              <div className="ui-modal__heading">
                <h3 className="ui-modal__title">
                  Chỉnh sửa thông tin
                </h3>
                <p className="ui-modal__description">
                  Metadata của đề thi
                </p>
              </div>
              <button
                className="ui-modal__close"
                type="button"
                aria-label="Đóng"
                onClick={() => setShowEditContestModal(false)}
              >
                <Icon name="close" />
              </button>
            </header>
            <div className="ui-modal__body">
            {editContestError && (
              <MessageBar
                intent="error"
                onDismiss={() => setEditContestError("")}
              >
                {editContestError}
              </MessageBar>
            )}
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                }}
              >
                Tên đề thi
              </label>
              <input
                type="text"
                className="ui-input-native"
                style={{ width: "100%" }}
                value={editContestData.title}
                onChange={(e) =>
                  setEditContestData({
                    ...editContestData,
                    title: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                }}
              >
                Thời gian làm bài (phút)
              </label>
              <NumberInput
                className="ui-input-native"
                style={{ width: "100%" }}
                value={editContestData.time_limit}
                onChange={(v) =>
                  setEditContestData({
                    ...editContestData,
                    time_limit: v,
                  })
                }
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                gap: "1rem",
              }}
            >
              <label style={{ fontWeight: 600, fontSize: ".9rem" }}>
                Thời điểm mở
                <DateTimePicker
                  value={editContestData.available_from}
                  onChange={(value) =>
                    setEditContestData({
                      ...editContestData,
                      available_from: value,
                    })
                  }
                />
              </label>
              <label style={{ fontWeight: 600, fontSize: ".9rem" }}>
                Hạn nộp
                <DateTimePicker
                  value={editContestData.due_at}
                  onChange={(value) =>
                    setEditContestData({
                      ...editContestData,
                      due_at: value,
                    })
                  }
                />
              </label>
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: ".6rem",
                fontSize: ".9rem",
              }}
            >
              <Checkbox
                checked={editContestData.allow_late_submission}
                onChange={(e) =>
                  setEditContestData({
                    ...editContestData,
                    allow_late_submission: e.target.checked,
                  })
                }
              />
              Cho phép nộp sau hạn
            </label>
            </div>
            <div className="ui-modal__footer">
              <button
                className="ui-button ui-button--secondary"
                onClick={() => setShowEditContestModal(false)}
              >
                Hủy
              </button>
              <button className="ui-button ui-button--primary" onClick={handleSaveContest}>
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}
      {showAssignModal && contest && (
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
                <h2 className="ui-modal__title">Giao đề cho lớp</h2>
                <p className="ui-modal__description">
                  {contest.title} · tích để giao, bỏ tích để gỡ. Lớp bị gỡ sẽ
                  không truy cập được đề nữa, bài đã nộp vẫn giữ.
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
              style={{ padding: "1.25rem 1.5rem", overflowY: "auto", flex: 1 }}
            >
              {assignError && (
                <MessageBar
                  intent="error"
                  onDismiss={() => setAssignError("")}
                >
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
                          disabled={!classOptions.length}
                          checked={allClassesSelected}
                          onChange={(e) =>
                            setSelectedClassIds(
                              e.target.checked
                                ? classOptions.map((cls) => cls.id)
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
                    {classOptions.map((cls) => {
                      const selected = selectedClassIds.includes(cls.id);
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
                          onClick={() => toggleClassId(cls.id, !selected)}
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
                              ? new Date(cls.assigned_at).toLocaleDateString(
                                  "vi-VN",
                                )
                              : "—"}
                          </td>
                          <td>
                            {cls.assigned
                              ? `${cls.submitted_count}/${cls.student_count}`
                              : "—"}
                          </td>
                          <td>
                            {willRemove ? (
                              <span className="badge badge-remove">Sẽ gỡ</span>
                            ) : willAdd ? (
                              <span className="badge badge-add">Sẽ giao</span>
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
              {!assignError && classOptions.length === 0 && (
                <div className="empty-state">
                  <h3>Chưa có lớp học</h3>
                  <Link className="ui-button ui-button--primary" href="/classes">
                    <Icon name="plus" />
                    Tạo lớp học
                  </Link>
                </div>
              )}
            </div>
            <div
              style={{
                padding: "1rem 1.5rem",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
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
    </div>
  );
}
