"use client";

/**
 * Component DUY NHẤT vẽ toast ra màn hình. Mount đúng một lần ở
 * `app/layout.tsx` (trong <body>, cạnh {children}) — mọi nơi khác chỉ cần
 * `import { toast } from "@/lib/toastStore"` rồi gọi `toast.error(...)`.
 *
 * Kiểu Google Material Snackbar — xem temp/error-toast-demo/README.md mục
 * "Đã chốt" và demo-big-apps.html (tab Google) để xem hình dạng gốc.
 */

import { useSyncExternalStore } from "react";
import { subscribeToasts, getToastSnapshot, toast, type ToastItem, type ToastKind } from "@/lib/toastStore";

const DOT_COLOR: Record<ToastKind, string> = {
  error: "#F28B82", // red 300
  warning: "#FDD663", // yellow 300
  success: "#81C995", // green 300
  info: "#8AB4F8", // blue 300
};

export default function ToastViewport() {
  const items = useSyncExternalStore(subscribeToasts, getToastSnapshot, getToastSnapshot);

  if (items.length === 0) return null;

  return (
    <div className="g-snackbar-zone" role="region" aria-label="Thông báo">
      {items.map((item) => (
        <Snackbar key={item.id} item={item} />
      ))}
    </div>
  );
}

function Snackbar({ item }: { item: ToastItem }) {
  return (
    <div className="g-snackbar" role={item.kind === "error" ? "alert" : "status"}>
      <span className="g-snackbar-dot" style={{ background: DOT_COLOR[item.kind] }} />
      <span className="g-snackbar-msg">{item.message}</span>
      {item.actionLabel && (
        <button
          className="g-snackbar-action"
          onClick={() => {
            item.onAction?.();
            toast.dismiss(item.id);
          }}
        >
          {item.actionLabel}
        </button>
      )}
    </div>
  );
}
