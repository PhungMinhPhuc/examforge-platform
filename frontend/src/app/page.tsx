"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";

export default function HomePage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register" | "guest">("login");

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");

  // Register form
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regRole, setRegRole] = useState("student");
  const [regOrg, setRegOrg] = useState("");

  // Guest
  const [guestContestId, setGuestContestId] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(loginEmail, loginPass);
      const returnTo = new URLSearchParams(window.location.search).get(
        "returnTo",
      );
      router.push(returnTo?.startsWith("/") ? returnTo : "/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.register({
        email: regEmail,
        password: regPass,
        name: regName,
        role: regRole,
        organization: regOrg,
      });
      await login(regEmail, regPass);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (guestContestId) router.push(`/exam/${guestContestId}?guest=true`);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "stretch" }}>
      {/* Left hero panel */}
      <div
        style={{
          flex: 1,
          background: "var(--bg-elevated)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "4rem",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative", zIndex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "2.5rem",
            }}
          ></div>

          <h1
            style={{
              fontSize: "clamp(2rem, 4vw, 3.5rem)",
              fontWeight: 800,
              lineHeight: 1.2,
              marginBottom: "1.5rem",
            }}
          >
            Hệ thống CSDL
          </h1>
        </div>
      </div>

      {/* Right auth panel */}
      <div
        style={{
          width: "460px",
          background: "var(--bg-surface)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "3rem 2.5rem",
          borderLeft: "1px solid var(--border)",
        }}
      >
        {/* Tabs */}
        <div
          style={{
            display: "flex",
            background: "var(--bg-elevated)",
            borderRadius: "var(--radius-md)",
            padding: "4px",
            marginBottom: "2rem",
          }}
        >
          {(["login", "register", "guest"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setError("");
              }}
              style={{
                flex: 1,
                padding: "0.5rem",
                border: "none",
                borderRadius: "var(--radius-sm)",
                background: tab === t ? "var(--bg-card)" : "transparent",
                color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.8rem",
                transition: "all 0.2s",
                boxShadow: tab === t ? "var(--shadow-sm)" : "none",
                fontFamily: "inherit",
              }}
            >
              {t === "login"
                ? "Đăng nhập"
                : t === "register"
                  ? "Đăng ký"
                  : "Thi thử"}
            </button>
          ))}
        </div>

        {error && <div className="alert alert-error"> {error}</div>}

        {tab === "login" && (
          <form onSubmit={handleLogin} className="fade-in">
            <h2 style={{ marginBottom: "1.5rem" }}>Chào mừng trở lại!</h2>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                id="login-email"
                className="input"
                type="email"
                placeholder="email@example.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mật khẩu</label>
              <input
                id="login-password"
                className="input"
                type="password"
                placeholder="••••••••"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                required
              />
            </div>
            <button
              id="btn-login"
              type="submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : "Đăng nhập"}
            </button>
          </form>
        )}

        {tab === "register" && (
          <form onSubmit={handleRegister} className="fade-in">
            <h2 style={{ marginBottom: "1.5rem" }}>Tạo tài khoản mới</h2>
            <div className="form-group">
              <label className="form-label">Họ và tên</label>
              <input
                id="reg-name"
                className="input"
                placeholder="Nguyễn Văn A"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                id="reg-email"
                className="input"
                type="email"
                placeholder="email@example.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mật khẩu</label>
              <input
                id="reg-password"
                className="input"
                type="password"
                placeholder="Tối thiểu 6 ký tự"
                value={regPass}
                onChange={(e) => setRegPass(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Vai trò</label>
              <select
                id="reg-role"
                className="select"
                value={regRole}
                onChange={(e) => setRegRole(e.target.value)}
              >
                <option value="student">Học sinh</option>
                <option value="teacher">Giáo viên</option>
              </select>
            </div>
            {regRole === "teacher" && (
              <div className="form-group">
                <label className="form-label">Trường / Tổ chức</label>
                <input
                  id="reg-org"
                  className="input"
                  placeholder="Trường THPT..."
                  value={regOrg}
                  onChange={(e) => setRegOrg(e.target.value)}
                />
              </div>
            )}
            <button
              id="btn-register"
              type="submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : "Tạo tài khoản"}
            </button>
          </form>
        )}

        {tab === "guest" && (
          <form onSubmit={handleGuest} className="fade-in">
            <h2 style={{ marginBottom: "0.5rem" }}>Thi không cần đăng nhập</h2>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                marginBottom: "1.5rem",
              }}
            >
              Nhập mã đề thi do giáo viên cung cấp để bắt đầu làm bài.
            </p>
            <div className="form-group">
              <label className="form-label">Mã đề thi (ID)</label>
              <input
                id="guest-contest-id"
                className="input"
                placeholder="VD: 42"
                type="number"
                value={guestContestId}
                onChange={(e) => setGuestContestId(e.target.value)}
                required
              />
            </div>
            <button
              id="btn-guest-exam"
              type="submit"
              className="btn btn-primary btn-block btn-lg"
            >
              Vào thi ngay →
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
