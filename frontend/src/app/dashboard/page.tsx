"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/Sidebar";
import api from "@/lib/api";
import Link from "next/link";

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({
    questions: 0,
    classes: 0,
    contests: 0,
    results: 0,
  });
  const [recentContests, setRecentContests] = useState<
    Record<string, unknown>[]
  >([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/");
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    api
      .getDashboard()
      .then((res) => {
        setStats(res.stats);
        setRecentContests(res.recent_contests);
      })
      .catch(console.error)
      .finally(() => setLoadingData(false));
  }, [user]);

  if (isLoading || !user)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
        }}
      >
        <span className="spinner" />
      </div>
    );

  const statCards =
    user.role === "teacher"
      ? [
          {
            icon: "",
            label: "Câu hỏi",
            value: stats.questions,
            href: "/questions",
            rgb: "37,91,167",
          },
          {
            icon: "",
            label: "Đề thi",
            value: stats.contests,
            href: "/contests",
            rgb: "245,158,11",
          },
          {
            icon: "",
            label: "Lớp học",
            value: stats.classes,
            href: "/classes",
            rgb: "16,185,129",
          },
        ]
      : [
          {
            icon: "",
            label: "Lớp học",
            value: stats.classes,
            href: "/classes",
            rgb: "16,185,129",
          },
          {
            icon: "",
            label: "Đề thi",
            value: stats.contests,
            href: "/contests",
            rgb: "245,158,11",
          },
        ];

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Xin chào, {user.name}! </h1>
            <p className="page-sub">
              {user.role === "teacher"
                ? "Quản lý ngân hàng câu hỏi và đề thi của bạn"
                : "Xem đề thi và kết quả học tập"}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          {statCards.map((s) => (
            <Link key={s.href} href={s.href} style={{ textDecoration: "none" }}>
              <div
                className="stat-card"
                style={{
                  cursor: "pointer",
                  background: `rgba(${s.rgb},0.05)`,
                  border: `1px solid rgba(${s.rgb},0.18)`,
                }}
              >
                <div
                  className="stat-icon"
                  style={{
                    background: `rgba(${s.rgb},0.12)`,
                    fontSize: "1.5rem",
                  }}
                >
                  {s.icon}
                </div>
                <div>
                  <div className="stat-value">
                    {loadingData ? "—" : s.value.toLocaleString()}
                  </div>
                  <div className="stat-label">{s.label}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick actions for teacher */}
        {user.role === "teacher" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            {[
              {
                icon: "",
                accent: "var(--accent-primary)",
                accentRgb: "37,91,167",
                title: "Upload câu hỏi LaTeX",
                desc: "Upload file .tex hoặc .zip, hệ thống tự parse và phân loại câu hỏi.",
                label: "Bắt đầu upload",
                href: "/questions/upload",
              },
              {
                icon: "",
                accent: "var(--accent-warning)",
                accentRgb: "245,158,11",
                title: "Tạo đề thi mới",
                desc: "Chọn câu hỏi từ ngân hàng, cấu hình thang điểm và tạo đề thi.",
                label: "Tạo đề thi",
                href: "/contests/new",
              },
              {
                icon: "",
                accent: "var(--accent-success)",
                accentRgb: "16,185,129",
                title: "Quản lý lớp học",
                desc: "Tạo lớp, thêm học sinh và giao đề thi cho từng lớp.",
                label: "Xem lớp học",
                href: "/classes",
              },
            ].map((item) => (
              <div
                key={item.href}
                className="card"
                style={{
                  background: `rgba(${item.accentRgb},0.05)`,
                  border: `1px solid rgba(${item.accentRgb},0.18)`,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: `rgba(${item.accentRgb},0.12)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.4rem",
                    marginBottom: "0.9rem",
                  }}
                >
                  {item.icon}
                </div>
                <h3 style={{ marginBottom: "0.5rem" }}>{item.title}</h3>
                <p
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "0.875rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  {item.desc}
                </p>
                <Link href={item.href} className="btn btn-primary btn-sm">
                  {item.label}
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Recent contests */}
        <div className="card">
          <div className="card-header">
            <h3>Đề thi gần đây</h3>
            <Link href="/contests" className="btn btn-ghost btn-sm">
              Xem tất cả
            </Link>
          </div>
          {loadingData ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton" style={{ height: "50px" }} />
              ))}
            </div>
          ) : recentContests.length === 0 ? (
            <div className="empty-state" style={{ padding: "2rem" }}>
              <div className="empty-state-icon"></div>
              <p>Chưa có đề thi nào</p>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {recentContests.map((c: Record<string, unknown>) => (
                <div
                  key={String(c.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.75rem",
                    background: "var(--bg-elevated)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{String(c.title)}</div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {String(c.class_name || "Không giới hạn lớp")} ·{" "}
                      {String(c.question_count || 0)} câu
                    </div>
                  </div>
                  <span className={`badge badge-${String(c.status)}`}>
                    {String(c.status) === "active" ? "Đang mở" : "Đóng"}
                  </span>
                  <Link
                    href={`/contests/${String(c.id)}`}
                    className="btn btn-ghost btn-sm"
                  >
                    Xem
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
