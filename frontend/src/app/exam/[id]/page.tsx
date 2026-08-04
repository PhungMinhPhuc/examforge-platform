"use client";

import { useEffect, useState, useCallback, use, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import LatexRenderer from "@/components/LatexRenderer";
import ExamTimer from "@/components/ExamTimer";
import api from "@/lib/api";
import Link from "next/link";
import CodingQuestionNode from "@/components/CodingQuestionNode";

type Question = {
  id: number;
  question_type: string;
  content: string;
  layout_type: string;
  images: { storage_path: string; img_type: string }[];
  options: { id: number; content: string; order_index: number }[];
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
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Answers: question_id -> student_choice string
  const [answers, setAnswers] = useState<Record<number, string>>({});

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

    // shuffle function
    const shuffleArray = (arr: any[]) => {
      if (user?.role === "teacher") return [...arr]; // Không đảo đối với giáo viên
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    const list = questions.map((q) => {
      let updatedQ = { ...q };
      if (updatedQ.question_type !== "st") {
        updatedQ.qNum = qNum++;
      } else {
        updatedQ.qNum = null;
      }
      if (updatedQ.question_type === "mc" && updatedQ.options) {
        updatedQ.options = shuffleArray(updatedQ.options);
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

    blocks.forEach((b, idx) => {
      // Shuffle questions within block (stimulus groups treated as atomic units)
      b.questions = shuffleArray(b.questions);
      // Shuffle children within each stimulus group
      b.questions.forEach((q: any) => {
        if (q.question_type === "st" && q.children) {
          q.children = shuffleArray(q.children);
        }
      });

      let blockQNum = 1;
      b.questions.forEach((q) => {
        if (q.question_type === "st") {
          q.children.forEach((c: any) => (c.qNum = blockQNum++));
        } else {
          q.qNum = blockQNum++;
        }
      });
      const totalInBlock = blockQNum - 1;

      const firstRealQ =
        b.questions.find((q) => q.question_type !== "st") ||
        b.questions[0]?.children?.[0];
      const typeStr = firstRealQ
        ? TYPE_LABELS[firstRealQ.question_type] || "câu hỏi"
        : "câu hỏi";
      b.title = `PHẦN ${ROMAN[idx] || idx + 1}. Câu ${typeStr.toLowerCase()}`;

      if (b.id === "mc") {
        b.instruction = `Thí sinh trả lời từ câu 1 đến câu ${totalInBlock}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.`;
      } else if (b.id === "tf") {
        b.instruction = `Thí sinh trả lời từ câu 1 đến câu ${totalInBlock}. Trong mỗi ý a), b), c), d) ở mỗi câu hỏi, thí sinh chọn đúng hoặc sai.`;
      } else if (b.id === "sa") {
        b.instruction = `Thí sinh trả lời từ câu 1 đến câu ${totalInBlock}.`;
      }
    });

    return { list, blocks };
  }, [questions, user?.role]);

  const handleStart = async () => {
    if (isGuest && !guestName.trim()) {
      setError("Vui lòng nhập tên của bạn");
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
        setStage("done");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Lỗi nộp bài");
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

  /* ── INFO STAGE ─────────────────────────────────────────────────── */
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
        <div className="card slide-up" style={{ maxWidth: 520, width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}></div>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
              {contest?.title}
            </h1>
            <p style={{ color: "var(--text-secondary)" }}>Đề thi trực tuyến</p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            {[
              {
                icon: "",
                label: "Thời gian",
                value: `${contest?.time_limit} phút`,
              },
              { icon: "", label: "Số câu", value: `${totalQ} câu` },
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
                <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
                  {s.icon}
                </div>
                <div style={{ fontWeight: 700 }}>{s.value}</div>
                <div
                  style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {isGuest && (
            <div className="form-group">
              <label className="form-label">Họ tên của bạn</label>
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

  /* ── DONE STAGE ─────────────────────────────────────────────────── */
  if (stage === "done")
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
          className="card slide-up"
          style={{ maxWidth: 480, width: "100%", textAlign: "center" }}
        >
          <div style={{ fontSize: "4rem", marginBottom: "1rem" }}></div>
          <h2 style={{ marginBottom: "0.5rem" }}>Nộp bài thành công!</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
            {contest?.title}
          </p>
          {score !== null && (
            <div
              style={{
                background: "rgba(37,91,167,0.06)",
                border: "1px solid rgba(37,91,167,0.15)",
                borderRadius: "var(--radius-lg)",
                padding: "2rem",
                marginBottom: "2rem",
              }}
            >
              <div
                style={{
                  fontSize: "3.5rem",
                  fontWeight: 800,
                  color: "var(--accent-primary)",
                }}
              >
                {score.toFixed(2)}
                {maxScore !== null && (
                  <span
                    style={{
                      fontSize: "1.75rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    /{maxScore.toFixed(2)}
                  </span>
                )}
              </div>
              <div
                style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}
              >
                Điểm của bạn
              </div>
            </div>
          )}
          {resultId && (
            <Link
              href={`/results/${resultId}`}
              className="btn btn-primary btn-lg"
              style={{ marginBottom: "0.75rem", display: "block" }}
            >
              Xem chi tiết kết quả
            </Link>
          )}
          <Link href="/" className="btn btn-ghost">
            Về trang chủ
          </Link>
        </div>
      </div>
    );

  /* ── EXAM STAGE ─────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)" }}>
      {/* Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
          padding: "0.875rem 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: "1rem" }}>
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
        >
          {submitting ? <span className="spinner" /> : "Nộp bài"}
        </button>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
        {/* Progress */}
        <div className="progress-bar" style={{ marginBottom: "2rem" }}>
          <div
            className="progress-fill"
            style={{ width: `${(answeredCount / Math.max(1, totalQ)) * 100}%` }}
          />
        </div>

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
                style={{ color: "var(--accent-primary)", fontSize: "1.25rem" }}
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
                    <CodingQuestionNode
                      key={node.id}
                      node={node}
                      ans={ans}
                      onCodeChange={(code, lang) => {
                        setAnswers((prev) => ({
                          ...prev,
                          [node.id]: JSON.stringify({ code, lang }),
                        }));
                      }}
                    />
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
                      <div className="question-num">{node.qNum}</div>
                      <div style={{ flex: 1 }}>
                        <LatexRenderer
                          content={node.content}
                          layoutType={node.layout_type}
                          images={node.images}
                          className="question-content"
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
                            onClick={() => setMCAnswer(node.id, String(opt.id))}
                          >
                            <div className="option-label">
                              {String.fromCharCode(65 + oi)}
                            </div>
                            <LatexRenderer
                              content={opt.content}
                              images={node.images}
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
                                style={{ fontWeight: 700, minWidth: "1.5rem" }}
                              >
                                {String.fromCharCode(97 + oi)})
                              </span>
                              <div style={{ flex: 1 }}>
                                <LatexRenderer
                                  content={opt.content}
                                  images={node.images}
                                />
                              </div>
                              <div className="tf-toggle">
                                <button
                                  id={`q${node.id}-tf-${oi}-T`}
                                  className={cur === "T" ? "active-T" : ""}
                                  onClick={() => setTFAnswer(node.id, oi, "T")}
                                >
                                  Đ
                                </button>
                                <button
                                  id={`q${node.id}-tf-${oi}-F`}
                                  className={cur === "F" ? "active-F" : ""}
                                  onClick={() => setTFAnswer(node.id, oi, "F")}
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
                        background: "rgba(78,205,196,0.05)",
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

        {/* Bottom submit */}
        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="spinner" /> Đang nộp...
              </>
            ) : (
              " Nộp bài"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
