"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/Sidebar";
import LatexRenderer from "@/components/LatexRenderer";
import AdaptiveOptionGrid from "@/components/AdaptiveOptionGrid";
import TrueFalseOptionList from "@/components/TrueFalseOptionList";
import Combobox from "@/components/Combobox";
import { QuestionEditor, QuestionDetail } from "@/components/QuestionEditor";
import api from "@/lib/api";
import { mcCorrectLabel } from "@/lib/docTree";
import { toast } from "@/lib/toastStore";

const TYPE_COLORS: Record<string, string> = {
  mc: "var(--type-mc)",
  tf: "var(--type-tf)",
  sa: "var(--type-sa)",
  oe: "var(--type-oe)",
  st: "var(--tone-purple-text)",
  cd: "var(--type-cd)",
};
const TYPE_SOFT: Record<string, string> = {
  mc: "var(--type-mc-soft)",
  tf: "var(--type-tf-soft)",
  sa: "var(--type-sa-soft)",
  oe: "var(--type-oe-soft)",
  cd: "var(--type-cd-soft)",
};
const TYPE_BORDER: Record<string, string> = {
  mc: "var(--type-mc-border)",
  tf: "var(--type-tf-border)",
  sa: "var(--type-sa-border)",
  oe: "var(--type-oe-border)",
  cd: "var(--type-cd-border)",
};

const typeBackground = (type: string) =>
  type === "st" ? "var(--tone-purple-bg)" : TYPE_SOFT[type] || "var(--type-mc-soft)";
const typeBorder = (type: string) =>
  type === "st"
    ? "var(--tone-purple-border)"
    : TYPE_BORDER[type] || "var(--type-mc-border)";

