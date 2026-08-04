"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import type { CodingAssignment } from "@/modules/coding/types";
import CodingAssignmentForm from "@/modules/coding/CodingAssignmentForm";

const STATUS_LABEL: Record<string, string> = {
  draft: "Bản nháp",
  published: "Đang mở",
  closed: "Đã đóng",
};

export default function CodingAssignmentsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<CodingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const load = () =>
    api
      .getCodingAssignments()
      .then(setItems)
      .finally(() => setLoading(false));
  useEffect(() => {
    if (user) load();
  }, [user]);

  const updateStatus = async (id: number, status: string) => {
    await api.updateCodingAssignmentStatus(id, status);
    load();
  };

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Đề thi và bài tập</h1>
            <p className="page-sub">
              Bài tập lập trình không giới hạn thời gian làm bài
            </p>
          </div>
          {user?.role === "teacher" && (
            <details style={{ position: "relative" }}>
              <summary
                className="btn btn-primary"
                style={{ listStyle: "none", cursor: "pointer" }}
              >
                Tạo mới
              </summary>
              <div
                className="card"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + .4rem)",
                  width: 210,
                  zIndex: 30,
                  padding: ".4rem",
                  display: "grid",
                  gap: ".25rem",
                }}
              >
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ justifyContent: "flex-start" }}
                  onClick={() => setShowCreate(true)}
                >
                  Tạo bài/đề lập trình
                </button>
                <Link
                  className="btn btn-ghost btn-sm"
                  style={{ justifyContent: "flex-start" }}
                  href="/questions/create?type=cd&returnTo=/coding"
                >
                  Tạo câu lập trình
                </Link>
              </div>
            </details>
          )}
        </div>
        <div style={{ display: "flex", gap: ".5rem", marginBottom: "1.25rem" }}>
          <Link href="/contests" className="btn btn-secondary">
            Đề thi
          </Link>
          <Link href="/coding" className="btn btn-primary">
            Lập trình
          </Link>
        </div>
        {user?.role === "teacher" && showCreate && (
          <CodingAssignmentForm
            onCancel={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              load();
            }}
          />
        )}
        {loading ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : items.length === 0 ? (
          <div className="empty-state">
            <h3>Chưa có bài tập lập trình</h3>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "1rem" }}>
            {items.map((item) => (
              <div
                key={item.id}
                className="card"
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/coding/${item.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    router.push(`/coding/${item.id}`);
                }}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                  padding: "1.15rem 1.25rem",
                  cursor: "pointer",
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
                    <span
                      className="badge badge-mode"
                    >
                      {item.time_limit ? "Có tính giờ" : "Bài tập"}
                    </span>
                    <span
                      className={`badge ${item.status === "published" ? "badge-active" : "badge-inactive"}`}
                    >
                      {STATUS_LABEL[item.status]}
                    </span>
                  </div>
                  <h2
                    style={{
                      fontSize: "1.05rem",
                      fontWeight: 750,
                      lineHeight: 1.35,
                      margin: 0,
                    }}
                  >
                    {item.title}
                  </h2>
                  <div
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: ".8rem",
                      display: "flex",
                      gap: "1rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      {item.time_limit
                        ? `${item.time_limit} phút`
                        : "Không giới hạn thời gian"}
                    </span>
                    <span>{item.question_count || 0} bài</span>
                    {item.class_name && <span>{item.class_name}</span>}
                    {item.due_at && (
                      <span>
                        Hạn {new Date(item.due_at).toLocaleString("vi-VN")}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  style={{ display: "flex", gap: ".5rem" }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Link
                    className="btn btn-primary btn-sm"
                    href={`/coding/${item.id}`}
                  >
                    {user?.role === "teacher" ? "Chi tiết" : "Làm bài"}
                  </Link>
                  {user?.role === "teacher" && (
                    <details style={{ position: "relative" }}>
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
                          width: 160,
                          padding: ".4rem",
                        }}
                      >
                        {item.status !== "published" ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{
                              width: "100%",
                              justifyContent: "flex-start",
                            }}
                            onClick={() => updateStatus(item.id, "published")}
                          >
                            Mở bài
                          </button>
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{
                              width: "100%",
                              justifyContent: "flex-start",
                            }}
                            onClick={() => updateStatus(item.id, "closed")}
                          >
                            Đóng bài
                          </button>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
