"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import NavigationHistory from "@/components/NavigationHistory";

interface NavItemProps {
  href: string;
  icon: string;
  label: string;
  onNavigate?: () => void;
}

function NavItem({ href, icon, label, onNavigate }: NavItemProps) {
  const path = usePathname();
  const isActive =
    href === "/dashboard"
      ? path === "/dashboard"
      : href === "/questions"
        ? path === "/questions" ||
          (path.startsWith("/questions/") &&
            !path.startsWith("/questions/upload") &&
            !path.startsWith("/questions/create"))
        : href === "/contests"
          ? path.startsWith("/contests") || path.startsWith("/coding")
          : path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`nav-item ${isActive ? "active" : ""}`}
      onClick={onNavigate}
    >
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop hide
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Restore the desktop collapsed preference on first render
  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebarCollapsed") === "1");
  }, []);

  // Persist the preference and reflect it on <body> so the layout can react
  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", collapsed ? "1" : "0");
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    return () => document.body.classList.remove("sidebar-collapsed");
  }, [collapsed]);

  const isMobile = () =>
    typeof window !== "undefined" && window.innerWidth <= 768;

  // Top-bar "Menu" button: open drawer on mobile, un-collapse on desktop
  const openSidebar = () => {
    if (isMobile()) setIsOpen(true);
    else setCollapsed(false);
  };

  // In-sidebar button: close drawer on mobile, toggle collapse on desktop
  const toggleSidebar = () => {
    if (isMobile()) setIsOpen(false);
    else setCollapsed((v) => !v);
  };

  const teacherNav = [
    { href: "/dashboard", icon: "", label: "Tổng quan" },
    { href: "/questions", icon: "", label: "Ngân hàng câu hỏi" },
    { href: "/contests", icon: "", label: "Đề thi và bài tập" },
    { href: "/classes", icon: "", label: "Lớp học" },
    { href: "/ai", icon: "", label: "AI" },
  ];

  const studentNav = [
    { href: "/dashboard", icon: "", label: "Tổng quan" },
    { href: "/classes", icon: "", label: "Lớp học" },
    { href: "/contests", icon: "", label: "Đề thi của tôi" },
    { href: "/coding", icon: "", label: "Lập trình" },
  ];

  const navItems = user?.role === "teacher" ? teacherNav : studentNav;

  return (
    <>
      {/* Top bar — shown on mobile, and on desktop when the sidebar is collapsed */}
      <header className="sidebar-topbar">
        <span className="sidebar-topbar-brand">Ngân hàng câu hỏi</span>
        <button
          className="btn btn-secondary btn-sm"
          onClick={openSidebar}
          aria-label="Mở menu"
        >
          Menu
        </button>
      </header>

      {/* Backdrop behind the drawer on mobile */}
      <div
        className={`sidebar-backdrop ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(false)}
      />

      <NavigationHistory />

      <div className={`sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-row">
            <div className="sidebar-logo-icon"></div>
            <div className="sidebar-logo-text">Ngân hàng câu hỏi</div>
          </div>
          <button
            className="btn btn-secondary btn-sm sidebar-hide-btn"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Mở menu" : "Ẩn menu"}
          >
            {collapsed ? "Menu" : "Ẩn"}
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              {user?.role === "teacher" ? "Giáo viên" : "Học sinh"}
            </div>
            {navItems.map((item) => (
              <NavItem
                key={item.href}
                {...item}
                onNavigate={() => setIsOpen(false)}
              />
            ))}
          </div>
        </nav>

        <div className="sidebar-footer">
          {user ? (
            <div
              className="user-card"
              ref={menuRef}
              style={{ position: "relative", cursor: "pointer" }}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <div className="user-avatar">
                {user.name?.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="user-info" style={{ flex: 1 }}>
                <div className="user-name">{user.name}</div>
                <div className="user-role">
                  {user.role === "teacher" ? "Giáo viên" : "Học sinh"}
                </div>
              </div>

              {/* Dropdown Menu */}
              {isMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    left: 0,
                    width: "100%",
                    minWidth: "180px",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                    marginBottom: "0.5rem",
                    padding: "0.5rem",
                    zIndex: 100,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25rem",
                  }}
                >
                  <Link
                    href="/settings"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-primary)",
                      fontSize: "0.9rem",
                      padding: "0.5rem 0.75rem",
                      textDecoration: "none",
                      borderRadius: "4px",
                    }}
                  >
                    <span>Cài đặt</span>
                  </Link>
                  <div
                    style={{
                      height: "1px",
                      background: "var(--border)",
                      margin: "0.25rem 0",
                    }}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      logout();
                      router.push("/");
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#ef4444",
                      fontSize: "0.9rem",
                      padding: "0.5rem 0.75rem",
                      textAlign: "left",
                      borderRadius: "4px",
                    }}
                  >
                    <span>Đăng xuất</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/" className="btn btn-primary btn-block">
              Đăng nhập
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
