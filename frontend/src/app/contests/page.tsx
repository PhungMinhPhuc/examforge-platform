"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import PageHeader from "@/components/PageHeader";
import api from "@/lib/api";
import Link from "next/link";
import ExportContestModal from "@/components/ExportContestModal";
import DetailsMenu from "@/components/DetailsMenu";
import useScrollRestoration from "@/lib/useScrollRestoration";
import { toast } from "@/lib/toastStore";
import { Icon } from "@/components/icons";
import Checkbox from "@/components/Checkbox";
import { confirmDialog } from "@/lib/confirmDialog";
import ViewModeToggle from "@/components/ViewModeToggle";
import { CollectionItem, CollectionView } from "@/components/CollectionView";
import useViewModePreference from "@/lib/useViewModePreference";

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
  const [viewMode, setViewMode] = useViewModePreference(
    "ui.contests.view-mode",
    "list",
  );

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
        <PageHeader
          title="Đề thi và bài tập"
          description={`${contests.length} đề thi`}
          actions={(
            <div className="ui-collection-controls">
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
              {user?.role === "teacher" && (
                <Link href="/contests/new" className="ui-button ui-button--primary">
                  <Icon name="plus" />
                  Tạo đề thi
                </Link>
              )}
            </div>
          )}
        />
        <nav className="ui-tablist" style={{ marginBottom: "1.25rem" }} role="tablist" aria-label="Loại đề thi">
          <Link href="/contests" className="ui-tab" role="tab" aria-selected="true">
            Đề thi
          </Link>
          <Link href="/coding" className="ui-tab" role="tab" aria-selected="false">
            Lập trình
          </Link>
        </nav>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="ui-skeleton"
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
          <CollectionView
            items={contests}
            mode={viewMode}
            getKey={(c) => c.id}
            ariaLabel="Danh sách đề thi"
            renderItem={(c) => (
              <CollectionItem
                href={user?.role === "teacher" ? `/contests/${c.id}` : `/exam/${c.id}`}
                badges={(
                  <>
                    <span className="badge badge-mode">
                      {c.time_limit ? "Có tính giờ" : "Bài tập"}
                    </span>
                    <span className={`badge ${c.status === "active" ? "badge-active" : "badge-inactive"}`}>
                      {c.status === "active" ? "Đang mở" : "Bản nháp"}
                    </span>
                  </>
                )}
                title={<Link href={user?.role === "teacher" ? `/contests/${c.id}` : `/exam/${c.id}`}>{c.title}</Link>}
                metadata={(
                  <>
                    <span>{c.time_limit ? `${c.time_limit} phút` : "Không giới hạn thời gian"}</span>
                    <span>{c.question_count} câu</span>
                    {c.class_name && <span>{c.class_name}</span>}
                    {c.due_at && <span>Hạn {new Date(c.due_at).toLocaleString("vi-VN")}</span>}
                  </>
                )}
                actions={user?.role === "teacher" ? (
                  <>
                      <Link
                        href={`/contests/${c.id}`}
                        className="ui-button ui-button--secondary ui-button--small"
                      >
                        Chi tiết
                      </Link>
                      <DetailsMenu className="ui-dropdown-anchor">
                        <summary
                          className="ui-dropdown__trigger ui-button ui-button--secondary ui-button--icon ui-button--small"
                          aria-label="Mở menu thao tác"
                        >
                          <Icon name="more-horizontal" />
                        </summary>
                        <div
                          className="ui-dropdown__menu ui-dropdown__menu--compact"
                          role="menu"
                        >
                          <button
                            className="ui-dropdown__option"
                            role="menuitem"
                            onClick={() => openShare(c)}
                          >
                            <span className="ui-dropdown__label">Giao bài</span>
                          </button>
                          <button
                            className="ui-dropdown__option"
                            role="menuitem"
                            onClick={() => {
                              setSelectedContest(c);
                              setShowExportModal(true);
                            }}
                          >
                            <span className="ui-dropdown__label">Xuất đề</span>
                          </button>
                          <button
                            className="ui-dropdown__option"
                            role="menuitem"
                            onClick={() => toggleStatus(c)}
                          >
                            <span className="ui-dropdown__label">
                              {c.status === "active" ? "Đóng đề" : "Mở đề"}
                            </span>
                          </button>
                          <button
                            className="ui-dropdown__option ui-dropdown__option--danger"
                            role="menuitem"
                            onClick={async () => {
                              if (
                                !(await confirmDialog(
                                  "Bạn có chắc muốn xóa đề thi này không?",
                                  { title: "Xóa đề thi", confirmLabel: "Xóa đề", intent: "danger" },
                                ))
                              )
                                return;
                              await api.updateContestStatus(c.id, "deleted");
                              setContests((prev) =>
                                prev.filter((x) => x.id !== c.id),
                              );
                            }}
                          >
                            <span className="ui-dropdown__label">Xóa</span>
                          </button>
                        </div>
                      </DetailsMenu>
                    </>
                  ) : (
                    <>
                      {c.attempts && c.attempts.length === 1 && (
                        <Link
                          href={`/results/${c.attempts[0].id}`}
                          className="ui-button ui-button--secondary ui-button--small"
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
                          className="ui-button ui-button--secondary ui-button--small"
                          aria-expanded={expandedHistory === c.id}
                        >
                          Lịch sử ({c.attempts.length})
                          <Icon
                            name={
                              expandedHistory === c.id
                                ? "chevron-up"
                                : "chevron-down"
                            }
                          />
                        </button>
                      )}
                      <Link
                        href={`/exam/${c.id}`}
                        className="ui-button ui-button--primary ui-button--small"
                      >
                        {c.attempts && c.attempts.length > 0
                          ? "Làm lại"
                          : "Làm bài"}
                      </Link>
                    </>
                  )}
                details={expandedHistory === c.id && c.attempts && c.attempts.length > 1 ? (
                  <>
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
                                className="ui-button ui-button--ghost ui-button--small"
                              >
                                Xem kết quả
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                ) : undefined}
              />
            )}
          />
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
          className="ui-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShareContest(null);
          }}
        >
          <div
            className="ui-modal ui-modal--large"
          >
            <header className="ui-modal__header">
              <div className="ui-modal__heading">
                <h2 className="ui-modal__title">Giao bài</h2>
                <p className="ui-modal__description">{shareContest.title}</p>
              </div>
              <button
                className="ui-modal__close"
                type="button"
                aria-label="Đóng"
                onClick={() => setShareContest(null)}
              >
                <Icon name="close" />
              </button>
            </header>
            <div className="ui-modal__body">
              <h3 style={{ margin: "0 0 .75rem" }}>Giao cho lớp</h3>
              <div style={{ display: "grid", gap: ".5rem" }}>
              {classes.map((cls) => (
                <label
                  key={cls.id}
                  className="card"
                  style={{ padding: ".85rem", display: "flex", gap: ".75rem" }}
                >
                  <Checkbox
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
            </div>
            <button
              className="ui-button ui-button--primary"
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
