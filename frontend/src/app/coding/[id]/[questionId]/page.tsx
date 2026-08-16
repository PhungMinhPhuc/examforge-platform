"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import CodingWorkspace from "@/modules/coding/CodingWorkspace";
import CodingSubmissionDetail from "@/modules/coding/CodingSubmissionDetail";
import type {
  CodingAssignment,
  CodingQuestion,
  CodingSubmission,
} from "@/modules/coding/types";
import { STATUS_BADGE, bestStatus } from "@/components/CodingQuestionNode";

export default function CodingQuestionPage({
  params,
}: {
  params: Promise<{ id: string; questionId: string }>;
}) {
  const { id, questionId } =
    params instanceof Promise
      ? use(params)
      : (params as unknown as { id: string; questionId: string });
  const assignmentId = Number(id);
  const qId = Number(questionId);
  const { user } = useAuth();
  const router = useRouter();

  const [assignment, setAssignment] = useState<CodingAssignment | null>(null);
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [submissions, setSubmissions] = useState<CodingSubmission[]>([]);
  const [openSubmission, setOpenSubmission] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    const [res, subs] = await Promise.all([
      api.getCodingAssignment(assignmentId),
      api.getQuestionSubmissions(assignmentId, qId).catch(() => []),
    ]);
    setAssignment(res.assignment);
    setQuestions(res.questions);
    setSubmissions((subs as CodingSubmission[]) || []);
  };

  useEffect(() => {
    if (!user) return;
    load()
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được bài"))
      .finally(() => setLoading(false));
  }, [user, assignmentId]);

  const index = questions.findIndex((q) => q.id === qId);
  const question = index >= 0 ? questions[index] : null;
  // Trạng thái tổng thể của câu = kết quả tốt nhất trong các lượt đã nộp
  const overallStatus = bestStatus(submissions.map((s) => s.status));
  const maxScore = submissions[0]?.max_score;

  const submit = async (sourceCode: string, language: string) => {
    const result = await api.submitCodingCode(assignmentId, qId, {
      source_code: sourceCode,
      language,
    });
    await load();
    return result;
  };

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        {loading ? (
          <div className="skeleton" style={{ height: 180 }} />
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : !question ? (
          <div className="empty-state">
            <h3>Không tìm thấy câu này trong bài</h3>
            <Link href={`/coding/${assignmentId}`} className="btn btn-primary">
              Về danh sách bài
            </Link>
          </div>
        ) : (
          <>
            <div className="page-header">
              <div>
                <div className="page-breadcrumb">
                  <Link href="/coding">Lập trình</Link>
                  <span className="sep">/</span>
                  <span className="current">{assignment?.title}</span>
                </div>
                <h1 className="page-title">Câu {index + 1}</h1>
                <p className="page-sub">
                  {[question.chapter, question.lesson].filter(Boolean).join(" · ") ||
                    "Chưa gắn chương"}{" "}
                  · {questions.length} bài trong đề
                </p>
              </div>
              <div style={{ display: "flex", gap: ".5rem" }}>
                <Link
                  href={`/coding/${assignmentId}`}
                  className="btn btn-secondary btn-sm"
                >
                  Danh sách bài
                </Link>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={index <= 0}
                  onClick={() =>
                    router.push(
                      `/coding/${assignmentId}/${questions[index - 1].id}`,
                    )
                  }
                >
                  Câu trước
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={index >= questions.length - 1}
                  onClick={() =>
                    router.push(
                      `/coding/${assignmentId}/${questions[index + 1].id}`,
                    )
                  }
                >
                  Câu sau
                </button>
              </div>
            </div>
            <CodingWorkspace
              question={{ ...question, overallStatus } as any}
              questionNumber={index + 1}
              onSubmit={submit}
            />

            <div className="card" style={{ padding: "1.25rem" }}>
              <h2 style={{ fontSize: "var(--font-size-md)", marginBottom: ".6rem" }}>
                Đã nộp ({submissions.length})
              </h2>
              {submissions.length === 0 ? (
                <p className="page-sub">
                  Chưa có lượt nộp nào cho câu này.
                </p>
              ) : (
                <div className="rows-scroll" style={{ overflowX: "auto" }}>
                  <table className="problem-table">
                    <colgroup>
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "22%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "13%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Lượt</th>
                        <th>Ngôn ngữ</th>
                        <th>Thời gian nộp</th>
                        <th>Kết quả</th>
                        <th>Điểm</th>
                        <th>Runtime</th>
                        <th>Memory</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((s) => (
                        <tr
                          key={s.id}
                          className="is-clickable"
                          role="button"
                          tabIndex={0}
                          onClick={() => setOpenSubmission(s.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setOpenSubmission(s.id);
                            }
                          }}
                        >
                          <td>{s.attempt_number}</td>
                          <td>{s.language}</td>
                          <td>
                            {new Date(s.submitted_at).toLocaleString("vi-VN")}
                          </td>
                          <td>
                            <span
                              className={`badge ${STATUS_BADGE[s.status] || "badge-inactive"}`}
                            >
                              {s.status}
                            </span>
                          </td>
                          <td className="cell-score">
                            {s.score == null
                              ? "—"
                              : Number(s.score).toFixed(2)}
                            {maxScore != null && (
                              <small>/{Number(maxScore).toFixed(2)}</small>
                            )}
                          </td>
                          <td>
                            {s.runtime_ms == null ? "—" : `${s.runtime_ms} ms`}
                          </td>
                          <td>
                            {s.memory_kb == null
                              ? "—"
                              : `${(s.memory_kb / 1024).toFixed(2)} MB`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {openSubmission !== null && (
              <CodingSubmissionDetail
                assignmentId={assignmentId}
                submissionId={openSubmission}
                onClose={() => setOpenSubmission(null)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
