"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { ViewMode } from "@/components/ViewModeToggle";

const sessionValues = new Map<string, ViewMode>();

export default function useViewModePreference(key: string, fallback: ViewMode) {
  const subscribe = useCallback((notify: () => void) => {
    const listener = () => notify();
    window.addEventListener("storage", listener);
    window.addEventListener("ui-view-mode-change", listener);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener("ui-view-mode-change", listener);
    };
  }, []);
  const getSnapshot = useCallback((): ViewMode => {
    const current = sessionValues.get(key);
    if (current) return current;
    try {
      const stored = localStorage.getItem(key);
      return stored === "grid" || stored === "list" ? stored : fallback;
    } catch { return fallback; }
  }, [fallback, key]);
  const value = useSyncExternalStore(subscribe, getSnapshot, () => fallback);
  const update = (next: ViewMode) => {
    sessionValues.set(key, next);
    try { localStorage.setItem(key, next); } catch { /* session value remains */ }
    window.dispatchEvent(new Event("ui-view-mode-change"));
  };
  return [value, update] as const;
}
