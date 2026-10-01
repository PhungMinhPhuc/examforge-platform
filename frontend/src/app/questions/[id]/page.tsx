"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/Sidebar";
import LatexRenderer from "@/components/LatexRenderer";
import RichLatexEditor from "@/components/rich-latex-editor";
import Combobox from "@/components/Combobox";
import api from "@/lib/api";
import { QuestionEditor, QuestionDetail } from "@/components/QuestionEditor";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { toast } from "@/lib/toastStore";
import MessageBar from "@/components/MessageBar";
import { confirmDialog } from "@/lib/confirmDialog";

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
    if (!(await confirmDialog("Hủy bỏ các thay đổi chưa lưu và tải lại câu hỏi?", {
      title: "Hủy thay đổi",
      confirmLabel: "Hủy thay đổi",
      intent: "danger",
    }))) return;
    setError("");
    try {
      const fresh = await api.getQuestion(question.id!);
      setQuestion(fresh);
      toast.success("Đã hủy các thay đổi chưa lưu.");
    } catch (err: any) {
      setError(err.message || "Không thể tải lại câu hỏi");
    }
  };

  const handleSaveAll = async () => {
    if (!question) return;
    setSaving(true);
    setError("");
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

      toast.success("Đã lưu tất cả thay đổi thành công!");
    } catch (err: any) {
      setError(err.message || "Lỗi khi lưu câu hỏi");
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
        <span className="ui-spinner" />
      </div>
    );

  if (error && !question)
    return (
      <div className="page-wrapper">
        {user && <Sidebar />}
        <main className="main-content">
          <MessageBar className="ui-message-bar--section" intent="error" onDismiss={() => router.push("/questions")}>
            {error || "Không tìm thấy câu hỏi"}
          </MessageBar>
          <Link
            href="/questions"
            className="ui-button ui-button--secondary"
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
        <PageHeader
          sticky
          breadcrumbs={[{ label: "Ngân hàng câu hỏi", href: "/questions" }, { label: `Câu hỏi #${question?.id || "..."}` }]}
          title={`Chi tiết và chỉnh sửa câu hỏi #${question?.id || "..."}`}
          actions={<>
            <button
              className="ui-button ui-button--secondary"
              onClick={handleDiscard}
              disabled={saving}
            >
              Hủy bỏ thay đổi
            </button>
            <button
              className="ui-button ui-button--primary"
              onClick={handleSaveAll}
              disabled={saving}
            >
              {saving ? "Đang lưu..." : " Lưu tất cả thay đổi"}
            </button>
          </>}
        />

        {error && (
          <MessageBar className="ui-message-bar--section" intent="error" onDismiss={() => setError("")}>
            {error}
          </MessageBar>
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
