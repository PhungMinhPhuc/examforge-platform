"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import useScrollRestoration from "@/lib/useScrollRestoration";
import api from "@/lib/api";
import Link from "next/link";

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
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [className, setClassName] = useState("");
  const [desc, setDesc] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
    setError("");
    try {
      await api.createClass({ class_name: className, description: desc });
      setSuccess("Tạo lớp thành công!");
      setShowCreate(false);
      setClassName("");
      setDesc("");
      fetchClasses();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi");
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.joinClass(joinCode);
      setSuccess("Tham gia lớp thành công!");
      setShowJoin(false);
      setJoinCode("");
      fetchClasses();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi");
    }
  };

  const handleDeleteClass = async (e: React.MouseEvent, cls: Class) => {
    e.preventDefault();
    e.stopPropagation(); // không kích hoạt điều hướng của Link
    setError("");
    setSuccess("");
    if (
      !confirm(
        `Xóa lớp "${cls.class_name}"?\nHọc sinh sẽ bị gỡ khỏi lớp và các đề thi của lớp sẽ chuyển thành không gán lớp (đề và kết quả vẫn được giữ). Không thể hoàn tác.`,
      )
    )
      return;
    try {
      await api.deleteClass(cls.id);
      setSuccess("Đã xóa lớp");
      fetchClasses();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi xóa lớp");
    }
  };

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Lớp học</h1>
            <p className="page-sub">
              {user?.role === "teacher"
                ? "Quản lý các lớp của bạn"
                : "Các lớp bạn đang tham gia"}
            </p>
          </div>
          {user?.role === "teacher" ? (
            <button
              className="btn btn-primary"
              onClick={() => setShowCreate(true)}
            >
              {" "}
              Tạo lớp mới
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => setShowJoin(true)}
            >
              {" "}
              Tham gia lớp
            </button>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {loading ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "1rem",
            }}
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton"
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "1rem",
            }}
          >
            {classes.map((cls) => (
              <Link
                key={cls.id}
                href={`/classes/${cls.id}`}
                style={{ textDecoration: "none" }}
              >
                <div
                  className="card"
                  style={{ cursor: "pointer", height: "100%" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: "1rem",
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        background: "rgba(30,63,170,0.08)",
                        border: "1px solid rgba(30,63,170,0.15)",
                        borderRadius: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.4rem",
                      }}
                    ></div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--text-muted)",
                          fontFamily: "monospace",
                          background: "var(--bg-elevated)",
                          padding: "0.2rem 0.5rem",
                          borderRadius: 6,
                        }}
                      >
                        ID: {String(cls.public_id).slice(0, 8)}...
                      </span>
                      {user?.role === "teacher" && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={(e) => handleDeleteClass(e, cls)}
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  </div>
                  <h3 style={{ marginBottom: "0.4rem" }}>{cls.class_name}</h3>
                  {cls.description && (
                    <p
                      style={{
                        color: "var(--text-secondary)",
                        fontSize: "0.875rem",
                        marginBottom: "1rem",
                      }}
                    >
                      {cls.description}
                    </p>
                  )}
                  {cls.teacher_name && (
                    <p
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.8rem",
                        marginBottom: "0.75rem",
                      }}
                    >
                      {" "}
                      {cls.teacher_name}
                    </p>
                  )}
                  <div
                    style={{
                      display: "flex",
                      gap: "1rem",
                      borderTop: "1px solid var(--border)",
                      paddingTop: "0.75rem",
                    }}
                  >
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 700 }}>{cls.student_count}</div>
                      <div
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        Học sinh
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 700 }}>{cls.contest_count}</div>
                      <div
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        Đề thi
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Create modal */}
        {showCreate && (
          <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">Tạo lớp học mới</h3>
              <form onSubmit={handleCreate}>
                <div className="form-group">
                  <label className="form-label">Tên lớp</label>
                  <input
                    className="input"
                    placeholder="VD: Lớp 12A1 - Toán"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mô tả (tùy chọn)</label>
                  <textarea
                    className="textarea"
                    placeholder="Mô tả lớp học..."
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowCreate(false)}
                  >
                    Hủy
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Tạo lớp
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Join modal */}
        {showJoin && (
          <div className="modal-backdrop" onClick={() => setShowJoin(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">Tham gia lớp học</h3>
              <form onSubmit={handleJoin}>
                <div className="form-group">
                  <label className="form-label">Mã lớp (UUID)</label>
                  <input
                    className="input"
                    placeholder="xxxxxxxx-xxxx-..."
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    required
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowJoin(false)}
                  >
                    Hủy
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Tham gia
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
