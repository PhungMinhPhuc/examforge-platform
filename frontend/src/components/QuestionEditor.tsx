import React from "react";
import Combobox from "@/components/Combobox";
import RichLatexEditor from "@/components/RichLatexEditor";
import CodingSettingsPanel from "./CodingSettingsPanel";

export type QuestionDetail = {
  id?: number;
  subject?: string;
  grade?: number;
  chapter?: string;
  lesson?: string;
  question_type: string;
  complexity?: number;
  content: string;
  solution?: string;
  teacher_name?: string;
  images?: { storage_path: string; img_scale?: number; img_type?: string }[];
  details?: {
    id?: number;
    content: string;
    is_correct?: boolean;
    explaination?: string;
  }[];
  children?: QuestionDetail[];
  coding_details?: {
    time_limit_c_cpp?: number;
    time_limit_java?: number;
    time_limit_python?: number;
    memory_limit?: number;
    max_submissions?: number;
    solution_code?: string;
    solution_language?: string;
  };
  coding_testcases?: {
    id?: number;
    input_data: string;
    output_data: string;
    point_weight: number;
    is_public: boolean;
    description?: string;
    order_index?: number;
  }[];
};

const TYPE_LABELS: Record<string, string> = {
  mc: "Trắc nghiệm",
  tf: "Đúng/Sai",
  sa: "Trả lời ngắn",
  oe: "Tự luận",
  st: "Chung giả thiết",
  cd: "Lập trình",
};
const COMPLEXITY_LABELS: Record<number, string> = {
  1: "Nhận biết",
  2: "Thông hiểu",
  3: "Vận dụng",
  4: "Vận dụng cao",
};

