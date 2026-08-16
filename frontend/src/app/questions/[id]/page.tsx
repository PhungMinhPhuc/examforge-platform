"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/Sidebar";
import LatexRenderer from "@/components/LatexRenderer";
import RichLatexEditor from "@/components/RichLatexEditor";
import Combobox from "@/components/Combobox";
import api from "@/lib/api";
import { QuestionEditor, QuestionDetail } from "@/components/QuestionEditor";
import Link from "next/link";
import { toast } from "@/lib/toastStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function QuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { id } = params instanceof Promise ? use(params) : (params as any);
  const [question, setQuestion] = useState<QuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [metadata, setMetadata] = useState<{
    chapters: string[];
    lessons: string[];
  }>({ chapters: [], lessons: [] });
  const [curriculum, setCurriculum] = useState<any>({});

  useEffect(() => {
    if (!isLoading && !user) router.replace("/");
    if (!isLoading && user?.role !== "teacher") router.replace("/dashboard");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (isLoading || user?.role !== "teacher") return;
    Promise.all([
      api.getQuestion(parseInt(id)),
      api.getMetadataFilters().catch(() => ({ chapters: [], lessons: [] })),
      api.getSubjects().catch(() => ({})),
    ])
      .then(([qData, metaData, currData]) => {
        setQuestion(qData);
        setMetadata(metaData);
        setCurriculum(currData);
      })
      .catch((err) => setError(err.message || "Lỗi khi tải câu hỏi"))
      .finally(() => setLoading(false));
  }, [id, isLoading, user?.role]);

  // Hủy bỏ các thay đổi văn bản chưa lưu: tải lại câu hỏi từ máy chủ.
  // (Ảnh được lưu ngay khi xác nhận trong hộp chỉnh ảnh, nên không bị ảnh hưởng.)
  const handleDiscard = async () => {
    if (!question) return;
    if (!confirm("Hủy bỏ các thay đổi chưa lưu và tải lại câu hỏi?")) return;
    setError("");
    setSuccessMsg("");
    try {
      const fresh = await api.getQuestion(question.id!);
      setQuestion(fresh);
      setSuccessMsg("Đã hủy các thay đổi chưa lưu.");
      setTimeout(() => setSuccessMsg(""), 2000);
      toast.success("Đã hủy các thay đổi chưa lưu.");
    } catch (err: any) {
      setError(err.message || "Không thể tải lại câu hỏi");
      toast.error(err.message || "Không thể tải lại câu hỏi");
    }
  };

  const handleSaveAll = async () => {
    if (!question) return;
    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      // Lưu câu chính
      await api.updateQuestion(question.id!, {
        subject: question.subject,
        grade: question.grade,
        chapter: question.chapter,
        lesson: question.lesson,
        complexity: question.complexity,
        content: question.content,
        solution: question.solution,
        details: question.details?.map((d) => ({
          id: d.id,
          content: d.content,
          is_correct: d.is_correct,
        })),
      });

      // Lưu các câu con
      if (question.children && question.children.length > 0) {
        for (const child of question.children) {
          await api.updateQuestion(child.id!, {
            subject: child.subject,
            grade: child.grade,
            chapter: child.chapter,
            lesson: child.lesson,
            complexity: child.complexity,
            content: child.content,
            solution: child.solution,
            details: child.details?.map((d) => ({
              id: d.id,
              content: d.content,
              is_correct: d.is_correct,
            })),
          });
        }
      }

      setSuccessMsg("Đã lưu tất cả thay đổi thành công!");
      setTimeout(() => setSuccessMsg(""), 3000);
      toast.success("Đã lưu tất cả thay đổi thành công!");
    } catch (err: any) {
      setError(err.message || "Lỗi khi lưu câu hỏi");
      toast.error(err.message || "Lỗi khi lưu câu hỏi");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || loading)
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <span className="spinner" />
      </div>
    );

  if (error && !question)
    return (
      <div className="page-wrapper">
        {user && <Sidebar />}
        <main className="main-content">
          <div className="alert alert-error">
            {" "}
            {error || "Không tìm thấy câu hỏi"}
          </div>
          <Link
            href="/questions"
            className="btn btn-secondary"
            style={{ marginTop: "1rem" }}
          >
            Quay lại
          </Link>
        </main>
      </div>
    );

  return (
    <div className="page-wrapper">
      {user && <Sidebar />}
      <main className="main-content">
        <div
          className="page-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            position: "sticky",
            top: 0,
            background: "var(--bg-default)",
            zIndex: 10,
            padding: "1rem 0",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>
              Chi tiết & Chỉnh sửa Câu hỏi #{question?.id}
            </h1>
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Link href="/questions" className="btn btn-secondary">
              Quay lại
            </Link>
            <button
              className="btn btn-secondary"
              onClick={handleDiscard}
              disabled={saving}
            >
              Hủy bỏ thay đổi
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSaveAll}
              disabled={saving}
            >
              {saving ? "Đang lưu..." : " Lưu tất cả thay đổi"}
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
            {" "}
            {error}
          </div>
        )}
        {successMsg && (
          <div
            className="alert alert-success"
            style={{
              marginBottom: "1rem",
              background: "var(--answer-correct-bg)",
              color: "var(--accent-success)",
              padding: "1rem",
              borderRadius: "var(--radius-md)",
            }}
          >
            {" "}
            {successMsg}
          </div>
        )}

        {question && (
          <div style={{ marginTop: "1.5rem" }}>
            <QuestionEditor
              qData={question}
              onChange={setQuestion}
              curriculum={curriculum}
              metadata={metadata}
              imageEditable={true}
            />
          </div>
        )}
      </main>
    </div>
  );
}
