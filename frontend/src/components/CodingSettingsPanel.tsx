import React from "react";
import { QuestionDetail } from "./QuestionEditor";
import Editor from "@monaco-editor/react";

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
          background: "#f8fafc",
          padding: "1rem",
          borderRadius: "0.75rem",
          border: "1px solid #e2e8f0",
        }}
      >
        <h4 style={{ margin: "0 0 1rem 0", color: "#0f172a" }}>
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
            <input
              type="number"
              step="0.1"
              className="input"
              value={details.time_limit_c_cpp}
              onChange={(e) =>
                updateDetails("time_limit_c_cpp", parseFloat(e.target.value))
              }
            />
          </div>
          <div className="form-group">
            <label className="form-label">Time Java (s)</label>
            <input
              type="number"
              step="0.1"
              className="input"
              value={details.time_limit_java}
              onChange={(e) =>
                updateDetails("time_limit_java", parseFloat(e.target.value))
              }
            />
          </div>
          <div className="form-group">
            <label className="form-label">Time Python (s)</label>
            <input
              type="number"
              step="0.1"
              className="input"
              value={details.time_limit_python}
              onChange={(e) =>
                updateDetails("time_limit_python", parseFloat(e.target.value))
              }
            />
          </div>
          <div className="form-group">
            <label className="form-label">Memory (MB)</label>
            <input
              type="number"
              className="input"
              value={details.memory_limit}
              onChange={(e) =>
                updateDetails("memory_limit", parseInt(e.target.value))
              }
            />
          </div>
          <div className="form-group">
            <label className="form-label">Max Submissions</label>
            <input
              type="number"
              className="input"
              value={details.max_submissions}
              onChange={(e) =>
                updateDetails("max_submissions", parseInt(e.target.value))
              }
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
          <h4 style={{ margin: 0, color: "#0f172a" }}>Danh sách Testcases</h4>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={addTestcase}
          >
            + Thêm Testcase
          </button>
        </div>

        {testcases.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "1rem",
              background: "#f8fafc",
              borderRadius: "0.5rem",
              color: "#64748b",
            }}
          >
            Chưa có testcase nào. Hãy bấm thêm testcase để chấm điểm.
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            {testcases.map((tc, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  background: "#fff",
                  padding: "0.75rem",
                  borderRadius: "0.75rem",
                  border: "1px solid #e2e8f0",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flex: 1 }}>
                  <label className="form-label">Input</label>
                  <textarea
                    className="input"
                    style={{ minHeight: "80px", fontFamily: "monospace" }}
                    value={tc.input_data}
                    onChange={(e) =>
                      updateTestcase(idx, "input_data", e.target.value)
                    }
                    placeholder="Dữ liệu đầu vào (stdin)..."
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Output mong đợi</label>
                  <textarea
                    className="input"
                    style={{ minHeight: "80px", fontFamily: "monospace" }}
                    value={tc.output_data}
                    onChange={(e) =>
                      updateTestcase(idx, "output_data", e.target.value)
                    }
                    placeholder="Kết quả đầu ra (stdout)..."
                  />
                </div>
                <div
                  style={{
                    width: "88px",
                    flex: "0 0 88px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.65rem",
                  }}
                >
                  <div>
                    <label
                      className="form-label"
                      style={{ fontSize: ".72rem" }}
                    >
                      Điểm
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="input"
                      style={{ padding: ".45rem .55rem" }}
                      value={tc.point_weight}
                      onChange={(e) =>
                        updateTestcase(
                          idx,
                          "point_weight",
                          parseInt(e.target.value) || 0,
                        )
                      }
                    />
                  </div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      cursor: "pointer",
                      fontSize: "0.78rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={tc.is_public}
                      onChange={(e) =>
                        updateTestcase(idx, "is_public", e.target.checked)
                      }
                    />
                    Công khai
                  </label>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => removeTestcase(idx)}
                    style={{ width: "100%", padding: "0.4rem" }}
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor cho Code mẫu */}
      <div>
        <h4 style={{ margin: "0 0 1rem 0", color: "#0f172a" }}>
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
            border: "1px solid #e2e8f0",
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
            }}
          />
        </div>
      </div>
    </div>
  );
}
