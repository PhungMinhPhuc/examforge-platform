"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import api from "@/lib/api";
import Link from "next/link";
import ExportContestModal from "@/components/ExportContestModal";
import DetailsMenu from "@/components/DetailsMenu";
import useScrollRestoration from "@/lib/useScrollRestoration";
import { toast } from "@/lib/toastStore";

type Contest = {
  id: number;
  title: string;
  status: string;
  time_limit: number;
  class_name?: string;
  question_count: number;
  public_id: string;
  result_id?: number;
  attempts?: any[];
  allow_guest_link?: boolean;
  due_at?: string | null;
};

export default function ContestsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);

  // Export Modal states
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedContest, setSelectedContest] = useState<Contest | null>(null);
  const [shareContest, setShareContest] = useState<Contest | null>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<number[]>([]);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/");
  }, [user, isLoading, router]);

  useScrollRestoration(!loading);

  useEffect(() => {
    if (!user) return;
    api
      .getContests()
      .then((res) => setContests(res as Contest[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const toggleStatus = async (c: Contest) => {
    const newStatus = c.status === "active" ? "inactive" : "active";
    await api.updateContestStatus(c.id, newStatus);
    setContests((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, status: newStatus } : x)),
    );
  };

  const openShare = async (c: Contest) => {
    setShareContest(c);
    setSelectedClasses([]);
    setClasses((await api.getClasses()) as any[]);
  };

  const assignToClasses = async () => {
    if (!shareContest || !selectedClasses.length) return;
    setSharing(true);
    try {
      await Promise.all(
        selectedClasses.map((classId) =>
          api.assignExistingToClass(classId, "contest", shareContest.id),
        ),
      );
      toast.success("Đã giao đề cho các lớp đã chọn");
      setSelectedClasses([]);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">{"Đề thi và bài tập"}</h1>
            <p className="page-sub">{contests.length} đề thi</p>
          </div>
          {user?.role === "teacher" && (
            <Link href="/contests/new" className="btn btn-primary">
              {" "}
              Tạo đề thi
            </Link>
          )}
        </div>
        <div style={{ display: "flex", gap: ".5rem", marginBottom: "1.25rem" }}>
          <Link href="/contests" className="btn btn-primary">
            Đề thi
          </Link>
          <Link href="/coding" className="btn btn-secondary">
            Lập trình
          </Link>
        </div>

        {loading ? (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: "80px", borderRadius: "var(--radius-lg)" }}
              />
            ))}
          </div>
        ) : contests.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"></div>
            <h3>Chưa có đề thi nào</h3>
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            {contests.map((c) => (
              <div
                key={c.id}
                className="card"
                role="link"
                tabIndex={0}
                onClick={() =>
                  router.push(
                    user?.role === "teacher"
                      ? `/contests/${c.id}`
                      : `/exam/${c.id}`,
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    router.push(
                      user?.role === "teacher"
                        ? `/contests/${c.id}`
                        : `/exam/${c.id}`,
                    );
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "1.15rem 1.25rem",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: ".5rem",
                        marginBottom: ".45rem",
                      }}
                    >
                      <span className="badge badge-mode">
                        {c.time_limit ? "Có tính giờ" : "Bài tập"}
                      </span>
                      <span
                        className={`badge ${c.status === "active" ? "badge-active" : "badge-inactive"}`}
                      >
                        {c.status === "active" ? "Đang mở" : "Bản nháp"}
                      </span>
                    </div>
                    <Link
                      href={
                        user?.role === "teacher"
                          ? `/contests/${c.id}`
                          : `/exam/${c.id}`
                      }
                      style={{
                        fontWeight: 750,
                        fontSize: "1.05rem",
                        color: "var(--text-primary)",
                        textDecoration: "none",
                      }}
                    >
                      {c.title}
                    </Link>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-secondary)",
                        display: "flex",
                        gap: "1rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <span>
                        {c.time_limit
                          ? `${c.time_limit} phút`
                          : "Không giới hạn thời gian"}
                      </span>
                      <span>{c.question_count} câu</span>
                      {c.class_name && <span>{c.class_name}</span>}
                      {c.due_at && (
                        <span>
                          Hạn {new Date(c.due_at).toLocaleString("vi-VN")}
                        </span>
                      )}
                    </div>
                  </div>
                  {user?.role !== "teacher" && (
                    <span className={`badge badge-${c.status}`}>
                      {c.status === "active" ? "Đang mở" : "Đóng"}
                    </span>
                  )}
                  {user?.role === "teacher" ? (
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Link
                        href={`/contests/${c.id}`}
                        className="btn btn-primary btn-sm"
                      >
                        Chi tiết
                      </Link>
                      <DetailsMenu style={{ position: "relative" }}>
                        <summary
                          className="btn btn-secondary btn-sm"
                          style={{ listStyle: "none", cursor: "pointer" }}
                        >
                          •••
                        </summary>
                        <div
                          className="card"
                          style={{
                            position: "absolute",
                            right: 0,
                            top: "calc(100% + .4rem)",
                            zIndex: 20,
                            width: 170,
                            padding: ".4rem",
                            display: "grid",
                            gap: ".25rem",
                            boxShadow: "var(--shadow-lg)",
                          }}
                        >
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ justifyContent: "flex-start" }}
                            onClick={() => openShare(c)}
                          >
                            Giao bài
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ justifyContent: "flex-start" }}
                            onClick={() => {
                              setSelectedContest(c);
                              setShowExportModal(true);
                            }}
                          >
                            Xuất đề
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ justifyContent: "flex-start" }}
                            onClick={() => toggleStatus(c)}
                          >
                            {c.status === "active" ? "Đóng đề" : "Mở đề"}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{
                              justifyContent: "flex-start",
                              color: "var(--accent-danger)",
                            }}
                            onClick={async () => {
                              if (
                                !confirm(
                                  "Bạn có chắc muốn xóa đề thi này không?",
                                )
                              )
                                return;
                              await api.updateContestStatus(c.id, "deleted");
                              setContests((prev) =>
                                prev.filter((x) => x.id !== c.id),
                              );
                            }}
                          >
                            Xóa
                          </button>
                        </div>
                      </DetailsMenu>
                    </div>
                  ) : (
                    <div
                      style={{ display: "flex", gap: "0.5rem" }}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {c.attempts && c.attempts.length === 1 && (
                        <Link
                          href={`/results/${c.attempts[0].id}`}
                          className="btn btn-secondary btn-sm"
                          style={{
                            background: "var(--bg-elevated)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          Xem kết quả
                        </Link>
                      )}
                      {c.attempts && c.attempts.length > 1 && (
                        <button
                          onClick={() =>
                            setExpandedHistory(
                              expandedHistory === c.id ? null : c.id,
                            )
                          }
                          className="btn btn-secondary btn-sm"
                          style={{
                            background: "var(--bg-elevated)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          Lịch sử ({c.attempts.length}){" "}
                          {expandedHistory === c.id ? "▲" : "▼"}
                        </button>
                      )}
                      <Link
                        href={`/exam/${c.id}`}
                        className="btn btn-primary btn-sm"
                      >
                        {c.attempts && c.attempts.length > 0
                          ? "Làm lại"
                          : "Làm bài"}
                      </Link>
                    </div>
                  )}
                </div>

                {expandedHistory === c.id &&
                  c.attempts &&
                  c.attempts.length > 1 && (
                    <div
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      style={{
                        padding: "1rem 1.25rem",
                        borderTop: "1px solid var(--border)",
                        background: "rgba(0,0,0,0.02)",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          marginBottom: "0.75rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Lịch sử làm bài:
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem",
                        }}
                      >
                        {c.attempts.map((att, i) => (
                          <div
                            key={att.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "0.75rem 1rem",
                              background: "var(--bg-surface)",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <div>
                              <span
                                style={{
                                  fontWeight: 600,
                                  marginRight: "1rem",
                                  color: "var(--text-primary)",
                                }}
                              >
                                Lần {i + 1}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.85rem",
                                  color: "var(--text-muted)",
                                }}
                              >
                                {new Date(att.start_time).toLocaleString(
                                  "vi-VN",
                                )}
                              </span>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "1.5rem",
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: "var(--accent-primary)",
                                }}
                              >
                                {Number(att.total_score).toFixed(2)} điểm
                              </span>
                              <Link
                                href={`/results/${att.id}`}
                                className="btn btn-ghost btn-sm"
                              >
                                Xem kết quả
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}
      </main>

      {showExportModal && selectedContest && (
        <ExportContestModal
          contest={selectedContest}
          onClose={() => setShowExportModal(false)}
        />
      )}
      {shareContest && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "var(--overlay)",
            display: "grid",
            placeItems: "center",
            padding: "2.5vh",
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShareContest(null);
          }}
        >
          <div
            className="card modal-wide-responsive"
            style={{
              width: "95vw",
              maxWidth: 1400,
              height: "95vh",
              overflowY: "auto",
            }}
          >
            <div className="card-header">
              <div>
                <h2>Giao bài</h2>
                <p className="page-sub">{shareContest.title}</p>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => setShareContest(null)}
              >
                Đóng
              </button>
            </div>
            <h3 style={{ margin: "1.5rem 0 .75rem" }}>Giao cho lớp</h3>
            <div style={{ display: "grid", gap: ".5rem" }}>
              {classes.map((cls) => (
                <label
                  key={cls.id}
                  className="card"
                  style={{ padding: ".85rem", display: "flex", gap: ".75rem" }}
                >
                  <input
                    type="checkbox"
                    checked={selectedClasses.includes(cls.id)}
                    onChange={(e) =>
                      setSelectedClasses((v) =>
                        e.target.checked
                          ? [...v, cls.id]
                          : v.filter((id) => id !== cls.id),
                      )
                    }
                  />
                  {cls.class_name}
                </label>
              ))}
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: "1rem" }}
              disabled={!selectedClasses.length || sharing}
              onClick={assignToClasses}
            >
              {sharing ? "Đang giao…" : "Giao cho lớp đã chọn"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
