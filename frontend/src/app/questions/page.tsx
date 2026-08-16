"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/Sidebar";
import useScrollRestoration from "@/lib/useScrollRestoration";
import QuestionCreateDropdown from "@/components/QuestionCreateDropdown";
import LatexRenderer from "@/components/LatexRenderer";
import { QuestionEditor, QuestionDetail } from "@/components/QuestionEditor";
import api from "@/lib/api";
import AdaptiveOptionGrid from "@/components/AdaptiveOptionGrid";
import TrueFalseOptionList from "@/components/TrueFalseOptionList";
import { mcCorrectLabel } from "@/lib/docTree";
import { toast } from "@/lib/toastStore";

type Question = {
  id: number;
  subject: string;
  grade: number;
  chapter: string;
  lesson: string;
  question_type: string;
  complexity: number;
  content: any; // cây tài liệu (jsonb) — xem frontend/src/lib/docTree.ts
  teacher_name: string;
  children?: any[];
};

const TYPE_LABELS: Record<string, string> = {
  mc: "Trắc nghiệm",
  tf: "Đúng/Sai",
  sa: "Trả lời ngắn",
  oe: "Tự luận",
  st: "Chung giả thiết",
  cd: "Lập trình",
};
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
const COMPLEXITY_LABELS: Record<number, string> = {
  1: "Nhận biết",
  2: "Thông hiểu",
  3: "Vận dụng",
  4: "Vận dụng cao",
};

const typeBadgeStyle = (type: string) => {
  const color = TYPE_COLORS[type] || "var(--type-mc)";
  if (type === "st") {
    return {
      background: "var(--tone-purple-bg)",
      color,
      border: "1px solid var(--tone-purple-border)",
    };
  }
  return {
    background: TYPE_SOFT[type] || "var(--type-mc-soft)",
    color,
    border: `1px solid ${TYPE_BORDER[type] || "var(--type-mc-border)"}`,
  };
};