type ParsedItem = {
  table_question: Record<string, unknown>;
  table_details: { target_table: string; records: Record<string, unknown>[] };
  table_images: { id?: number | string; storage_path: string; url?: string; img_type?: string; width?: number | null; raw_code?: string | null }[];
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

export default function UploadPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [editModal, setEditModal] = useState<{
    idx: number;
    draft: QuestionDetail;
    isChild: boolean;
    childIndex?: number;
  } | null>(null);

  const mapToDetail = (item: any): QuestionDetail => {
    return {
      id: 0,
      subject: subject,
      grade: Number(item.table_question.grade || grade),
      chapter: item.table_question.chapter || "",
      lesson: item.table_question.lesson || "",
      question_type: item.table_question.question_type,
      complexity: item.table_question.complexity || 1,
      layout_type: item.table_question.layout_type || "normal",
      content: item.table_question.content || "",
      solution: item.table_question.solution || "",
      images: item.table_images || [],
      details:
        item.table_details?.records?.map((r: any, i: number) => ({
          id: i,
          content: r.content,
          is_correct: r.is_correct,
          explaination: r.explaination ?? r.explanation,
        })) || [],
    };
  };

  const mapFromDetail = (qData: QuestionDetail, oldItem: any) => {
    return {
      ...oldItem,
      table_question: {
        ...oldItem.table_question,
        content: qData.content,
        solution: qData.solution,
        chapter: qData.chapter,
        lesson: qData.lesson,
        complexity: qData.complexity,
        grade: qData.grade,
        layout_type: qData.layout_type || "normal",
      },
      table_images: qData.images || oldItem.table_images || [],
      table_details: oldItem.table_details
        ? {
            ...oldItem.table_details,
            records:
              qData.details?.map((d: any) => ({
                content: d.content,
                is_correct: d.is_correct,
                explaination: d.explaination,
              })) || [],
          }
        : oldItem.table_details,
    };
  };

  const openEdit = (idx: number, isChild: boolean, childIndex?: number) => {
    setEditModal({
      idx,
      draft: mapToDetail(preview[idx]),
      isChild,
      childIndex,
    });
  };

  const saveEdit = () => {
    if (!editModal) return;
    const next = [...preview];
    next[editModal.idx] = mapFromDetail(editModal.draft, next[editModal.idx]);
    setPreview(next);
    setEditModal(null);
  };

  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState<ParsedItem[]>([]);
  const [uploadJobId, setUploadJobId] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Record<string, unknown>>({});

  const [subject, setSubject] = useState("Toán");
  const [grade, setGrade] = useState("12");
  const [chapter, setChapter] = useState("");
  const [lesson, setLesson] = useState("");
  const [complexity, setComplexity] = useState(1);

  // Modal nhập tên đề thi khi "Lưu & tạo đề thi"
  const [showContestModal, setShowContestModal] = useState(false);
  const [contestTitle, setContestTitle] = useState("");

  useEffect(() => {
    if (!isLoading && !user) router.replace("/");
    if (!isLoading && user?.role !== "teacher") router.replace("/dashboard");
  }, [user, isLoading, router]);

  useEffect(() => {
    api
      .getSubjects()
      .then(setSubjects)
      .catch(() => {});
  }, []);

  const subjectList = Object.keys(subjects);
  const gradeList = subject
    ? Object.keys(
        (subjects as Record<string, Record<string, unknown>>)[subject] || {},
      )
    : ["10", "11", "12"];
  const chapterList =
    subject && grade
      ? Object.keys(
          (subjects as Record<string, Record<string, Record<string, unknown>>>)[
            subject
          ]?.[grade] || {},
        )
      : [];
  const lessonList: string[] =
    subject && grade && chapter
      ? ((subjects as any)?.[subject]?.[grade]?.[chapter] as string[]) || []
      : [];

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (
      f &&
      (f.name.endsWith(".tex") ||
        f.name.endsWith(".txt") ||
        f.name.endsWith(".zip") ||
        f.name.endsWith(".docx"))
    )
      setFile(f);
  };

  const handleParse = async (overrideFile?: File) => {
    const targetFile = overrideFile || file;
    if (!targetFile || !user) return;
    setLoading(true);
    setError("");
    if (uploadJobId) {
      api.cancelUploadJob(uploadJobId).catch(() => undefined);
      setUploadJobId(null);
    }
    setPreview([]);
    const fd = new FormData();
    fd.append("file", targetFile);
    fd.append("teacher_id", String(user.user_id));
    fd.append("subject", subject);
    fd.append("grade", grade);
    fd.append("chapter", chapter);
    fd.append("complexity", String(complexity));
    try {
      const res = await api.uploadTex(fd);
      setUploadJobId(res.job_id || null);
      let completed = res;
      while (completed.status === "processing") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        completed = await api.getUploadJob(completed.job_id);
      }
      if (completed.data && completed.data.length > 0) {
        setPreview(completed.data);
      } else {
        const msg =
          "Không tìm thấy câu hỏi nào trong file (định dạng chưa chuẩn). Vui lòng đảm bảo các câu hỏi bắt đầu bằng chữ 'Câu 1.', 'Câu 2:',...";
        setError(msg);
        toast.error(msg);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lỗi parse file");
      toast.error(e instanceof Error ? e.message : "Lỗi parse file");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get("source") === "ai") {
        const aiData = localStorage.getItem("ai_normalized_questions");
        if (aiData) {
          try {
            const parsed = JSON.parse(aiData);
            const questionsArr = parsed.questions || parsed;
            if (Array.isArray(questionsArr) && questionsArr.length > 0) {
              const texContent = questionsArr
                .map((q: any) => q.latex_code || "")
                .join("\n\n");
              const aiFile = new File([texContent], "ai_normalized.tex", {
                type: "text/plain",
              });
              setFile(aiFile);

              // Tự động gọi parse với file AI thay vì dùng click
              handleParse(aiFile);
            } else {
              setError("Không tìm thấy câu hỏi từ dữ liệu AI.");
              toast.error("Không tìm thấy câu hỏi từ dữ liệu AI.");
            }
          } catch (e) {
            setError("Lỗi khi đọc dữ liệu từ AI.");
            toast.error("Lỗi khi đọc dữ liệu từ AI.");
          }
          localStorage.removeItem("ai_normalized_questions");
        }
      }
    }
  }, [user, subject, grade, chapter, complexity]);

  const updateItem = (idx: number, key: string, val: unknown) => {
    setPreview((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next[idx].table_question[key] = val;
      return next;
    });
  };

  // Đồng bộ 1 trường (chương/bài/mức độ/khối) cho TẤT CẢ câu trong preview.
  const applyToAll = (key: string, val: unknown) => {
    setPreview((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.forEach((it: any) => {
        it.table_question[key] = val;
      });
      return next;
    });
  };

  const removeItem = (idx: number) =>
    setPreview((prev) => prev.filter((_, i) => i !== idx));

  const discardPreview = () => {
    if (uploadJobId) api.cancelUploadJob(uploadJobId).catch(() => undefined);
    setUploadJobId(null);
    setPreview([]);
  };

  const updatePreviewImageWidth = (
    idx: number,
    storagePath: string,
    width: number,
  ) => {
    setPreview((current) =>
      current.map((item, itemIndex) =>
        itemIndex !== idx
          ? item
          : {
              ...item,
              table_images: (item.table_images || []).map((image) =>
                image.storage_path === storagePath ? { ...image, width } : image,
              ),
            },
      ),
    );
  };

  const stCount = preview.filter(
    (q: any) => q.table_question?.question_type === "st",
  ).length;
  const actualQCount = preview.length - stCount;
  const countText =
    stCount > 0
      ? `${actualQCount} câu hỏi và ${stCount} chung giả thiết`
      : `${actualQCount} câu hỏi`;

  const handleConfirm = async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      await api.confirmUpload({
        teacher_id: user.user_id,
        subject,
        grade: parseInt(grade),
        data: preview,
        job_id: uploadJobId,
      });
      setSuccess(` Đã lưu ${countText} vào CSDL!`);
      toast.success(`Đã lưu ${countText} vào CSDL!`);
      setPreview([]);
      setUploadJobId(null);
      setFile(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lỗi lưu dữ liệu");
      toast.error(e instanceof Error ? e.message : "Lỗi lưu dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  // Mở hộp nhập tên đề (modal) trước khi lưu + tạo đề thi.
  const handleConfirmAsContest = () => {
    if (!user) return;
    const defaultTitle =
      (file?.name?.replace(/\.[^.]+$/, "") || "Đề thi import") +
      " - " +
      new Date().toLocaleDateString("vi-VN");
    setContestTitle(defaultTitle);
    setShowContestModal(true);
  };

  // Lưu các câu vừa import vào ngân hàng RỒI tạo luôn thành 1 đề thi.
  const doCreateContest = async () => {
    if (!user) return;
    const title = contestTitle.trim() || "Đề thi import";
    setShowContestModal(false);
    setLoading(true);
    setError("");
    try {
      const res = await api.confirmUploadAsContest({
        teacher_id: user.user_id,
        subject,
        grade: parseInt(grade),
        data: preview,
        job_id: uploadJobId,
        title,
        time_limit: 45,
        scoring_config: { mc: 0.25, tf: 1.0, sa: 0.25, oe: 2.0 },
        status: "inactive",
      });
      setPreview([]);
      setUploadJobId(null);
      setFile(null);
      setSuccess(`Đã lưu ${res.saved} câu và tạo đề thi! Đang chuyển...`);
      toast.success(`Đã lưu ${res.saved} câu và tạo đề thi!`);
      setTimeout(() => router.push(`/contests/${res.contest_id}`), 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lỗi tạo đề thi");
      toast.error(e instanceof Error ? e.message : "Lỗi tạo đề thi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Nhập câu hỏi từ tài liệu</h1>
            <p className="page-sub">
              Hỗ trợ: .tex, .txt, .zip, .docx đã được chuẩn hóa
            </p>
          </div>
        </div>

        {error && <div className="alert alert-error"> {error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {preview.length === 0 ? (
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            {/* Upload zone */}
            <div>
              <div
                className={`upload-zone ${dragging ? "drag-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
              >
                <div className="upload-icon"></div>
                <div className="upload-text">
                  Kéo thả hoặc nhấn để chọn tài liệu
                </div>
                <div className="upload-sub">
                  Hỗ trợ: .tex, .txt, .zip, .docx
                </div>
                {file && (
                  <div
                    style={{
                      marginTop: "1rem",
                      color: "var(--accent-success)",
                      fontWeight: 600,
                    }}
                  >
                    ✓ {file.name}
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".tex,.txt,.zip,.docx"
                style={{ display: "none" }}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>

            <button
              id="btn-parse-preview"
              className="btn btn-primary btn-block btn-lg"
              style={{ marginTop: "1rem" }}
              onClick={() => handleParse()}
              disabled={!file || loading}
            >
              {loading ? (
                <>
                  <span className="spinner" /> Đang trích xuất...
                </>
              ) : (
                " Trích xuất và Xem trước"
              )}
            </button>
            <p
              style={{
                marginTop: "0.75rem",
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              Môn, khối, chương/bài và mức độ sẽ điền chung cho tất cả câu sau
              khi trích xuất.
            </p>
          </div>
        ) : (
          /* Preview */
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1.5rem",
              }}
            >
              <div>
                <h2 style={{ marginBottom: "0.25rem" }}>
                  Xem trước - {countText}
                </h2>
                <p
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "var(--font-size-base)",
                  }}
                >
                  Kiểm tra và chỉnh sửa trước khi lưu vào CSDL
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  className="btn btn-secondary"
                  onClick={discardPreview}
                >
                  Hủy
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleConfirmAsContest}
                  disabled={loading}
                  title="Lưu vào ngân hàng rồi tạo luôn thành 1 đề thi"
                >
                  Lưu & tạo đề thi
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleConfirm}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner" /> Đang lưu...
                    </>
                  ) : (
                    ` Lưu `
                  )}
                </button>
              </div>
            </div>

            {/* Thông tin chung — đồng bộ cho tất cả câu sau khi parse */}
            <div
              className="card"
              style={{ marginBottom: "1.5rem", padding: "1rem 1.25rem" }}
            >
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: "0.75rem",
                  fontSize: "0.9rem",
                }}
              >
                Thông tin chung — áp dụng cho tất cả {preview.length} câu
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  alignItems: "center",
                }}
              >
                <Combobox
                  className="select"
                  style={{ width: "auto" }}
                  value={subject}
                  onChange={(s) => {
                    setSubject(s);
                    const gs = Object.keys(
                      (subjects as Record<string, Record<string, unknown>>)[
                        s
                      ] || {},
                    );
                    setGrade(gs[0] || "12");
                    setChapter("");
                    setLesson("");
                  }}
                  options={subjectList}
                />
                <Combobox
                  className="select"
                  style={{ width: "auto" }}
                  value={grade}
                  onChange={(g) => {
                    const gradeValue = String(g);
                    setGrade(gradeValue);
                    setChapter("");
                    setLesson("");
                    applyToAll("grade", +gradeValue);
                  }}
                  options={gradeList.map((g) => ({
                    value: g,
                    label: `Lớp ${g}`,
                  }))}
                />
                <Combobox
                  className="select"
                  style={{ flex: 1, minWidth: "180px" }}
                  value={chapter}
                  onChange={(val) => {
                    setChapter(val);
                    setLesson("");
                    applyToAll("chapter", val);
                  }}
                  options={chapterList}
                  placeholder="Chương (áp dụng tất cả)"
                />
                <Combobox
                  className="select"
                  style={{ flex: 1, minWidth: "180px" }}
                  value={lesson}
                  onChange={(val) => {
                    setLesson(val);
                    applyToAll("lesson", val);
                  }}
                  options={lessonList}
                  placeholder="Bài (áp dụng tất cả)"
                />
                <Combobox
                  className="select"
                  style={{ width: "auto" }}
                  value={complexity}
                  onChange={(value) => {
                    setComplexity(+value);
                    applyToAll("complexity", +value);
                  }}
                  options={Object.entries(COMPLEXITY_LABELS).map(
                    ([value, label]) => ({
                      value,
                      label,
                    }),
                  )}
                />
              </div>
              <div
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--text-muted)",
                  marginTop: "0.6rem",
                }}
              >
                Đổi chương/bài/mức độ ở đây sẽ đồng bộ cho mọi câu; vẫn có thể
                chỉnh riêng từng câu bên dưới.
              </div>
            </div>

            {(() => {
              const groupedPreview: any[] = [];
              let currentParent: any = null;

              for (let i = 0; i < preview.length; i++) {
                const item = preview[i];
                if (item.table_question.question_type === "st") {
                  const newItem = { ...item, originalIdx: i, children: [] };
                  groupedPreview.push(newItem);
                  currentParent = newItem;
                } else if (
                  item.table_question.parent_id &&
                  currentParent &&
                  currentParent.table_question.public_id ===
                    item.table_question.parent_id
                ) {
                  currentParent.children.push({ ...item, originalIdx: i });
                } else {
                  groupedPreview.push({ ...item, originalIdx: i });
                }
              }

              let displayCounter = 1;

              const renderItem = (
                item: any,
                displayNum: number | string,
                isChild: boolean = false,
              ) => {
                const q = item.table_question;
                const qtype = String(q.question_type);
                const originalIdx = item.originalIdx;
                const options = item.table_details?.records || [];

                const children = isChild ? [] : item.children || [];

                if (qtype === "st") {
                  const children = item.children || [];
                  const stRange =
                    children.length > 0
                      ? `Dựa vào thông tin dưới đây để trả lời từ câu ${Number(displayNum)} đến câu ${Number(displayNum) + children.length - 1}`
                      : null;
                  return (
                    <div
                      key={originalIdx}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-lg)",
                        background: "var(--bg-card)",
                        overflow: "hidden",
                        marginBottom: "1.5rem",
                      }}
                    >
                      {/* ST header: content + buttons column */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "1rem",
                          padding: "1.5rem",
                          background: "var(--bg-surface)",
                          borderBottom: "2px dashed var(--border)",
                          borderLeft: "4px solid var(--accent-primary)",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
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
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              marginBottom: "0.75rem",
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "var(--font-size-xs)",
                                fontWeight: 600,
                                padding: "0.2rem 0.5rem",
                                borderRadius: 99,
                                background: typeBackground(qtype),
                                color:
                                  TYPE_COLORS[qtype] || "var(--accent-primary)",
                                border: `1px solid ${typeBorder(qtype)}`,
                              }}
                            >
                              {TYPE_LABELS[qtype] || qtype}
                            </span>
                            <div
                              style={{
                                position: "relative",
                                display: "inline-block",
                              }}
                            >
                              <span
                                className={`badge complexity-${q.complexity}`}
                                style={{ paddingRight: "1.5rem" }}
                              >
                                {COMPLEXITY_LABELS[q.complexity as number]}
                              </span>
                              <select
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  width: "100%",
                                  height: "100%",
                                  opacity: 0,
                                  cursor: "pointer",
                                }}
                                value={Number(q.complexity) || 1}
                                onChange={(e) =>
                                  updateItem(
                                    originalIdx,
                                    "complexity",
                                    +e.target.value,
                                  )
                                }
                              >
                                {Object.entries(COMPLEXITY_LABELS).map(
                                  ([k, v]) => (
                                    <option key={k} value={k}>
                                      {v}
                                    </option>
                                  ),
                                )}
                              </select>
                              <span
                                style={{
                                  position: "absolute",
                                  right: "0.4rem",
                                  top: "50%",
                                  transform: "translateY(-50%)",
                                  fontSize: "0.6rem",
                                  pointerEvents: "none",
                                  color: "inherit",
                                }}
                              >
                                ▼
                              </span>
                            </div>
                            <Combobox
                              className="select"
                              style={{ width: "100px" }}
                              value={q.grade || grade}
                              onChange={(val) =>
                                updateItem(originalIdx, "grade", +val)
                              }
                              options={gradeList.map((g) => ({
                                value: g,
                                label: `Lớp ${g}`,
                              }))}
                              placeholder="Lớp"
                            />
                            <Combobox
                              className="select"
                              style={{ flex: 1, minWidth: "150px" }}
                              value={q.chapter || ""}
                              onChange={(val) =>
                                updateItem(originalIdx, "chapter", val)
                              }
                              options={Object.keys(
                                (subjects as any)?.[subject]?.[
                                  q.grade || grade
                                ] || {},
                              )}
                              placeholder="Chương"
                            />
                            <Combobox
                              className="select"
                              style={{ flex: 1, minWidth: "150px" }}
                              value={q.lesson || ""}
                              onChange={(val) =>
                                updateItem(originalIdx, "lesson", val)
                              }
                              options={
                                (subjects as any)?.[subject]?.[
                                  q.grade || grade
                                ]?.[q.chapter || ""] || []
                              }
                              placeholder="Bài"
                            />
                          </div>
                          <LatexRenderer
                            content={q.content}
                            layoutType={String(q.layout_type || "normal")}
                            images={item.table_images || []}
                            imageZoomable
                            onImageWidthChange={(path, width) =>
                              updatePreviewImageWidth(originalIdx, path, width)
                            }
                            className="question-content"
                          />
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem",
                            flexShrink: 0,
                          }}
                        >
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEdit(originalIdx, false)}
                          >
                            Chi tiết
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => removeItem(originalIdx)}
                          >
                            Xóa
                          </button>
                        </div>
                      </div>
                      {/* ST children */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0",
                        }}
                      >
                        {children.map((child: any, cIdx: number) => (
                          <div
                            key={cIdx}
                            style={{
                              borderTop:
                                cIdx > 0 ? "1px solid var(--border)" : "none",
                            }}
                          >
                            {renderItem(child, Number(displayNum) + cIdx, true)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={originalIdx}
                    style={
                      isChild
                        ? { padding: "1.5rem", background: "var(--bg-surface)" }
                        : {
                            padding: "1.25rem",
                            background: "var(--bg-surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-lg)",
                            boxShadow: "var(--shadow-sm)",
                            marginBottom: "1.5rem",
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
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.75rem",
                            alignItems: "center",
                            marginBottom: "0.5rem",
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 700,
                              color: "var(--accent-primary)",
                              fontSize: "1.1rem",
                            }}
                          >
                            Câu {displayNum}
                          </span>
                          {!isChild && (
                            <div
                              style={{
                                display: "flex",
                                gap: "0.5rem",
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "var(--font-size-xs)",
                                  fontWeight: 600,
                                  padding: "0.2rem 0.6rem",
                                  borderRadius: 99,
                                  background: typeBackground(qtype),
                                  color:
                                    TYPE_COLORS[qtype] ||
                                    "var(--accent-primary)",
                                  border: `1px solid ${typeBorder(qtype)}`,
                                }}
                              >
                                {TYPE_LABELS[qtype] || qtype}
                              </span>
                              <div
                                style={{
                                  position: "relative",
                                  display: "inline-block",
                                }}
                              >
                                <span
                                  className={`badge complexity-${q.complexity}`}
                                  style={{ paddingRight: "1.5rem" }}
                                >
                                  {COMPLEXITY_LABELS[q.complexity as number]}
                                </span>
                                <select
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    height: "100%",
                                    opacity: 0,
                                    cursor: "pointer",
                                  }}
                                  value={Number(q.complexity) || 1}
                                  onChange={(e) =>
                                    updateItem(
                                      originalIdx,
                                      "complexity",
                                      +e.target.value,
                                    )
                                  }
                                >
                                  {Object.entries(COMPLEXITY_LABELS).map(
                                    ([k, v]) => (
                                      <option key={k} value={k}>
                                        {v}
                                      </option>
                                    ),
                                  )}
                                </select>
                                <span
                                  style={{
                                    position: "absolute",
                                    right: "0.4rem",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    fontSize: "0.6rem",
                                    pointerEvents: "none",
                                    color: "inherit",
                                  }}
                                >
                                  ▼
                                </span>
                              </div>
                              <Combobox
                                className="select"
                                style={{ width: "100px" }}
                                value={q.grade || grade}
                                onChange={(val) =>
                                  updateItem(originalIdx, "grade", +val)
                                }
                                options={gradeList.map((g) => ({
                                  value: g,
                                  label: `Lớp ${g}`,
                                }))}
                                placeholder="Lớp"
                              />
                              <Combobox
                                className="select"
                                style={{ flex: 1, minWidth: "150px" }}
                                value={q.chapter || ""}
                                onChange={(val) =>
                                  updateItem(originalIdx, "chapter", val)
                                }
                                options={Object.keys(
                                  (subjects as any)?.[subject]?.[
                                    q.grade || grade
                                  ] || {},
                                )}
                                placeholder="Chương"
                              />
                              <Combobox
                                className="select"
                                style={{ flex: 1, minWidth: "150px" }}
                                value={q.lesson || ""}
                                onChange={(val) =>
                                  updateItem(originalIdx, "lesson", val)
                                }
                                options={
                                  (subjects as any)?.[subject]?.[
                                    q.grade || grade
                                  ]?.[q.chapter || ""] || []
                                }
                                placeholder="Bài"
                              />
                            </div>
                          )}
                        </div>

                        <LatexRenderer
                          content={q.content}
                          layoutType={String(q.layout_type || "normal")}
                          images={item.table_images || []}
                          imageZoomable
                          onImageWidthChange={(path, width) =>
                            updatePreviewImageWidth(originalIdx, path, width)
                          }
                          className="question-content"
                          preserveLineBreaks={qtype === "cd"}
                        />

                        {qtype === "mc" && options.length > 0 && (
                          <AdaptiveOptionGrid
                            count={options.length}
                            style={{ marginTop: "0.75rem" }}
                          >
                            {options.map((opt: any, oi: number) => {
                              let bg = "var(--bg-elevated)";
                              let border = "transparent";
                              let textColor = "var(--text-secondary)";
                              if (opt.is_correct) {
                                bg = "var(--answer-correct-bg)";
                                border = "var(--answer-correct-border)";
                                textColor = "var(--accent-success)";
                              }
                              return (
                                <div
                                  key={oi}
                                  data-opt-cell="1"
                                  style={{
                                    display: "flex",
                                    alignItems: "baseline",
                                    gap: "0.5rem",
                                    padding: "0.4rem 0.75rem",
                                    borderRadius: "var(--radius-sm)",
                                    background: bg,
                                    border: `1px solid ${border}`,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontWeight: 700,
                                      color: textColor,
                                    }}
                                  >
                                    {String.fromCharCode(65 + oi)}.
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <LatexRenderer
                                      content={opt.content}
                                      images={item.table_images || []}
                                      imageZoomable
                                      onImageWidthChange={(path, width) =>
                                        updatePreviewImageWidth(originalIdx, path, width)
                                      }
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </AdaptiveOptionGrid>
                        )}

                        {qtype === "tf" && options.length > 0 && (
                          <TrueFalseOptionList>
                            {options.map((opt: any, oi: number) => (
                              <div
                                key={oi}
                                style={{
                                  display: "flex",
                                  gap: "0.5rem",
                                  alignItems: "center",
                                  padding: "0.4rem 0.75rem",
                                  borderRadius: "var(--radius-sm)",
                                  background: opt.is_correct
                                    ? "var(--answer-correct-bg)"
                                    : "var(--answer-wrong-bg)",
                                  border: `1px solid ${opt.is_correct ? "var(--answer-correct-border)" : "var(--answer-wrong-border)"}`,
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
                                    images={item.table_images || []}
                                    imageZoomable
                                    onImageWidthChange={(path, width) =>
                                      updatePreviewImageWidth(originalIdx, path, width)
                                    }
                                  />
                                </div>
                              </div>
                            ))}
                          </TrueFalseOptionList>
                        )}

                        {qtype === "sa" &&
                          options.length > 0 &&
                          (() => {
                            const rawAns = String(options[0].content || "")
                              .replace(/\$/g, "")
                              .replace(/[{}]/g, "")
                              .trim();
                            const chars = rawAns.split("");
                            const boxes = Array.from({
                              length: Math.max(4, chars.length),
                            }).map((_, i) => chars[i] || "");

                            return (
                              <div
                                style={{
                                  marginTop: "0.75rem",
                                  padding: "0.5rem 0.75rem",
                                  background: "var(--accent-primary-soft)",
                                  border:
                                    "1px solid var(--accent-primary-border)",
                                  borderRadius: "var(--radius-md)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.75rem",
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: 600,
                                    color: "var(--accent-primary)",
                                  }}
                                >
                                  Trả lời ngắn:
                                </span>
                                <div
                                  style={{ display: "flex", gap: "0.25rem" }}
                                >
                                  {boxes.map((c, i) => (
                                    <div
                                      key={i}
                                      style={{
                                        width: "25px",
                                        height: "27px",
                                        border:
                                          "2px solid var(--accent-primary)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontWeight: 700,
                                        borderRadius: "4px",
                                        background: "var(--bg-surface)",
                                        color: "var(--text-primary)",
                                      }}
                                    >
                                      {c}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                        {/* Solution */}
                        {qtype !== "st" &&
                          ((q.solution && qtype !== "tf") ||
                            (qtype === "tf" && options.length > 0)) && (
                          <div
                            style={{
                              marginTop: "1rem",
                              padding: "1rem",
                              background: "var(--bg-surface)",
                              borderLeft: "4px solid var(--accent-primary)",
                              borderTop:
                                "1px solid var(--accent-primary-border)",
                              borderRight:
                                "1px solid var(--accent-primary-border)",
                              borderBottom:
                                "1px solid var(--accent-primary-border)",
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
                            {qtype === "tf" && options.length > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "0.5rem",
                                  marginBottom: q.solution ? "1rem" : "0",
                                }}
                              >
                                {options.map((opt: any, oi: number) => (
                                  <div
                                    key={oi}
                                    style={{
                                      display: "flex",
                                      gap: "0.5rem",
                                      alignItems: "baseline",
                                    }}
                                  >
                                    <strong style={{ flexShrink: 0 }}>
                                      {String.fromCharCode(97 + oi)}){" "}
                                      {opt.is_correct ? "Đúng." : "Sai."}
                                    </strong>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {opt.explaination && (
                                        <LatexRenderer
                                          content={opt.explaination}
                                          images={item.table_images || []}
                                          imageZoomable
                                          onImageWidthChange={(path, width) =>
                                            updatePreviewImageWidth(originalIdx, path, width)
                                          }
                                        />
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {q.solution && (
                              <LatexRenderer
                                content={q.solution}
                                images={item.table_images || []}
                                imageZoomable
                                onImageWidthChange={(path, width) =>
                                  updatePreviewImageWidth(originalIdx, path, width)
                                }
                              />
                            )}
                            {qtype === "mc" && mcCorrectLabel(options) && (
                              <div
                                style={{ fontWeight: 700, marginTop: "0.5rem" }}
                              >
                                Chọn {mcCorrectLabel(options)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {/* end flex-1 content */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem",
                          flexShrink: 0,
                        }}
                      >
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            openEdit(
                              originalIdx,
                              isChild,
                              isChild ? Number(displayNum) : undefined,
                            )
                          }
                        >
                          Chi tiết
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => removeItem(originalIdx)}
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                    {/* end flex row */}
                  </div>
                );
              };

              return groupedPreview.map((item) => {
                let currentDisplayCounter = displayCounter;
                const el = renderItem(item, currentDisplayCounter);

                if (item.table_question.question_type === "st") {
                  displayCounter += item.children ? item.children.length : 0;
                } else {
                  displayCounter++;
                }
                return el;
              });
            })()}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.75rem",
                marginTop: "1.5rem",
              }}
            >
              <button
                className="btn btn-secondary"
                onClick={discardPreview}
              >
                Hủy
              </button>
              <button
                className="btn btn-secondary btn-lg"
                onClick={handleConfirmAsContest}
                disabled={loading}
                title="Lưu vào ngân hàng rồi tạo luôn thành 1 đề thi"
              >
                Lưu & tạo đề thi
              </button>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner" /> Đang lưu...
                  </>
                ) : (
                  ` Lưu `
                )}
              </button>
            </div>
          </div>
        )}
        {/* Modal nhập tên đề thi cho "Lưu & tạo đề thi" */}
        {showContestModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1100,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2rem",
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setShowContestModal(false);
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 460,
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-lg)",
                padding: "1.5rem",
              }}
            >
              <h3 style={{ margin: "0 0 1rem" }}>
                Tạo đề thi từ các câu vừa import
              </h3>
              <label className="form-label">Tên đề thi</label>
              <input
                className="input"
                value={contestTitle}
                autoFocus
                onChange={(e) => setContestTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") doCreateContest();
                }}
                placeholder="Nhập tên đề thi"
              />
              <p
                style={{
                  fontSize: "0.78rem",
                  color: "var(--text-muted)",
                  marginTop: "0.5rem",
                }}
              >
                Các câu sẽ được lưu vào ngân hàng và tạo thành 1 đề thi (mặc
                định: chưa mở, 45 phút). Có thể chỉnh lại sau ở trang đề thi.
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                  marginTop: "1.25rem",
                }}
              >
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowContestModal(false)}
                >
                  Hủy
                </button>
                <button
                  className="btn btn-primary"
                  onClick={doCreateContest}
                  disabled={loading}
                >
                  Tạo đề thi
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit modal — fixed overlay so page scroll is never affected */}
        {editModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              padding: "2rem",
              overflowY: "auto",
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setEditModal(null);
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 900,
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-lg)",
                marginBottom: "2rem",
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
                <h3 style={{ margin: 0 }}>Chi tiết câu hỏi</h3>
                <button
                  onClick={() => setEditModal(null)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 20,
                    color: "var(--text-secondary)",
                    lineHeight: 1,
                    padding: 4,
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: "1.5rem" }}>
                <QuestionEditor
                  qData={editModal.draft}
                  onChange={(newDraft) =>
                    setEditModal((m) => (m ? { ...m, draft: newDraft } : m))
                  }
                  isChild={editModal.isChild}
                  childIndex={editModal.childIndex}
                  imageEditable={true}
                  importJobId={uploadJobId || undefined}
                />
              </div>

              <div
                style={{
                  padding: "1rem 1.5rem",
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                }}
              >
                <button
                  className="btn btn-secondary"
                  onClick={() => setEditModal(null)}
                >
                  Hủy bỏ
                </button>
                <button className="btn btn-primary" onClick={saveEdit}>
                  Lưu
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
