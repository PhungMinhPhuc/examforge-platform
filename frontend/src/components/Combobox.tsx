"use client";

import React, { useState, useRef, useEffect } from "react";

type Option = string | { value: string | number; label: string };

interface Props {
  value: string | number;
  onChange: (val: any) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
}

export default function Combobox({
  value,
  onChange,
  options,
  placeholder,
  className,
  style,
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const getLabel = (val: string | number) => {
    if (val === undefined || val === null) return "";
    const valStr = String(val);
    const opt = options.find((o) => {
      if (typeof o === "object") return String(o.value) === valStr;
      return String(o) === valStr;
    });
    return opt ? (typeof opt === "object" ? opt.label : String(opt)) : valStr;
  };

  useEffect(() => {
    if (!open) {
      setSearch(getLabel(value));
    }
  }, [value, open, options]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter((o) => {
    const label = typeof o === "object" ? o.label : o;
    return label.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "relative",
        width: style?.width || "100%",
        minWidth: "100px",
        ...style,
      }}
    >
      <div
        style={{ position: "relative", display: "flex", alignItems: "center" }}
      >
        <input
          id={id}
          className={className || "form-input"}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (options.length === 0 || typeof options[0] === "string") {
              onChange(e.target.value);
            }
            setOpen(true);
          }}
          onFocus={() => {
            setSearch("");
            setOpen(true);
          }}
          placeholder={placeholder}
          style={{
            width: "100%",
            paddingRight: "20px",
            textOverflow: "ellipsis",
            marginBottom: 0,
          }}
        />
        <div
          onClick={() => setOpen(!open)}
          style={{
            position: "absolute",
            right: "8px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-secondary)",
            fontSize: "0.65rem",
          }}
        >
          ▼
        </div>
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
            marginTop: "4px",
            zIndex: 100,
            maxHeight: "200px",
            overflowY: "auto",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {filtered.length > 0 ? (
            filtered.map((opt, i) => {
              const label = typeof opt === "object" ? opt.label : opt;
              const val = typeof opt === "object" ? opt.value : opt;
              return (
                <div
                  key={i}
                  style={{
                    padding: "0.5rem 1rem",
                    cursor: "pointer",
                    fontSize: "var(--font-size-base)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                  onClick={() => {
                    setSearch(label);
                    onChange(val);
                    setOpen(false);
                  }}
                >
                  {label}
                </div>
              );
            })
          ) : (
            <div
              style={{
                padding: "0.5rem 1rem",
                color: "var(--text-muted)",
                fontSize: "var(--font-size-base)",
              }}
            >
              Không có gợi ý
            </div>
          )}
        </div>
      )}
    </div>
  );
}
