import React from "react";
import Combobox from "@/components/Combobox";
import RichLatexEditor from "@/components/RichLatexEditor";
import CodingSettingsPanel from "./CodingSettingsPanel";
import { TreeDoc, emptyDoc } from "@/lib/docTree";

export type QuestionDetail = {
  id?: number;
  subject?: string;
  grade?: number;
  chapter?: string;
  lesson?: string;
  question_type: string;
  complexity?: number;
  layout_type?: string; // normal | immini_content — cụm "Bố cục" ảnh trôi ở Nội dung đề bài
  // Luôn là cây tài liệu (TreeDoc), kể cả câu "sa" — chỉ ĐÁP ÁN sa
  // (details[].content) mới là chuỗi thường (xem q_shortans_details.content).
  content: TreeDoc;
  solution?: TreeDoc;
  teacher_name?: string;
  images?: { id?: number | string; storage_path: string; url?: string; width?: number | null; img_type?: string; asset_exists?: boolean; pendingFile?: File | Blob }[];
  details?: {
    id?: number;
    content: any; // TreeDoc (mc/tf) hoặc string (sa)
    is_correct?: boolean;
    explaination?: TreeDoc;
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
    is_public: boolean; // cho xem chi tiết sau khi nộp
    is_sample?: boolean; // hiện làm ví dụ trên đề
    description?: string;
    order_index?: number;
  }[];
};

