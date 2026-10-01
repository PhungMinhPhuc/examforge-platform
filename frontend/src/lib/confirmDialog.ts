export type ConfirmDialogOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  intent?: "default" | "danger";
};

export type ConfirmDialogRequest = ConfirmDialogOptions & {
  id: number;
  message: string;
  resolve: (confirmed: boolean) => void;
};

let nextId = 1;
let activeRequest: ConfirmDialogRequest | null = null;
const queue: ConfirmDialogRequest[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function showNext() {
  if (activeRequest || queue.length === 0) return;
  activeRequest = queue.shift() ?? null;
  emit();
}

export function confirmDialog(message: string, options: ConfirmDialogOptions = {}) {
  return new Promise<boolean>((resolve) => {
    queue.push({ id: nextId++, message, resolve, ...options });
    showNext();
  });
}

export function settleConfirmDialog(confirmed: boolean) {
  if (!activeRequest) return;
  const request = activeRequest;
  activeRequest = null;
  request.resolve(confirmed);
  emit();
  showNext();
}

export function subscribeConfirmDialog(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConfirmDialogSnapshot() {
  return activeRequest;
}
