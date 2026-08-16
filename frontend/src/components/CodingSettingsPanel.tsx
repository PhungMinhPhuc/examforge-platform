import React from "react";
import { QuestionDetail } from "./QuestionEditor";
import Editor from "@monaco-editor/react";
import NumberInput from "./NumberInput";

export default function CodingSettingsPanel({
  qData,
  onChange,
}: {
  qData: QuestionDetail;
  onChange: (q: QuestionDetail) => void;
}) {
  const details = qData.coding_details || {
    time_limit_c_cpp: 1.0,
    time_limit_java: 2.0,
    time_limit_python: 2.0,
    memory_limit: 256,
    max_submissions: 10,
    solution_code: "",
    solution_language: "cpp",
  };

  const updateDetails = (field: string, value: any) => {
    onChange({
      ...qData,
      coding_details: { ...details, [field]: value },
    });
  };

  // testcases management
  const testcases = qData.coding_testcases || [];

  const addTestcase = () => {
    onChange({
      ...qData,
      coding_testcases: [
        ...testcases,
        {
          input_data: "",
          output_data: "",
          point_weight: 1,
          is_public: false,
          is_sample: false,
          order_index: testcases.length,
        },
      ],
    });
  };

  const updateTestcase = (idx: number, field: string, value: any) => {
    const newTc = [...testcases];
    newTc[idx] = { ...newTc[idx], [field]: value };
    onChange({ ...qData, coding_testcases: newTc });
  };

  const removeTestcase = (idx: number) => {
    const newTc = [...testcases];
    newTc.splice(idx, 1);
    onChange({ ...qData, coding_testcases: newTc });
  };

  // Mở cho xem sau khi nộp hàng loạt, đỡ phải tích từng test case
  const allPublic = testcases.length > 0 && testcases.every((tc) => tc.is_public);
  const togglePublicAll = () =>
    onChange({
      ...qData,
      coding_testcases: testcases.map((tc) => ({ ...tc, is_public: !allPublic })),
    });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        marginTop: "1rem",
      }}
    >
      {/* Settings Grid */}
      <div
        style={{
          background: "var(--bg-hover)",
          padding: "1rem",
          borderRadius: "0.75rem",
          border: "1px solid var(--border)",
        }}
      >
        <h4 style={{ margin: "0 0 1rem 0", color: "var(--text-primary)" }}>
          Giới hạn tài nguyên & Nộp bài
        </h4>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "1rem",
          }}
        >
          <div className="form-group">
            <label className="form-label">Time C/C++ (s)</label>
            <NumberInput
              step="0.1"
              className="input"
              value={details.time_limit_c_cpp}
              onChange={(v) => updateDetails("time_limit_c_cpp", v)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Time Java (s)</label>
            <NumberInput
              step="0.1"
              className="input"
              value={details.time_limit_java}
              onChange={(v) => updateDetails("time_limit_java", v)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Time Python (s)</label>
            <NumberInput
              step="0.1"
              className="input"
              value={details.time_limit_python}
              onChange={(v) => updateDetails("time_limit_python", v)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Memory (MB)</label>
            <NumberInput
              className="input"
              value={details.memory_limit}
              onChange={(v) => updateDetails("memory_limit", v)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Max Submissions</label>
            <NumberInput
              className="input"
              value={details.max_submissions}
              onChange={(v) => updateDetails("max_submissions", v)}
            />
          </div>
        </div>
      </div>

      {/* Testcases */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <div>
            <h4 style={{ margin: 0, color: "var(--text-primary)" }}>Danh sách Testcases</h4>
            <div style={{ fontSize: ".85rem" }}>
              Tổng điểm:{" "}
              <strong style={{ color: "var(--accent-primary)" }}>
                {testcases.reduce(
                  (sum, tc) => sum + (Number(tc.point_weight) || 0),
                  0,
                )}
              </strong>
            </div>
          </div>
          <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={togglePublicAll}
              disabled={!testcases.length}
            >
              {allPublic ? "Bỏ tích tất cả" : "Cho xem tất cả"}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={addTestcase}
            >
              + Thêm Testcase
            </button>
          </div>
        </div>

        {testcases.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "1rem",
              background: "var(--bg-hover)",
              borderRadius: "0.5rem",
              color: "var(--text-muted)",
            }}
          >
            Chưa có testcase nào. Hãy bấm thêm testcase để chấm điểm.
          </div>
        ) : (
          <div className="tc-scroll">
            {testcases.map((tc, idx) => (
              <div key={idx} className="tc-rec">
                <div className="tc-rec-head">
                  <span className="tc-idx">#{idx + 1}</span>
                  <label className="tc-flag">
                    Điểm
                    <NumberInput
                      min={0}
                      className="tc-point"
                      value={tc.point_weight}
                      onChange={(v) => updateTestcase(idx, "point_weight", v)}
                    />
                  </label>
                  <label className="tc-flag">
                    <input
                      type="checkbox"
                      checked={!!tc.is_sample}
                      onChange={(e) =>
                        updateTestcase(idx, "is_sample", e.target.checked)
                      }
                    />
                    Hiện trên đề
                  </label>
                  <label className="tc-flag">
                    <input
                      type="checkbox"
                      checked={tc.is_public}
                      onChange={(e) =>
                        updateTestcase(idx, "is_public", e.target.checked)
                      }
                    />
                    Cho xem sau khi nộp
                  </label>
                  <button
                    type="button"
                    className="tc-x"
                    title="Xóa test case"
                    onClick={() => removeTestcase(idx)}
                  >
                    ✕
                  </button>
                </div>
                <div className="io-pair">
                  <div>
                    <div className="code-label">Input</div>
                    <textarea
                      className="code-edit"
                      value={tc.input_data}
                      onChange={(e) =>
                        updateTestcase(idx, "input_data", e.target.value)
                      }
                      placeholder="Dữ liệu đầu vào (stdin)..."
                    />
                  </div>
                  <div>
                    <div className="code-label">Output</div>
                    <textarea
                      className="code-edit"
                      value={tc.output_data}
                      onChange={(e) =>
                        updateTestcase(idx, "output_data", e.target.value)
                      }
                      placeholder="Kết quả đầu ra (stdout)..."
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor cho Code mẫu */}
      <div>
        <h4 style={{ margin: "0 0 1rem 0", color: "var(--text-primary)" }}>
          Solution Code
        </h4>
        <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem" }}>
          <select
            className="select"
            style={{ width: "200px" }}
            value={details.solution_language}
            onChange={(e) => updateDetails("solution_language", e.target.value)}
          >
            <option value="cpp">C++</option>
            <option value="c">C</option>
            <option value="java">Java</option>
            <option value="python">Python</option>
          </select>
        </div>
        <div
          style={{
            height: "400px",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            overflow: "hidden",
          }}
        >
          <Editor
            height="100%"
            language={
              details.solution_language === "c"
                ? "c"
                : details.solution_language === "cpp"
                  ? "cpp"
                  : details.solution_language === "java"
                    ? "java"
                    : "python"
            }
            theme="vs-dark"
            value={details.solution_code || ""}
            onChange={(val) => updateDetails("solution_code", val || "")}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              padding: { top: 8 },
            }}
          />
        </div>
      </div>
    </div>
  );
}