// Bộ phương án mặc định khi tạo câu mới / đổi loại câu — mc/tf luôn là cây
// (emptyDoc), riêng đáp án "sa" vẫn là chuỗi thường (xem q_shortans_details).
export function defaultDetailsFor(type: string): QuestionDetail["details"] {
  if (type === "mc") {
    return [
      { content: emptyDoc(), is_correct: true },
      { content: emptyDoc(), is_correct: false },
      { content: emptyDoc(), is_correct: false },
      { content: emptyDoc(), is_correct: false },
    ];
  }
  if (type === "tf") {
    return [
      { content: emptyDoc(), is_correct: true, explaination: emptyDoc() },
      { content: emptyDoc(), is_correct: true, explaination: emptyDoc() },
      { content: emptyDoc(), is_correct: true, explaination: emptyDoc() },
      { content: emptyDoc(), is_correct: true, explaination: emptyDoc() },
    ];
  }
  if (type === "sa") {
    return [{ content: "" }];
  }
  return [];
}

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
  importJobId,
}: {
  qData: QuestionDetail;
  onChange: (q: QuestionDetail) => void;
  onDelete?: () => void;
  isChild?: boolean;
  childIndex?: number;
  curriculum?: any;
  metadata?: { chapters: string[]; lessons: string[] };
  imageEditable?: boolean;
  importJobId?: string;
}) => {
  const [newChildType, setNewChildType] = React.useState("mc");

  const handleAddChild = () => {
    const newDetails = defaultDetailsFor(newChildType);
    const newChild: QuestionDetail = {
      question_type: newChildType,
      content: emptyDoc(),
      details: newDetails,
    };
    const newChildren = [...(qData.children || []), newChild];
    onChange({ ...qData, children: newChildren });
  };

  // `newImage` chỉ có khi RichLatexEditor vừa chèn ảnh MỚI (nút/dán) — PHẢI
  // gộp vào qData.images trong CÙNG một lần cập nhật với content/layout_type.
  // Từng tách content và ảnh-mới thành 2 lần onChange riêng gọi liền nhau
  // (giống layout_type trước đây) — cả 2 cùng spread {...qData,...} trên
  // CÙNG một qData cũ (React chưa kịp re-render giữa 2 lần gọi), lần sau đè
  // mất lần trước, ảnh vừa chèn "biến mất" khỏi qData.images dù vẫn thấy
  // trên màn hình (chỉ là DOM thao tác tay) — bấm +/− sau đó không tìm thấy
  // ảnh trong `images` prop nữa nên im re không phản ứng.
  const handleChange = (field: keyof QuestionDetail, value: any, newImage?: { id?: number | string; storage_path: string; width?: number | null; img_type?: string; pendingFile?: File | Blob }) => {
    if (field === "content" && value && typeof value === "object") {
      onChange({
        ...qData,
        content: value,
        layout_type: value.side === "right" ? "immini_content" : "normal",
        ...(newImage ? { images: [...(qData.images || []), newImage] } : {}),
      });
      return;
    }
    onChange({
      ...qData,
      [field]: value,
      ...(newImage ? { images: [...(qData.images || []), newImage] } : {}),
    });
  };

  const handleDetailChange = (
    idx: number,
    field: string,
    value: any,
    newImage?: { id?: number | string; storage_path: string; width?: number | null; img_type?: string; pendingFile?: File | Blob },
  ) => {
    const newDetails = [...(qData.details || [])];
    newDetails[idx] = { ...newDetails[idx], [field]: value };
    onChange({
      ...qData,
      details: newDetails,
      ...(newImage ? { images: [...(qData.images || []), newImage] } : {}),
    });
  };

  // Đổi cỡ ảnh (cụm nút −/%/+ trong RichLatexEditor) — CHỈ giữ tạm ở form,
  // KHÔNG gọi API ở đây. Gộp lưu chung một lượt khi bấm "Lưu" câu hỏi (xem
  // questions/page.tsx::saveDetail, đọc lại qData.images lúc đó).
  const handleImageWidthChange = (storagePath: string, width: number) => {
    const newImages = (qData.images || []).map((img) =>
      img.storage_path === storagePath ? { ...img, width } : img,
    );
    onChange({ ...qData, images: newImages });
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
        <div className="meta-table" style={{ marginBottom: "0.25rem" }}>
          {!isChild ? (
              <>
                <div className="meta-row">
                  <span className="meta-row-label">Môn học</span>
                  <Combobox
                    className="meta-row-value"
                    style={{ flex: 1 }}
                    value={qData.subject || ""}
                    onChange={(val) => handleChange("subject", val)}
                    options={subjOptions}
                    placeholder="Môn học"
                  />
                </div>
                <div className="meta-row">
                  <span className="meta-row-label">Khối lớp</span>
                  <Combobox
                    className="meta-row-value"
                    style={{ flex: 1 }}
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
              <div className="meta-row">
                <span className="meta-row-label">Loại câu hỏi</span>
                <select
                  className="meta-row-value"
                  value={qData.question_type}
                  onChange={(e) => {
                    const newType = e.target.value;
                    onChange({
                      ...qData,
                      question_type: newType,
                      details: defaultDetailsFor(newType),
                    });
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
            <div className="meta-row">
              <span className="meta-row-label">Chương</span>
              <Combobox
                className="meta-row-value"
                style={{ flex: 1 }}
                value={qData.chapter || ""}
                onChange={(val) => handleChange("chapter", val)}
                options={chapterOptions}
                placeholder="Chương"
              />
            </div>
            <div className="meta-row">
              <span className="meta-row-label">Bài học</span>
              <Combobox
                className="meta-row-value"
                style={{ flex: 1 }}
                value={qData.lesson || ""}
                onChange={(val) => handleChange("lesson", val)}
                options={lessonOptions}
                placeholder="Bài học"
              />
            </div>
            <div className="meta-row">
              <span className="meta-row-label">Mức độ</span>
              <Combobox
                className="meta-row-value"
                style={{ flex: 1 }}
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

        <div style={{ marginBottom: "0.5rem", marginTop: "0.5rem" }}>
          <label className="section-label">Nội dung đề bài</label>
          <RichLatexEditor
            key={`content-${qData.id ?? "new"}`}
            content={qData.content}
            onChange={(val, newImage) => handleChange("content", val, newImage)}
            imageEditable={imageEditable}
            images={qData.images}
            onImageWidthChange={handleImageWidthChange}
            questionId={qData.id}
            importJobId={importJobId}
            allowPendingImage={imageEditable && !qData.id && !importJobId}
            showLayoutControl
            layoutType={qData.layout_type}
          />
        </div>

        {qData.details &&
          qData.details.length > 0 &&
          qData.question_type === "sa" && (
            <div>
              <label className="section-label">Trả lời ngắn</label>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {qData.details.map((det, idx) => (
                  // Đáp án "sa" luôn là số/chuỗi thường (q_shortans_details.content
                  // vẫn là text) — không phải cây, nên dùng input thường, không
                  // qua RichLatexEditor (chỉ soạn cây).
                  <input
                    key={idx}
                    type="text"
                    className="input"
                    value={det.content || ""}
                    onChange={(e) => handleDetailChange(idx, "content", e.target.value)}
                    placeholder="Nhập đáp án..."
                    style={{
                      padding: "0.6rem 0.85rem",
                      border: "1.5px solid var(--border-strong)",
                      borderRadius: "8px",
                      fontSize: "0.95rem",
                    }}
                  />
                ))}
              </div>
            </div>
          )}

        {qData.details &&
          qData.details.length > 0 &&
          qData.question_type !== "sa" && (
            <div>
              <label className="section-label">
                {qData.question_type === "tf"
                  ? "Các ý Đúng / Sai"
                  : "Phương án trả lời"}
              </label>
              <div
                className="option-list-surface"
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
                          background:
                            correct && isMC
                              ? "var(--accent-success)"
                              : "var(--bg-hover)",
                          color: correct && isMC ? "var(--text-on-accent)" : "var(--text-primary)",
                          border: "none",
                          transition: "all 0.2s",
                        }}
                      >
                        {letter}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <RichLatexEditor
                          key={`${qData.question_type}-opt-${idx}-${det.id ?? "new"}`}
                          content={det.content}
                          onChange={(val, newImage) =>
                            handleDetailChange(idx, "content", val, newImage)
                          }
                          placeholder={
                            isMC
                              ? `Nhập nội dung phương án ${letter}...`
                              : `Nhập nội dung ý ${letter}...`
                          }
                          imageEditable={imageEditable}
                          images={qData.images}
                          onImageWidthChange={handleImageWidthChange}
                          questionId={qData.id}
                          importJobId={importJobId}
                          allowPendingImage={imageEditable && !qData.id && !importJobId}
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
                              key={`${qData.question_type}-expl-${idx}-${det.id ?? "new"}`}
                              content={det.explaination}
                              onChange={(val, newImage) =>
                                handleDetailChange(idx, "explaination", val, newImage)
                              }
                              placeholder="Giải thích vì sao ý này đúng/sai (tùy chọn)"
                              imageEditable={imageEditable}
                              images={qData.images}
                              onImageWidthChange={handleImageWidthChange}
                              questionId={qData.id}
                              importJobId={importJobId}
                              allowPendingImage={imageEditable && !qData.id && !importJobId}
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
                              background: "var(--bg-hover)",
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
                                borderBottom: "1px solid var(--border)",
                                cursor: "pointer",
                                fontSize: "0.85rem",
                                background: correct
                                  ? "var(--accent-success)"
                                  : "var(--bg-surface)",
                                color: correct
                                  ? "var(--text-on-accent)"
                                  : "var(--text-primary)",
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
                                  : "var(--bg-surface)",
                                color: !correct
                                  ? "var(--text-on-accent)"
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

        {qData.question_type !== "st" &&
          qData.question_type !== "cd" && (
            <div style={{ marginTop: "1rem" }}>
              <label className="section-label">
                {qData.question_type === "tf"
                  ? "Lời giải chung"
                  : "Lời giải chi tiết"}
              </label>
              <RichLatexEditor
                key={`solution-${qData.id ?? "new"}`}
                content={qData.solution}
                onChange={(val, newImage) => handleChange("solution", val, newImage)}
                imageEditable={imageEditable}
                images={qData.images}
                onImageWidthChange={handleImageWidthChange}
                questionId={qData.id}
                importJobId={importJobId}
                allowPendingImage={imageEditable && !qData.id && !importJobId}
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
                        const newChild: QuestionDetail = {
                          question_type: val,
                          content: emptyDoc(),
                          details: defaultDetailsFor(val),
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
