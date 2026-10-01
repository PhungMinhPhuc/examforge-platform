"use client";

/**
 * Component DUY NHẤT vẽ toast ra màn hình. Mount đúng một lần ở
 * `app/layout.tsx` (trong <body>, cạnh {children}) — mọi nơi khác chỉ cần
 * `import { toast } from "@/lib/toastStore"` rồi gọi `toast.error(...)`.
 *
 * Store chịu trách nhiệm hàng đợi và thời gian hiển thị; component `Toast`
 * chịu trách nhiệm giao diện và accessibility.
 */

import { useSyncExternalStore } from "react";
import Toast from "@/components/Toast";
import { subscribeToasts, getToastSnapshot, toast } from "@/lib/toastStore";

export default function ToastViewport() {
  const items = useSyncExternalStore(subscribeToasts, getToastSnapshot, getToastSnapshot);

  if (items.length === 0) return null;

  return (
    <div className="ui-toast-viewport" role="region" aria-label="Thông báo">
      {items.map((item) => (
        <Toast
          key={item.id}
          kind={item.kind}
          actionLabel={item.actionLabel}
          onAction={
            item.actionLabel
              ? () => {
                  item.onAction?.();
                  toast.dismiss(item.id);
                }
              : undefined
          }
          onDismiss={() => toast.dismiss(item.id)}
        >
          {item.message}
        </Toast>
      ))}
    </div>
  );
}
