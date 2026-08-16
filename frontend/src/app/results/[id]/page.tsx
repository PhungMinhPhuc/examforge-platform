"use client";

import { useEffect, useState, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/Sidebar";
import LatexRenderer from "@/components/LatexRenderer";
import AdaptiveOptionGrid from "@/components/AdaptiveOptionGrid";
import TrueFalseOptionList from "@/components/TrueFalseOptionList";
import DetailsMenu from "@/components/DetailsMenu";
import { hasAppHistory } from "@/lib/appHistory";
import { mcCorrectLabel } from "@/lib/docTree";
import api from "@/lib/api";
import Link from "next/link";
import { toast } from "@/lib/toastStore";

type Submission = {
  question_id: number;
  content: any; // cây tài liệu (jsonb) — xem frontend/src/lib/docTree.ts
  question_type: string;
  student_choice: string;
  is_correct: boolean;
  earned_point: string;
  option_display_order: string | null;
  solution?: any;
};
type Result = {
  id: number;
  total_score: number;
  max_score?: number;
  count_wrong_answers: number;
  start_time: string;
  end_time: string;
  title: string;
  time_limit: number;
  contest_id: number;
  guest_name?: string;
  student_name?: string;
};

const TYPE_LABELS: Record<string, string> = {
  mc: "Trắc nghiệm nhiều phương án lựa chọn",
  tf: "Trắc nghiệm Đúng Sai",
  sa: "Trắc nghiệm trả lời ngắn",
  oe: "Tự luận",
  st: "Chung giả thiết",
  cd: "Lập trình",
};

export default function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const { id } = params instanceof Promise ? use(params) : (params as any);
  const [result, setResult] = useState<Result | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getResult(parseInt(id))
      .then(async (res: any) => {
        setResult(res.result as Result);
        setSubmissions(res.submissions as Submission[]);
        setQuestions(res.questions || []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const correctCount = submissions.filter((s) => s.is_correct).length;

  // giáo viên quay về đề đã chấm, học sinh quay về danh sách đề
  const backHref =
    user?.role === "teacher" && result?.contest_id
      ? `/contests/${result.contest_id}`
      : "/contests";

  let durationStr = "0 phút 0 giây";
  let submitTimeStr = "";
  if (result && result.start_time && result.end_time) {
    const diffSecs = Math.round(
      (new Date(result.end_time).getTime() -
        new Date(result.start_time).getTime()) /
        1000,
    );
    const mins = Math.floor(diffSecs / 60);
    const secs = diffSecs % 60;
    durationStr = `${mins} phút ${secs} giây`;

    const d = new Date(result.end_time);
    submitTimeStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  let mcScore = 0;
  let mcCorrect = 0;
  let mcTotal = 0;
  if (result && questions.length > 0) {
    const mcQuestions = questions.filter((q) => q.question_type === "mc");
    mcTotal = mcQuestions.length;
    submissions.forEach((sub) => {
      const q = mcQuestions.find((q) => q.id === sub.question_id);
      if (q) {
        if (sub.is_correct) mcCorrect++;
        mcScore += Number(sub.earned_point) || 0;
      }
    });
  }

  const processedBlocks = useMemo(() => {
    if (!questions.length) return [];

    // Create a deep copy to avoid mutating state
    const list = questions.map((q) => ({ ...q }));

    // Apply shuffling restoration if option_display_order exists
    const subMap = new Map(submissions.map((s) => [s.question_id, s]));
    list.forEach((q) => {
      if (q.question_type === "mc" && q.options) {
        const sub = subMap.get(q.id);
        if (sub && sub.option_display_order) {
          const orderIds = sub.option_display_order.split(",").map(Number);
          if (orderIds.length === q.options.length) {
            q.options.sort(
              (a: any, b: any) =>
                orderIds.indexOf(a.id) - orderIds.indexOf(b.id),
            );
          }
        }
      }
    });

    const rootQuestions: any[] = [];
    const stMap = new Map();

    list.forEach((q) => {
      if (q.question_type === "st") {
        q.children = [];
        stMap.set(q.id, q);
        rootQuestions.push(q);
      } else if (q.parent_id && stMap.has(q.parent_id)) {
        stMap.get(q.parent_id).children.push(q);
      } else {
        rootQuestions.push(q);
      }
    });

    const effectiveType = (q: any) => {
      if (q.question_type === "st") {
        return q.children?.[0]?.question_type || "st";
      }
      return q.question_type;
    };

    const TYPE_ORDER: Record<string, number> = {
      mc: 1,
      tf: 2,
      sa: 3,
      oe: 4,
      st: 5,
    };

    rootQuestions.sort((a, b) => {
      const typeA = effectiveType(a);
      const typeB = effectiveType(b);
      const orderA = TYPE_ORDER[typeA] || 99;
      const orderB = TYPE_ORDER[typeB] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.original_order - b.original_order;
    });

    const blocks: {
      id: string;
      title: string;
      questions: any[];
      instruction?: string;
    }[] = [];
    let currentType: string | null = null;
    let currentBlockQuestions: any[] = [];

    rootQuestions.forEach((q) => {
      const qType = effectiveType(q);
      if (qType !== currentType && currentType !== null) {
        blocks.push({
          id: currentType,
          title: "",
          questions: currentBlockQuestions,
        });
        currentBlockQuestions = [];
      }
      currentType = qType;
      currentBlockQuestions.push(q);
    });
    if (currentBlockQuestions.length > 0 && currentType) {
      blocks.push({
        id: currentType,
        title: "",
        questions: currentBlockQuestions,
      });
    }

    const ROMAN = ["I", "II", "III", "IV", "V"];
    let globalQNum = 1;
    blocks.forEach((b, idx) => {
      const blockStartQNum = globalQNum;
      b.questions.forEach((q) => {
        if (q.question_type === "st") {
          q.children.forEach((c: any) => (c.qNum = globalQNum++));
        } else {
          q.qNum = globalQNum++;
        }
      });
      const blockEndQNum = globalQNum - 1;

      const firstRealQ =
        b.questions.find((q) => q.question_type !== "st") ||
        b.questions[0]?.children?.[0];
      const typeStr = firstRealQ
        ? TYPE_LABELS[firstRealQ.question_type] || "câu hỏi"
        : "câu hỏi";
      b.title = `PHẦN ${ROMAN[idx] || idx + 1}. Câu ${typeStr.toLowerCase()}`;

      if (b.id === "mc") {
        b.instruction = `Thí sinh trả lời từ câu ${blockStartQNum} đến câu ${blockEndQNum}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.`;
      } else if (b.id === "tf") {
        b.instruction = `Thí sinh trả lời từ câu ${blockStartQNum} đến câu ${blockEndQNum}. Trong mỗi ý a), b), c), d) ở mỗi câu hỏi, thí sinh chọn đúng hoặc sai.`;
      } else if (b.id === "sa") {
        b.instruction = `Thí sinh trả lời từ câu ${blockStartQNum} đến câu ${blockEndQNum}.`;
      } else if (b.id === "oe") {
        b.instruction = `Thí sinh trả lời từ câu ${blockStartQNum} đến câu ${blockEndQNum}.`;
      }
    });

    return blocks;
  }, [questions, submissions]);

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <span className="spinner" />
      </div>
    );

  return (
    <div className="page-wrapper">
      {user && <Sidebar />}
      <main className="main-content result-page-content">
        {/* Header */}
        <div className="page-header result-page-header">
          <div>
            <div className="page-breadcrumb">
              <Link
                href={backHref}
                onClick={(e) => {
                  // lùi lịch sử để giữ đúng trang và vị trí cuộn cũ; vào thẳng
                  // bằng link thì mới đi tới backHref
                  if (hasAppHistory()) {
                    e.preventDefault();
                    router.back();
                  }
                }}
              >
                Đề thi và bài tập
              </Link>
              <span className="sep">/</span>
              <span className="current">Kết quả chi tiết</span>
            </div>
            <h1>{result?.title}</h1>
          </div>
          {user?.role === "teacher" && (
            <DetailsMenu className="result-actions">
              <summary className="btn btn-secondary btn-sm">Thao tác</summary>
              <div className="result-actions-menu">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (!result) return;
                    if (confirm("Bạn có chắc chắn muốn xóa bài thi này?")) {
                      api
                        .deleteResult(result.id)
                        .then(() => router.back())
                        .catch((e: any) => toast.error(e.message));
                    }
                  }}
                >
                  Xóa bài thi
                </button>
              </div>
            </DetailsMenu>
          )}
        </div>

        <section className="card result-overview-card">
          <div className="result-overview-main">
            <h2>Thông tin bài làm</h2>
            <div className="result-info-grid">
              <div>
                <span>Họ và tên</span>
                <strong>
                  {result?.student_name ||
                    result?.guest_name ||
                    "Thí sinh ẩn danh"}
                </strong>
              </div>
              <div>
                <span>Thời gian làm bài</span>
                <strong>{durationStr}</strong>
              </div>
              <div>
                <span>Thời gian nộp bài</span>
                <strong>{submitTimeStr}</strong>
              </div>
            </div>
          </div>
          <div className="result-score-panel">
            <span>Điểm số</span>
            <strong>
              {result?.total_score?.toFixed(2)}
              <small>/{(result?.max_score ?? 10).toFixed(2)}</small>
            </strong>
            <div className="result-counts">
              <span>
                <b>{correctCount}</b> câu đúng
              </span>
              <span>
                <b>{result?.count_wrong_answers ?? 0}</b> câu sai
              </span>
            </div>
          </div>
        </section>

        {/* Submissions detail */}
        <div className="result-block-list">
          {processedBlocks.map((block: any) => (
            <div key={block.id} className="card">
              <div
                style={{
                  marginBottom: "1.5rem",
                  paddingBottom: "0.5rem",
                  borderBottom: "2px solid var(--border)",
                }}
              >
                <h2
                  style={{
                    color: "var(--accent-primary)",
                    fontSize: "var(--font-size-lg)",
                  }}
                >
                  {block.title}
                </h2>
                {block.instruction && (
                  <div
                    style={{
                      fontStyle: "italic",
                      color: "var(--text-secondary)",
                      marginTop: "0.25rem",
                    }}
                  >
                    {block.instruction}
                  </div>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.5rem",
                }}
              >
                {block.questions.map((q: any) => {
                  const renderResultNode = (node: any, isNested: boolean) => {
                    const sub = submissions.find(
                      (s) => s.question_id === node.id,
                    );
                    if (!sub) return null;
                    return (
                      <div
                        key={node.id}
                        style={
                          isNested
                            ? {
                                padding: "1.25rem",
                                background: "var(--bg-surface)",
                                borderLeft: `3px solid ${sub.is_correct ? "var(--accent-success)" : "var(--accent-danger)"}`,
                              }
                            : {
                                padding: "1.25rem",
                                background: "var(--bg-surface)",
                                border: "1px solid var(--border)",
                                borderLeft: `3px solid ${sub.is_correct ? "var(--accent-success)" : "var(--accent-danger)"}`,
                                borderRadius: "var(--radius-md)",
                                boxShadow: "var(--shadow-sm)",
                              }
                        }
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "1rem",
                          }}
                        >
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: "var(--radius-sm)",
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              background: sub.is_correct
                                ? "var(--answer-correct-bg)"
                                : "var(--answer-wrong-bg)",
                              color: sub.is_correct
                                ? "var(--accent-success)"
                                : "var(--accent-danger)",
                              fontSize: "var(--font-size-md)",
                            }}
                          >
                            {sub.is_correct ? (
                              <svg
                                width="17"
                                height="17"
                                viewBox="0 0 24 24"
                                fill="none"
                                aria-label="Đúng"
                              >
                                <path
                                  d="M5 12.5l4.2 4.2L19 7"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : (
                              <svg
                                width="17"
                                height="17"
                                viewBox="0 0 24 24"
                                fill="none"
                                aria-label="Sai"
                              >
                                <path
                                  d="M7 7l10 10M17 7L7 17"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                />
                              </svg>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "0.5rem",
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>
                                Câu {node.qNum}
                              </span>
                              <span
                                style={{
                                  fontWeight: 600,
                                  color: "var(--text-secondary)",
                                  fontSize: "var(--font-size-base)",
                                }}
                              >
                                Điểm: {Number(sub.earned_point).toFixed(2)}
                              </span>
                            </div>
                            <LatexRenderer
                              content={node.content}
                              layoutType={node.layout_type}
                              images={node.images}
                              imageZoomable
                              className="question-content"
                            />

                            {/* Render Options if any (re-sorted) */}
                            {node.question_type === "mc" && node.options && (
                              <AdaptiveOptionGrid
                                count={node.options.length}
                                style={{ marginTop: "0.75rem" }}
                              >
                                {node.options.map((opt: any, oi: number) => {
                                  const storedChoice =
                                    sub.student_choice?.trim() || "";
                                  // opt.content giờ là cây tài liệu (object), không còn
                                  // là chuỗi — nhánh so chuỗi cũ chỉ còn áp dụng được
                                  // với dữ liệu rất cũ (opt.content vẫn là string).
                                  const isSelected =
                                    storedChoice === String(opt.id) ||
                                    (typeof opt.content === "string" && storedChoice === opt.content.trim());
                                  const isCorrectOption = opt.is_correct;

                                  let bg = "var(--bg-surface)";
                                  let border = "var(--border)";
                                  let textColor = "var(--text-secondary)";

                                  if (isCorrectOption) {
                                    bg = "var(--answer-correct-bg)";
                                    border = "var(--answer-correct-border)";
                                    textColor = "var(--accent-success)";
                                  } else if (isSelected) {
                                    bg = "var(--answer-wrong-bg)";
                                    border = "var(--answer-wrong-border)";
                                    textColor = "var(--accent-danger)";
                                  }

                                  return (
                                    <div
                                      key={opt.id}
                                      data-opt-cell="1"
                                      style={{
                                        display: "flex",
                                        alignItems: "baseline",
                                        gap: "0.5rem",
                                        padding: "0.4rem 0.75rem",
                                        borderRadius: "var(--radius-sm)",
                                        background: bg,
                                        border: `1px solid ${border}`,
                                        minWidth: 0,
                                        overflow: "hidden",
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontWeight: 700,
                                          color: textColor,
                                          flexShrink: 0,
                                        }}
                                      >
                                        {String.fromCharCode(65 + oi)}.
                                      </div>
                                      <div
                                        style={{
                                          minWidth: 0,
                                          overflow: "hidden",
                                          overflowWrap: "break-word",
                                        }}
                                      >
                                        <LatexRenderer
                                          content={opt.content}
                                          images={node.images}
                                          imageZoomable
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </AdaptiveOptionGrid>
                            )}

                            {node.question_type === "tf" && node.options && (
                              <TrueFalseOptionList>
                                {node.options.map((opt: any, oi: number) => {
                                  const choicesStr = sub.student_choice || "";
                                  let userChoice: any = choicesStr[oi];
                                  if (userChoice !== "T" && userChoice !== "F")
                                    userChoice = null;

                                  let bg = "var(--bg-surface)";
                                  let border = "var(--border)";

                                  if (userChoice !== null) {
                                    const isCorrectChoice =
                                      userChoice ===
                                      (opt.is_correct ? "T" : "F");
                                    if (isCorrectChoice) {
                                      bg = "var(--answer-correct-bg)";
                                      border = "var(--answer-correct-border)";
                                    } else {
                                      bg = "var(--answer-wrong-bg)";
                                      border = "var(--answer-wrong-border)";
                                    }
                                  }

                                  return (
                                    <div
                                      key={opt.id}
                                      style={{
                                        display: "flex",
                                        gap: "0.75rem",
                                        alignItems: "center",
                                        padding: "0.5rem 0.75rem",
                                        borderRadius: "var(--radius-sm)",
                                        background: bg,
                                        border: `1px solid ${border}`,
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontWeight: 700,
                                          color: "var(--text-secondary)",
                                        }}
                                      >
                                        {String.fromCharCode(97 + oi)})
                                      </div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <LatexRenderer
                                          content={opt.content}
                                          images={node.images}
                                          imageZoomable
                                        />
                                      </div>
                                    </div>
                                  );
                                })}

                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "2rem",
                                    marginTop: "0.5rem",
                                    padding: "0.75rem",
                                    background: "var(--bg-elevated)",
                                    borderRadius: "var(--radius-sm)",
                                    border: "1px solid var(--border)",
                                    fontSize: "0.9rem",
                                  }}
                                >
                                  <div style={{ flex: 1, minWidth: "200px" }}>
                                    <strong
                                      style={{
                                        color: "var(--text-secondary)",
                                        marginRight: "0.25rem",
                                      }}
                                    >
                                      Đáp án của bạn:
                                    </strong>
                                    {node.options.map(
                                      (opt: any, oi: number) => {
                                        const choicesStr =
                                          sub.student_choice || "";
                                        let userChoice: any = choicesStr[oi];
                                        if (
                                          userChoice !== "T" &&
                                          userChoice !== "F"
                                        )
                                          userChoice = null;
                                        let userChoiceStr =
                                          userChoice === "T"
                                            ? "Đúng"
                                            : userChoice === "F"
                                              ? "Sai"
                                              : "Bỏ qua";
                                        return (
                                          <span
                                            key={opt.id}
                                            style={{
                                              marginRight: "1rem",
                                              fontWeight: 500,
                                              color: "var(--text-primary)",
                                            }}
                                          >
                                            {String.fromCharCode(97 + oi)}){" "}
                                            {userChoiceStr}
                                          </span>
                                        );
                                      },
                                    )}
                                  </div>
                                  <div style={{ flex: 1, minWidth: "200px" }}>
                                    <strong
                                      style={{
                                        color: "var(--text-secondary)",
                                        marginRight: "0.25rem",
                                      }}
                                    >
                                      Đáp án đúng:
                                    </strong>
                                    {node.options.map(
                                      (opt: any, oi: number) => (
                                        <span
                                          key={opt.id}
                                          style={{
                                            marginRight: "1rem",
                                            fontWeight: 500,
                                            color: "var(--text-primary)",
                                          }}
                                        >
                                          {String.fromCharCode(97 + oi)}){" "}
                                          {opt.is_correct ? "Đúng" : "Sai"}
                                        </span>
                                      ),
                                    )}
                                  </div>
                                </div>
                              </TrueFalseOptionList>
                            )}

                            {node.question_type === "sa" &&
                              (() => {
                                const correctAnswer =
                                  node.options && node.options.length > 0
                                    ? node.options[0].content
                                        .replace(/\$/g, "")
                                        .replace(/[{}]/g, "")
                                        .trim()
                                    : "";
                                const answerBoxes = (value: string) => {
                                  const chars = Array.from(value);
                                  return Array.from({
                                    length: Math.max(4, chars.length),
                                  }).map((_, index) => chars[index] || "");
                                };
                                const studentBoxes = answerBoxes(
                                  sub.student_choice || "",
                                );
                                const correctBoxes = answerBoxes(correctAnswer);
                                const studentColor = sub.is_correct
                                  ? "var(--accent-success)"
                                  : "var(--accent-danger)";
                                const studentBackground = sub.is_correct
                                  ? "var(--answer-correct-bg)"
                                  : "var(--answer-wrong-bg)";

                                return (
                                  <div
                                    style={{
                                      marginTop: "1.5rem",
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "1rem",
                                      alignItems: "flex-start",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: "0.5rem",
                                        alignItems: "center",
                                        minHeight: 58,
                                        width: "fit-content",
                                        maxWidth: "100%",
                                        padding: "0.65rem 0.8rem",
                                        border: `1px solid ${sub.is_correct ? "var(--answer-correct-border)" : "var(--answer-wrong-border)"}`,
                                        borderRadius: "var(--radius-md)",
                                        background: studentBackground,
                                      }}
                                    >
                                      <strong
                                        style={{
                                          color: studentColor,
                                          fontSize: "var(--font-size-base)",
                                          marginRight: "0.25rem",
                                          minWidth: 126,
                                        }}
                                      >
                                        Đáp án của bạn:
                                      </strong>
                                      <div
                                        style={{
                                          display: "flex",
                                          gap: "0.3rem",
                                          flexWrap: "wrap",
                                        }}
                                      >
                                        {studentBoxes.map(
                                          (character, index) => (
                                            <span
                                              key={index}
                                              style={{
                                                width: 36,
                                                height: 36,
                                                display: "inline-flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                border: `2px solid ${studentColor}`,
                                                borderRadius: 6,
                                                background: studentBackground,
                                                color: "var(--text-primary)",
                                                fontWeight: 750,
                                              }}
                                            >
                                              {character}
                                            </span>
                                          ),
                                        )}
                                      </div>
                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: "0.5rem",
                                        alignItems: "center",
                                        minHeight: 58,
                                        width: "fit-content",
                                        maxWidth: "100%",
                                        padding: "0.65rem 0.8rem",
                                        border:
                                          "1px solid var(--accent-primary-border)",
                                        borderRadius: "var(--radius-md)",
                                        background:
                                          "var(--accent-primary-soft)",
                                      }}
                                    >
                                      <strong
                                        style={{
                                          color: "var(--accent-primary)",
                                          fontSize: "var(--font-size-base)",
                                          marginRight: "0.25rem",
                                          minWidth: 126,
                                        }}
                                      >
                                        Đáp án đúng:
                                      </strong>
                                      <div
                                        style={{
                                          display: "flex",
                                          gap: "0.25rem",
                                        }}
                                      >
                                        {correctBoxes.map((c, i) => (
                                          <span
                                            key={i}
                                            style={{
                                              width: 36,
                                              height: 36,
                                              border:
                                                "2px solid var(--accent-primary)",
                                              display: "inline-flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              fontWeight: 750,
                                              borderRadius: 6,
                                              background: "var(--bg-surface)",
                                              color: "var(--text-primary)",
                                            }}
                                          >
                                            {c}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}

                            {node.question_type === "oe" && (
                              <div
                                style={{
                                  marginTop: "1.5rem",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "1rem",
                                  background: "var(--bg-elevated)",
                                  padding: "1rem",
                                  borderRadius: "var(--radius-sm)",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.5rem",
                                  }}
                                >
                                  <strong
                                    style={{
                                      color: "var(--text-secondary)",
                                      fontSize: "var(--font-size-base)",
                                    }}
                                  >
                                    Bài làm của bạn:
                                  </strong>
                                  <div
                                    style={{
                                      padding: "1rem",
                                      background: "var(--bg-surface)",
                                      border: "1px solid var(--border)",
                                      borderRadius: "var(--radius-sm)",
                                      whiteSpace: "pre-wrap",
                                      color: "var(--text-primary)",
                                    }}
                                  >
                                    {sub.student_choice || "(Không có bài làm)"}
                                  </div>
                                </div>
                              </div>
                            )}

                            {node.question_type !== "st" &&
                              ((sub.solution && node.question_type !== "tf") ||
                                (node.question_type === "tf" &&
                                  node.options)) && (
                              <div
                                style={{
                                  marginTop: "1.5rem",
                                  marginLeft: "1rem",
                                  padding: "1rem",
                                  background: "var(--bg-surface)",
                                  borderLeft: "4px solid var(--accent-primary)",
                                  borderRadius:
                                    "0 var(--radius-sm) var(--radius-sm) 0",
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 700,
                                    marginBottom: "0.5rem",
                                    color: "var(--accent-primary)",
                                  }}
                                >
                                  Lời giải:
                                </div>
                                {node.question_type === "tf" &&
                                  node.options && (
                                    <div
                                      style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "0.5rem",
                                        marginBottom: sub.solution
                                          ? "1rem"
                                          : "0",
                                      }}
                                    >
                                      {node.options.map(
                                        (opt: any, oi: number) => (
                                          <div
                                            key={opt.id}
                                            style={{
                                              display: "flex",
                                              gap: "0.5rem",
                                              alignItems: "baseline",
                                            }}
                                          >
                                            <strong style={{ flexShrink: 0 }}>
                                              {String.fromCharCode(97 + oi)}){" "}
                                              {opt.is_correct
                                                ? "Đúng."
                                                : "Sai."}
                                            </strong>
                                            <div
                                              style={{ flex: 1, minWidth: 0 }}
                                            >
                                              {opt.explaination && (
                                                <LatexRenderer
                                                  content={opt.explaination}
                                                  images={node.images}
                                                  imageZoomable
                                                />
                                              )}
                                            </div>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  )}
                                {sub.solution && (
                                  <LatexRenderer
                                    content={sub.solution}
                                    images={node.images}
                                    imageZoomable
                                  />
                                )}
                                {node.question_type === "mc" &&
                                  mcCorrectLabel(node.options) && (
                                    <div
                                      style={{
                                        fontWeight: 700,
                                        marginTop: "0.5rem",
                                      }}
                                    >
                                      Chọn {mcCorrectLabel(node.options)}
                                    </div>
                                  )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  };

                  if (q.question_type === "st") {
                    const children = q.children || [];
                    const stRange =
                      children.length > 0
                        ? `Dựa vào thông tin dưới đây để trả lời từ câu ${children[0].qNum} đến câu ${children[children.length - 1].qNum}`
                        : null;
                    return (
                      <div
                        key={q.id}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-lg)",
                          background: "var(--bg-card)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            padding: "1.5rem",
                            background: "var(--bg-surface)",
                            borderBottom: "2px dashed var(--border)",
                            borderLeft: "4px solid var(--accent-primary)",
                          }}
                        >
                          {stRange && (
                            <div
                              style={{
                                fontWeight: 700,
                                marginBottom: "0.75rem",
                                color: "var(--accent-primary)",
                                fontSize: "1.1rem",
                              }}
                            >
                              {stRange}
                            </div>
                          )}
                          <LatexRenderer
                            content={q.content}
                            layoutType={q.layout_type}
                            images={q.images}
                            imageZoomable
                            className="question-content"
                          />
                        </div>
                        <div
                          style={{ display: "flex", flexDirection: "column" }}
                        >
                          {children.map((child: any, cIdx: number) => (
                            <div
                              key={child.id}
                              style={{
                                borderTop:
                                  cIdx > 0 ? "1px solid var(--border)" : "none",
                              }}
                            >
                              {renderResultNode(child, true)}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  return renderResultNode(q, false);
                })}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            marginTop: "2rem",
            justifyContent: "center",
          }}
        >
          <Link href="/" className="btn btn-secondary">
            {" "}
            Về trang chủ
          </Link>
          <Link href="/contests" className="btn btn-primary">
            {" "}
            Xem đề thi khác
          </Link>
        </div>
      </main>
    </div>
  );
}
