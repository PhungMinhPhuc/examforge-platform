"use client";

import React, { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (val: string) => void;
  inline?: boolean;
  autoFocus?: boolean;
  kbdContainer?: React.RefObject<HTMLDivElement | null>;
}

const STYLE_ID = "ml-kbd-zindex";

function injectKbdStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `.ML__keyboard { z-index: 10001 !important; } body { --keyboard-zindex: 10001; }`;
  document.head.appendChild(s);
}
function removeKbdStyle() {
  document.getElementById(STYLE_ID)?.remove();
}

export default function MathLiveEditor({
  value,
  onChange,
  inline = false,
  autoFocus = false,
  kbdContainer,
}: Props) {
  const mfRef = useRef<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    import("mathlive").then((ml) => {
      ml.MathfieldElement.fontsDirectory = "/api/static/fonts/web/mathlive";
      ml.MathfieldElement.soundsDirectory = "/mathlive-sounds";
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    if (!mounted || !mfRef.current) return;
    const mf = mfRef.current;

    if (mf.value !== value)
      mf.setValue(value, { suppressChangeNotifications: true });

    // 'onfocus' means built-in ⌨ toggle button works AND keyboard
    // shows automatically when the field receives focus
    mf.mathVirtualKeyboardPolicy = "onfocus";

    injectKbdStyle();

    // Do NOT override kv.container; let it mount in document.body so the global z-index works!
    const kv = (window as any).mathVirtualKeyboard;
    if (kv) {
      kv.container = window.document.body; // Reset to default just in case
    }

    const handleInput = (e: any) => onChange(e.target.value);
    mf.addEventListener("input", handleInput);

    let t: ReturnType<typeof setTimeout> | null = null;
    if (autoFocus) {
      t = setTimeout(() => {
        try {
          mf.focus();
        } catch {
          /* not ready */
        }
      }, 80);
    }

    return () => {
      mf.removeEventListener("input", handleInput);
      if (t) clearTimeout(t);
      const kv2 = (window as any).mathVirtualKeyboard;
      if (kv2) {
        kv2.hide({ animate: false });
        kv2.container = null;
      }
      removeKbdStyle();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  if (!mounted)
    return (
      <div
        style={{
          padding: "0.5rem",
          background: "var(--bg-hover)",
          borderRadius: "4px",
        }}
      >
        Đang tải công cụ Toán...
      </div>
    );

  const MathField = "math-field" as any;
  return (
    <MathField
      ref={mfRef}
      style={{
        width: "100%",
        fontSize: "1.2rem",
        padding: "0.5rem",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-default)",
        color: "var(--text-primary)",
        display: inline ? "inline-block" : "block",
      }}
    />
  );
}
