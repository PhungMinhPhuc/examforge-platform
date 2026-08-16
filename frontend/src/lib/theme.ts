export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

/** Đọc theme đã lưu; mặc định "light" nếu chưa chọn bao giờ (không tự dò
 * theo hệ điều hành — người dùng chủ động chọn trong Cài đặt). */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
}

/** Ghi `data-theme` lên <html> + lưu lại lựa chọn. Gọi được ngay cả trước
 * khi React mount (xem script chống chớp trong layout.tsx). */
export function applyTheme(theme: Theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  localStorage.setItem(STORAGE_KEY, theme);
}

/** Chuỗi JS thuần (không phụ thuộc React/import gì) để nhúng vào
 * <script dangerouslySetInnerHTML> trong layout.tsx — chạy TRƯỚC khi
 * trang vẽ ra để khỏi chớp sáng rồi mới chuyển tối. Phải đồng bộ tuyệt đối
 * với logic của applyTheme()/getStoredTheme() ở trên. */
export const NO_FLASH_THEME_SCRIPT = `
  try {
    if (localStorage.getItem('${STORAGE_KEY}') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {}
`;
