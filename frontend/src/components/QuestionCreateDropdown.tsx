"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function QuestionCreateDropdown() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="question-create-dropdown" ref={rootRef}>
      <button
        type="button"
        className="btn btn-primary question-create-dropdown-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Tạo câu hỏi
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="question-create-dropdown-menu" role="menu">
          <Link
            href="/questions/create"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <strong>Tạo câu hỏi mới</strong>
            <span>Nhập nội dung và đáp án thủ công</span>
          </Link>
          <Link
            href="/questions/upload"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <strong>Nhập câu hỏi</strong>
            <span>Nhập nhiều câu hỏi từ tài liệu</span>
          </Link>
        </div>
      )}
    </div>
  );
}
