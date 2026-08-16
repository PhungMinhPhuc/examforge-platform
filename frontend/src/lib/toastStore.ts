/**
 * Kho toast dùng chung cho toàn hệ thống — KHÔNG phụ thuộc React, nên gọi
 * được từ bất cứ đâu: component, `lib/api.ts`, event handler ngoài React.
 * `ToastViewport.tsx` là nơi DUY NHẤT vẽ ra màn hình, subscribe kho này qua
 * `useSyncExternalStore`.
 *
 * Kiểu Google Material Snackbar — nền tối, chấm màu nhỏ chỉ mức độ, neo góc
 * trái dưới, tối đa 3 cái hiện cùng lúc, dư thì xếp hàng FIFO và tự trồi lên
 * khi có chỗ trống. Xem gốc thiết kế ở temp/error-toast-demo/README.md.
 */

export type ToastKind = "error" | "success" | "warning" | "info";

export interface ToastOptions {
  /** ms trước khi tự đóng. Mặc định 4000, giống mọi mức độ (severity đã thể
   * hiện qua chấm màu, không cần kéo dài thời gian theo mức độ). */
  duration?: number;
  /** Chữ hành động màu (vd. "Thử lại", "Hoàn tác") — bấm vào tự đóng luôn. */
  actionLabel?: string;
  onAction?: () => void;
}

export interface ToastItem extends ToastOptions {
  id: string;
  kind: ToastKind;
  message: string;
}

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 4000;

let visible: ToastItem[] = []; // thứ tự hiển thị: cũ nhất đầu mảng, mới nhất cuối mảng (gần góc neo)
let queue: ToastItem[] = []; // hàng đợi FIFO, chưa lên màn hình, chưa chạy giờ tự đóng
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function push(kind: ToastKind, message: string, opts: ToastOptions = {}): string {
  const id = `toast-${++seq}`;
  const item: ToastItem = { id, kind, message, duration: DEFAULT_DURATION, ...opts };
  if (visible.length < MAX_VISIBLE) {
    show(item);
  } else {
    queue.push(item);
  }
  return id;
}

function show(item: ToastItem) {
  visible = [...visible, item];
  emit();
  const duration = item.duration ?? DEFAULT_DURATION;
  if (duration > 0) {
    setTimeout(() => dismiss(item.id), duration);
  }
}

function dismiss(id: string) {
  const wasVisible = visible.some((t) => t.id === id);
  if (wasVisible) {
    visible = visible.filter((t) => t.id !== id);
    emit();
    const next = queue.shift();
    if (next) show(next);
    return;
  }
  // Có thể caller muốn hủy một cái còn đang xếp hàng, chưa lên màn hình.
  const beforeLength = queue.length;
  queue = queue.filter((t) => t.id !== id);
  if (queue.length !== beforeLength) emit();
}

function dismissAll() {
  visible = [];
  queue = [];
  emit();
}

/** API gọi giống `console.*` — cố tình đơn giản để thay thế
 * `alert()`/`console.error`/banner cũ chỉ bằng đổi tên hàm. */
export const toast = {
  error: (message: string, opts?: ToastOptions) => push("error", message, opts),
  success: (message: string, opts?: ToastOptions) => push("success", message, opts),
  warning: (message: string, opts?: ToastOptions) => push("warning", message, opts),
  info: (message: string, opts?: ToastOptions) => push("info", message, opts),
  dismiss,
  dismissAll,
};

/** Dùng trong `ToastViewport` qua `useSyncExternalStore`. */
export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Chỉ trả về các toast ĐANG HIỂN THỊ (tối đa 3) — hàng đợi không tự vẽ. */
export function getToastSnapshot(): ToastItem[] {
  return visible;
}

/** Số cái còn đang chờ, phòng khi UI muốn hiện kiểu "+2 nữa". */
export function getQueueLength(): number {
  return queue.length;
}
