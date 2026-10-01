"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";

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
    <div className="ui-dropdown-anchor" ref={rootRef}>
      <button
        type="button"
        className="ui-button ui-button--primary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Icon name="plus" />
        Tạo câu hỏi
        <Icon name="chevron-down" />
      </button>

      {open && (
        <div className="ui-dropdown__menu" role="menu">
          <Link
            className="ui-dropdown__option"
            href="/questions/create"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <strong className="ui-dropdown__label">Tạo câu hỏi mới</strong>
            <span className="ui-dropdown__description">
              Nhập nội dung và đáp án thủ công
            </span>
          </Link>
          <Link
            className="ui-dropdown__option"
            href="/questions/upload"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <strong className="ui-dropdown__label">Nhập câu hỏi</strong>
            <span className="ui-dropdown__description">
              Nhập nhiều câu hỏi từ tài liệu
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
