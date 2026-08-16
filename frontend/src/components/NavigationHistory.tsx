"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { APP_HISTORY_KEY } from "@/lib/appHistory";

export default function NavigationHistory() {
  const router = useRouter();
  const pathname = usePathname();
  const [position, setPosition] = useState({ index: 0, length: 1 });
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let node: HTMLDivElement | null = null;
    const attach = () => {
      if (node?.isConnected) return true;
      const header = document.querySelector(".main-content > .page-header");
      if (!header) return false;
      node = document.createElement("div");
      node.className = "history-nav-host";
      header.appendChild(node);
      setHost(node);
      return true;
    };
    attach();
    const observer = new MutationObserver(() => attach());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      node?.remove();
      setHost(null);
    };
  }, [pathname]);

  useEffect(() => {
    const key = APP_HISTORY_KEY;
    let data: { entries: string[]; index: number };
    try {
      data = JSON.parse(sessionStorage.getItem(key) || "null");
    } catch {
      data = { entries: [], index: -1 };
    }
    if (!data?.entries?.length) data = { entries: [pathname], index: 0 };
    else if (data.entries[data.index] !== pathname) {
      if (data.index > 0 && data.entries[data.index - 1] === pathname)
        data.index -= 1;
      else if (
        data.index < data.entries.length - 1 &&
        data.entries[data.index + 1] === pathname
      )
        data.index += 1;
      else {
        data.entries = [...data.entries.slice(0, data.index + 1), pathname];
        data.index = data.entries.length - 1;
      }
    }
    sessionStorage.setItem(key, JSON.stringify(data));
    setPosition({ index: data.index, length: data.entries.length });
  }, [pathname]);

  const canBack =
    position.index > 0 ||
    (typeof window !== "undefined" && window.history.length > 1);
  const canForward = position.index < position.length - 1;
  if (!host) return null;
  return createPortal(
    <div className="history-nav" aria-label="Điều hướng lịch sử">
      <button
        type="button"
        className="history-nav-btn"
        disabled={!canBack}
        onClick={() => router.back()}
        title="Quay lại trang trước"
        aria-label="Quay lại trang trước"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        className="history-nav-btn"
        disabled={!canForward}
        onClick={() => router.forward()}
        title="Đi tới trang kế tiếp"
        aria-label="Đi tới trang kế tiếp"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>,
    host,
  );
}
