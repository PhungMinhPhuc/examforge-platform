"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import api from "@/lib/api";

export default function SettingsPage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/");
    } else if (user) {
      setName(user.name || "");
      // Organization is not returned in /auth/login currently, so we'd leave it blank if not available
      // But user can still update it.
    }
  }, [user, isLoading, router]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // update profile API
      const payload: any = {};
      if (name) payload.name = name;
      if (user?.role === "teacher" && organization)
        payload.organization = organization;
      if (password) payload.password = password;

      await apiFetch("/auth/profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setSuccess("Cập nhật thông tin thành công!");
      // Xoá mật khẩu sau khi cập nhật
      setPassword("");

      // Khuyến khích đăng nhập lại
      setTimeout(() => {
        if (password) {
          logout();
        } else {
          window.location.reload();
        }
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra khi cập nhật hồ sơ");
    } finally {
      setLoading(false);
    }
  };

  // Helper for apiFetch since it might not be exported from lib/api
  const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "/api"}${endpoint}`,
      {
        ...options,
        headers,
      },
    );
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.detail || data.message || "Lỗi kết nối API");
    return data;
  };

  if (isLoading)
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
  if (!user) return null;

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Cài đặt Tài khoản</h1>
          <p className="page-sub">Quản lý thông tin cá nhân và bảo mật</p>
        </div>

        <div className="card" style={{ maxWidth: "600px" }}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
              {error}
            </div>
          )}
          {success && (
            <div
              className="alert alert-success"
              style={{ marginBottom: "1rem" }}
            >
              {success}
            </div>
          )}

          <form onSubmit={handleUpdate}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="input"
                type="email"
                value={user.email || ""}
                disabled
                style={{
                  background: "var(--bg-elevated)",
                  cursor: "not-allowed",
                }}
              />
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  marginTop: "0.25rem",
                }}
              >
                Email không thể thay đổi
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Họ và tên</label>
              <input
                className="input"
                placeholder="Tên hiển thị của bạn"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {user.role === "teacher" && (
              <div className="form-group">
                <label className="form-label">Trường / Tổ chức</label>
                <input
                  className="input"
                  placeholder="VD: Trường THPT Chuyên..."
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                />
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginTop: "0.25rem",
                  }}
                >
                  Để trống nếu không muốn cập nhật
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Đổi mật khẩu mới</label>
              <input
                className="input"
                type="password"
                placeholder="Bỏ trống nếu không muốn đổi"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
              />
              {password && (
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--accent-warning)",
                    marginTop: "0.25rem",
                  }}
                >
                  Bạn sẽ cần đăng nhập lại sau khi đổi mật khẩu
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ marginTop: "1rem" }}
            >
              {loading ? "Đang cập nhật..." : "Lưu thay đổi"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
