"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import NavigationHistory from "@/components/NavigationHistory";

interface NavItemProps {
  href: string;
  icon: SidebarIconName;
  label: string;
  onNavigate?: () => void;
}

type SidebarIconName = "dashboard" | "library" | "create" | "import" | "exams" | "classes" | "ai";

const sidebarIconPaths: Record<SidebarIconName, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  library: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /><path d="M8 7h8M8 11h6" /></>,
  create: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v8M8 12h8" /></>,
  import: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3" /></>,
  exams: <><path d="M9 5h6M9 3v4M7 5H5a2 2 0 0 0-2 2v13h18V7a2 2 0 0 0-2-2h-2" /><path d="M7 11h10M7 15h7" /></>,
  classes: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  ai: <path d="M12 3l1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2zM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8zM18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />,
};

function SidebarIcon({ name }: { name: SidebarIconName }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{sidebarIconPaths[name]}</svg>;
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
          ? path.startsWith("/contests") ||
            path.startsWith("/coding") ||
            path.startsWith("/results")
          : path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`nav-item ${isActive ? "active" : ""}`}
      onClick={onNavigate}
      title={label}
      aria-current={isActive ? "page" : undefined}
    >
      <span className="nav-icon"><SidebarIcon name={icon} /></span>
      <span className="nav-label">{label}</span>
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
  const hasRestoredCollapsed = useRef(false);

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
    const savedCollapsed = localStorage.getItem("sidebarCollapsed") === "1";
    setCollapsed(savedCollapsed);
    document.body.classList.toggle("sidebar-collapsed", savedCollapsed);
  }, []);

  // Persist the preference and reflect it on <body> so the layout can react
  useEffect(() => {
    // Do not overwrite the saved preference with the initial React value
    // before the restore effect above has applied it.
    if (!hasRestoredCollapsed.current) {
      hasRestoredCollapsed.current = true;
      return;
    }
    localStorage.setItem("sidebarCollapsed", collapsed ? "1" : "0");
    document.body.classList.toggle("sidebar-collapsed", collapsed);
  }, [collapsed]);

  useEffect(() => {
    return () => document.body.classList.remove("sidebar-collapsed");
  }, []);

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
    { href: "/dashboard", icon: "dashboard" as const, label: "Tổng quan" },
    { href: "/questions", icon: "library" as const, label: "Ngân hàng câu hỏi" },
    { href: "/questions/create", icon: "create" as const, label: "Tạo câu hỏi" },
    { href: "/questions/upload", icon: "import" as const, label: "Nhập câu hỏi" },
    { href: "/contests", icon: "exams" as const, label: "Đề thi và bài tập" },
    { href: "/classes", icon: "classes" as const, label: "Lớp học" },
    { href: "/ai", icon: "ai" as const, label: "AI" },
  ];

  const studentNav = [
    { href: "/dashboard", icon: "dashboard" as const, label: "Tổng quan" },
    { href: "/classes", icon: "classes" as const, label: "Lớp học" },
    { href: "/contests", icon: "exams" as const, label: "Đề thi và bài tập" },
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
                      color: "var(--accent-danger)",
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
