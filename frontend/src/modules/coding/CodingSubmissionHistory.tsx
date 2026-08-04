"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import LatexRenderer from "@/components/LatexRenderer";
import api from "@/lib/api";
import Editor from "@monaco-editor/react";

type Attempt = {
  id: number;
  question_id: number;
  order_index: number;
  attempt_number: number;
  language: string;
  status: string;
  runtime_ms?: number | null;
  memory_kb?: number | null;
  score: number;
  submitted_at: string;
  is_late?: boolean;
  source_code: string;
  compiler_output?: string | null;
  question_content: string;
  testcase_results?: Array<{
    order_index: number;
    input_data?: string | null;
    expected_output?: string | null;
    actual_output?: string | null;
    status: string;
    runtime_ms?: number | null;
    memory_kb?: number | null;
    error_message?: string | null;
  }>;
};

export default function CodingSubmissionHistory({
  assignmentId,
  studentId,
  onClose,
}: {
  assignmentId: number;
  studentId: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    student: {
      name: string;
      email: string;
      progress_status: string;
      total_score: number;
    };
    submissions: Attempt[];
  } | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [expandedProblem, setExpandedProblem] = useState<number | null>(null);
  useEffect(() => {
    api
      .getCodingStudentSubmissions(assignmentId, studentId)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [assignmentId, studentId]);
  const groups = useMemo(() => {
    const map = new Map<number, Attempt[]>();
    for (const item of data?.submissions || [])
      map.set(item.question_id, [...(map.get(item.question_id) || []), item]);
    return Array.from(map.values());
  }, [data]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        background: "rgba(0,0,0,.55)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "2.5vh 2.5vw",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
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
          <div>
            <h3 style={{ margin: 0 }}>Chi tiết lượt nộp</h3>
            {data && (
              <div
                style={{
                  color: "var(--text-secondary)",
                  fontSize: ".85rem",
                  marginTop: ".25rem",
                }}
              >
                {data.student.name} · {data.student.email} ·{" "}
                {data.submissions.length} lượt
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: 0,
              cursor: "pointer",
              fontSize: 20,
              color: "var(--text-secondary)",
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "1rem 1.5rem" }}>
          {error ? (
            <div className="alert alert-error">{error}</div>
          ) : !data ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : groups.length === 0 ? (
            <div className="empty-state">
              <p>Học sinh chưa có lượt nộp nào.</p>
            </div>
          ) : (
            groups.map((attempts, groupIndex) => (
              <section
                key={attempts[0].question_id}
                className="card"
                style={{ marginBottom: "1rem" }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: ".5rem",
                    alignItems: "center",
                    marginBottom: ".75rem",
                  }}
                >
                  <span className="badge badge-cd">Bài {groupIndex + 1}</span>
                  <strong>{attempts.length} lượt nộp</strong>
                </div>
                <div style={{ marginBottom: ".75rem" }}>
                  <div
                    style={{
                      maxHeight:
                        expandedProblem === attempts[0].question_id
                          ? "none"
                          : "7rem",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <LatexRenderer
                      content={attempts[0].question_content}
                      preserveLineBreaks
                    />
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: ".35rem", paddingLeft: 0 }}
                    onClick={() =>
                      setExpandedProblem(
                        expandedProblem === attempts[0].question_id
                          ? null
                          : attempts[0].question_id,
                      )
                    }
                  >
                    {expandedProblem === attempts[0].question_id
                      ? "Thu gọn đề bài"
                      : "Xem toàn bộ đề bài"}
                  </button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table
                    className="submission-record-table"
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      tableLayout: "fixed",
                      fontSize: ".85rem",
                    }}
                  >
                    <colgroup>
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "24%" }} />
                      <col style={{ width: "14%" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <th style={{ padding: ".7rem" }}>Lượt</th>
                        <th>Ngôn ngữ</th>
                        <th>Trạng thái</th>
                        <th>Điểm</th>
                        <th>Runtime</th>
                        <th>Memory</th>
                        <th>Thời gian</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attempts.map((item) => (
                        <Fragment key={item.id}>
                          <tr
                            key={item.id}
                            style={{ borderTop: "1px solid var(--border)" }}
                          >
                            <td style={{ padding: ".75rem" }}>
                              #{item.attempt_number}
                            </td>
                            <td>{item.language}</td>
                            <td>
                              <span className="badge badge-inactive">
                                {item.status}
                              </span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {Number(item.score || 0).toFixed(2)}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {item.runtime_ms == null
                                ? "—"
                                : `${item.runtime_ms} ms`}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {item.memory_kb == null
                                ? "—"
                                : `${item.memory_kb} KB`}
                            </td>
                            <td
                              style={{
                                textAlign: "right",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {new Date(item.submitted_at).toLocaleString(
                                "vi-VN",
                              )}
                              {item.is_late && (
                                <span className="badge badge-late" style={{ marginLeft: ".5rem" }}>
                                  Nộp muộn
                                </span>
                              )}
                            </td>
                            <td
                              style={{
                                textAlign: "right",
                                paddingRight: ".5rem",
                              }}
                            >
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() =>
                                  setExpanded(
                                    expanded === item.id ? null : item.id,
                                  )
                                }
                              >
                                {expanded === item.id ? "Ẩn code" : "Xem code"}
                              </button>
                            </td>
                          </tr>
                          {expanded === item.id && (
                            <tr
                              className="submission-detail-row"
                              key={`code-${item.id}`}
                            >
                              <td colSpan={8} style={{ padding: "0 0 .9rem" }}>
                                <div
                                  style={{
                                    border: "1px solid var(--border)",
                                    borderRadius: "var(--radius-sm)",
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      padding: ".5rem .75rem",
                                      background: "var(--bg-elevated)",
                                      display: "flex",
                                      justifyContent: "space-between",
                                      fontSize: ".78rem",
                                    }}
                                  >
                                    <strong>Mã nguồn · {item.language}</strong>
                                    <span>Lượt #{item.attempt_number}</span>
                                  </div>
                                  <Editor
                                    height={`${Math.min(480, Math.max(180, item.source_code.split("\n").length * 19 + 24))}px`}
                                    language={
                                      item.language === "c" ||
                                      item.language === "cpp"
                                        ? "cpp"
                                        : item.language
                                    }
                                    theme="vs-dark"
                                    value={item.source_code}
                                    options={{
                                      readOnly: true,
                                      minimap: { enabled: false },
                                      fontSize: 14,
                                      lineNumbers: "on",
                                      scrollBeyondLastLine: false,
                                      automaticLayout: true,
                                      wordWrap: "on",
                                      folding: true,
                                    }}
                                  />
                                </div>
                                {item.compiler_output && (
                                  <div style={{ marginTop: ".5rem" }}>
                                    <strong style={{ fontSize: ".8rem" }}>
                                      Kết quả biên dịch
                                    </strong>
                                    <pre
                                      style={{
                                        marginTop: ".35rem",
                                        padding: ".75rem",
                                        background: "var(--bg-elevated)",
                                        borderRadius: "var(--radius-sm)",
                                        whiteSpace: "pre-wrap",
                                      }}
                                    >
                                      {item.compiler_output}
                                    </pre>
                                  </div>
                                )}
                                <div style={{ marginTop: ".85rem" }}>
                                  <strong style={{ fontSize: ".9rem" }}>
                                    Kết quả testcase
                                  </strong>
                                  {!item.testcase_results?.length ? (
                                    <p
                                      style={{
                                        color: "var(--text-secondary)",
                                        fontSize: ".82rem",
                                        marginTop: ".5rem",
                                      }}
                                    >
                                      Lượt nộp cũ chưa có dữ liệu chi tiết
                                      testcase.
                                    </p>
                                  ) : (
                                    <div
                                      style={{
                                        display: "grid",
                                        gap: ".6rem",
                                        marginTop: ".6rem",
                                      }}
                                    >
                                      {item.testcase_results.map((tc) => (
                                        <div
                                          key={tc.order_index}
                                          style={{
                                            border: "1px solid var(--border)",
                                            borderRadius: "var(--radius-sm)",
                                            overflow: "hidden",
                                          }}
                                        >
                                          <div
                                            style={{
                                              padding: ".55rem .75rem",
                                              background: "var(--bg-elevated)",
                                              display: "flex",
                                              justifyContent: "space-between",
                                              alignItems: "center",
                                            }}
                                          >
                                            <strong>
                                              Testcase {tc.order_index + 1}
                                            </strong>
                                            <span
                                              className={`badge ${tc.status.toLowerCase() === "accepted" ? "badge-active" : "badge-inactive"}`}
                                            >
                                              {tc.status}
                                            </span>
                                          </div>
                                          <div
                                            style={{
                                              display: "grid",
                                              gridTemplateColumns:
                                                "repeat(3,minmax(0,1fr))",
                                              gap: "1px",
                                              background: "var(--border)",
                                            }}
                                          >
                                            <div
                                              style={{
                                                background: "var(--bg-surface)",
                                                padding: ".65rem",
                                              }}
                                            >
                                              <div
                                                style={{
                                                  color: "var(--text-muted)",
                                                  fontSize: ".72rem",
                                                  marginBottom: ".3rem",
                                                }}
                                              >
                                                INPUT
                                              </div>
                                              <pre
                                                style={{
                                                  margin: 0,
                                                  whiteSpace: "pre-wrap",
                                                }}
                                              >
                                                {tc.input_data || "—"}
                                              </pre>
                                            </div>
                                            <div
                                              style={{
                                                background: "var(--bg-surface)",
                                                padding: ".65rem",
                                              }}
                                            >
                                              <div
                                                style={{
                                                  color: "var(--text-muted)",
                                                  fontSize: ".72rem",
                                                  marginBottom: ".3rem",
                                                }}
                                              >
                                                EXPECTED
                                              </div>
                                              <pre
                                                style={{
                                                  margin: 0,
                                                  whiteSpace: "pre-wrap",
                                                }}
                                              >
                                                {tc.expected_output || "—"}
                                              </pre>
                                            </div>
                                            <div
                                              style={{
                                                background: "var(--bg-surface)",
                                                padding: ".65rem",
                                              }}
                                            >
                                              <div
                                                style={{
                                                  color: "var(--text-muted)",
                                                  fontSize: ".72rem",
                                                  marginBottom: ".3rem",
                                                }}
                                              >
                                                ACTUAL
                                              </div>
                                              <pre
                                                style={{
                                                  margin: 0,
                                                  whiteSpace: "pre-wrap",
                                                }}
                                              >
                                                {tc.actual_output ??
                                                  "Chưa chấm"}
                                              </pre>
                                            </div>
                                          </div>
                                          <div
                                            style={{
                                              padding: ".45rem .75rem",
                                              color: "var(--text-secondary)",
                                              fontSize: ".76rem",
                                            }}
                                          >
                                            Runtime:{" "}
                                            {tc.runtime_ms == null
                                              ? "—"
                                              : `${tc.runtime_ms} ms`}{" "}
                                            · Memory:{" "}
                                            {tc.memory_kb == null
                                              ? "—"
                                              : `${tc.memory_kb} KB`}
                                            {tc.error_message
                                              ? ` · ${tc.error_message}`
                                              : ""}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          )}
        </div>
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button className="btn btn-secondary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
