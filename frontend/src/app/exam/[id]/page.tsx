"use client";

import { useEffect, useState, useCallback, use, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import LatexRenderer from "@/components/LatexRenderer";
import ExamTimer from "@/components/ExamTimer";
import api from "@/lib/api";
import Link from "next/link";
import CodingQuestionNode from "@/components/CodingQuestionNode";
import { toast } from "@/lib/toastStore";

type Question = {
  id: number;
  question_type: string;
  content: any; // cây tài liệu (jsonb) — xem frontend/src/lib/docTree.ts
  layout_type: string;
  images: {
    id?: number;
    storage_path: string;
    img_type: string;
    width?: number;
  }[];
  options: { id: number; content: any; order_index: number }[];
  original_order: number;
  group_id: number;
  parent_id: number | null;
  children?: any[];
  qNum?: number | null;
};

type Contest = {
  id: number;
  title: string;
  time_limit: number;
  status: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const TYPE_LABELS: Record<string, string> = {
  mc: "Trắc nghiệm nhiều phương án lựa chọn",
  tf: "Trắc nghiệm Đúng Sai",
  sa: "Trắc nghiệm trả lời ngắn",
  oe: "Tự luận",
  st: "Chung giả thiết",
  cd: "Lập trình",
};
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

const hashSeed = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededShuffle = <T,>(items: T[], seedText: string) => {
  const copy = [...items];
  let state = hashSeed(seedText) || 1;
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export default function ExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isGuest = searchParams.get("guest") === "true";
  const { id } = params instanceof Promise ? use(params) : (params as any);
  const contestId = parseInt(id);

  const [stage, setStage] = useState<"info" | "exam" | "done">("info");
  const [contest, setContest] = useState<Contest | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [resultId, setResultId] = useState<number | null>(null);
  const [guestName, setGuestName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [maxScore, setMaxScore] = useState<number | null>(null);
  const [submissionSummary, setSubmissionSummary] = useState<{
    correct_count: number;
    question_count: number;
    duration_seconds: number;
    section_stats: Record<string, { total: number; correct: number }>;
  } | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Answers: question_id -> student_choice string
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [questionNavOpen, setQuestionNavOpen] = useState(true);
  const [markedQuestions, setMarkedQuestions] = useState<number[]>([]);
  const [persistedDisplayOrder, setPersistedDisplayOrder] = useState("");
  const [persistedOptionOrders, setPersistedOptionOrders] = useState<
    Record<string, string>
  >({});
  const layoutInitRef = useRef<number | null>(null);

  useEffect(() => {
    if (!resultId) return;
    try {
      const saved = localStorage.getItem(`exam-marked-${resultId}`);
      setMarkedQuestions(saved ? JSON.parse(saved) : []);
    } catch {
      setMarkedQuestions([]);
    }
  }, [resultId]);

  const toggleMarkedQuestion = (questionId: number) => {
    setMarkedQuestions((current) => {
      const next = current.includes(questionId)
        ? current.filter((id) => id !== questionId)
        : [...current, questionId];
      if (resultId) {
        localStorage.setItem(`exam-marked-${resultId}`, JSON.stringify(next));
      }
      return next;
    });
  };

  useEffect(() => {
    if (isGuest && user?.name && !guestName) setGuestName(user.name);
  }, [isGuest, user?.name, guestName]);

  useEffect(() => {
    api
      .getContest(contestId)
      .then((res) => {
        setContest(res.contest as Contest);
        setQuestions(res.questions as Question[]);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [contestId]);

  const processedQuestions = useMemo(() => {
    let qNum = 1;

    const displayRank = new Map(
      persistedDisplayOrder
        .split(",")
        .map(Number)
        .filter(Number.isFinite)
        .map((questionId, index) => [questionId, index]),
    );
    const orderQuestions = (arr: any[], scope: string) => {
      if (user?.role === "teacher") return [...arr];
      if (displayRank.size) {
        return [...arr].sort(
          (a, b) =>
            (displayRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (displayRank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        );
      }
      return seededShuffle(arr, `${resultId || contestId}:${scope}`);
    };
    const orderOptions = (options: any[], questionId: number) => {
      if (user?.role === "teacher") return [...options];
      const saved = persistedOptionOrders[String(questionId)];
      if (saved) {
        const rank = new Map(
          saved.split(",").map((id, index) => [Number(id), index]),
        );
        return [...options].sort(
          (a, b) =>
            (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        );
      }
      return seededShuffle(
        options,
        `${resultId || contestId}:options:${questionId}`,
      );
    };

    const list = questions.map((q) => {
      let updatedQ = { ...q };
      if (updatedQ.question_type !== "st") {
        updatedQ.qNum = qNum++;
      } else {
        updatedQ.qNum = null;
      }
      if (updatedQ.question_type === "mc" && updatedQ.options) {
        updatedQ.options = orderOptions(updatedQ.options, updatedQ.id);
      }
      return updatedQ;
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
      cd: 6,
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

    let globalQNum = 1;
    blocks.forEach((b, idx) => {
      // Shuffle questions within block (stimulus groups treated as atomic units)
      b.questions = orderQuestions(b.questions, `block:${b.id}`);
      // Shuffle children within each stimulus group
      b.questions.forEach((q: any) => {
        if (q.question_type === "st" && q.children) {
          q.children = orderQuestions(q.children, `children:${q.id}`);
        }
      });

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
      }
    });

    return { list, blocks };
  }, [
    questions,
    user?.role,
    resultId,
    contestId,
    persistedDisplayOrder,
    persistedOptionOrders,
  ]);

  useEffect(() => {
    const mcQuestionCount = processedQuestions.list.filter(
      (question: any) =>
        question.question_type === "mc" && question.options?.length,
    ).length;
    const hasCompleteLayout =
      Boolean(persistedDisplayOrder) &&
      Object.keys(persistedOptionOrders).length >= mcQuestionCount;
    if (
      !resultId ||
      stage !== "exam" ||
      hasCompleteLayout ||
      layoutInitRef.current === resultId
    )
      return;
    layoutInitRef.current = resultId;
    const displayOrder = processedQuestions.blocks
      .flatMap((block) =>
        block.questions.flatMap((question: any) =>
          question.question_type === "st"
            ? [
                question.id,
                ...(question.children || []).map((child: any) => child.id),
              ]
            : [question.id],
        ),
      )
      .join(",");
    const optionOrders = Object.fromEntries(
      processedQuestions.list
        .filter(
          (question: any) =>
            question.question_type === "mc" && question.options?.length,
        )
        .map((question: any) => [
          String(question.id),
          question.options.map((option: any) => option.id).join(","),
        ]),
    );
    api
      .initializeContestLayout(contestId, {
        contest_result_id: resultId,
        display_order: displayOrder,
        option_orders: optionOrders,
      })
      .then((layout) => {
        setPersistedDisplayOrder(layout.display_order || displayOrder);
        setPersistedOptionOrders(layout.option_orders || optionOrders);
      })
      .catch(() => {
        layoutInitRef.current = null;
        setSaveStatus("error");
      });
  }, [
    resultId,
    stage,
    persistedDisplayOrder,
    persistedOptionOrders,
    processedQuestions,
    contestId,
  ]);

  const handleStart = async () => {
    if (isGuest && !guestName.trim()) {
      const msg = "Vui lòng nhập tên của bạn";
      setError(msg);
      toast.error(msg);
      return;
    }
    setError("");
    try {
      const res = await api.startContest(contestId, {
        student_id: isGuest ? null : user?.user_id || null,
        guest_name: isGuest ? guestName : null,
        access_mode: isGuest ? "guest" : "account",
      });
      setResultId(res.contest_result_id);
      setPersistedDisplayOrder(res.display_order || "");
      setPersistedOptionOrders(
        Object.fromEntries(
          (res.answers || [])
            .filter((answer: any) => answer.option_display_order)
            .map((answer: any) => [
              String(answer.question_id),
              answer.option_display_order,
            ]),
        ),
      );
      setRemainingSeconds(
        res.remaining_seconds ?? (contest?.time_limit || 45) * 60,
      );
      if (res.answers?.length) {
        setAnswers(
          Object.fromEntries(
            res.answers.map((a: any) => [
              a.question_id,
              a.student_choice || "",
            ]),
          ),
        );
      }
      setStage("exam");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lỗi bắt đầu thi");
      toast.error(e instanceof Error ? e.message : "Lỗi bắt đầu thi");
    }
  };

  const saveAnswer = useCallback(
    (qId: number, content: string, delay = 0) => {
      if (!resultId) return;
      if (saveTimers.current[qId]) clearTimeout(saveTimers.current[qId]);
      setSaveStatus("saving");
      saveTimers.current[qId] = setTimeout(async () => {
        try {
          await api.autosaveContestAnswer(contestId, {
            contest_result_id: resultId,
            question_id: qId,
            student_choice: content,
          });
          setSaveStatus("saved");
        } catch {
          setSaveStatus("error");
        }
      }, delay);
    },
    [contestId, resultId],
  );

  const setMCAnswer = (qId: number, content: string, delay = 0) => {
    setAnswers((prev) => ({ ...prev, [qId]: content }));
    saveAnswer(qId, content, delay);
  };

  const setTFAnswer = (qId: number, idx: number, val: "T" | "F") => {
    setAnswers((prev) => {
      const q = questions.find((q) => q.id === qId);
      const len = q?.options.length || 4;
      const current = (prev[qId] || "X".repeat(len)).split("");
      current[idx] = val;
      const value = current.join("");
      saveAnswer(qId, value);
      return { ...prev, [qId]: value };
    });
  };

  const handleSubmit = useCallback(
    async (force = false) => {
      if (!force && !confirm("Bạn chắc chắn muốn nộp bài?")) return;
      if (!resultId) return;
      setSubmitting(true);
      try {
        const submissionAnswers = processedQuestions.list
          .filter((q) => q.question_type !== "st")
          .map((q) => {
            let option_display_order = "";
            if (q.question_type === "mc" && q.options) {
              option_display_order = q.options
                .map((opt: any) => opt.id)
                .join(",");
            }
            let student_choice = answers[q.id] || "";
            if (q.question_type === "tf") {
              const arr = [];
              for (let i = 0; i < (q.options?.length || 4); i++)
                arr.push(answers[q.id]?.[i] || " ");
              student_choice = arr.join("");
            }
            return { question_id: q.id, student_choice, option_display_order };
          });

        const res = await api.submitContest(contestId, {
          contest_result_id: resultId,
          answers: submissionAnswers,
        });
        setScore(res.total_score);
        setMaxScore(res.max_score ?? null);
        setSubmissionSummary({
          correct_count: res.correct_count ?? 0,
          question_count: res.question_count ?? submissionAnswers.length,
          duration_seconds: res.duration_seconds ?? 0,
          section_stats: res.section_stats ?? {},
        });
        setStage("done");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Lỗi nộp bài");
        toast.error(e instanceof Error ? e.message : "Lỗi nộp bài");
      } finally {
        setSubmitting(false);
      }
    },
    [resultId, processedQuestions, answers, contestId],
  );

  const answeredCount = Object.keys(answers).filter(
    (k) =>
      answers[parseInt(k)] && answers[parseInt(k)].replace(/X/g, "").trim(),
  ).length;
  const totalQ = processedQuestions.list.filter(
    (q) => q.question_type !== "st",
  ).length;
  const navigationQuestions = processedQuestions.list
    .filter((q) => q.question_type !== "st" && q.qNum != null)
    .sort((a, b) => Number(a.qNum) - Number(b.qNum));
  const hasAnswer = (questionId: number) =>
    Boolean(answers[questionId]?.replace(/X/g, "").trim());
  const goToQuestion = (questionId: number) => {
    document.getElementById(`question-${questionId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <span
          className="spinner"
          style={{ width: 40, height: 40, borderWidth: 3 }}
        />
        <p style={{ color: "var(--text-secondary)" }}>Đang tải đề thi...</p>
      </div>
    );

  if (error && !contest)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div className="alert alert-error">{error}</div>
        <Link href="/" className="btn btn-primary">
          Về trang chủ
        </Link>
      </div>
    );

  /* INFO STAGE */
  if (stage === "info")
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-base)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div className="card slide-up" style={{ maxWidth: 600, width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: "1rem" }}>
            <p
              style={{
                color: "var(--text-secondary)",
                marginBottom: "0.5rem",
              }}
            >
              Đề thi trực tuyến
            </p>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
              {contest?.title}
            </h1>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
              marginBottom: "1.25rem",
            }}
          >
            {[
              {
                label: "Thời gian",
                value: `${contest?.time_limit} phút`,
              },
              {
                label: "Số câu",
                value: `${totalQ} câu`,
              },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--radius-sm)",
                  padding: "1rem",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: "var(--text-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  {s.label}
                </div>
                <div style={{ fontWeight: 700 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {isGuest && (
            <div className="form-group">
              <label className="form-label">Họ và tên</label>
              <input
                id="guest-name"
                className="input"
                placeholder="Nguyễn Văn A"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
            </div>
          )}

          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            <button
              id="btn-start-exam"
              className="btn btn-primary btn-lg"
              onClick={handleStart}
            >
              {" "}
              Bắt đầu làm bài
            </button>
            <Link
              href="/"
              className="btn btn-ghost"
              style={{ textAlign: "center" }}
            >
              Quay về
            </Link>
          </div>

          <div
            style={{
              marginTop: "1.5rem",
              padding: "1rem",
              background: "rgba(255,217,61,0.05)",
              border: "1px solid rgba(255,217,61,0.2)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Sau khi bắt đầu, đồng hồ đếm ngược sẽ chạy. Bài sẽ tự động nộp khi
              hết giờ.
            </p>
          </div>
        </div>
      </div>
    );

  /* DONE STAGE */
  if (stage === "done") {
    const formatDuration = (totalSeconds: number) => {
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return [hours, minutes, seconds]
        .map((value) => String(value).padStart(2, "0"))
        .join(":");
    };
    const sectionLabels: Record<string, string> = {
      mc: "Trắc nghiệm",
      tf: "Đúng/Sai",
      sa: "Trả lời ngắn",
      oe: "Tự luận",
      cd: "Lập trình",
    };
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-base)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div
          className="card slide-up exam-result-summary"
          style={{ maxWidth: 680, width: "100%" }}
        >
          <div className="exam-result-kicker">Kết quả bài thi</div>
          <h1 className="exam-result-title">Thông tin bài thi</h1>
          <div className="exam-result-details">
            <span>Họ và tên</span>
            <strong>{isGuest ? guestName : user?.name}</strong>
            <span>Đề thi</span>
            <strong>{contest?.title}</strong>
            <span>Thời gian</span>
            <strong>
              {contest?.time_limit
                ? `${contest.time_limit} phút`
                : "Không giới hạn"}
            </strong>
            <span>Thời gian làm bài thực tế</span>
            <strong>
              {formatDuration(submissionSummary?.duration_seconds ?? 0)}
            </strong>
            <span>Tổng số câu</span>
            <strong>{submissionSummary?.question_count ?? totalQ}</strong>
            <span>Số câu trả lời đúng</span>
            <strong>
              {submissionSummary?.correct_count ?? 0}/
              {submissionSummary?.question_count ?? totalQ}
            </strong>
          </div>

          {submissionSummary &&
            Object.keys(submissionSummary.section_stats).length > 0 && (
              <div className="exam-result-sections">
                {Object.entries(submissionSummary.section_stats).map(
                  ([type, stats]) => (
                    <div key={type}>
                      <span>▸ {sectionLabels[type] || "Phần khác"}</span>
                      <strong>
                        {stats.correct}/{stats.total}
                      </strong>
                    </div>
                  ),
                )}
              </div>
            )}

          {score !== null && (
            <div className="exam-result-score-row">
              <span>Điểm số</span>
              <strong>
                {score.toFixed(2)}
                {maxScore !== null && <small>/{maxScore.toFixed(2)}</small>}
              </strong>
            </div>
          )}
          {resultId && (
            <Link
              href={`/results/${resultId}`}
              className="btn btn-primary btn-lg exam-result-detail-button"
            >
              Xem chi tiết bài làm
            </Link>
          )}
          {isGuest ? (
            <p className="exam-result-note">
              Thí sinh tự do chỉ có thể mở chi tiết bài làm từ màn hình kết quả
              này.
            </p>
          ) : (
            <p className="exam-result-note">
              Bạn có thể xem lại bài làm bất cứ lúc nào trong trang Đề thi và
              bài tập.
            </p>
          )}
          <Link
            href={isGuest ? "/" : "/contests"}
            className="btn btn-ghost exam-result-back"
          >
            {isGuest ? "Về trang chủ" : "Về Đề thi và bài tập"}
          </Link>
        </div>
      </div>
    );
  }

  /* EXAM STAGE */
  return (
    <div
      className="exam-workspace"
      style={{ minHeight: "100vh", background: "var(--bg-base)" }}
    >
      {/* Header */}
      <div
        className="exam-sticky-header"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "var(--bg-surface)",
          borderBottom: "none",
          boxShadow: "0 1px 8px rgba(15, 23, 42, 0.07)",
          padding: "0.875rem 2rem",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: "var(--font-size-md)" }}>
            {contest?.title}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Đã trả lời: {answeredCount}/{totalQ}
            {saveStatus !== "idle" && (
              <span style={{ marginLeft: ".75rem" }}>
                ·{" "}
                {saveStatus === "saving"
                  ? "Đang lưu…"
                  : saveStatus === "saved"
                    ? "Đã lưu"
                    : "Lưu thất bại"}
              </span>
            )}
          </div>
        </div>
        <ExamTimer
          totalSeconds={(contest?.time_limit || 45) * 60}
          initialSeconds={remainingSeconds ?? undefined}
          onExpire={() => handleSubmit(true)}
        />
        <button
          id="btn-submit-exam"
          className="btn btn-primary"
          onClick={() => handleSubmit(false)}
          disabled={submitting}
          style={{ justifySelf: "end" }}
        >
          {submitting ? <span className="spinner" /> : "Nộp bài"}
        </button>
      </div>

      <div
        className={`exam-body-layout ${questionNavOpen ? "nav-open" : "nav-closed"}`}
      >
        <main className="exam-question-column">
          {error && <div className="alert alert-error">{error}</div>}

          {/* Blocks of Questions */}
          {processedQuestions.blocks.map((block: any) => (
            <div key={block.id} style={{ marginBottom: "3rem" }}>
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

              {block.questions.map((q: any) => {
                const renderQuestionNode = (node: any, isNested: boolean) => {
                  const ans = answers[node.id] || "";

                  if (node.question_type === "cd") {
                    return (
                      <div key={node.id} id={`question-${node.id}`}>
                        <CodingQuestionNode
                          node={node}
                          ans={ans}
                          onCodeChange={(code, lang) => {
                            setAnswers((prev) => ({
                              ...prev,
                              [node.id]: JSON.stringify({ code, lang }),
                            }));
                          }}
                        />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={node.id}
                      id={`question-${node.id}`}
                      className="question-card fade-in"
                      style={{
                        marginBottom: isNested ? "1rem" : "1.5rem",
                        padding: isNested ? "1.25rem" : "1.5rem",
                        border: "1px solid var(--border)",
                        background: isNested
                          ? "var(--bg-elevated)"
                          : "var(--bg-card)",
                        borderRadius: "var(--radius-md)",
                        boxShadow: isNested ? "none" : "var(--shadow-sm)",
                      }}
                    >
                      <div className="question-header">
                        <div className="exam-question-marker">
                          <div className="question-num">{node.qNum}</div>
                          <button
                            type="button"
                            className={`exam-bookmark-button ${markedQuestions.includes(node.id) ? "active" : ""}`}
                            onClick={() => toggleMarkedQuestion(node.id)}
                            title={
                              markedQuestions.includes(node.id)
                                ? "Bỏ đánh dấu"
                                : "Đánh dấu câu đang phân vân"
                            }
                            aria-label={
                              markedQuestions.includes(node.id)
                                ? `Bỏ đánh dấu câu ${node.qNum}`
                                : `Đánh dấu câu ${node.qNum}`
                            }
                          >
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill={
                                markedQuestions.includes(node.id)
                                  ? "currentColor"
                                  : "none"
                              }
                            >
                              <path
                                d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-3.6L6 21V4.75Z"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <LatexRenderer
                            content={node.content}
                            layoutType={node.layout_type}
                            images={node.images}
                            className="question-content"
                            imageZoomable
                          />
                        </div>
                      </div>

                      {/* MC options */}
                      {node.question_type === "mc" && (
                        <div
                          className="options-list"
                          style={{ marginLeft: "3rem" }}
                        >
                          {node.options.map((opt: any, oi: number) => (
                            <div
                              key={opt.id}
                              id={`q${node.id}-opt-${oi}`}
                              className={`option-item ${ans === String(opt.id) || ans === opt.content ? "selected" : ""}`}
                              onClick={() =>
                                setMCAnswer(node.id, String(opt.id))
                              }
                            >
                              <div className="option-label">
                                {String.fromCharCode(65 + oi)}
                              </div>
                              <LatexRenderer
                                content={opt.content}
                                images={node.images}
                                imageZoomable
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* TF options */}
                      {node.question_type === "tf" && (
                        <div
                          style={{
                            marginLeft: "3rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem",
                          }}
                        >
                          {node.options.map((opt: any, oi: number) => {
                            const cur = ans[oi];
                            return (
                              <div
                                key={opt.id}
                                className={`tf-item ${cur === "T" ? "true-sel" : cur === "F" ? "false-sel" : ""}`}
                              >
                                <span
                                  style={{
                                    fontWeight: 700,
                                    minWidth: "1.5rem",
                                  }}
                                >
                                  {String.fromCharCode(97 + oi)})
                                </span>
                                <div style={{ flex: 1 }}>
                                  <LatexRenderer
                                    content={opt.content}
                                    images={node.images}
                                    imageZoomable
                                  />
                                </div>
                                <div className="tf-toggle">
                                  <button
                                    id={`q${node.id}-tf-${oi}-T`}
                                    className={cur === "T" ? "active-T" : ""}
                                    onClick={() =>
                                      setTFAnswer(node.id, oi, "T")
                                    }
                                  >
                                    Đ
                                  </button>
                                  <button
                                    id={`q${node.id}-tf-${oi}-F`}
                                    className={cur === "F" ? "active-F" : ""}
                                    onClick={() =>
                                      setTFAnswer(node.id, oi, "F")
                                    }
                                  >
                                    S
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Short answer */}
                      {node.question_type === "sa" && (
                        <div style={{ marginLeft: "3rem" }}>
                          <label className="form-label">Đáp án:</label>
                          <input
                            id={`q${node.id}-answer`}
                            className="input"
                            style={{ maxWidth: 200 }}
                            placeholder="Nhập đáp án..."
                            value={ans}
                            onChange={(e) =>
                              setMCAnswer(node.id, e.target.value, 800)
                            }
                          />
                        </div>
                      )}

                      {/* Open-ended */}
                      {node.question_type === "oe" && (
                        <div style={{ marginLeft: "3rem" }}>
                          <label className="form-label">Câu trả lời:</label>
                          <textarea
                            id={`q${node.id}-answer`}
                            className="textarea"
                            placeholder="Viết câu trả lời của bạn..."
                            value={ans}
                            onChange={(e) =>
                              setMCAnswer(node.id, e.target.value, 1500)
                            }
                          />
                        </div>
                      )}
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
                      className="st-container fade-in"
                      style={{
                        marginBottom: "2rem",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-lg)",
                        background: "var(--bg-card)",
                        overflow: "hidden",
                        boxShadow: "var(--shadow-md)",
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
                          className="question-content"
                          imageZoomable
                        />
                      </div>
                      <div
                        style={{
                          padding: "1.5rem",
                          background: "var(--bg-card)",
                        }}
                      >
                        {children.map((child: any) =>
                          renderQuestionNode(child, true),
                        )}
                      </div>
                    </div>
                  );
                }

                return renderQuestionNode(q, false);
              })}
            </div>
          ))}
        </main>

        <aside
          className={`exam-question-nav ${questionNavOpen ? "open" : "closed"}`}
        >
          <button
            type="button"
            className="exam-question-nav-toggle"
            onClick={() => setQuestionNavOpen((open) => !open)}
            aria-label={
              questionNavOpen
                ? "Thu gọn danh sách câu hỏi"
                : "Mở danh sách câu hỏi"
            }
            title={questionNavOpen ? "Thu gọn" : "Mở danh sách câu hỏi"}
          >
            {questionNavOpen ? "›" : "‹"}
          </button>

          {questionNavOpen && (
            <div className="exam-question-nav-content">
              <div className="exam-candidate-info">
                <div className="exam-candidate-info-title">
                  Thông tin thí sinh
                </div>
                <dl>
                  <dt>Họ và tên</dt>
                  <dd>{isGuest ? guestName : user?.name || "Chưa xác định"}</dd>
                  {user?.email && !isGuest && (
                    <>
                      <dt>Email</dt>
                      <dd>{user.email}</dd>
                    </>
                  )}
                  <dt>Hình thức</dt>
                  <dd>{isGuest ? "Thí sinh tự do" : "Tài khoản học sinh"}</dd>
                </dl>
              </div>
              <div className="exam-question-nav-heading">Danh sách câu hỏi</div>
              <div className="exam-question-nav-summary">
                <span>
                  <i className="answered-dot" />
                  Đã làm {answeredCount}
                </span>
                <span>
                  <i className="unanswered-dot" />
                  Chưa làm {totalQ - answeredCount}
                </span>
                <span>
                  <i className="marked-dot" />
                  Đánh dấu {markedQuestions.length}
                </span>
              </div>
              <div className="exam-question-grid">
                {navigationQuestions.map((question) => {
                  const answered = hasAnswer(question.id);
                  const marked = markedQuestions.includes(question.id);
                  return (
                    <button
                      key={question.id}
                      type="button"
                      className={`exam-question-jump ${answered ? "answered" : ""} ${marked ? "marked" : ""}`}
                      onClick={() => goToQuestion(question.id)}
                      aria-label={`Đi đến câu ${question.qNum}${answered ? ", đã làm" : ", chưa làm"}`}
                    >
                      {question.qNum}
                    </button>
                  );
                })}
              </div>
              <div className="exam-question-nav-progress">
                <div>
                  <span>Tiến độ</span>
                  <strong>
                    {answeredCount}/{totalQ} câu
                  </strong>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${(answeredCount / Math.max(1, totalQ)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
