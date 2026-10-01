"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { toast } from "@/lib/toastStore";
import Combobox from "@/components/Combobox";
import { GoogleIcon, Icon, MicrosoftIcon } from "@/components/icons";
import MessageBar from "@/components/MessageBar";

type AuthTab = "login" | "register" | "guest";
/** Google/Microsoft chưa nối OAuth thật ở backend — nút hiện đúng chuẩn
 * thương hiệu để chốt UI trước, bấm vào chỉ báo cho biết đang chờ triển khai. */
function OAuthRow({ mode }: { mode: "Đăng nhập" | "Đăng ký" }) {
  const notify = (provider: string) =>
    toast.info(`${mode} bằng ${provider} sẽ sớm được hỗ trợ`);
  return (
    <div className="oauth-row">
      <button
        type="button"
        className="ui-button ui-provider-button ui-provider-button--google"
        onClick={() => notify("Google")}
      >
        <GoogleIcon size="var(--icon-size-md)" />
        {mode} bằng Google
      </button>
      <button
        type="button"
        className="ui-button ui-provider-button ui-provider-button--microsoft"
        onClick={() => notify("Microsoft")}
      >
        <MicrosoftIcon size="var(--icon-size-md)" />
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
          <div className="auth-brand-icon" aria-hidden="true" />
          <h1>Ngân hàng câu hỏi</h1>
          <p>Hệ thống CSDL — đăng nhập để tiếp tục</p>
        </div>

        <div className="ui-segmented" role="tablist" aria-label="Chọn hình thức truy cập">
          <button
            type="button"
            className="ui-segmented__item"
            role="tab"
            aria-selected={tab === "login"}
            onClick={() => switchTab("login")}
          >
            <Icon name="login-arrow" />
            Đăng nhập
          </button>
          <button
            type="button"
            className="ui-segmented__item"
            role="tab"
            aria-selected={tab === "register"}
            onClick={() => switchTab("register")}
          >
            <Icon name="user-plus" />
            Đăng ký
          </button>
          <button
            type="button"
            className="ui-segmented__item"
            role="tab"
            aria-selected={tab === "guest"}
            onClick={() => switchTab("guest")}
          >
            <Icon name="exam-paper" />
            Thi thử
          </button>
        </div>

        {error && (
          <MessageBar className="ui-message-bar--section" intent="error" onDismiss={() => setError("")}>
            {error}
          </MessageBar>
        )}

        {tab === "login" && (
          <form onSubmit={handleLogin} className="fade-in">
            <div className="form-group">
              <label className="form-label">
                Email<span className="req-mark">*</span>
              </label>
              <span className="ui-input ui-input--large">
                <span className="ui-input__before">
                  <Icon name="mail" size="var(--control-icon-size)" />
                </span>
                <input
                  id="login-email"
                  className="ui-input__control"
                  type="email"
                  placeholder="email@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </span>
            </div>
            <div className="form-group">
              <label className="form-label">
                Mật khẩu<span className="req-mark">*</span>
              </label>
              <span className="ui-input ui-input--large">
                <span className="ui-input__before">
                  <Icon name="lock" size="var(--control-icon-size)" />
                </span>
                <input
                  id="login-password"
                  className="ui-input__control"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="ui-input__after"
                  onClick={() => setShowPassword((v) => !v)}
                  title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  <Icon name={showPassword ? "eye-off" : "eye"} size="var(--control-icon-size)" />
                </button>
              </span>
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
              className="ui-button ui-button--primary ui-button--block ui-button--large"
              disabled={loading}
            >
              {loading ? <span className="ui-spinner" /> : "Đăng nhập"}
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
              <span className="ui-input ui-input--large">
                <input id="reg-name" className="ui-input__control" placeholder="Nguyễn Văn A" value={regName} onChange={(e) => setRegName(e.target.value)} required />
              </span>
            </div>
            <div className="form-group">
              <label className="form-label">
                Email<span className="req-mark">*</span>
              </label>
              <span className="ui-input ui-input--large">
                <input id="reg-email" className="ui-input__control" type="email" placeholder="email@example.com" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required />
              </span>
            </div>
            <div className="form-group">
              <label className="form-label">
                Mật khẩu<span className="req-mark">*</span>
              </label>
              <span className="ui-input ui-input--large">
                <input id="reg-password" className="ui-input__control" type="password" placeholder="Tối thiểu 6 ký tự" value={regPass} onChange={(e) => setRegPass(e.target.value)} required minLength={6} />
              </span>
            </div>
            <div className="form-group">
              <label className="form-label">
                Vai trò<span className="req-mark">*</span>
              </label>
              <Combobox
                id="reg-role"
                size="large"
                style={{ width: "100%" }}
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
                <span className="ui-input ui-input--large">
                  <input id="reg-org" className="ui-input__control" placeholder="Trường THPT..." value={regOrg} onChange={(e) => setRegOrg(e.target.value)} />
                </span>
              </div>
            )}
            <button
              id="btn-register"
              type="submit"
              className="ui-button ui-button--primary ui-button--block ui-button--large"
              disabled={loading}
            >
              {loading ? <span className="ui-spinner" /> : "Tạo tài khoản"}
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
                fontSize: "var(--font-size-md)",
                marginBottom: "1.1rem",
              }}
            >
              Nhập mã đề thi do giáo viên cung cấp để bắt đầu làm bài.
            </p>
            <div className="form-group">
              <label className="form-label">
                Mã đề thi (ID)<span className="req-mark">*</span>
              </label>
              <span className="ui-input ui-input--large">
                <input id="guest-contest-id" className="ui-input__control" placeholder="VD: 42" type="text" inputMode="numeric" pattern="[0-9]*" value={guestContestId} onChange={(e) => setGuestContestId(e.target.value)} required />
              </span>
            </div>
            <button
              id="btn-guest-exam"
              type="submit"
              className="ui-button ui-button--primary ui-button--block ui-button--large"
            >
              Vào thi ngay
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
