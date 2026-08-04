"use client";

import React, { useState, useEffect, useRef, useCallback } from "react"; // useCallback still used by handleImgSave
import { createPortal } from "react-dom";
import LatexRenderer from "./LatexRenderer";
import MathLiveEditor from "./MathLiveEditor";
import ImageEditorModal, { ImageEditResult } from "./ImageEditorModal";

export type EditorImage = {
  storage_path: string;
  img_scale?: number;
  img_type?: string;
};

interface Props {
  content: string;
  onChange: (val: string) => void;
  placeholder?: string;
  imageEditable?: boolean;
  images?: EditorImage[];
  minHeight?: string;
  maxHeight?: string;
}

function imgBasename(src: string): string {
  return (src.split("/").pop() || "").split("?")[0];
}

function scaleForSrc(src: string, images?: EditorImage[]): number {
  const base = imgBasename(src);
  const info = images?.find((i) =>
    (i.storage_path || "").replace(/\\/g, "/").split("?")[0].endsWith(base),
  );
  return info?.img_scale ? Number(info.img_scale) : 1;
}

// ── WYSIWYG: chuyển đổi giữa LaTeX định dạng và HTML cho ô soạn ───────────────
// Người dùng không cần thấy \textbf{}, \underline{}, \hl{} — họ thấy chữ đậm, gạch
// chân, tô nền trực tiếp (như Word) và tự định dạng bằng thanh công cụ.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function latexToHtml(val: string): string {
  let s = escapeHtml(val ?? "");
  // Vài lượt để xử lý lồng một mức (vd \textbf{\underline{x}}).
  for (let k = 0; k < 4; k++) {
    s = s
      .replace(/\\textbf\{([^{}]*)\}/g, "<b>$1</b>")
      .replace(/\\textit\{([^{}]*)\}/g, "<i>$1</i>")
      .replace(/\\emph\{([^{}]*)\}/g, "<i>$1</i>")
      .replace(/\\underline\{([^{}]*)\}/g, "<u>$1</u>")
      .replace(/\\ul\{([^{}]*)\}/g, "<u>$1</u>")
      .replace(
        /\\hl\{([^{}]*)\}/g,
        '<span style="background-color:#fff3a3;border-radius:2px;padding:0 .1em;">$1</span>',
      );
  }
  // Ký tự LaTeX bị escape → hiện lại dạng thường để người dùng không thấy "\%".
  s = s
    .replace(/\\%/g, "%")
    .replace(/\\#/g, "#")
    .replace(/\\_/g, "_")
    .replace(/\\&amp;/g, "&amp;");

  // Xử lý xuống dòng:
  s = s.replace(/\\\\/g, "<br>").replace(/\\newline/g, "<br>");
  s = s.replace(/\n\n/g, "<br><br>");

  return s;
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    // Escape lại ký tự đặc biệt LaTeX trong văn bản (vd % -> \%) để xuất .tex an toàn.
    return (node.textContent || "")
      .replace(/%/g, "\\%")
      .replace(/#/g, "\\#")
      .replace(/&/g, "\\&");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") return "\n";
  let inner = "";
  el.childNodes.forEach((c) => {
    inner += serializeNode(c);
  });
  if (tag === "div" || tag === "p") {
    if (el.previousSibling) return `\n${inner}`;
    return inner;
  }
  if (inner === "") return "";
  const style = el.getAttribute("style") || "";
  const bold =
    tag === "b" ||
    tag === "strong" ||
    /font-weight\s*:\s*(bold|[6-9]00)/i.test(style);
  const italic =
    tag === "i" || tag === "em" || /font-style\s*:\s*italic/i.test(style);
  const underline =
    tag === "u" || /text-decoration[^;"']*underline/i.test(style);
  const highlight =
    tag === "mark" ||
    (/background(-color)?\s*:/i.test(style) &&
      !/transparent|rgba?\(0,\s*0,\s*0,\s*0\)/i.test(style));
  if (underline) inner = `\\underline{${inner}}`;
  if (italic) inner = `\\textit{${inner}}`;
  if (highlight) inner = `\\hl{${inner}}`;
  if (bold) inner = `\\textbf{${inner}}`;
  return inner;
}

function htmlToLatex(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  let out = "";
  div.childNodes.forEach((c) => {
    out += serializeNode(c);
  });
  return out.replace(/ /g, " ");
}

type Token = {
  id: string;
  type: "text" | "inline_math" | "display_math" | "image";
  val: string;
};

function parseLatex(latex: string): Token[] {
  if (latex == null)
    return [{ id: `text_end_${Date.now()}`, type: "text", val: "" }];
  const regex = /(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|!\[.*?\]\(.*?\))/g;
  const parts = latex.split(regex);
  const tokens: Token[] = [];
  parts.forEach((part, i) => {
    if (!part) return;
    if (part.startsWith("$$") && part.endsWith("$$")) {
      tokens.push({
        id: `math_${i}_${Date.now()}`,
        type: "display_math",
        val: part.slice(2, -2),
      });
    } else if (part.startsWith("$") && part.endsWith("$")) {
      tokens.push({
        id: `math_${i}_${Date.now()}`,
        type: "inline_math",
        val: part.slice(1, -1),
      });
    } else if (part.startsWith("![") && part.endsWith(")")) {
      tokens.push({ id: `img_${i}_${Date.now()}`, type: "image", val: part });
    } else {
      tokens.push({ id: `text_${i}_${Date.now()}`, type: "text", val: part });
    }
  });
  if (tokens.length === 0 || tokens[tokens.length - 1].type !== "text") {
    tokens.push({ id: `text_end_${Date.now()}`, type: "text", val: "" });
  }
  return tokens;
}

function tokensToLatex(tokens: Token[]): string {
  return tokens
    .map((t) => {
      if (t.type === "display_math") return `$$${t.val}$$`;
      if (t.type === "inline_math") return `$${t.val}$`;
      return t.val;
    })
    .join("");
}

function resolveImgSrc(val: string): string {
  const match = val.match(/!\[.*?\]\((.*?)\)/);
  let src = match ? match[1] : "";
  if (!src) return "";
  src = src.replace(/\\\\/g, "/");
  if (src.startsWith("http")) return src;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api";
  if (apiUrl.endsWith("/") && src.startsWith("/")) return apiUrl + src.slice(1);
  if (!apiUrl.endsWith("/") && !src.startsWith("/")) return apiUrl + "/" + src;
  return apiUrl + src;
}

export default function RichLatexEditor({
  content,
  onChange,
  placeholder,
  imageEditable = false,
  images = [],
  minHeight,
  maxHeight,
}: Props) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [editingMathIdx, setEditingMathIdx] = useState<number | null>(null);
  const [tempMathVal, setTempMathVal] = useState("");
  // No DOM element ref needed — we update the token val directly
  const [editingImg, setEditingImg] = useState<{
    src: string;
    tokenIdx: number;
    scale: number;
  } | null>(null);
  const initialized = useRef(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (!initialized.current) {
      setTokens(parseLatex(content || ""));
      initialized.current = true;
    }
  }, [content]);

  const commitChanges = (next: Token[]) => {
    setTokens(next);
    onChange(tokensToLatex(next));
  };

  const updateText = (idx: number, val: string) => {
    const next = [...tokens];
    next[idx] = { ...next[idx], val };
    commitChanges(next);
  };

  const deleteToken = (idx: number) => {
    const next = [...tokens];
    next.splice(idx, 1);
    commitChanges(next);
  };

  const openMathEditor = (idx: number) => {
    setTempMathVal(tokens[idx].val);
    setEditingMathIdx(idx);
  };

  const closeMathEditor = () => {
    const kbd = (window as any).mathVirtualKeyboard;
    if (kbd) {
      kbd.hide({ animate: false });
      kbd.container = null;
    }
    setEditingMathIdx(null);
  };

  const deleteMath = () => {
    if (editingMathIdx !== null) deleteToken(editingMathIdx);
    closeMathEditor();
  };
  const saveMath = () => {
    if (editingMathIdx === null) return;
    const next = [...tokens];
    next[editingMathIdx] = { ...next[editingMathIdx], val: tempMathVal };
    commitChanges(next);
    closeMathEditor();
  };

  // Insert math at current cursor position inside a text token, or append at end
  const insertMath = () => {
    const ts = Date.now();
    const newMath: Token = { id: `math_${ts}`, type: "inline_math", val: "x" };

    const sel = window.getSelection();
    let splitIdx: number | null = null;
    let splitOffset = 0;

    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      let el: Element | null =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? (range.startContainer as Text).parentElement
          : (range.startContainer as Element);
      while (el && !el.hasAttribute("data-token-idx")) el = el.parentElement;
      if (el) {
        const ti = parseInt(el.getAttribute("data-token-idx") ?? "-1", 10);
        if (ti >= 0 && tokens[ti]?.type === "text") {
          splitIdx = ti;
          splitOffset = Math.min(
            range.startOffset,
            (tokens[ti].val ?? "").length,
          );
        }
      }
    }

    if (splitIdx !== null) {
      const tok = tokens[splitIdx];
      const before = tok.val.slice(0, splitOffset);
      const after = tok.val.slice(splitOffset);
      const next = [...tokens];
      next.splice(splitIdx, 1, { ...tok, val: before }, newMath, {
        id: `text_${ts}`,
        type: "text",
        val: after || " ",
      });
      commitChanges(next);
      setEditingMathIdx(splitIdx + 1);
    } else {
      const next = [...tokens];
      next.push(newMath, { id: `text_${ts}`, type: "text", val: " " });
      commitChanges(next);
      setEditingMathIdx(next.length - 2);
    }
    setTempMathVal("x");
  };

  const handleImgSave = useCallback(
    async (result: ImageEditResult) => {
      if (!editingImg) return;
      const src = editingImg.src;
      const url = new URL(src, window.location.href);
      const imgPath = decodeURIComponent(
        url.pathname.replace(/^\/api/, "").replace(/^\/static\/images\//, ""),
      );
      const authToken =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;

      if (result.kind === "scale") {
        // SVG: chỉ lưu tỉ lệ vào DB, không đụng tới file ảnh.
        const fd = new FormData();
        fd.append("img_path", imgPath);
        fd.append("scale", String(result.scale));
        const res = await fetch("/api/questions/images/scale", {
          method: "POST",
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          body: fd,
        });
        if (!res.ok) throw new Error("Save failed");
      } else {
        const fd = new FormData();
        fd.append("img_path", imgPath);
        fd.append("file", result.blob, "edited.png");
        const res = await fetch("/api/questions/images/edit", {
          method: "POST",
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          body: fd,
        });
        if (!res.ok) throw new Error("Save failed");
      }

      // Đổi ?t= trong đường dẫn ảnh để buộc tải lại (tránh dùng bản cache).
      const tok = tokens[editingImg.tokenIdx];
      if (tok?.type === "image") {
        const newVal = tok.val.replace(/(?:\?t=\d+)?\)$/, `?t=${Date.now()})`);
        const newTokens = [...tokens];
        newTokens[editingImg.tokenIdx] = { ...tok, val: newVal };
        setTokens(newTokens);
        onChange(tokensToLatex(newTokens));
      }
      setEditingImg(null);
    },
    [editingImg, tokens, onChange],
  );

  const applyFormat = (cmd: string, value?: string) => {
    try {
      document.execCommand("styleWithCSS", false, "true");
    } catch {
      /* noop */
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const common = range.commonAncestorContainer;
    const container =
      common instanceof Element
        ? common.closest(".editor-container")
        : common.parentElement?.closest(".editor-container");

    if (
      container &&
      (common === container ||
        (common instanceof Element &&
          common.closest(".editor-container") === container))
    ) {
      const htmlEl = container as HTMLElement;
      const wasEditable = htmlEl.contentEditable;
      htmlEl.contentEditable = "true";
      document.execCommand(cmd, false, value);
      htmlEl.contentEditable = wasEditable;

      const next = [...tokens];
      let changed = false;
      const spans = htmlEl.querySelectorAll("span[data-token-idx]");
      spans.forEach((span) => {
        const idx = parseInt(span.getAttribute("data-token-idx") || "-1", 10);
        if (idx >= 0 && next[idx].type === "text") {
          let newVal = htmlToLatex(span.innerHTML);

          let el: HTMLElement | null = span as HTMLElement;
          let isBold = false,
            isItalic = false,
            isUnderline = false,
            isHighlight = false;
          while (el && el !== htmlEl) {
            const tag = el.tagName.toLowerCase();
            const style = el.getAttribute("style") || "";
            if (
              tag === "b" ||
              tag === "strong" ||
              /font-weight\s*:\s*(bold|[6-9]00)/i.test(style)
            )
              isBold = true;
            if (
              tag === "i" ||
              tag === "em" ||
              /font-style\s*:\s*italic/i.test(style)
            )
              isItalic = true;
            if (tag === "u" || /text-decoration[^;"']*underline/i.test(style))
              isUnderline = true;
            if (
              tag === "mark" ||
              (/background(-color)?\s*:/i.test(style) &&
                !/transparent|rgba?\(0,\s*0,\s*0,\s*0\)/i.test(style))
            )
              isHighlight = true;
            el = el.parentElement;
          }

          if (newVal.trim().length > 0) {
            if (isBold && !newVal.includes("\\textbf{"))
              newVal = `\\textbf{${newVal}}`;
            if (isItalic && !newVal.includes("\\textit{"))
              newVal = `\\textit{${newVal}}`;
            if (isUnderline && !newVal.includes("\\underline{"))
              newVal = `\\underline{${newVal}}`;
            if (isHighlight && !newVal.includes("\\hl{"))
              newVal = `\\hl{${newVal}}`;
          }

          if (newVal !== next[idx].val) {
            next[idx] = { ...next[idx], val: newVal };
            changed = true;
          }
        }
      });
      // Force update even if we think nothing changed, to wipe out stray DOM mutations from execCommand
      setTokens(next);
      if (changed) {
        onChange(tokensToLatex(next));
      }
    } else {
      document.execCommand(cmd, false, value);
    }
  };

  // Click vào vùng trống của ô (không trúng chữ) → đặt con trỏ ở vị trí gần nhất với tọa độ chuột
  // Sử dụng API gốc của trình duyệt để xử lý chính xác ngay cả khi một thẻ span chứa nhiều dòng văn bản.
  const handleBoxMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return; // bấm trúng chữ/công thức thì để mặc định
    const textSpans = Array.from(
      e.currentTarget.querySelectorAll("span[data-token-idx]"),
    ) as HTMLElement[];
    if (textSpans.length === 0) return;

    e.preventDefault();

    const place = () => {
      let range: Range | null = null;

      // Lấy vị trí văn bản chính xác dựa trên tọa độ click
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(e.clientX, e.clientY);
      } else if ((document as any).caretPositionFromPoint) {
        const pos = (document as any).caretPositionFromPoint(
          e.clientX,
          e.clientY,
        );
        if (pos) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
        }
      }

      if (range) {
        // Tìm textSpan chứa vị trí này để gọi focus() (bắt buộc phải có để contentEditable nhận focus)
        let node: Node | null = range.startContainer;
        while (node && node !== e.currentTarget) {
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            (node as Element).hasAttribute("data-token-idx")
          ) {
            (node as HTMLElement).focus();

            // Đặt lại vùng chọn đúng vị trí chuột
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            return; // Đã xử lý xong
          }
          node = node.parentNode;
        }

        // Nếu không tìm được thẻ textSpan nào bao ngoài (click quá xa, hoặc click vào chính wrapper div)
        // -> Đặt con trỏ vào cuối cùng của span cuối
        const last = textSpans[textSpans.length - 1];
        last.focus();
        const r = document.createRange();
        r.selectNodeContents(last);
        r.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      } else {
        // Fallback: nếu API không hỗ trợ, về cuối cùng
        const last = textSpans[textSpans.length - 1];
        last.focus();
        const r = document.createRange();
        r.selectNodeContents(last);
        r.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
    };

    place();
    requestAnimationFrame(place);
  };

  // Tô nền: bấm 1 lần để tô, bấm lần nữa để xóa (toggle).
  const toggleHighlight = () => {
    try {
      document.execCommand("styleWithCSS", false, "true");
    } catch {
      /* noop */
    }
    let v = "";
    try {
      v = String(document.queryCommandValue("hiliteColor") || "");
    } catch {
      /* noop */
    }
    if (!v) {
      try {
        v = String(document.queryCommandValue("backColor") || "");
      } catch {
        /* noop */
      }
    }
    const norm = v.replace(/\s+/g, "").toLowerCase();
    const isOn = norm.includes("255,243,163") || norm.includes("#fff3a3");
    document.execCommand(
      "hiliteColor",
      false,
      isOn ? "transparent" : "#fff3a3",
    );
  };

  const toolBtn: React.CSSProperties = {
    minWidth: 34,
    height: 32,
    padding: "0 10px",
    border: "none",
    borderRight: "1px solid var(--border-strong)",
    background: "transparent",
    cursor: "pointer",
    fontSize: "0.95rem",
    color: "var(--text-primary)",
    lineHeight: 1,
  };

  return (
    <div>
      <div
        style={{
          position: "relative",
          border: `1.5px solid ${isFocused ? "var(--accent-primary)" : "#cbd5e1"}`,
          borderRadius: "8px",
          padding: "0.85rem 1rem",
          background: "#ffffff",
          minHeight: minHeight || "3rem",
          maxHeight: maxHeight,
          overflowY: maxHeight ? "auto" : "visible",
          lineHeight: 2,
          transition: "all 0.2s",
          boxShadow: isFocused ? "0 0 0 4px rgba(37,91,167,0.15)" : "none",
        }}
        onMouseDown={handleBoxMouseDown}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsFocused(false);
          }
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
            e.preventDefault();
            const sel = window.getSelection();
            if (sel) {
              const range = document.createRange();
              range.selectNodeContents(e.currentTarget);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
            e.preventDefault();
            applyFormat("bold");
          } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
            e.preventDefault();
            applyFormat("italic");
          } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
            e.preventDefault();
            applyFormat("underline");
          } else {
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed) {
              const range = sel.getRangeAt(0);
              const container = e.currentTarget;
              const common = range.commonAncestorContainer;

              if (
                common === container ||
                (common instanceof Element &&
                  common.closest(".editor-container") === container)
              ) {
                if (range.toString().length === container.textContent?.length) {
                  if (e.key === "Backspace" || e.key === "Delete") {
                    e.preventDefault();
                    const next = [
                      {
                        id: `text_${Date.now()}`,
                        type: "text" as const,
                        val: "",
                      },
                    ];
                    setTokens(next);
                    onChange("");
                  } else if (
                    e.key.length === 1 &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    !e.altKey
                  ) {
                    e.preventDefault();
                    const next = [
                      {
                        id: `text_${Date.now()}`,
                        type: "text" as const,
                        val: e.key,
                      },
                    ];
                    setTokens(next);
                    onChange(e.key);
                  }
                }
              }
            }
          }
        }}
        className="editor-container"
      >
        {tokens.every((t) => t.type === "text" && !t.val) && !isFocused && (
          <span
            style={{
              position: "absolute",
              top: "0.75rem",
              left: "1rem",
              color: "var(--text-placeholder)",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {placeholder || "Nhập nội dung..."}
          </span>
        )}

        {tokens.map((token, idx) => {
          if (token.type === "text") {
            return (
              <span
                key={token.id}
                data-token-idx={idx}
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) =>
                  updateText(idx, htmlToLatex(e.currentTarget.innerHTML))
                }
                onKeyDown={(e) => {
                  if (e.key === "Backspace") {
                    const sel = window.getSelection();
                    // Chrome might report focusOffset 1 if it's a zero-width space, but we don't use zero-width space.
                    if (sel && sel.isCollapsed && sel.focusOffset === 0) {
                      if (idx > 0) {
                        e.preventDefault();
                        const currentVal = htmlToLatex(
                          e.currentTarget.innerHTML,
                        );
                        const next = [...tokens];
                        next[idx] = { ...next[idx], val: currentVal };

                        let targetIdxToFocus = idx - 1;
                        let offsetToFocus = 0;

                        next.splice(idx - 1, 1); // remove the math/image token

                        if (idx - 2 >= 0 && next[idx - 2].type === "text") {
                          const prevVal = next[idx - 2].val;
                          offsetToFocus = prevVal.length;
                          next[idx - 2] = {
                            ...next[idx - 2],
                            val: prevVal + currentVal,
                          };
                          next.splice(idx - 1, 1); // merge text tokens
                          targetIdxToFocus = idx - 2;
                        }

                        commitChanges(next);

                        setTimeout(() => {
                          const el = document.querySelector(
                            `span[data-token-idx="${targetIdxToFocus}"]`,
                          ) as HTMLSpanElement;
                          if (el) {
                            el.focus();
                            const newSel = window.getSelection();
                            const range = document.createRange();
                            if (el.childNodes.length > 0) {
                              try {
                                range.setStart(el.childNodes[0], offsetToFocus);
                                range.collapse(true);
                                newSel?.removeAllRanges();
                                newSel?.addRange(range);
                              } catch (err) {}
                            }
                          }
                        }, 50);
                      }
                    }
                  } else if (e.key === "ArrowLeft") {
                    const sel = window.getSelection();
                    if (sel && sel.isCollapsed && sel.focusOffset === 0) {
                      if (idx > 0) {
                        e.preventDefault();
                        // Focus the previous text token
                        let prevIdx = idx - 1;
                        while (prevIdx >= 0 && tokens[prevIdx].type !== "text")
                          prevIdx--;
                        if (prevIdx >= 0) {
                          const el = document.querySelector(
                            `span[data-token-idx="${prevIdx}"]`,
                          ) as HTMLSpanElement;
                          if (el) {
                            el.focus();
                            const newSel = window.getSelection();
                            const range = document.createRange();
                            if (el.childNodes.length > 0) {
                              try {
                                range.setStart(
                                  el.childNodes[0],
                                  (el.innerText || "").length,
                                );
                                range.collapse(true);
                                newSel?.removeAllRanges();
                                newSel?.addRange(range);
                              } catch (err) {}
                            } else {
                              try {
                                range.setStart(el, 0);
                                range.collapse(true);
                                newSel?.removeAllRanges();
                                newSel?.addRange(range);
                              } catch (err) {}
                            }
                          }
                        }
                      }
                    }
                  } else if (e.key === "ArrowRight") {
                    const sel = window.getSelection();
                    if (
                      sel &&
                      sel.isCollapsed &&
                      sel.focusOffset ===
                        (e.currentTarget.innerText || "").length
                    ) {
                      if (idx < tokens.length - 1) {
                        e.preventDefault();
                        // Focus the next text token
                        let nextIdx = idx + 1;
                        while (
                          nextIdx < tokens.length &&
                          tokens[nextIdx].type !== "text"
                        )
                          nextIdx++;
                        if (nextIdx < tokens.length) {
                          const el = document.querySelector(
                            `span[data-token-idx="${nextIdx}"]`,
                          ) as HTMLSpanElement;
                          if (el) {
                            el.focus();
                            const newSel = window.getSelection();
                            const range = document.createRange();
                            if (el.childNodes.length > 0) {
                              try {
                                range.setStart(el.childNodes[0], 0);
                                range.collapse(true);
                                newSel?.removeAllRanges();
                                newSel?.addRange(range);
                              } catch (err) {}
                            } else {
                              try {
                                range.setStart(el, 0);
                                range.collapse(true);
                                newSel?.removeAllRanges();
                                newSel?.addRange(range);
                              } catch (err) {}
                            }
                          }
                        }
                      }
                    }
                  }
                }}
                style={{
                  outline: "none",
                  whiteSpace: "pre-wrap",
                  display: token.val === "" ? "inline-block" : "inline",
                  minWidth: token.val === "" ? "10px" : "auto",
                }}
                dangerouslySetInnerHTML={{ __html: latexToHtml(token.val) }}
              />
            );
          }

          if (token.type === "inline_math" || token.type === "display_math") {
            return (
              <span
                key={token.id}
                onClick={() => openMathEditor(idx)}
                title="Click để sửa công thức"
                style={{
                  display:
                    token.type === "display_math" ? "block" : "inline-block",
                  verticalAlign: "middle",
                  overflowX: "auto",
                  maxWidth: "100%",
                  background: "rgba(37,91,167,0.08)",
                  border: "1px solid rgba(37,91,167,0.25)",
                  borderRadius: 4,
                  padding: "0 3px",
                  margin: token.type === "display_math" ? "0.25rem 0" : "0 2px",
                  cursor: "pointer",
                }}
              >
                <span style={{ pointerEvents: "none" }}>
                  <LatexRenderer
                    content={
                      token.type === "display_math"
                        ? `$$${token.val}$$`
                        : `$${token.val}$`
                    }
                  />
                </span>
              </span>
            );
          }

          if (token.type === "image") {
            const imgSrc = resolveImgSrc(token.val);
            const scale = scaleForSrc(imgSrc, images);
            return (
              <div
                key={token.id}
                style={{
                  display: "block",
                  margin: "0.6rem 0",
                  padding: "0.6rem 0.75rem",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "rgba(16,185,129,0.12)",
                      color: "#10b981",
                    }}
                  >
                    Ảnh
                  </span>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    {imageEditable && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingImg({ src: imgSrc, tokenIdx: idx, scale });
                        }}
                      >
                        Sửa ảnh
                      </button>
                    )}
                    <button
                      className="btn btn-danger btn-sm"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteToken(idx);
                      }}
                    >
                      Xóa
                    </button>
                  </div>
                </div>
                <img
                  src={imgSrc}
                  alt="Hình vẽ"
                  style={{
                    maxWidth: "100%",
                    maxHeight: 240,
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    display: "block",
                  }}
                />
              </div>
            );
          }

          return null;
        })}
      </div>

      <div
        style={{
          marginTop: "0.5rem",
          display: "flex",
          gap: "0.6rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            border: "1.5px solid var(--border-strong)",
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
            background: "var(--bg-surface)",
          }}
        >
          <button
            type="button"
            title="Đậm"
            style={{ ...toolBtn, fontWeight: 700 }}
            onMouseDown={(e) => {
              e.preventDefault();
              applyFormat("bold");
            }}
          >
            B
          </button>
          <button
            type="button"
            title="Nghiêng"
            style={{ ...toolBtn, fontStyle: "italic" }}
            onMouseDown={(e) => {
              e.preventDefault();
              applyFormat("italic");
            }}
          >
            I
          </button>
          <button
            type="button"
            title="Gạch chân"
            style={{ ...toolBtn, textDecoration: "underline" }}
            onMouseDown={(e) => {
              e.preventDefault();
              applyFormat("underline");
            }}
          >
            U
          </button>
          <button
            type="button"
            title="Tô nền (bấm lần nữa để xóa)"
            style={{ ...toolBtn, borderRight: "none" }}
            onMouseDown={(e) => {
              e.preventDefault();
              toggleHighlight();
            }}
          >
            <span
              style={{
                background: "#fff3a3",
                borderRadius: 2,
                padding: "0 4px",
              }}
            >
              A
            </span>
          </button>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertMath}
        >
          Chèn công thức
        </button>
      </div>

      {editingMathIdx !== null &&
        portalTarget &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: "2rem",
              left: "50%",
              transform: "translateX(-50%)",
              width: "92%",
              maxWidth: 820,
              maxHeight: "calc(100vh - 4rem)",
              overflowY: "auto",
              zIndex: 9998,
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              padding: "1.5rem",
              boxShadow:
                "0 0 0 100vmax rgba(0,0,0,0.55), 0 12px 32px rgba(0,0,0,0.3)",
            }}
          >
            <h3 style={{ marginBottom: "1rem" }}>Sửa công thức</h3>
            <MathLiveEditor
              value={tempMathVal}
              onChange={setTempMathVal}
              autoFocus
            />
            <div
              style={{
                marginTop: "0.75rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <button className="btn btn-danger btn-sm" onClick={deleteMath}>
                Xóa công thức
              </button>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button className="btn btn-secondary" onClick={closeMathEditor}>
                  Hủy
                </button>
                <button className="btn btn-primary" onClick={saveMath}>
                  Xác nhận
                </button>
              </div>
            </div>
          </div>,
          portalTarget,
        )}

      {editingImg && (
        <ImageEditorModal
          src={editingImg.src}
          initialScale={editingImg.scale}
          onSave={handleImgSave}
          onClose={() => setEditingImg(null)}
        />
      )}
    </div>
  );
}
