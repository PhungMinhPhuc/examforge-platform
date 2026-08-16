"use client";

import { DetailsHTMLAttributes, useEffect, useRef } from "react";

// <details> nhưng đóng luôn khi bấm ra ngoài hoặc bấm Escape; thẻ gốc chỉ đóng
// khi bấm lại vào summary. Dùng thay <details>, props giữ nguyên.
export default function DetailsMenu(
  props: DetailsHTMLAttributes<HTMLDetailsElement>,
) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOnOutside = (e: PointerEvent) => {
      const el = ref.current;
      if (!el?.open || el.contains(e.target as Node)) return;
      el.open = false;
    };
    const closeOnEscape = (e: KeyboardEvent) => {
      const el = ref.current;
      if (e.key !== "Escape" || !el?.open) return;
      el.open = false;
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return <details ref={ref} {...props} />;
}
