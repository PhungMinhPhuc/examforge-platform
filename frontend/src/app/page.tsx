"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { toast } from "@/lib/toastStore";
import Combobox from "@/components/Combobox";

type AuthTab = "login" | "register" | "guest";

const EYE_PATH = (
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </>
);
const EYE_OFF_PATH = (
  <>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10 10 0 0 1 22 12s-1.2 2.4-3.4 4.3M6.2 6.2C4 8 2 12 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.8-.8" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </>
);

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
      />
      <path
        fill="#FF3D00"
        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
      />
      <path
        fill="#1976D2"
        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
      />
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <span className="ms-logo" aria-hidden="true">
      <i style={{ background: "#F25022" }} />
      <i style={{ background: "#7FBA00" }} />
      <i style={{ background: "#00A4EF" }} />
      <i style={{ background: "#FFB900" }} />
    </span>
  );
}

/** Google/Microsoft chưa nối OAuth thật ở backend — nút hiện đúng chuẩn
 * thương hiệu để chốt UI trước, bấm vào chỉ báo cho biết đang chờ triển khai. */
function OAuthRow({ mode }: { mode: "Đăng nhập" | "Đăng ký" }) {
  const notify = (provider: string) =>
    toast.info(`${mode} bằng ${provider} sẽ sớm được hỗ trợ`);
  return (
    <div className="oauth-row">
      <button
        type="button"
        className="btn-oauth btn-google"
        onClick={() => notify("Google")}
      >
        <GoogleLogo />
        {mode} bằng Google
      </button>
      <button
        type="button"
        className="btn-oauth btn-microsoft"
        onClick={() => notify("Microsoft")}
      >
        <MicrosoftLogo />
        {mode} bằng Microsoft
      </button>
    </div>
  );
}

export default function HomePage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<AuthTab>("login");

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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

  const switchTab = (t: AuthTab) => {
    setTab(t);
    setError("");
  };

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
    <div className="auth-stage">
      <div className="auth-aurora" aria-hidden="true">
        <div className="auth-blob b1" />
        <div className="auth-blob b2" />
        <div className="auth-blob b3" />
      </div>

      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <svg className="icon" viewBox="0 0 24 24">
              <path d="M12 3 3 8l9 5 9-5-9-5Z" />
              <path d="M3 12l9 5 9-5" />
              <path d="M3 16l9 5 9-5" />
            </svg>
          </div>
          <h1>Ngân hàng câu hỏi</h1>
          <p>Hệ thống CSDL — đăng nhập để tiếp tục</p>
        </div>

        <div className="segtabs">
          <button
            type="button"
            className={tab === "login" ? "active" : ""}
            onClick={() => switchTab("login")}
          >
            <svg className="icon" viewBox="0 0 24 24">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
            </svg>
            Đăng nhập
          </button>
          <button
            type="button"
            className={tab === "register" ? "active" : ""}
            onClick={() => switchTab("register")}
          >
            <svg className="icon" viewBox="0 0 24 24">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M19 8v6M22 11h-6" />
            </svg>
            Đăng ký
          </button>
          <button
            type="button"
            className={tab === "guest" ? "active" : ""}
            onClick={() => switchTab("guest")}
          >
            <svg className="icon" viewBox="0 0 24 24">
              <path d="M9 5h6M9 3v4M7 5H5a2 2 0 0 0-2 2v13h18V7a2 2 0 0 0-2-2h-2" />
              <path d="M7 11h10M7 15h7" />
            </svg>
            Thi thử
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {tab === "login" && (
          <form onSubmit={handleLogin} className="fade-in">
            <div className="form-group">
              <label className="form-label">
                Email<span className="req-mark">*</span>
              </label>
              <div className="input-wrap">
                <span className="input-icon">
                  <svg className="icon" viewBox="0 0 24 24">
                    <path d="M4 5h16v14H4z" />
                    <path d="m4 6 8 7 8-7" />
                  </svg>
                </span>
                <input
                  id="login-email"
                  className="input has-icon"
                  type="email"
                  placeholder="email@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">
                Mật khẩu<span className="req-mark">*</span>
              </label>
              <div className="input-wrap">
                <span className="input-icon">
                  <svg className="icon" viewBox="0 0 24 24">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
                <input
                  id="login-password"
                  className="input has-icon has-icon-r"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="input-icon-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  <svg className="icon" viewBox="0 0 24 24">
                    {showPassword ? EYE_OFF_PATH : EYE_PATH}
                  </svg>
                </button>
              </div>
            </div>
            <div className="auth-forgot">
              <button
                type="button"
                onClick={() =>
                  toast.info(
                    "Tính năng khôi phục mật khẩu đang được phát triển",
                  )
                }
              >
                Quên mật khẩu?
              </button>
            </div>
            <button
              id="btn-login"
              type="submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : "Đăng nhập"}
            </button>

            <div className="oauth-divider">
              <span>hoặc</span>
            </div>
            <OAuthRow mode="Đăng nhập" />
            <div className="auth-more">
              <button
                type="button"
                onClick={() =>
                  toast.info(
                    "Các phương thức đăng nhập khác đang được phát triển",
                  )
                }
              >
                Cách khác để đăng nhập
              </button>
            </div>
          </form>
        )}

        {tab === "register" && (
          <form onSubmit={handleRegister} className="fade-in">
            <div className="form-group">
              <label className="form-label">
                Họ và tên<span className="req-mark">*</span>
              </label>
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
              <label className="form-label">
                Email<span className="req-mark">*</span>
              </label>
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
              <label className="form-label">
                Mật khẩu<span className="req-mark">*</span>
              </label>
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
              <label className="form-label">
                Vai trò<span className="req-mark">*</span>
              </label>
              <Combobox
                id="reg-role"
                className="select"
                value={regRole}
                onChange={(val) => setRegRole(val)}
                options={[
                  { value: "student", label: "Học sinh" },
                  { value: "teacher", label: "Giáo viên" },
                ]}
              />
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

            <div className="oauth-divider">
              <span>hoặc</span>
            </div>
            <OAuthRow mode="Đăng ký" />
          </form>
        )}

        {tab === "guest" && (
          <form onSubmit={handleGuest} className="fade-in">
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "var(--font-size-base)",
                marginBottom: "1.1rem",
              }}
            >
              Nhập mã đề thi do giáo viên cung cấp để bắt đầu làm bài — không
              cần tài khoản.
            </p>
            <div className="form-group">
              <label className="form-label">
                Mã đề thi (ID)<span className="req-mark">*</span>
              </label>
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
              Vào thi ngay
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
