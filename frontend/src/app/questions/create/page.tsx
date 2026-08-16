"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/Sidebar";
import { QuestionEditor, QuestionDetail, defaultDetailsFor } from "@/components/QuestionEditor";
import Combobox from "@/components/Combobox";
import api from "@/lib/api";
import Link from "next/link";
import { emptyDoc } from "@/lib/docTree";
import { toast } from "@/lib/toastStore";

export default function CreateQuestionPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [subjects, setSubjects] = useState<any>(null);
  const [metadata, setMetadata] = useState<{
    chapters: string[];
    lessons: string[];
  }>({ chapters: [], lessons: [] });

  const [qData, setQData] = useState<QuestionDetail>({
    question_type: "mc",
    subject: "",
    grade: 10,
    chapter: "",
    lesson: "",
    complexity: 1,
    content: emptyDoc(),
    solution: emptyDoc(),
    details: defaultDetailsFor("mc"),
    coding_details: {
      time_limit_c_cpp: 1.0,
      time_limit_java: 2.0,
      time_limit_python: 2.0,
      memory_limit: 256,
      max_submissions: 10,
      solution_code: "",
      solution_language: "cpp",
    },
    coding_testcases: [],
  });

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push("/");
      return;
    }
    if (user.role !== "teacher") {
      router.push("/dashboard");
      return;
    }
    api
      .getSubjects()
      .then((res) => setSubjects(res))
      .catch(() => {});
    api
      .getMetadataFilters()
      .then((res) => setMetadata(res))
      .catch(() => {});
  }, [user, isLoading, router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("type") === "cd") {
      setQData((current) => ({ ...current, question_type: "cd", details: [] }));
    }
  }, []);

  const handleSave = async () => {
    if (
      !qData.subject ||
      !qData.grade ||
      !qData.question_type ||
      !qData.content
    ) {
      const msg =
        "Vui lòng điền đầy đủ môn học, lớp, loại câu hỏi và nội dung đề bài.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (qData.question_type === "cd") {
      if (
        !qData.coding_details ||
        (qData.coding_details.max_submissions || 0) < 1
      ) {
        const msg = "Câu lập trình phải có giới hạn lượt nộp lớn hơn 0.";
        setError(msg);
        toast.error(msg);
        return;
      }
      if (!qData.coding_testcases?.length) {
        const msg = "Câu lập trình phải có ít nhất một testcase.";
        setError(msg);
        toast.error(msg);
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const created = await api.createQuestion({
        subject: qData.subject,
        grade: qData.grade,
        chapter: qData.chapter,
        lesson: qData.lesson,
        question_type: qData.question_type,
        complexity: qData.complexity,
        content: qData.content,
        solution: qData.solution,
        details: qData.details,
        coding_details: qData.coding_details,
        coding_testcases: qData.coding_testcases,
      });
      const pendingImages = (qData.images || []).filter(
        (image: any) => image.pendingFile,
      );
      if (pendingImages.length) {
        const uploadedImages = await Promise.all(
          pendingImages.map((image: any) =>
            api.uploadQuestionImage(created.id, image.pendingFile),
          ),
        );
        const uploadedIdByPendingId = new Map(
          pendingImages.map((image: any, index: number) => [
            image.id,
            uploadedImages[index].id,
          ]),
        );
        const replaceFigureId = (value: any): any => {
          if (Array.isArray(value)) return value.map(replaceFigureId);
          if (!value || typeof value !== "object") return value;
          return Object.fromEntries(
            Object.entries(value).map(([key, child]) => [
              key,
              key === "figure_id" && uploadedIdByPendingId.has(child)
                ? uploadedIdByPendingId.get(child)
                : replaceFigureId(child),
            ]),
          );
        };
        // Sau khi tạo, lấy ID thật của từng detail để cập nhật cả ảnh trong
        // phương án/giải thích; endpoint update chỉ sửa detail theo ID.
        const savedQuestion = await api.getQuestion(created.id);
        await api.updateQuestion(created.id, {
          content: replaceFigureId(qData.content),
          solution: replaceFigureId(qData.solution),
          details: qData.details?.map((detail: any, index: number) => ({
            ...detail,
            id: savedQuestion.details?.[index]?.id,
            content: replaceFigureId(detail.content),
            explaination: replaceFigureId(detail.explaination),
          })),
        });
      }
      toast.success("Tạo câu hỏi thành công!");
      const returnTo = new URLSearchParams(window.location.search).get(
        "returnTo",
      );
      router.push(returnTo === "/coding" ? "/coding" : "/questions");
    } catch (err: any) {
      setError(err.message || "Lỗi khi tạo câu hỏi");
      toast.error(err.message || "Lỗi khi tạo câu hỏi");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading)
    return (
      <div className="spinner" style={{ margin: "auto", display: "block" }} />
    );

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Tạo câu hỏi</h1>
            <p className="page-sub">
              Nhập câu hỏi Trắc nghiệm, Tự luận hoặc Lập trình
            </p>
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <Link href="/questions" className="btn btn-secondary">
              Hủy
            </Link>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Đang lưu..." : "Lưu câu hỏi"}
            </button>
          </div>
        </div>

        <div>
          {error && (
            <div
              className="alert alert-error"
              style={{ marginBottom: "1.5rem" }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            <label
              className="form-label"
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: "0.9rem",
              }}
            >
              Loại câu hỏi:
            </label>
            <div style={{ flex: 1, maxWidth: "400px" }}>
              <Combobox
                className="select"
                value={qData.question_type}
                options={[
                  { value: "mc", label: "Trắc nghiệm nhiều lựa chọn" },
                  { value: "tf", label: "Đúng/Sai" },
                  { value: "sa", label: "Trả lời ngắn" },
                  { value: "oe", label: "Tự luận" },
                  { value: "cd", label: "Lập trình" },
                  { value: "st", label: "Chung giả thiết" },
                ]}
                onChange={(newType) => {
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

                  const newQData = {
                    ...qData,
                    question_type: newType,
                    details: newDetails,
                  };
                  if (newType === "st" && !newQData.children) {
                    newQData.children = [];
                  }
                  setQData(newQData);
                }}
              />
            </div>
          </div>

          <QuestionEditor
            qData={qData}
            onChange={setQData}
            curriculum={subjects || {}}
            metadata={metadata}
            imageEditable={true}
          />
        </div>
      </main>
    </div>
  );
}
