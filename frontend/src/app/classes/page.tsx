"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import PageHeader from "@/components/PageHeader";
import useScrollRestoration from "@/lib/useScrollRestoration";
import api from "@/lib/api";
import Link from "next/link";
import { toast } from "@/lib/toastStore";
import { Icon } from "@/components/icons";
import MessageBar from "@/components/MessageBar";
import { confirmDialog } from "@/lib/confirmDialog";
import ViewModeToggle from "@/components/ViewModeToggle";
import { CollectionItem, CollectionView } from "@/components/CollectionView";
import useViewModePreference from "@/lib/useViewModePreference";

type Class = {
  id: number;
  class_name: string;
  description?: string;
  student_count: number;
  contest_count: number;
  public_id: string;
  teacher_name?: string;
};

export default function ClassesPage() {
  const [viewMode, setViewMode] = useViewModePreference("classes-view", "grid");
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [className, setClassName] = useState("");
  const [desc, setDesc] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [createError, setCreateError] = useState("");
  const [joinError, setJoinError] = useState("");

  useEffect(() => {
    if (!isLoading && !user) router.replace("/");
  }, [user, isLoading, router]);

  useScrollRestoration(!loading);

  const fetchClasses = () => {
    setLoading(true);
    api
      .getClasses()
      .then((res) => setClasses(res as Class[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (user) fetchClasses();
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    try {
      await api.createClass({ class_name: className, description: desc });
      toast.success("Tạo lớp thành công!");
      setShowCreate(false);
      setClassName("");
      setDesc("");
      fetchClasses();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Lỗi");
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError("");
    try {
      await api.joinClass(joinCode);
      toast.success("Tham gia lớp thành công!");
      setShowJoin(false);
      setJoinCode("");
      fetchClasses();
    } catch (err: unknown) {
      setJoinError(err instanceof Error ? err.message : "Lỗi");
    }
  };

  const handleDeleteClass = async (e: React.MouseEvent, cls: Class) => {
    e.preventDefault();
    e.stopPropagation(); // không kích hoạt điều hướng của Link
    if (
      !(await confirmDialog(
        `Xóa lớp "${cls.class_name}"?\nHọc sinh sẽ bị gỡ khỏi lớp và các đề thi của lớp sẽ chuyển thành không gán lớp (đề và kết quả vẫn được giữ). Không thể hoàn tác.`,
        { title: "Xóa lớp học", confirmLabel: "Xóa lớp", intent: "danger" },
      ))
    )
      return;
    try {
      await api.deleteClass(cls.id);
      toast.success("Đã xóa lớp");
      fetchClasses();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi xóa lớp");
    }
  };

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        <PageHeader
          title="Lớp học"
          description={user?.role === "teacher" ? "Quản lý các lớp của bạn" : "Các lớp bạn đang tham gia"}
          actions={<div className="ui-collection-controls">
            <ViewModeToggle value={viewMode} onChange={setViewMode} ariaLabel="Chế độ hiển thị lớp học" />
            {user?.role === "teacher" ? (
            <button
              className="ui-button ui-button--primary"
              onClick={() => {
                setCreateError("");
                setShowCreate(true);
              }}
            >
              <Icon name="plus" />
              Tạo lớp mới
            </button>
          ) : (
            <button
              className="ui-button ui-button--primary"
              onClick={() => {
                setJoinError("");
                setShowJoin(true);
              }}
            >
              <Icon name="user-plus" />
              Tham gia lớp
            </button>
            )}
          </div>}
        />

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="ui-skeleton"
                style={{ height: "160px", borderRadius: "var(--radius-lg)" }}
              />
            ))}
          </div>
        ) : classes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"></div>
            <h3>Chưa có lớp nào</h3>
            <p>
              {user?.role === "teacher"
                ? "Tạo lớp đầu tiên để bắt đầu"
                : "Tham gia lớp bằng mã do giáo viên cung cấp"}
            </p>
          </div>
        ) : (
          <CollectionView items={classes} mode={viewMode} getKey={(cls) => cls.id} ariaLabel="Danh sách lớp học" renderItem={(cls) => (
            <CollectionItem
              href={`/classes/${cls.id}`}
              leading={<span className="ui-collection-item__placeholder" />}
              title={<Link href={`/classes/${cls.id}`}>{cls.class_name}</Link>}
              description={cls.description}
              metadata={<><span>{cls.student_count} học sinh</span><span>{cls.contest_count} đề thi</span>{cls.teacher_name && <span>{cls.teacher_name}</span>}</>}
              actions={<><span className="ui-collection-item__code">ID: {String(cls.public_id).slice(0, 8)}…</span><Link className="ui-button ui-button--secondary ui-button--small" href={`/classes/${cls.id}`}>Chi tiết</Link>{user?.role === "teacher" && <button className="ui-button ui-button--danger ui-button--small" onClick={(event) => handleDeleteClass(event, cls)}><Icon name="trash" />Xóa</button>}</>}
            />
          )} />
        )}

        {/* Create modal */}
        {showCreate && (
          <div className="ui-modal-backdrop" onClick={() => setShowCreate(false)}>
            <section
              className="ui-modal ui-modal--small"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-class-title"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="ui-modal__header">
                <div className="ui-modal__heading">
                  <h3 className="ui-modal__title" id="create-class-title">Tạo lớp học mới</h3>
                </div>
                <button className="ui-modal__close" type="button" aria-label="Đóng" onClick={() => setShowCreate(false)}>
                  <Icon name="close" />
                </button>
              </header>
              <form onSubmit={handleCreate}>
                <div className="ui-modal__body">
                  {createError && (
                    <MessageBar className="ui-message-bar--section" intent="error" onDismiss={() => setCreateError("")}>
                      {createError}
                    </MessageBar>
                  )}
                  <div className="form-group">
                    <label className="form-label">Tên lớp</label>
                    <input className="ui-input-native" placeholder="VD: Lớp 12A1 - Toán" value={className} onChange={(e) => setClassName(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Mô tả (tùy chọn)</label>
                    <textarea className="ui-textarea" placeholder="Mô tả lớp học..." value={desc} onChange={(e) => setDesc(e.target.value)} />
                  </div>
                </div>
                <footer className="ui-modal__footer">
                  <button type="button" className="ui-button ui-button--secondary" onClick={() => setShowCreate(false)}>Hủy</button>
                  <button type="submit" className="ui-button ui-button--primary">
                    <Icon name="plus" />
                    Tạo lớp
                  </button>
                </footer>
              </form>
            </section>
          </div>
        )}

        {/* Join modal */}
        {showJoin && (
          <div className="ui-modal-backdrop" onClick={() => setShowJoin(false)}>
            <section className="ui-modal ui-modal--small" role="dialog" aria-modal="true" aria-labelledby="join-class-title" onClick={(e) => e.stopPropagation()}>
              <header className="ui-modal__header">
                <div className="ui-modal__heading">
                  <h3 className="ui-modal__title" id="join-class-title">Tham gia lớp học</h3>
                </div>
                <button className="ui-modal__close" type="button" aria-label="Đóng" onClick={() => setShowJoin(false)}>
                  <Icon name="close" />
                </button>
              </header>
              <form onSubmit={handleJoin}>
                <div className="ui-modal__body">
                  {joinError && (
                    <MessageBar className="ui-message-bar--section" intent="error" onDismiss={() => setJoinError("")}>
                      {joinError}
                    </MessageBar>
                  )}
                  <div className="form-group">
                    <label className="form-label">Mã lớp (UUID)</label>
                    <input className="ui-input-native" placeholder="xxxxxxxx-xxxx-..." value={joinCode} onChange={(e) => setJoinCode(e.target.value)} required />
                  </div>
                </div>
                <footer className="ui-modal__footer">
                  <button type="button" className="ui-button ui-button--secondary" onClick={() => setShowJoin(false)}>Hủy</button>
                  <button type="submit" className="ui-button ui-button--primary">Tham gia</button>
                </footer>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
