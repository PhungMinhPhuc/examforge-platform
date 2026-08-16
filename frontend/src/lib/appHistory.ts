// Lịch sử điều hướng trong app, do NavigationHistory ghi vào sessionStorage.
export const APP_HISTORY_KEY = "appNavigationHistory";

// Có trang trước để lùi về không. Lùi lịch sử thì giữ được vị trí cuộn cũ,
// đẩy sang URL mới thì mất.

export function hasAppHistory(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const data = JSON.parse(sessionStorage.getItem(APP_HISTORY_KEY) || "null");
    return Number(data?.index) > 0;
  } catch {
    return false;
  }
}
