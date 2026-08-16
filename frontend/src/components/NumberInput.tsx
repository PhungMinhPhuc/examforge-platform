"use client";

import { useEffect, useRef, useState } from "react";

interface NumberInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type"
  > {
  value: number | null | undefined;
  onChange: (value: number) => void;
  // Giá trị chốt khi để trống lúc rời khỏi ô (blur) — không truyền thì dùng
  // `min` nếu có, không thì 0.
  fallback?: number;
}

/** Ô nhập số DÙNG CHUNG cho cả app — thay `<input type="number">` viết tay
 * lặp lại nhiều nơi (thời gian thi, điểm số, memory/time limit coding...).
 * Lúc gõ: hiện ĐÚNG những gì đang gõ, KHÔNG tự ép về 0/min/max giữa chừng
 * (bug đã gặp: gõ "50" tự nhảy thành "450" vì ô có sẵn "0" rồi ký tự gõ vào
 * bị nối sau). Chỉ ép min/max và chốt giá trị mặc định (nếu để trống) lúc
 * bấm ra ngoài ô (blur). */
export default function NumberInput({
  value,
  onChange,
  fallback,
  min,
  max,
  onFocus,
  onBlur,
  ...rest
}: NumberInputProps) {
  const [text, setText] = useState(() =>
    Number.isFinite(value) ? String(value) : "",
  );
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setText(Number.isFinite(value) ? String(value) : "");
    }
  }, [value]);

  const clamp = (n: number) => {
    let v = n;
    if (min != null && v < Number(min)) v = Number(min);
    if (max != null && v > Number(max)) v = Number(max);
    return v;
  };

  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      value={text}
      onFocus={(e) => {
        focusedRef.current = true;
        onFocus?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw !== "" && raw !== "-" && raw !== "." && raw !== "-.") {
          const n = Number(raw);
          if (!Number.isNaN(n)) onChange(n);
        }
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        const raw = e.target.value;
        const parsed = Number(raw);
        const base =
          raw === "" || Number.isNaN(parsed)
            ? (fallback ?? (min != null ? Number(min) : 0))
            : parsed;
        const finalVal = clamp(base);
        setText(String(finalVal));
        onChange(finalVal);
        onBlur?.(e);
      }}
    />
  );
}