export const QuestionEditor = ({
  qData,
  onChange,
  onDelete,
  isChild = false,
  childIndex = 0,
  curriculum = {},
  metadata = { chapters: [], lessons: [] },
  imageEditable = false,
}: {
  qData: QuestionDetail;
  onChange: (q: QuestionDetail) => void;
  onDelete?: () => void;
  isChild?: boolean;
  childIndex?: number;
  curriculum?: any;
  metadata?: { chapters: string[]; lessons: string[] };
  imageEditable?: boolean;
}) => {
  const [newChildType, setNewChildType] = React.useState("mc");

  const handleAddChild = () => {
    let newDetails: any[] = [];
    if (newChildType === "mc") {
      newDetails = [
        { content: "", is_correct: true },
        { content: "", is_correct: false },
        { content: "", is_correct: false },
        { content: "", is_correct: false },
      ];
    } else if (newChildType === "tf") {
      newDetails = [
        { content: "", is_correct: true, explaination: "" },
        { content: "", is_correct: true, explaination: "" },
        { content: "", is_correct: true, explaination: "" },
        { content: "", is_correct: true, explaination: "" },
      ];
    } else if (newChildType === "sa") {
      newDetails = [{ content: "" }];
    }
    const newChild = {
      question_type: newChildType,
      content: "",
      details: newDetails,
    };
    const newChildren = [...(qData.children || []), newChild];
    onChange({ ...qData, children: newChildren });
  };

  const handleChange = (field: keyof QuestionDetail, value: any) => {
    onChange({ ...qData, [field]: value });
  };

  const handleDetailChange = (idx: number, field: string, value: any) => {
    const newDetails = [...(qData.details || [])];
    newDetails[idx] = { ...newDetails[idx], [field]: value };
    onChange({ ...qData, details: newDetails });
  };

  const subjOptions = Array.from(new Set(Object.keys(curriculum || {})));

  const gradeOptions = Array.from(
    new Set(
      qData.subject && curriculum[qData.subject]
        ? Object.keys(curriculum[qData.subject])
        : ["10", "11", "12"],
    ),
  );

  const currChapters =
    qData.subject && qData.grade && curriculum[qData.subject]?.[qData.grade]
      ? Object.keys(curriculum[qData.subject][qData.grade])
      : [];
  const chapterOptions = Array.from(
    new Set([...currChapters, ...metadata.chapters]),
  );

  const currLessons =
    qData.subject &&
    qData.grade &&
    qData.chapter &&
    curriculum[qData.subject]?.[qData.grade]?.[qData.chapter]
      ? curriculum[qData.subject][qData.grade][qData.chapter]
      : [];
  const lessonOptions = Array.from(
    new Set([...currLessons, ...metadata.lessons]),
  );

  return (
    <div
      className="card"
      style={{
        marginBottom: "1.5rem",
        border: isChild ? "1px solid var(--border)" : "none",
        background: isChild ? "var(--bg-card)" : "var(--bg-surface)",
      }}
    >
      <div
        className="card-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3 style={isChild ? { color: "var(--accent-primary)" } : {}}>
          {isChild
            ? `Câu ${childIndex}${qData.id ? ` #${qData.id}` : ""}`
            : `Nội dung câu hỏi ${qData.id ? `#${qData.id}` : ""}`}
        </h3>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <span className={`badge badge-${qData.question_type}`}>
            {TYPE_LABELS[qData.question_type] || qData.question_type}
          </span>
          {!isChild &&
            qData.question_type === "st" &&
            qData.children &&
            Array.from(new Set(qData.children.map((c) => c.question_type))).map(
              (t) => (
                <span key={t} className={`badge badge-${t}`}>
                  {TYPE_LABELS[t] || t}
                </span>
              ),
            )}
          {onDelete && (
            <button
              className="btn btn-danger btn-sm"
              onClick={onDelete}
              title="Xóa câu hỏi này"
              style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem" }}
            >
              Xóa
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div
          style={{
            background: "#f1f5f9",
            borderRadius: "1rem",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1.25rem 1rem",
            }}
          >
            {!isChild ? (
              <>
                <div className="form-group">
                  <label className="form-label">Môn học</label>
                  <Combobox
                    className="select"
                    value={qData.subject || ""}
                    onChange={(val) => handleChange("subject", val)}
                    options={subjOptions}
                    placeholder="Môn học"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Khối lớp</label>
                  <Combobox
                    className="select"
                    value={qData.grade || ""}
                    onChange={(val) =>
                      handleChange("grade", parseInt(val) || 0)
                    }
                    options={gradeOptions}
                    placeholder="Khối lớp"
                  />
                </div>
              </>
            ) : (
              <div className="form-group">
                <label className="form-label">Loại câu hỏi</label>
                <select
                  className="select"
                  value={qData.question_type}
                  onChange={(e) => {
                    const newType = e.target.value;
                    let newDetails: any[] = [];
                    if (newType === "mc") {
                      newDetails = [
                        { content: "", is_correct: true },
                        { content: "", is_correct: false },
                        { content: "", is_correct: false },
                        { content: "", is_correct: false },
                      ];
                    } else if (newType === "tf") {
                      newDetails = [
                        { content: "", is_correct: true, explaination: "" },
                        { content: "", is_correct: true, explaination: "" },
                        { content: "", is_correct: true, explaination: "" },
                        { content: "", is_correct: true, explaination: "" },
                      ];
                    } else if (newType === "sa") {
                      newDetails = [{ content: "" }];
                    }
                    onChange({
                      ...qData,
                      question_type: newType,
                      details: newDetails,
                    });
                  }}
                  style={{
                    width: "100%",
                    height: "38px",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  {Object.entries(TYPE_LABELS)
                    .filter(([k]) => k !== "st")
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Chương</label>
              <Combobox
                className="select"
                value={qData.chapter || ""}
                onChange={(val) => handleChange("chapter", val)}
                options={chapterOptions}
                placeholder="Chương"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Bài học</label>
              <Combobox
                className="select"
                value={qData.lesson || ""}
                onChange={(val) => handleChange("lesson", val)}
                options={lessonOptions}
                placeholder="Bài học"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mức độ</label>
              <Combobox
                className="select"
                value={qData.complexity || 1}
                onChange={(val) => handleChange("complexity", parseInt(val))}
                options={Object.entries(COMPLEXITY_LABELS).map(([k, v]) => ({
                  value: +k,
                  label: v,
                }))}
                placeholder="Mức độ"
              />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: "0.5rem", marginTop: "0.5rem" }}>
          <label className="form-label">Nội dung đề bài</label>
          <RichLatexEditor
            content={qData.content || ""}
            onChange={(val) => handleChange("content", val)}
            imageEditable={imageEditable}
            images={qData.images}
          />
        </div>

        {qData.details &&
          qData.details.length > 0 &&
          qData.question_type === "sa" && (
            <div>
              <label className="form-label">Trả lời ngắn</label>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {qData.details.map((det, idx) => (
                  <RichLatexEditor
                    key={idx}
                    content={det.content || ""}
                    onChange={(val) => handleDetailChange(idx, "content", val)}
                    placeholder="Nhập đáp án..."
                  />
                ))}
              </div>
            </div>
          )}

        {qData.details &&
          qData.details.length > 0 &&
          qData.question_type !== "sa" && (
            <div>
              <label className="form-label">
                {qData.question_type === "tf"
                  ? "Các ý Đúng / Sai"
                  : "Phương án trả lời"}
              </label>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {qData.details.map((det, idx) => {
                  const isMC = qData.question_type === "mc";
                  const letter = isMC
                    ? String.fromCharCode(65 + idx)
                    : `${String.fromCharCode(97 + idx)})`;
                  const correct = !!det.is_correct;
                  return (
                    <div
                      key={idx}
                      className={`option-card ${correct && isMC ? "is-correct" : ""}`}
                    >
                      <div
                        onClick={
                          isMC
                            ? () =>
                                onChange({
                                  ...qData,
                                  details: qData.details!.map((d, i) => ({
                                    ...d,
                                    is_correct: i === idx,
                                  })),
                                })
                            : undefined
                        }
                        title={isMC ? "Bấm để chọn làm đáp án đúng" : undefined}
                        style={{
                          flexShrink: 0,
                          width: 34,
                          height: 34,
                          marginTop: 2,
                          borderRadius: "8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          fontSize: "1.05rem",
                          cursor: isMC ? "pointer" : "default",
                          userSelect: "none",
                          background: correct && isMC ? "#10b981" : "#f1f5f9",
                          color: correct && isMC ? "#ffffff" : "#0f172a",
                          border: "none",
                          transition: "all 0.2s",
                        }}
                      >
                        {letter}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <RichLatexEditor
                          content={det.content || ""}
                          onChange={(val) =>
                            handleDetailChange(idx, "content", val)
                          }
                        />
                        {!isMC && (
                          <div style={{ marginTop: "0.6rem" }}>
                            <label
                              style={{
                                display: "block",
                                fontSize: "0.78rem",
                                fontWeight: 600,
                                color: "var(--text-secondary)",
                                marginBottom: "0.3rem",
                              }}
                            >
                              Giải thích cho ý {letter}
                            </label>
                            <RichLatexEditor
                              content={det.explaination || ""}
                              onChange={(val) =>
                                handleDetailChange(idx, "explaination", val)
                              }
                              placeholder="Giải thích vì sao ý này đúng/sai (tùy chọn)"
                            />
                          </div>
                        )}
                      </div>

                      <div style={{ flexShrink: 0, marginTop: 4 }}>
                        {isMC ? (
                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <input
                              type="radio"
                              name={`correct_${qData.id}_${isChild ? childIndex : "parent"}`}
                              checked={correct}
                              onChange={() =>
                                onChange({
                                  ...qData,
                                  details: qData.details!.map((d, i) => ({
                                    ...d,
                                    is_correct: i === idx,
                                  })),
                                })
                              }
                            />
                            <span
                              style={{
                                fontSize: "0.85rem",
                                color: correct
                                  ? "var(--accent-success)"
                                  : "var(--text-secondary)",
                                fontWeight: correct ? 700 : 500,
                              }}
                            >
                              Đúng
                            </span>
                          </label>
                        ) : (
                          <div
                            style={{
                              display: "inline-flex",
                              flexDirection: "column",
                              background: "#f1f5f9",
                              borderRadius: 8,
                              overflow: "hidden",
                              width: 64,
                              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.05)",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                handleDetailChange(idx, "is_correct", true)
                              }
                              style={{
                                padding: "0.4rem 0",
                                border: "none",
                                borderBottom: "1px solid rgba(0,0,0,0.05)",
                                cursor: "pointer",
                                fontSize: "0.85rem",
                                background: correct
                                  ? "var(--accent-success)"
                                  : "#fff",
                                color: correct ? "#fff" : "var(--text-primary)",
                                fontWeight: correct ? 700 : 500,
                              }}
                            >
                              Đúng
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleDetailChange(idx, "is_correct", false)
                              }
                              style={{
                                padding: "0.4rem 0",
                                border: "none",
                                cursor: "pointer",
                                fontSize: "0.85rem",
                                background: !correct
                                  ? "var(--accent-danger)"
                                  : "#fff",
                                color: !correct
                                  ? "#fff"
                                  : "var(--text-primary)",
                                fontWeight: !correct ? 700 : 500,
                              }}
                            >
                              Sai
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        {qData.question_type === "cd" && (
          <CodingSettingsPanel qData={qData} onChange={onChange} />
        )}

        {(qData.solution !== undefined || qData.question_type !== "st") &&
          qData.question_type !== "cd" && (
            <div style={{ marginTop: "1rem" }}>
              <label className="form-label">
                {qData.question_type === "tf"
                  ? "Lời giải chung"
                  : "Lời giải chi tiết"}
              </label>
              <RichLatexEditor
                content={qData.solution || ""}
                onChange={(val) => handleChange("solution", val)}
              />
            </div>
          )}

        {!isChild && qData.question_type === "st" && (
          <div
            style={{
              marginTop: "1rem",
              borderTop: "2px dashed var(--border)",
              paddingTop: "1.5rem",
            }}
          >
            <div
              style={{
                marginBottom: "1.5rem",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  paddingLeft: "0.5rem",
                  borderLeft: "4px solid var(--accent-primary)",
                }}
              >
                Các câu hỏi con
              </h3>
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <div style={{ width: "170px" }}>
                  <Combobox
                    className="select"
                    value={newChildType}
                    onChange={(val) => {
                      if (qData.children && qData.children.length > 0) {
                        let newDetails: any[] = [];
                        if (val === "mc") {
                          newDetails = [
                            { content: "", is_correct: true },
                            { content: "", is_correct: false },
                            { content: "", is_correct: false },
                            { content: "", is_correct: false },
                          ];
                        } else if (val === "tf") {
                          newDetails = [
                            { content: "", is_correct: true, explaination: "" },
                            { content: "", is_correct: true, explaination: "" },
                            { content: "", is_correct: true, explaination: "" },
                            { content: "", is_correct: true, explaination: "" },
                          ];
                        } else if (val === "sa") {
                          newDetails = [{ content: "" }];
                        }
                        const newChild = {
                          question_type: val,
                          content: "",
                          details: newDetails,
                        };
                        onChange({ ...qData, children: [newChild] });
                      }
                      setNewChildType(val);
                    }}
                    options={Object.entries(TYPE_LABELS)
                      .filter(([k]) => k !== "st")
                      .map(([k, v]) => ({ value: k, label: v }))}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    padding: "0.25rem 0.75rem",
                    fontSize: "0.85rem",
                    height: "38px",
                  }}
                  onClick={handleAddChild}
                >
                  + Thêm
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
              }}
            >
              {(qData.children || []).map((child, idx) => (
                <QuestionEditor
                  key={idx}
                  qData={child}
                  onChange={(newChild) => {
                    const newChildren = [...(qData.children || [])];
                    newChildren[idx] = newChild;
                    onChange({ ...qData, children: newChildren });
                  }}
                  onDelete={() => {
                    if (!confirm("Xóa câu hỏi con này?")) return;
                    const newChildren = [...(qData.children || [])];
                    newChildren.splice(idx, 1);
                    onChange({ ...qData, children: newChildren });
                  }}
                  isChild={true}
                  childIndex={idx + 1}
                  curriculum={curriculum}
                  metadata={metadata}
                  imageEditable={imageEditable}
                />
              ))}
              {(!qData.children || qData.children.length === 0) && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    background: "var(--bg-elevated)",
                    color: "var(--text-muted)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  Chưa có câu hỏi con.
                </div>
              )}
              {qData.children && qData.children.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginTop: "1rem",
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleAddChild}
                  >
                    + Thêm câu hỏi con
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