export default function QuestionsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<Record<string, unknown>>({});

  const [filters, setFilters] = useState({
    subject: "",
    grade: "",
    chapter: "",
    question_type: "",
    complexity: "",
    search: "",
  });

  useEffect(() => {
    if (!isLoading && !user) router.replace("/");
    if (!isLoading && user?.role !== "teacher") router.replace("/dashboard");
  }, [user, isLoading, router]);

  useScrollRestoration(!loading);

  useEffect(() => {
    api
      .getSubjects()
      .then(setSubjects)
      .catch(() => {});
  }, []);

  const fetchQuestions = useCallback(() => {
    setLoading(true);
    api
      .getQuestions({ ...filters, page, page_size: 20 })
      .then((res) => {
        setQuestions(res.data);
        setTotal(res.total);
        setTotalQuestions(res.total_questions || 0);
        setTotalPages(res.total_pages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(() => {
    if (user?.role === "teacher") fetchQuestions();
  }, [user, fetchQuestions]);

  const handleDelete = async (id: number) => {
    if (!confirm("Xóa câu hỏi này?")) return;
    await api.deleteQuestion(id);
    fetchQuestions();
  };

  const [deletingAll, setDeletingAll] = useState(false);
  const handleDeleteAll = async () => {
    if (total === 0) {
      toast.warning("Ngân hàng đang trống.");
      return;
    }
    if (
      !confirm(
        `Xóa TẤT CẢ ${total.toLocaleString()} mục trong ngân hàng câu hỏi? Hành động này không thể hoàn tác.`,
      )
    )
      return;
    if (!confirm("Xác nhận lần nữa: xóa toàn bộ câu hỏi của bạn?")) return;
    setDeletingAll(true);
    try {
      const res = await api.deleteAllQuestions();
      toast.success(res.message || "Đã xóa toàn bộ câu hỏi");
      setPage(1);
      fetchQuestions();
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Lỗi khi xóa toàn bộ câu hỏi",
      );
    } finally {
      setDeletingAll(false);
    }
  };

  const [detailModal, setDetailModal] = useState<{
    question: QuestionDetail;
    saving: boolean;
    error: string;
  } | null>(null);

  const openDetail = async (id: number) => {
    try {
      const q = await api.getQuestion(id);
      setDetailModal({ question: q, saving: false, error: "" });
    } catch {
      /* ignore */
    }
  };

  const saveDetail = async () => {
    if (!detailModal) return;
    setDetailModal((d) => (d ? { ...d, saving: true, error: "" } : d));
    try {
      const q = detailModal.question;

      // Cỡ ảnh (width) gộp lưu chung lúc bấm "Lưu" — không lưu riêng từng
      // ảnh lúc kéo/gõ số trong ô soạn thảo (xem
      // RichLatexEditor.tsx::onImageWidthChange -> QuestionEditor.tsx).
      const widthTasks: Promise<void>[] = [];
      const queueWidths = (imgs?: QuestionDetail["images"]) => {
        (imgs || []).forEach((img) => {
          if (img.width != null) {
            widthTasks.push(api.updateImageWidth(img.storage_path, img.width));
          }
        });
      };
      queueWidths(q.images);
      (q.children || []).forEach((child) => queueWidths(child.images));
      if (widthTasks.length) await Promise.all(widthTasks);

      await api.updateQuestion(q.id!, {
        subject: q.subject,
        grade: q.grade,
        chapter: q.chapter,
        lesson: q.lesson,
        complexity: q.complexity,
        layout_type: q.layout_type,
        content: q.content,
        solution: q.solution,
        details: q.details?.map((d) => ({
          id: d.id,
          content: d.content,
          is_correct: d.is_correct,
          explaination: d.explaination,
        })),
      });

      if (q.question_type === "st" && q.children?.length) {
        await Promise.all(
          q.children.map((child) =>
            api.updateQuestion(child.id!, {
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
                explaination: d.explaination,
              })),
            }),
          ),
        );
      }

      const mergeEditedQuestion = (current: any, edited: any): any => ({
        ...current,
        subject: edited.subject,
        grade: edited.grade,
        chapter: edited.chapter,
        lesson: edited.lesson,
        complexity: edited.complexity,
        layout_type: edited.layout_type ?? current.layout_type,
        content: edited.content,
        solution: edited.solution,
        // Ảnh MỚI chèn qua RichLatexEditor (nút/dán) chỉ có trong qData.images
        // của modal — thiếu dòng này thì danh sách vẫn hiện content đã có
        // figure_id mới nhưng KHÔNG tra được ảnh nào (images cũ không có id
        // đó), ảnh không hiện cho tới khi tải lại trang.
        images: edited.images ?? current.images,
        options: edited.details
          ? edited.details.map((detail: any) => ({ ...detail }))
          : current.options,
        children: edited.children
          ? edited.children.map((child: any) => {
              const currentChild = current.children?.find(
                (item: any) => item.id === child.id,
              );
              return mergeEditedQuestion(currentChild || {}, child);
            })
          : current.children,
      });

      setQuestions((current) =>
        current.map((item) =>
          item.id === q.id ? mergeEditedQuestion(item, q) : item,
        ),
      );
      setDetailModal(null);
      toast.success("Đã lưu câu hỏi");
    } catch {
      setDetailModal((d) =>
        d ? { ...d, saving: false, error: "Lỗi lưu câu hỏi" } : d,
      );
      toast.error("Lỗi lưu câu hỏi");
    }
  };

  const setFilter = (key: string, val: string) => {
    setFilters((f) => ({ ...f, [key]: val }));
    setPage(1);
  };

  if (isLoading) return null;

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="pagination">
        <button
          className="page-btn"
          style={{ padding: "0 0.7rem" }}
          onClick={() => handlePageChange(1)}
          disabled={page === 1}
        >
          « Đầu
        </button>
        <button
          className="page-btn"
          onClick={() => handlePageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          ‹
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
          return (
            <button
              key={p}
              className={`page-btn ${page === p ? "active" : ""}`}
              onClick={() => handlePageChange(p)}
            >
              {p}
            </button>
          );
        })}
        <button
          className="page-btn"
          onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
        >
          ›
        </button>
        <button
          className="page-btn"
          style={{ padding: "0 0.75rem" }}
          onClick={() => handlePageChange(totalPages)}
          disabled={page === totalPages}
        >
          Cuối »
        </button>
      </div>
    );
  };

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Ngân hàng câu hỏi</h1>
            <p className="page-sub">
              Tổng: {total.toLocaleString()} mục -{" "}
              {totalQuestions.toLocaleString()} câu hỏi
            </p>
          </div>
          {user?.role === "teacher" && (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <QuestionCreateDropdown />
              <button
                className="btn btn-danger"
                onClick={handleDeleteAll}
                disabled={deletingAll || total === 0}
              >
                {deletingAll ? "Đang xóa..." : "Xóa tất cả"}
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="filter-bar">
          <input
            className="input search-input"
            placeholder=" Tìm nội dung..."
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
          />
          <select
            className="select"
            value={filters.subject}
            onChange={(e) => setFilter("subject", e.target.value)}
          >
            <option value="">Tất cả môn</option>
            {Object.keys(subjects).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filters.grade}
            onChange={(e) => setFilter("grade", e.target.value)}
          >
            <option value="">Tất cả khối</option>
            {[10, 11, 12].map((g) => (
              <option key={g} value={String(g)}>
                Lớp {g}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filters.question_type}
            onChange={(e) => setFilter("question_type", e.target.value)}
          >
            <option value="">Tất cả loại</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filters.complexity}
            onChange={(e) => setFilter("complexity", e.target.value)}
          >
            <option value="">Tất cả mức</option>
            {Object.entries(COMPLEXITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setFilters({
                subject: "",
                grade: "",
                chapter: "",
                question_type: "",
                complexity: "",
                search: "",
              });
              setPage(1);
            }}
          >
            Xóa lọc
          </button>
        </div>

        {/* Pagination Top */}
        {renderPagination()}

        {/* Question list */}
        {loading ? (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            {Array(5)
              .fill(0)
              .map((_, i) => (
                <div
                  key={i}
                  className="skeleton"
                  style={{ height: "100px", borderRadius: "var(--radius-lg)" }}
                />
              ))}
          </div>
        ) : questions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"></div>
            <h3>Không tìm thấy câu hỏi</h3>
            <p>Thử thay đổi bộ lọc hoặc upload câu hỏi mới</p>
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            {(() => {
              // Group questions like exam but without "Phần I" labels
              const effectiveType = (q: any) => {
                if (q.question_type === "st") {
                  return q.children?.[0]?.question_type || "st";
                }
                return q.question_type;
              };

              const TYPE_ORDER: Record<string, number> = {
                mc: 1,
                tf: 2,
                sa: 3,
                oe: 4,
                st: 5,
              };

              const sortedQs = [...questions].sort((a, b) => {
                const typeA = effectiveType(a);
                const typeB = effectiveType(b);
                const orderA = TYPE_ORDER[typeA] || 99;
                const orderB = TYPE_ORDER[typeB] || 99;
                if (orderA !== orderB) return orderA - orderB;
                return a.id - b.id; // stable sort
              });

              return sortedQs.map((q, idx) => {
                let stTags: string[] = [];
                if (q.question_type === "st" && q.children) {
                  const types = new Set(
                    q.children.map(
                      (c: any) =>
                        TYPE_LABELS[c.question_type] || c.question_type,
                    ),
                  );
                  stTags = Array.from(types) as string[];
                }

                const renderNode = (
                  node: any,
                  isChild = false,
                  childIndex = 0,
                ) => {
                  const innerContent = (
                    <>
                      {isChild && (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.5rem",
                            marginBottom: "0.75rem",
                            alignItems: "center",
                          }}
                        >
                          <span
                            className={`badge badge-${node.question_type}`}
                            style={typeBadgeStyle(node.question_type)}
                          >
                            {TYPE_LABELS[node.question_type] ||
                              node.question_type}
                          </span>
                          <span
                            className={`badge complexity-${node.complexity}`}
                          >
                            {COMPLEXITY_LABELS[node.complexity]}
                          </span>
                          {node.subject && (
                            <span
                              style={{
                                fontSize: "var(--font-size-xs)",
                                color: "var(--text-muted)",
                              }}
                            >
                              {node.subject} · Lớp {node.grade}
                            </span>
                          )}
                          {node.chapter && (
                            <span
                              style={{
                                fontSize: "var(--font-size-xs)",
                                color: "var(--text-muted)",
                              }}
                              title={node.chapter}
                            >
                              {" "}
                              {node.chapter.slice(0, 40)}
                              {node.chapter.length > 40 ? "..." : ""}
                            </span>
                          )}
                        </div>
                      )}
                      <LatexRenderer
                        content={node.content}
                        layoutType={node.layout_type}
                        images={node.images}
                        imageZoomable
                        className="question-content"
                        preserveLineBreaks={node.question_type === "cd"}
                      />

                      {/* Options — số cột tự điều chỉnh theo render thật (xem AdaptiveOptionGrid) */}
                      {node.question_type === "mc" && node.options && (
                        <AdaptiveOptionGrid
                          count={node.options.length}
                          style={{ marginTop: "0.75rem" }}
                        >
                          {node.options.map((opt: any, oi: number) => (
                            <div
                              key={opt.id}
                              data-opt-cell="1"
                              style={{
                                display: "flex",
                                gap: "0.5rem",
                                alignItems: "baseline",
                                padding: "0.4rem 0.75rem",
                                background: opt.is_correct
                                  ? "var(--answer-correct-bg)"
                                  : "var(--bg-elevated)",
                                borderRadius: "var(--radius-sm)",
                                border: `1px solid ${opt.is_correct ? "var(--answer-correct-border)" : "transparent"}`,
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 700,
                                  color: opt.is_correct
                                    ? "var(--accent-success)"
                                    : "var(--text-secondary)",
                                }}
                              >
                                {String.fromCharCode(65 + oi)}.
                              </div>
                              <LatexRenderer
                                content={opt.content}
                                images={node.images}
                                imageZoomable
                              />
                            </div>
                          ))}
                        </AdaptiveOptionGrid>
                      )}

                      {node.question_type === "tf" && node.options && (
                        <TrueFalseOptionList>
                          {node.options.map((opt: any, oi: number) => (
                            <div
                              key={opt.id}
                              style={{
                                display: "flex",
                                gap: "0.5rem",
                                alignItems: "center",
                                padding: "0.4rem 0.75rem",
                                background: opt.is_correct
                                  ? "var(--answer-correct-bg)"
                                  : "var(--answer-wrong-bg)",
                                border: `1px solid ${opt.is_correct ? "var(--answer-correct-border)" : "var(--answer-wrong-border)"}`,
                                borderRadius: "var(--radius-sm)",
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
                                  images={node.images}
                                  imageZoomable
                                />
                              </div>
                            </div>
                          ))}
                        </TrueFalseOptionList>
                      )}

                      {node.question_type === "sa" &&
                        node.options &&
                        node.options.length > 0 &&
                        (() => {
                          const rawAns = node.options[0].content
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
                                borderRadius: "var(--radius-sm)",
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
                              <div style={{ display: "flex", gap: "0.25rem" }}>
                                {boxes.map((c, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      width: "25px",
                                      height: "27px",
                                      border: "2px solid var(--accent-primary)",
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
                      {node.question_type !== "st" &&
                        ((node.solution && node.question_type !== "tf") ||
                          (node.question_type === "tf" && node.options)) && (
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
                            {node.question_type === "tf" && node.options && (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "0.5rem",
                                  marginBottom: node.solution ? "1rem" : "0",
                                }}
                              >
                                {node.options.map((opt: any, oi: number) => (
                                  <div
                                    key={opt.id}
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
                                          images={node.images}
                                          imageZoomable
                                        />
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {node.solution && (
                              <LatexRenderer
                                content={node.solution}
                                images={node.images}
                                imageZoomable
                              />
                            )}
                            {node.question_type === "mc" &&
                              mcCorrectLabel(node.options) && (
                                <div
                                  style={{
                                    fontWeight: 700,
                                    marginTop: "0.5rem",
                                  }}
                                >
                                  Chọn {mcCorrectLabel(node.options)}
                                </div>
                              )}
                          </div>
                        )}
                    </>
                  );

                  return (
                    <div
                      key={node.id}
                      style={
                        isChild
                          ? {
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "0.75rem",
                              padding: "0.75rem",
                              background: "var(--bg-elevated)",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--border)",
                            }
                          : {}
                      }
                    >
                      {isChild && (
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            flexShrink: 0,
                            background: "var(--accent-primary)",
                            border: "1px solid var(--accent-primary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            color: "var(--text-on-accent)",
                          }}
                        >
                          {childIndex}
                        </div>
                      )}
                      {isChild ? (
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {innerContent}
                        </div>
                      ) : (
                        innerContent
                      )}
                    </div>
                  );
                };

                return (
                  <div
                    key={q.id}
                    className="question-card"
                    style={{
                      padding: "1.25rem",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "1rem",
                      }}
                    >
                      <div
                        className="question-num"
                        style={{
                          flexShrink: 0,
                        }}
                      >
                        {(page - 1) * 20 + idx + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.5rem",
                            marginBottom: "0.75rem",
                            alignItems: "center",
                          }}
                        >
                          <span
                            className={`badge badge-${q.question_type}`}
                            style={typeBadgeStyle(q.question_type)}
                          >
                            {TYPE_LABELS[q.question_type] || q.question_type}
                          </span>
                          {stTags.map((tag, i) => {
                            const typeKey =
                              Object.keys(TYPE_LABELS).find(
                                (k) => TYPE_LABELS[k] === tag,
                              ) || tag;
                            return (
                              <span
                                key={i}
                                className={`badge badge-${typeKey}`}
                                style={typeBadgeStyle(typeKey)}
                              >
                                {tag}
                              </span>
                            );
                          })}
                          {q.question_type !== "st" && (
                            <span
                              className={`badge complexity-${q.complexity}`}
                            >
                              {COMPLEXITY_LABELS[q.complexity]}
                            </span>
                          )}
                          {q.subject && (
                            <span
                              style={{
                                fontSize: "var(--font-size-xs)",
                                color: "var(--text-muted)",
                              }}
                            >
                              {q.subject} · Lớp {q.grade}
                            </span>
                          )}
                          {q.chapter && (
                            <span
                              style={{
                                fontSize: "var(--font-size-xs)",
                                color: "var(--text-muted)",
                              }}
                              title={q.chapter}
                            >
                              {" "}
                              {q.chapter.slice(0, 40)}
                              {q.chapter.length > 40 ? "..." : ""}
                            </span>
                          )}
                        </div>

                        {q.question_type === "st" &&
                          q.children &&
                          q.children.length > 0 && (
                            <div
                              style={{
                                fontSize: "0.85rem",
                                fontWeight: 600,
                                marginBottom: "0.5rem",
                                color: "var(--text-primary)",
                              }}
                            >
                              Dựa vào thông tin sau để trả lời từ câu 1 đến câu{" "}
                              {q.children.length}:
                            </div>
                          )}
                        {renderNode(q, false)}
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
                          onClick={() => openDetail(q.id)}
                        >
                          Chi tiết
                        </button>
                        {user?.role === "teacher" && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(q.id)}
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </div>

                    {q.question_type === "st" &&
                      q.children &&
                      q.children.length > 0 && (
                        <div
                          style={{
                            marginTop: "1rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "1rem",
                          }}
                        >
                          {q.children.map((child: any, cIdx: number) =>
                            renderNode(child, true, cIdx + 1),
                          )}
                        </div>
                      )}
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* Pagination Bottom */}
        {renderPagination()}

        {/* Detail / edit popup */}
        {detailModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2.5vh 2.5vw",
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setDetailModal(null);
            }}
          >
            <div
              className="modal-wide-responsive"
              style={{
                width: "95vw",
                maxWidth: 1400,
                height: "95vh",
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
                <h3 style={{ margin: 0 }}>Chi tiết câu hỏi</h3>
                <button
                  onClick={() => setDetailModal(null)}
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
              <div style={{ padding: "1.5rem", flex: 1, overflowY: "auto" }}>
                {user?.role === "teacher" ? (
                  <QuestionEditor
                    qData={detailModal.question}
                    onChange={(q) =>
                      setDetailModal((d) => (d ? { ...d, question: q } : d))
                    }
                    curriculum={subjects}
                    imageEditable={true}
                  />
                ) : (
                  <LatexRenderer
                    content={detailModal.question.content}
                    images={detailModal.question.images}
                    imageZoomable
                    preserveLineBreaks={
                      detailModal.question.question_type === "cd"
                    }
                  />
                )}
              </div>
              {detailModal.error && (
                <div
                  style={{
                    padding: "0 1.5rem 1rem",
                    color: "var(--accent-danger)",
                    fontSize: "var(--font-size-base)",
                  }}
                >
                  {detailModal.error}
                </div>
              )}
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
                  onClick={() => setDetailModal(null)}
                >
                  Đóng
                </button>
                {user?.role === "teacher" && (
                  <button
                    className="btn btn-primary"
                    onClick={saveDetail}
                    disabled={detailModal.saving}
                  >
                    {detailModal.saving ? "Đang lưu..." : "Lưu"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
