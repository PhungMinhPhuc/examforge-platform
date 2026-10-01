"use client";

import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import api from "@/lib/api";
import { STATUS_BADGE } from "@/components/CodingQuestionNode";
import type { CodingSubmission, CodingTestcaseResult } from "./types";
import { Icon } from "@/components/icons";
import MessageBar from "@/components/MessageBar";

// Khối code nền tối kèm nút sao chép, dùng cho input/output và mã nguồn
function CodeBox({ text, hidden }: { text?: string | null; hidden?: boolean }) {
  const [copied, setCopied] = useState(false);
  const value = hidden ? "---HIDDEN---" : text || "";
  return (
    <div className="code-box">
      <button
        type="button"
        className="code-copy"
        title={copied ? "Đã sao chép" : "Sao chép"}
        aria-label={copied ? "Đã sao chép" : "Sao chép"}
        disabled={hidden}
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        <Icon name={copied ? "check" : "copy"} />
      </button>
      <pre className={hidden ? "is-hidden" : undefined}>{value}</pre>
    </div>
  );
}

/** Popup chi tiết một test case, mở chồng lên popup lượt nộp. */
function TestcaseModal({
  item,
  onClose,
}: {
  item: CodingTestcaseResult;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="ui-modal-backdrop ui-modal-backdrop--nested"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="ui-modal ui-modal--medium" role="dialog" aria-modal="true" aria-labelledby="testcase-modal-title">
        <header className="ui-modal__header">
          <div className="ui-modal__heading">
            <h3 className="ui-modal__title" id="testcase-modal-title">
              Test case {item.order_index + 1}
            </h3>
            <p className="ui-modal__description">
              {item.is_public ? "Public" : "Hidden"} · {item.point_weight} điểm ·{" "}
              {item.status}
              {item.runtime_ms != null ? ` · ${item.runtime_ms} ms` : ""}
              {item.memory_kb != null
                ? ` · ${(item.memory_kb / 1024).toFixed(2)} MB`
                : ""}
            </p>
          </div>
          <button className="ui-modal__close" type="button" aria-label="Đóng" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="ui-modal__body">
          <div className="code-label">Input</div>
          <CodeBox text={item.input_data} hidden={item.hidden} />
          <div className="io-pair" style={{ marginTop: "1rem" }}>
            <div>
              <div className="code-label">Kết quả mong đợi</div>
              <CodeBox text={item.expected_output} hidden={item.hidden} />
            </div>
            <div>
              <div className="code-label">Chương trình in ra</div>
              <CodeBox text={item.actual_output} hidden={item.hidden} />
            </div>
          </div>
          {item.error_message && (
            <div style={{ marginTop: "1rem" }}>
              <div className="code-label">Thông báo lỗi</div>
              <CodeBox text={item.error_message} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** Popup một lượt nộp: bảng test case ở trên, mã nguồn ở dưới. */
export default function CodingSubmissionDetail({
  assignmentId,
  submissionId,
  onClose,
}: {
  assignmentId: number;
  submissionId: number;
  onClose: () => void;
}) {
  const [submission, setSubmission] = useState<CodingSubmission | null>(null);
  const [testcases, setTestcases] = useState<CodingTestcaseResult[]>([]);
  const [error, setError] = useState("");
  const [openCase, setOpenCase] = useState<CodingTestcaseResult | null>(null);

  useEffect(() => {
    api
      .getCodingSubmissionDetail(assignmentId, submissionId)
      .then((res: any) => {
        setSubmission(res.submission);
        setTestcases(res.testcases || []);
      })
      .catch((e: Error) => setError(e.message));
  }, [assignmentId, submissionId]);

  return (
    <div
      className="ui-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !openCase) onClose();
      }}
    >
      <section className="ui-modal ui-modal--large" role="dialog" aria-modal="true" aria-labelledby="submission-detail-title">
        <header className="ui-modal__header">
          <div className="ui-modal__heading">
            <h3 className="ui-modal__title" id="submission-detail-title">
              Lượt {submission?.attempt_number} · {submission?.language} ·{" "}
              {Number(submission?.score || 0).toFixed(2)}/
              {Number(submission?.max_score || 0).toFixed(2)} điểm
            </h3>
            <p className="ui-modal__description">
              {submission?.student_name ? `${submission.student_name} · ` : ""}
              {submission
                ? new Date(submission.submitted_at).toLocaleString("vi-VN")
                : ""}{" "}
              · {submission?.status}
            </p>
          </div>
          <button className="ui-modal__close" type="button" aria-label="Đóng" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>

        <div className="ui-modal__body">
          {error ? (
            <MessageBar intent="error" onDismiss={onClose}>{error}</MessageBar>
          ) : !submission ? (
            <div className="ui-skeleton" style={{ height: 120 }} />
          ) : (
            <>
              {submission.compiler_output && (
                <div style={{ marginBottom: "1rem" }}>
                  <div className="code-label">Thông báo trình biên dịch</div>
                  <CodeBox text={submission.compiler_output} />
                </div>
              )}

              <h4 style={{ fontSize: "var(--font-size-sm)", margin: "0 0 .6rem" }}>
                Test case ({testcases.length})
              </h4>
              <div className="rows-scroll" style={{ overflowX: "auto" }}>
                <table className="problem-table">
                  <colgroup>
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "24%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "19%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Hiển thị</th>
                      <th>Điểm</th>
                      <th>Kết quả</th>
                      <th>Runtime</th>
                      <th>Memory</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testcases.map((tc) => (
                      <tr key={tc.order_index}>
                        <td>{tc.order_index + 1}</td>
                        <td>
                          <span
                            className={`badge ${tc.is_public ? "badge-active" : "badge-inactive"}`}
                          >
                            {tc.is_public ? "Public" : "Hidden"}
                          </span>
                        </td>
                        <td className="cell-score">{tc.point_weight}</td>
                        <td>
                          <span
                            className={`badge ${STATUS_BADGE[tc.status] || "badge-inactive"}`}
                          >
                            {tc.status}
                          </span>
                        </td>
                        <td>
                          {tc.runtime_ms == null ? "—" : `${tc.runtime_ms} ms`}
                        </td>
                        <td>
                          {tc.memory_kb == null
                            ? "—"
                            : `${(tc.memory_kb / 1024).toFixed(2)} MB`}
                        </td>
                        <td>
                          <button
                            className="ui-button ui-button--secondary ui-button--small"
                            onClick={() => setOpenCase(tc)}
                          >
                            Chi tiết
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h4 style={{ fontSize: ".95rem", margin: "1.5rem 0 .6rem" }}>
                Mã nguồn đã nộp
              </h4>
              <Editor
                height={`${Math.min(480, Math.max(180, (submission.source_code || "").split("\n").length * 19 + 24))}px`}
                language={
                  submission.language === "c" || submission.language === "cpp"
                    ? "cpp"
                    : submission.language
                }
                theme="vs-dark"
                value={submission.source_code || ""}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 14,
                  padding: { top: 8 },
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: "on",
                  folding: true,
                }}
              />
            </>
          )}
        </div>
      </section>

      {openCase && (
        <TestcaseModal item={openCase} onClose={() => setOpenCase(null)} />
      )}
    </div>
  );
}
