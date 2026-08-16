"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import MathLiveEditor from "./MathLiveEditor";
import ImageEditorModal, { ImageEditResult } from "./ImageEditorModal";
import { queueTypeset } from "@/lib/mathjax";
import api from "@/lib/api";
import { toast } from "@/lib/toastStore";
import {
  TreeDoc,
  BlockNode,
  InlineNode,
  Mark,
  emptyDoc,
  resolveImgSrc,
  wrapInlineMath,
  wrapDisplayMath,
} from "@/lib/docTree";

export type EditorImage = {
  id?: number | string;
  storage_path: string;
  url?: string;
  width?: number | null;
  img_type?: string;
  asset_exists?: boolean;
  /** Chỉ tồn tại trong trình duyệt khi đang tạo câu hỏi chưa có ID. */
  pendingFile?: File | Blob;
};

interface Props {
  content: TreeDoc | null | undefined;
  // `newImage` chỉ có khi vừa chèn ảnh MỚI (nút/dán) — cha PHẢI gộp nó vào
  // qData.images trong CÙNG một lần cập nhật với content. Từng tách thành 2
  // callback riêng (onChange + onImageInserted) gọi liền nhau trong cùng một
  // thao tác — cả 2 đều tự spread {...qData, ...} trên CÙNG một qData cũ (React
  // chưa kịp re-render giữa 2 lần gọi), lần gọi sau đè mất lần gọi trước, ảnh
  // vừa chèn "biến mất" khỏi qData.images dù vẫn thấy trên màn hình (chỉ là
  // DOM thao tác tay, không phải state thật) — click +/- sau đó không tìm
  // thấy ảnh trong `images` prop nữa nên im re không phản ứng gì.
  onChange: (val: TreeDoc, newImage?: EditorImage) => void;
  placeholder?: string;
  imageEditable?: boolean;
  images?: EditorImage[];
  minHeight?: string;
  maxHeight?: string;
  // Gõ/bấm +/- cụm cỡ ảnh -> báo lên đây, KHÔNG tự gọi API. Cha (QuestionEditor)
  // giữ tạm trong qData.images, gộp lưu một lượt khi bấm "Lưu" chung của cả câu.
  onImageWidthChange?: (storagePath: string, width: number) => void;
  // Chèn ảnh MỚI (nút hoặc dán Ctrl+V). Câu chưa có ID giữ file cục bộ và
  // trang tạo câu sẽ upload ngay sau khi nhận được ID thật.
  questionId?: number;
  importJobId?: string;
  allowPendingImage?: boolean;
  // Cụm "Bố cục" (trôi phải/ở giữa) — chỉ hiện ở ô Nội dung đề bài chính,
  // không hiện ở từng phương án/lời giải (đúng phạm vi đã duyệt).
  showLayoutControl?: boolean;
  layoutType?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function findImageInfo(
  figureId: string,
  images: EditorImage[],
): EditorImage | undefined {
  return images.find((i) => String(i.id) === figureId);
}

function normalizedFigureId(raw: string): number | string {
  const value = raw.trim();
  return /^\d+$/.test(value) ? Number(value) : value;
}

// ---------- dựng cây -> DOM soạn thảo (atom công thức/ảnh, còn lại gõ trực tiếp) ----------

function renderInlineForEdit(
  nodes: InlineNode[],
  images: EditorImage[],
  imageEditable: boolean,
): string {
  return (nodes || [])
    .map((n) => {
      if (n.type === "text") {
        let html = escapeHtml(n.text) || "​";
        (n.marks || []).forEach((m) => {
          const tag =
            m === "bold"
              ? "b"
              : m === "italic"
                ? "i"
                : m === "underline"
                  ? "u"
                  : "mark";
          html = `<${tag}>${html}</${tag}>`;
        });
        if (/^#[0-9a-f]{6}$/i.test(n.color || ""))
          html = `<span style="color:${n.color}">${html}</span>`;
        return html;
      }
      if (n.type === "math") {
        return `<span class="rle-math" contenteditable="false" data-tex="${escapeHtml(n.tex)}">${wrapInlineMath(escapeHtml(n.tex))}</span>​`;
      }
      if (n.type === "hard_break") return "<br>";
      if (n.type === "image_inline") {
        return imageInlineCardHtml(String(n.figure_id), images, imageEditable);
      }
      return "";
    })
    .join("");
}

function imageCardHtml(
  figureId: string,
  images: EditorImage[],
  imageEditable: boolean,
  side: "right" | "center" = "center",
): string {
  const imgInfo = findImageInfo(figureId, images);
  const isTikz = imgInfo?.img_type === "tikz";
  const isStaged = !!imgInfo?.url?.includes("/upload/job/");
  const widthFrac = imgInfo?.width;
  const pctValue = widthFrac == null ? "" : String(Math.round(widthFrac * 100));
  const imgSrc = imgInfo
    ? resolveImgSrc(imgInfo.url || imgInfo.storage_path)
    : "";
  const missing = !!imgInfo && imgInfo.asset_exists === false;
  return `<div class="rle-image side-${side}" contenteditable="false" data-figure-id="${escapeHtml(figureId)}"${widthFrac ? ` style="--rle-image-width:${Math.min(widthFrac * 100, 100)}%"` : ""}>
    <div class="rle-image-head">
      ${
        imageEditable && imgInfo
          ? `
      <div class="rle-image-zoom">
        <button type="button" class="btn btn-secondary btn-sm rle-iz-btn" data-imgcmd="dec" title="Thu nhỏ">−</button>
        <input type="number" class="rle-iz-input" value="${pctValue}" placeholder="Tự động" min="1" max="100" data-imgcmd="pct" title="Cỡ ảnh theo chiều ngang vùng soạn thảo (%)">
        <span class="rle-iz-sign">%</span>
        <button type="button" class="btn btn-secondary btn-sm rle-iz-btn" data-imgcmd="inc" title="Phóng to">+</button>
      </div>`
          : "<span></span>"
      }
      <div class="rle-image-actions">
        ${imageEditable && !isTikz && !isStaged ? `<button type="button" class="btn btn-secondary btn-sm" data-imgcmd="edit" title="Cắt / đổi độ phân giải">✂</button>` : ""}
        <button type="button" class="btn btn-danger btn-sm" data-imgcmd="del" title="Xoá ảnh">✕</button>
      </div>
    </div>
    ${missing ? `<div class="alert alert-danger">Ảnh không tồn tại (${escapeHtml(figureId)})</div>` : `<img src="${imgSrc}" alt="Hình vẽ" class="rle-image-img" style="height:auto;">`}
  </div>`;
}

function imageInlineCardHtml(
  figureId: string,
  images: EditorImage[],
  imageEditable: boolean,
): string {
  const imgInfo = findImageInfo(figureId, images);
  const widthFrac = imgInfo?.width;
  const pctValue = widthFrac == null ? "" : String(Math.round(widthFrac * 100));
  const imgSrc = imgInfo
    ? resolveImgSrc(imgInfo.url || imgInfo.storage_path)
    : "";
  const missing = !!imgInfo && imgInfo.asset_exists === false;
  return `<span class="rle-imginline rle-image" contenteditable="false" data-figure-id="${escapeHtml(figureId)}">
    ${
      imageEditable && imgInfo
        ? `<span class="rle-image-zoom">
      <button type="button" class="btn btn-secondary btn-sm rle-iz-btn" data-imgcmd="dec" title="Thu nhỏ">−</button>
      <input type="number" class="rle-iz-input" value="${pctValue}" placeholder="Tự động" min="1" max="100" data-imgcmd="pct" title="Cỡ ảnh theo chiều ngang vùng soạn thảo (%)">
      <span class="rle-iz-sign">%</span>
      <button type="button" class="btn btn-secondary btn-sm rle-iz-btn" data-imgcmd="inc" title="Phóng to">+</button>
      <button type="button" class="btn btn-danger btn-sm rle-iz-btn" data-imgcmd="del" title="Xoá ảnh">✕</button>
    </span>`
        : ""
    }
    ${missing ? `<span class="text-danger">Ảnh không tồn tại</span>` : imgInfo ? `<img src="${imgSrc}" alt="Hình vẽ" class="rle-image-img" style="${widthFrac ? `width:${Math.min(widthFrac * 100, 100)}%;` : "width:auto;"}height:auto;">` : "🖼"}
  </span>​`;
}

function renderBlockForEdit(
  node: BlockNode,
  images: EditorImage[],
  imageEditable: boolean,
  side: "right" | "center",
): string {
  if (node.type === "paragraph")
    return `<p class="rle-p" style="text-align:${node.align || "justify"}">${renderInlineForEdit(node.content, images, imageEditable)}</p>`;
  if (node.type === "math_block") {
    return `<div class="rle-mathblock" contenteditable="false" data-tex="${escapeHtml(node.tex)}">${wrapDisplayMath(escapeHtml(node.tex))}</div>`;
  }
  if (node.type === "image")
    return imageCardHtml(String(node.figure_id), images, imageEditable, side);
  if (node.type === "list") {
    const tag = node.ordered ? "ol" : "ul";
    const items = node.items
      .map(
        (item) =>
          `<li>${item.map((b) => (b.type === "paragraph" ? renderInlineForEdit(b.content, images, imageEditable) : "")).join("")}</li>`,
      )
      .join("");
    return `<${tag} class="rle-list">${items}</${tag}>`;
  }
  if (node.type === "table") {
    const columnCount = node.widths?.length || Math.max(
      1,
      ...node.rows.map((row) =>
        row.reduce((total, cell) => total + (cell.colspan || 1), 0),
      ),
    );
    const widths =
      node.widths?.length === columnCount
        ? node.widths
        : Array.from({ length: columnCount }, () => 1 / columnCount);
    const columns = `<colgroup>${widths
      .map((width) => `<col style="width:${width * 100}%">`)
      .join("")}</colgroup>`;
    const rows = node.rows
      .map(
        (row, rowIndex) =>
          `<tr${node.row_heights?.[rowIndex] ? ` data-height="${node.row_heights[rowIndex]}" style="height:${node.row_heights[rowIndex]}px"` : ""}>${row.map((c) => `<td${c.colspan && c.colspan > 1 ? ` colspan="${c.colspan}"` : ""}${c.rowspan && c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ""}>${renderInlineForEdit(c.content, images, imageEditable)}</td>`).join("")}</tr>`,
      )
      .join("");
    return `<table class="rle-table">${columns}<tbody>${rows}</tbody></table>`;
  }
  if (node.type === "columns") {
    const widths = node.columns
      .map((column) => `${column.width * 100}%`)
      .join(" ");
    const columns = node.columns
      .map((column, index) => {
        const body = column.content
          .map((block) =>
            renderBlockForEdit(block, images, imageEditable, "center"),
          )
          .join("");
        return `<div class="rle-column" data-width="${column.width}" data-align="${column.align || "left"}" data-valign="${column.valign || "top"}" style="text-align:${column.align || "left"}"><div class="rle-column-head" contenteditable="false">Cột ${index + 1}: <input class="rle-column-width" type="number" min="5" max="95" value="${Math.round(column.width * 100)}">%</div>${body}</div>`;
      })
      .join("");
    return `<div class="rle-columns" data-gap="${node.gap || 0}" style="display:grid;grid-template-columns:${widths}">${columns}</div>`;
  }
  if (node.type === "code_block") {
    return `<pre class="rle-code" data-lang="${escapeHtml(node.lang || "")}">${escapeHtml(node.text)}</pre>`;
  }
  return "";
}

function renderDocForEdit(
  doc: TreeDoc,
  images: EditorImage[],
  imageEditable: boolean,
): string {
  const content = doc.content?.length ? doc.content : emptyDoc().content;
  const side: "right" | "center" = doc.side === "right" ? "right" : "center";
  if (side === "right") {
    const imageBlocks = content.filter((block) => block.type === "image");
    if (imageBlocks.length) {
      const floatedImages = imageBlocks
        .map((block) => renderBlockForEdit(block, images, imageEditable, side))
        .join("");
      const anchoredContent = content
        .map((block) =>
          block.type === "image"
            ? `<span class="rle-image-anchor" contenteditable="false" data-figure-id="${escapeHtml(String(block.figure_id))}" hidden></span>`
            : renderBlockForEdit(block, images, imageEditable, side),
        )
        .join("");
      return floatedImages + anchoredContent;
    }
  }
  return content
    .map((b) => renderBlockForEdit(b, images, imageEditable, side))
    .join("");
}

function blockHasImage(block: BlockNode): boolean {
  if (block.type === "image") return true;
  if (block.type === "paragraph")
    return block.content.some((node) => node.type === "image_inline");
  if (block.type === "columns")
    return block.columns.some((column) => column.content.some(blockHasImage));
  if (block.type === "list")
    return block.items.some((item) => item.some(blockHasImage));
  if (block.type === "table")
    return block.rows.some((row) =>
      row.some((cell) =>
        cell.content.some((node) => node.type === "image_inline"),
      ),
    );
  return false;
}

/** Một tài liệu chỉ gồm các đoạn văn không có chữ vẫn phải được xem là rỗng.
 * `emptyDoc()` chủ động tạo một text node có `text: ""`, vì vậy không thể chỉ
 * kiểm tra `paragraph.content.length === 0` khi quyết định hiện placeholder. */
function isDocEmpty(doc: TreeDoc | null | undefined): boolean {
  const blocks = doc?.content ?? [];
  if (blocks.length === 0) return true;

  return blocks.every(
    (block) =>
      block.type === "paragraph" &&
      block.content.every(
        (node) =>
          node.type === "text" &&
          node.text.replace(/\u200b/g, "").trim().length === 0,
      ),
  );
}

// ---------- DOM soạn thảo -> cây (reconcile, chỉ chạy lúc blur/debounce, không phải mỗi phím gõ) ----------

function marksOfNode(node: Node, root: HTMLElement): Mark[] {
  const marks: Mark[] = [];
  let el: HTMLElement | null = node.parentElement;
  while (el && el !== root) {
    const tag = el.tagName;
    const style = el.getAttribute("style") || "";
    if (
      tag === "B" ||
      tag === "STRONG" ||
      /font-weight\s*:\s*(bold|[6-9]00)/i.test(style)
    )
      marks.push("bold");
    if (tag === "I" || tag === "EM" || /font-style\s*:\s*italic/i.test(style))
      marks.push("italic");
    if (tag === "U" || /text-decoration[^;"']*underline/i.test(style))
      marks.push("underline");
    if (
      tag === "MARK" ||
      (/background(-color)?\s*:/i.test(style) &&
        !/transparent|rgba?\(0,\s*0,\s*0,\s*0\)/i.test(style))
    )
      marks.push("highlight");
    el = el.parentElement;
  }
  return [...new Set(marks)];
}

function normalizeTextColor(value: string): string | undefined {
  const color = value.trim().toLowerCase();
  const longHex = /^#([0-9a-f]{6})$/.exec(color);
  if (longHex) return `#${longHex[1]}`;
  const shortHex = /^#([0-9a-f]{3})$/.exec(color);
  if (shortHex)
    return `#${shortHex[1].split("").map((digit) => digit + digit).join("")}`;
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(color);
  if (!rgb || (rgb[4] != null && Number(rgb[4]) === 0)) return undefined;
  const channel = (part: string) =>
    Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, "0");
  return `#${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`;
}

function textColorOfNode(node: Node, root: HTMLElement): string | undefined {
  let el: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement;
  while (el && el !== root) {
    const color = normalizeTextColor(el.style.color || "");
    if (color) return color;
    el = el.parentElement;
  }
  return undefined;
}

function reconcileInline(container: HTMLElement): InlineNode[] {
  const out: InlineNode[] = [];
  function walk(node: ChildNode) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || "").replace(/​/g, "");
      if (text.length) {
        const marks = marksOfNode(node, container);
        const color = textColorOfNode(node, container);
        out.push({
          type: "text",
          text,
          ...(marks.length ? { marks } : {}),
          ...(color ? { color } : {}),
        });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.classList.contains("rle-math")) {
      out.push({ type: "math", tex: el.dataset.tex || "" });
      return;
    }
    if (el.classList.contains("rle-imginline")) {
      out.push({
        type: "image_inline",
        figure_id: normalizedFigureId(el.dataset.figureId || ""),
      });
      return;
    }
    if (el.tagName === "BR") {
      out.push({ type: "hard_break" });
      return;
    }
    el.childNodes.forEach(walk);
  }
  container.childNodes.forEach(walk);
  const merged: InlineNode[] = [];
  out.forEach((n) => {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.type === "text" &&
      n.type === "text" &&
      JSON.stringify(prev.marks || []) === JSON.stringify(n.marks || []) &&
      prev.color === n.color
    ) {
      prev.text += n.text;
    } else merged.push(n);
  });
  return merged.length ? merged : [{ type: "text", text: "" }];
}

// Ô % của cụm zoom được chèn qua innerHTML (không do React dựng) — cả
// onChange lẫn onInput của React đều im lặng bỏ qua nó (cơ chế theo dõi giá
// trị của React chỉ gắn được cho input chính React render ra). Gắn thẳng
// listener gốc, không qua hệ thống sự kiện của React, mới chắc ăn.
function wireImageZoomInputs(
  container: HTMLElement,
  onLiveInput: (input: HTMLInputElement) => void,
  onCommit: (input: HTMLInputElement) => void,
) {
  container
    .querySelectorAll<HTMLInputElement>(".rle-iz-input")
    .forEach((input) => {
      if (input.dataset.wired === "1") return;
      input.dataset.wired = "1";
      // Gõ dở (vd "3" trên đường tới "30") không kẹp/ghi đè input.value ngay —
      // ghi đè giữa chừng sẽ tự phá số đang gõ. Chỉ áp xem trước lên ảnh.
      input.addEventListener("input", () => onLiveInput(input));
      // Kẹp về [5,90] + chốt lại đúng lúc rời ô (Tab/click ra ngoài/Enter).
      input.addEventListener("blur", () => onCommit(input));
    });
}

function reconcileBlocks(surface: HTMLElement): BlockNode[] {
  const blocks: BlockNode[] = [];
  const anchoredImageIds = new Set(
    Array.from(
      surface.querySelectorAll<HTMLElement>(":scope > .rle-image-anchor"),
    ).map((anchor) => anchor.dataset.figureId || ""),
  );
  surface.querySelectorAll(":scope > *").forEach((elRaw) => {
    const el = elRaw as HTMLElement;
    if (el.classList.contains("rle-p")) {
      const align = (el.style.textAlign || getComputedStyle(el).textAlign) as
        | "left"
        | "center"
        | "right"
        | "justify"
        | "";
      blocks.push({
        type: "paragraph",
        content: reconcileInline(el),
        ...(align && align !== "left" ? { align } : {}),
      });
    } else if (el.classList.contains("rle-mathblock")) {
      blocks.push({ type: "math_block", tex: el.dataset.tex || "" });
    } else if (el.classList.contains("rle-image-anchor")) {
      blocks.push({
        type: "image",
        figure_id: normalizedFigureId(el.dataset.figureId || ""),
      });
    } else if (
      el.classList.contains("rle-image") &&
      !anchoredImageIds.has(el.dataset.figureId || "")
    ) {
      blocks.push({
        type: "image",
        figure_id: normalizedFigureId(el.dataset.figureId || ""),
      });
    } else if (el.tagName === "OL" || el.tagName === "UL") {
      const items = Array.from(el.children).map((li) => [
        {
          type: "paragraph" as const,
          content: reconcileInline(li as HTMLElement),
          ...((li as HTMLElement).style.textAlign &&
          (li as HTMLElement).style.textAlign !== "left"
            ? {
                align: (li as HTMLElement).style.textAlign as
                  | "center"
                  | "right"
                  | "justify",
              }
            : {}),
        },
      ]);
      blocks.push({ type: "list", ordered: el.tagName === "OL", items });
    } else if (el.tagName === "TABLE") {
      const table = el as HTMLTableElement;
      const rows = Array.from(table.querySelectorAll(":scope > tbody > tr")).map((tr) =>
        Array.from(tr.children).map((td) => {
          const cell = td as HTMLTableCellElement;
          return {
            content: reconcileInline(cell),
            ...(cell.colSpan > 1 ? { colspan: cell.colSpan } : {}),
            ...(cell.rowSpan > 1 ? { rowspan: cell.rowSpan } : {}),
          };
        }),
      );
      const rawWidths = Array.from(table.querySelectorAll(":scope > colgroup > col")).map(
        (column) => Number.parseFloat((column as HTMLTableColElement).style.width) / 100,
      );
      const totalWidth = rawWidths.reduce((total, width) => total + width, 0);
      const rowHeights = Array.from(table.rows).map((row) => Number(row.dataset.height || 0));
      blocks.push({
        type: "table",
        rows,
        ...(rawWidths.length && totalWidth > 0
          ? { widths: rawWidths.map((width) => width / totalWidth) }
          : {}),
        ...(rowHeights.some(Boolean)
          ? { row_heights: rowHeights.map((height) => height || 32) }
          : {}),
      });
    } else if (el.classList.contains("rle-columns")) {
      const columns = Array.from(
        el.querySelectorAll<HTMLElement>(":scope > .rle-column"),
      ).map((column) => ({
        width:
          Number(
            column.querySelector<HTMLInputElement>(
              ":scope > .rle-column-head .rle-column-width",
            )?.value || Number(column.dataset.width || 1) * 100,
          ) / 100,
        align: (column.dataset.align || "left") as "left" | "center" | "right",
        valign: (column.dataset.valign || "top") as "top" | "center" | "bottom",
        content: reconcileBlocks(column),
      }));
      blocks.push({
        type: "columns",
        columns,
        gap: Number(el.dataset.gap || 0),
      });
    } else if (el.tagName === "PRE") {
      blocks.push({
        type: "code_block",
        text: el.textContent || "",
        lang: el.dataset.lang || "",
      });
    }
  });
  return blocks;
}

/**
 * contenteditable không đảm bảo dùng cùng một tag giữa các trình duyệt:
 * Enter/paste có thể sinh DIV, SPAN, BR hoặc text node trực tiếp ở cấp surface.
 * Chuẩn hóa chúng về paragraph trước khi đọc TreeDoc để nội dung không bị bỏ qua.
 */
function normalizeEditableBlocks(surface: HTMLElement) {
  const isKnownTopLevel = (element: HTMLElement) =>
    element.matches(
      "p.rle-p, .rle-mathblock, .rle-image, .rle-image-anchor, .rle-columns, ol, ul, table, pre",
    );

  Array.from(surface.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!(node.textContent || "").replace(/\u200b/g, "").length) {
        node.remove();
        return;
      }
      const paragraph = document.createElement("p");
      paragraph.className = "rle-p";
      paragraph.style.textAlign = "justify";
      node.replaceWith(paragraph);
      paragraph.append(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    if (isKnownTopLevel(element)) return;

    const paragraph = document.createElement("p");
    paragraph.className = "rle-p";
    paragraph.style.textAlign = element.style.textAlign || "justify";
    if (element.tagName === "BR") {
      element.replaceWith(paragraph);
      paragraph.append(element);
    }
    else {
      while (element.firstChild) paragraph.append(element.firstChild);
      element.replaceWith(paragraph);
    }
  });
}

function reconcileDoc(surface: HTMLElement, side: "right" | "center"): TreeDoc {
  normalizeEditableBlocks(surface);
  const blocks = reconcileBlocks(surface);
  const doc: TreeDoc = {
    type: "doc",
    content: blocks.length ? blocks : emptyDoc().content,
  };
  // schema.py từ chối side:"center" ghi tường minh (đó là mặc định) — chỉ
  // gắn `side` khi thật sự trôi phải.
  if (side === "right") doc.side = "right";
  return doc;
}

const IconFloatRight = () => (
  <svg
    viewBox="0 0 16 16"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
  >
    <rect x="9" y="2" width="5" height="5" rx="0.5" />
    <line x1="2" y1="3" x2="7" y2="3" />
    <line x1="2" y1="5.5" x2="7" y2="5.5" />
    <line x1="2" y1="9" x2="14" y2="9" />
    <line x1="2" y1="11.5" x2="14" y2="11.5" />
    <line x1="2" y1="14" x2="10" y2="14" />
  </svg>
);
const IconCentered = () => (
  <svg
    viewBox="0 0 16 16"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
  >
    <line x1="2" y1="2.5" x2="14" y2="2.5" />
    <line x1="2" y1="5" x2="14" y2="5" />
    <rect x="5.5" y="7" width="5" height="4" rx="0.5" />
    <line x1="2" y1="12.5" x2="14" y2="12.5" />
    <line x1="2" y1="15" x2="14" y2="15" />
  </svg>
);

type ToolbarIconName =
  | "image"
  | "ordered-list"
  | "bullet-list"
  | "table"
  | "code"
  | "row-add"
  | "row-delete"
  | "column-add"
  | "column-delete"
  | "merge-right"
  | "split-horizontal"
  | "merge-down"
  | "split-vertical"
  | "align-left"
  | "align-center"
  | "align-right"
  | "align-justify";

const ToolbarIcon = ({ name }: { name: ToolbarIconName }) => {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.25,
    strokeLinecap: "square" as const,
    strokeLinejoin: "miter" as const,
  };
  let content: React.ReactNode;
  if (name === "image")
    content = <><rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 18 5-5 3 3 2-2 6 6"/></>;
  else if (name === "ordered-list")
    content = <><path d="M9 6h12M9 12h12M9 18h12"/><text x="3.9" y="8.1" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="Arial, sans-serif">1</text><text x="3.9" y="14.1" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="Arial, sans-serif">2</text><text x="3.9" y="20.1" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.5" fontFamily="Arial, sans-serif">3</text></>;
  else if (name === "bullet-list")
    content = <><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/><path d="M9 6h12M9 12h12M9 18h12"/></>;
  else if (name === "table")
    content = <><rect x="3" y="3" width="18" height="18"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><path d="M3 3h18v6H3z" fill="var(--accent-primary-soft)" stroke="var(--accent-primary)"/></>;
  else if (name === "code")
    content = <><path d="m9 7-5 5 5 5M15 7l5 5-5 5M13 4l-2 16"/></>;
  else if (name === "row-add" || name === "row-delete")
    content = <><rect x="3" y="4" width="15" height="16"/><path d="M3 9.3h15M3 14.7h15"/><rect x="3" y="9.3" width="15" height="5.4" fill="var(--accent-primary-soft)" stroke="var(--accent-primary)"/>{name === "row-add" ? <><path d="M21 4v7M18.5 8.5 21 11l2.5-2.5" stroke="var(--accent-primary)"/></> : <><path d="m18.5 7 5 5m0-5-5 5" stroke="#d13438" strokeWidth="1.7"/></>}</>;
  else if (name === "column-add" || name === "column-delete")
    content = <><rect x="4" y="3" width="16" height="15"/><path d="M9.3 3v15M14.7 3v15"/><rect x="9.3" y="3" width="5.4" height="15" fill="var(--accent-primary-soft)" stroke="var(--accent-primary)"/>{name === "column-add" ? <><path d="M13 21h7M17.5 18.5 20 21l-2.5 2.5" stroke="var(--accent-primary)"/></> : <><path d="m14.5 18.5 5 5m0-5-5 5" stroke="#d13438" strokeWidth="1.7"/></>}</>;
  else if (name === "merge-right")
    content = <><rect x="3" y="4" width="18" height="16"/><path d="M12 4v16M7 12h10m-3-3 3 3-3 3"/></>;
  else if (name === "split-horizontal")
    content = <><rect x="3" y="4" width="18" height="16"/><path d="M12 4v16M9 12H5m0 0 2-2m-2 2 2 2M15 12h4m0 0-2-2m2 2-2 2"/></>;
  else if (name === "merge-down")
    content = <><rect x="4" y="3" width="16" height="18"/><path d="M4 12h16M12 7v10m-3-3 3 3 3-3"/></>;
  else if (name === "split-vertical")
    content = <><rect x="4" y="3" width="16" height="18"/><path d="M4 12h16M12 9V5m0 0-2 2m2-2 2 2M12 15v4m0 0-2-2m2 2 2-2"/></>;
  else {
    const widths = name === "align-left" ? [16,10,16,12] : name === "align-center" ? [16,10,16,12] : name === "align-right" ? [16,10,16,12] : [16,16,16,16];
    const starts = name === "align-center" ? widths.map((width) => 12 - width / 2) : name === "align-right" ? widths.map((width) => 20 - width) : widths.map(() => 4);
    content = <>{widths.map((width, index) => <path key={index} strokeWidth="1.45" d={`M${starts[index]} ${5.5 + index * 4.3}h${width}`}/>)}</>;
  }
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...common}>{content}</svg>;
};

type MathEditState =
  | { mode: "new"; isBlock: boolean; savedRange: Range | null }
  | { mode: "edit"; el: HTMLElement; isBlock: boolean };

export default function RichLatexEditor({
  content,
  onChange,
  placeholder,
  imageEditable = false,
  images = [],
  minHeight,
  maxHeight,
  onImageWidthChange,
  questionId,
  importJobId,
  allowPendingImage = false,
  showLayoutControl = false,
  layoutType,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textColorInputRef = useRef<HTMLInputElement>(null);
  const textColorRangeRef = useRef<Range | null>(null);
  const seeded = useRef(false);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  // Cụm % của ảnh được gắn qua addEventListener gốc, MỘT LẦN lúc chèn/mount
  // (không qua React) — nếu closure của listener đó tham chiếu THẲNG một
  // hàm/prop nào khác (như onImageWidthChange), nó sẽ ĐÓNG BĂNG mãi mãi
  // đúng bản của lần render lúc gắn, dù QuestionEditor có render lại bao
  // nhiêu lần sau đó với qData mới hơn — mọi lần gọi tiếp theo vẫn cứ dùng
  // qData CŨ (giống hệt bug "2 callback rời đè nhau" nhưng ở dạng khác: ở
  // đây là do KHÔNG BAO GIỜ cập nhật, không phải đè lẫn nhau). Bọc trong ref,
  // cập nhật mỗi lần render, để listener luôn gọi TỚI bản mới nhất.
  const onImageWidthChangeRef = useRef(onImageWidthChange);
  onImageWidthChangeRef.current = onImageWidthChange;
  const [isFocused, setIsFocused] = useState(false);
  const [textColor, setTextColor] = useState("#000000");
  const [toolbarState, setToolbarState] = useState({
    bold: false,
    italic: false,
    underline: false,
    highlight: false,
    textColor: null as string | null,
    ordered: false,
    bullet: false,
    alignment: "justify" as "left" | "center" | "right" | "justify",
  });
  const [isEmpty, setIsEmpty] = useState(() => isDocEmpty(content));
  const [hasImage, setHasImage] = useState(() =>
    (content?.content ?? []).some(blockHasImage),
  );
  const [side, setSide] = useState<"right" | "center">(() =>
    content?.side === "right" || (layoutType || "").startsWith("immini")
      ? "right"
      : "center",
  );
  const sideRef = useRef(side);
  sideRef.current = side;
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setPortalTarget(document.body), []);

  const [editingMath, setEditingMath] = useState<MathEditState | null>(null);
  const [tableDialog, setTableDialog] = useState<{
    rows: string;
    columns: string;
    savedRange: Range | null;
  } | null>(null);
  const [tempMathVal, setTempMathVal] = useState("");
  const [editingImg, setEditingImg] = useState<{
    el: HTMLElement;
    src: string;
  } | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const activeTableCellRef = useRef<HTMLTableCellElement | null>(null);
  const [hasActiveTableCell, setHasActiveTableCell] = useState(false);
  const selectTableCell = (cell: HTMLTableCellElement | null) => {
    activeTableCellRef.current = cell;
    setHasActiveTableCell(!!cell);
  };

  // Seed DOM từ `content` CHỈ MỘT LẦN mỗi lần mount (giống đúng cơ chế
  // `initialized.current` của bản cũ) — chuyển sang câu/phương án khác phải
  // đi qua remount (key khác ở nơi gọi), không tự reseed giữa chừng, nếu
  // không sẽ đè mất nội dung đang gõ dở mỗi khi cha re-render.
  useEffect(() => {
    if (!surfaceRef.current || seeded.current) return;
    seeded.current = true;
    surfaceRef.current.innerHTML = renderDocForEdit(
      content || emptyDoc(),
      images,
      imageEditable,
    );
    wireImageZoomInputs(
      surfaceRef.current,
      handleImageZoomLiveInput,
      handleImageCmd,
    );
    queueTypeset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = useCallback(
    (newImage?: EditorImage) => {
      if (!surfaceRef.current) return;
      const doc = reconcileDoc(surfaceRef.current, sideRef.current);
      setIsEmpty(isDocEmpty(doc));
      setHasImage(doc.content.some(blockHasImage));
      onChange(doc, newImage);
    },
    [onChange],
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Gõ trực tiếp vào ô % (input được chèn qua innerHTML, không do React quản
  // lý) — onChange của React dựa vào cơ chế theo dõi giá trị riêng chỉ gắn
  // được cho input do chính React dựng, nên KHÔNG BAO GIỜ bắn với input kiểu
  // này (im lặng, không lỗi) dù sự kiện 'change' gốc vẫn nổ và bubble bình
  // thường. Bắt qua onInput (đã dùng cho gõ chữ) thay vì onChange.
  const handleInput = (event: React.FormEvent<HTMLDivElement>) => {
    const target = event.target as HTMLInputElement;
    if (target.classList?.contains("rle-column-width")) {
      const group = target.closest<HTMLElement>(".rle-columns");
      const inputs = Array.from(
        group?.querySelectorAll<HTMLInputElement>(".rle-column-width") || [],
      );
      let value = Math.max(5, Math.min(95, Number(target.value) || 50));
      if (inputs.length === 2) {
        const other = inputs.find((input) => input !== target)!;
        other.value = String(100 - value);
      }
      if (group)
        group.style.gridTemplateColumns = inputs
          .map((input) => `${input.value}%`)
          .join(" ");
    }

    // Placeholder phải phản hồi ngay khi gõ/xóa. Việc báo nội dung lên component
    // cha vẫn debounce bên dưới, nhưng không để trạng thái hiển thị chờ 400 ms.
    if (surfaceRef.current) {
      setIsEmpty(
        isDocEmpty(reconcileDoc(surfaceRef.current, sideRef.current)),
      );
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      commit();
    }, 400);
  };
  const handleBlur = () => {
    // Đổi sang tab Chrome cũng làm contenteditable phát `blur`. Trước đây
    // blur luôn commit dù DOM không đổi, tạo TreeDoc mới và khiến preview đề
    // bị hiểu nhầm là "Thông tin chung" vừa thay đổi rồi phân trang lại.
    // Chỉ chốt sớm nếu thật sự còn một lượt input đang chờ debounce.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      commit();
    }
    if (!surfaceRef.current?.contains(document.activeElement))
      setIsFocused(false);
  };

  // Quirk contenteditable: chọn hết rồi gõ/xoá có thể để lại DOM hỏng khi
  // selection trải qua nhiều atom — chặn lại, tự dựng nội dung mới sạch.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    const anchorElement =
      selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? (selection.anchorNode as HTMLElement)
        : selection?.anchorNode?.parentElement;
    const codeBlock = anchorElement?.closest("pre.rle-code") as HTMLElement | null;
    const listItem = anchorElement?.closest("li") as HTMLLIElement | null;
    const isVisuallyEmpty = (element: HTMLElement) =>
      !(element.textContent || "").replace(/\u200b/g, "").trim();

    if (
      e.key === "Backspace" &&
      listItem &&
      selection?.isCollapsed &&
      isVisuallyEmpty(listItem)
    ) {
      e.preventDefault();
      const list = listItem.parentElement as HTMLOListElement | HTMLUListElement;
      const paragraph = document.createElement("p");
      paragraph.className = "rle-p";
      paragraph.append(document.createElement("br"));

      // Nếu thoát ở giữa danh sách, giữ các mục sau trong một danh sách mới.
      const followingItems: HTMLLIElement[] = [];
      let sibling = listItem.nextElementSibling as HTMLLIElement | null;
      while (sibling) {
        const next = sibling.nextElementSibling as HTMLLIElement | null;
        followingItems.push(sibling);
        sibling = next;
      }
      const trailingList = followingItems.length
        ? (list.cloneNode(false) as HTMLOListElement | HTMLUListElement)
        : null;
      followingItems.forEach((item) => trailingList?.append(item));
      listItem.remove();
      if (list.children.length) list.after(paragraph);
      else list.replaceWith(paragraph);
      if (trailingList) paragraph.after(trailingList);

      const paragraphRange = document.createRange();
      paragraphRange.setStart(paragraph, 0);
      paragraphRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(paragraphRange);
      commit();
      return;
    }

    const exitedListParagraph = anchorElement?.closest(
      "p.rle-p",
    ) as HTMLParagraphElement | null;
    if (
      e.key === "Backspace" &&
      exitedListParagraph &&
      selection?.isCollapsed &&
      isVisuallyEmpty(exitedListParagraph)
    ) {
      const previousList = exitedListParagraph.previousElementSibling;
      const previousItem = previousList?.matches("ol, ul")
        ? (previousList.lastElementChild as HTMLLIElement | null)
        : null;
      if (previousItem) {
        e.preventDefault();
        exitedListParagraph.remove();
        const previousRange = document.createRange();
        previousRange.selectNodeContents(previousItem);
        previousRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(previousRange);
        commit();
        return;
      }
    }
    const leaveCodeBlock = () => {
      if (!codeBlock) return;
      let paragraph = codeBlock.nextElementSibling as HTMLElement | null;
      if (!paragraph?.matches("p.rle-p")) {
        paragraph = document.createElement("p");
        paragraph.className = "rle-p";
        paragraph.textContent = "​";
        codeBlock.after(paragraph);
      }
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
      commit();
    };
    if (codeBlock && e.key === "Tab") {
      e.preventDefault();
      document.execCommand("insertText", false, "  ");
      commit();
      return;
    }
    if (
      codeBlock &&
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.altKey
    ) {
      e.preventDefault();
      leaveCodeBlock();
      return;
    }
    if (codeBlock && e.key === "Escape") {
      e.preventDefault();
      leaveCodeBlock();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const surface = surfaceRef.current;
    if (!surface) return;
    const withinAll =
      range.toString().length >= (surface.textContent || "").length;
    if (!withinAll) return;
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      surface.innerHTML = `<p class="rle-p">​</p>`;
      commit();
    } else if (e.key.length === 1) {
      e.preventDefault();
      surface.innerHTML = `<p class="rle-p">${escapeHtml(e.key)}</p>`;
      const p = surface.querySelector("p");
      if (p) {
        const r = document.createRange();
        r.selectNodeContents(p);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      commit();
    }
  };

  const ensureFocus = () => {
    const surface = surfaceRef.current;
    if (!surface) return;
    if (document.activeElement !== surface) {
      surface.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount === 0) {
        const r = document.createRange();
        r.selectNodeContents(surface);
        r.collapse(false);
        sel.addRange(r);
      }
    }
  };

  const focusParagraphAfter = (block: HTMLElement) => {
    let paragraph = block.nextElementSibling as HTMLParagraphElement | null;
    if (!paragraph?.matches("p.rle-p")) {
      paragraph = document.createElement("p");
      paragraph.className = "rle-p";
      paragraph.style.textAlign = "justify";
      paragraph.append(document.createElement("br"));
      block.after(paragraph);
    } else if (!paragraph.childNodes.length) {
      paragraph.append(document.createElement("br"));
    }
    surfaceRef.current?.focus({ preventScroll: true });
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(paragraph, 0);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return paragraph;
  };

  const refreshToolbarState = () => {
    const selection = window.getSelection();
    if (!selection?.anchorNode || !surfaceRef.current?.contains(selection.anchorNode))
      return;
    const state = (command: string) => {
      try {
        return document.queryCommandState(command);
      } catch {
        return false;
      }
    };
    let highlight = false;
    try {
      const color = String(
        document.queryCommandValue("hiliteColor") ||
          document.queryCommandValue("backColor") ||
          "",
      ).replace(/\s+/g, "").toLowerCase();
      // Chrome trả về màu nền mặc định (thường rgb(255,255,255)) ngay cả khi
      // caret ở paragraph trống. Chỉ màu vàng chuẩn của editor mới là highlight.
      highlight =
        color === "#fff3a3" ||
        color === "rgb(255,243,163)" ||
        color === "rgba(255,243,163,1)";
    } catch {
      /* noop */
    }
    const anchorElement =
      selection.anchorNode.nodeType === Node.ELEMENT_NODE
        ? (selection.anchorNode as HTMLElement)
        : selection.anchorNode.parentElement;
    const activeBlock = anchorElement?.closest("p, li") as HTMLElement | null;
    const activeTextColor = textColorOfNode(
      selection.anchorNode,
      surfaceRef.current,
    ) || null;
    setTextColor(activeTextColor || "#000000");
    const computedAlignment = activeBlock
      ? getComputedStyle(activeBlock).textAlign
      : "justify";
    setToolbarState({
      bold: state("bold"),
      italic: state("italic"),
      underline: state("underline"),
      highlight,
      textColor: activeTextColor,
      ordered: state("insertOrderedList"),
      bullet: state("insertUnorderedList"),
      alignment: state("justifyFull")
        ? "justify"
        : state("justifyCenter")
          ? "center"
          : state("justifyRight")
            ? "right"
            : computedAlignment === "justify"
              ? "justify"
              : computedAlignment === "center"
                ? "center"
                : computedAlignment === "right"
                  ? "right"
                  : "left",
    });
  };

  const applyMark = (cmd: "bold" | "italic" | "underline") => {
    ensureFocus();
    document.execCommand(cmd);
    refreshToolbarState();
    commit();
  };

  const applyAlignment = (
    alignment: "left" | "center" | "right" | "justify",
  ) => {
    ensureFocus();
    const surface = surfaceRef.current;
    const selection = window.getSelection();
    if (!surface || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const anchor = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as HTMLElement)
      : range.startContainer.parentElement;
    const blocks = Array.from(
      surface.querySelectorAll<HTMLElement>("p.rle-p, li"),
    ).filter((block) =>
      selection.isCollapsed
        ? block === anchor?.closest("p.rle-p, li")
        : range.intersectsNode(block),
    );

    // Chỉ đổi thuộc tính của block; execCommand(justify*) có thể tách các atom
    // contenteditable=false (đặc biệt inline math) khỏi paragraph và làm chúng
    // nhảy xuống dòng dù người dùng chỉ yêu cầu đổi căn lề.
    blocks.forEach((block) => {
      block.style.textAlign = alignment;
      if (block.tagName === "P") block.classList.add("rle-p");
    });
    setToolbarState((current) => ({ ...current, alignment }));
    commit();
  };

  const toggleHighlight = () => {
    ensureFocus();
    try {
      document.execCommand("styleWithCSS", false, "true" as any);
    } catch {
      /* noop */
    }
    let v = "";
    try {
      v = String(
        document.queryCommandValue("hiliteColor") ||
          document.queryCommandValue("backColor") ||
          "",
      );
    } catch {
      /* noop */
    }
    const isOn = v.replace(/\s+/g, "").toLowerCase().includes("255,243,163");
    if (isOn) {
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const surface = surfaceRef.current;
      let removed = false;
      if (range && surface) {
        // `hiliteColor: transparent` vẫn để lại thẻ <mark>; reconcile sẽ đọc
        // thẻ đó thành highlight lần nữa. Bỏ chính wrapper/style nền đang giao
        // với vùng chọn để định dạng thực sự được tắt.
        surface.querySelectorAll<HTMLElement>("mark, [style*='background']")
          .forEach((element) => {
            if (!range.intersectsNode(element)) return;
            if (element.tagName === "MARK") {
              element.replaceWith(...Array.from(element.childNodes));
              removed = true;
            } else {
              element.style.removeProperty("background");
              element.style.removeProperty("background-color");
              if (!element.getAttribute("style")) element.removeAttribute("style");
              removed = true;
            }
          });
      }
      if (!removed)
        document.execCommand("hiliteColor", false, "rgba(0, 0, 0, 0)");
    } else {
      document.execCommand("hiliteColor", false, "#fff3a3");
    }
    refreshToolbarState();
    commit();
  };

  // ---------- công thức: MỘT nút chèn, chọn "trong dòng"/"khối riêng" ngay
  // trong modal — không chèn gì vào DOM cho tới khi bấm "Xác nhận" (Hủy thì
  // không để lại atom rác, khác bản cũ). ----------
  const rememberTextColorRange = () => {
    const selection = window.getSelection();
    textColorRangeRef.current =
      selection?.rangeCount && surfaceRef.current?.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null;
  };

  const applyTextColor = (color: string) => {
    const normalized = normalizeTextColor(color);
    if (!normalized) return;
    setTextColor(normalized);
    ensureFocus();
    const selection = window.getSelection();
    const savedRange = textColorRangeRef.current;
    if (
      selection &&
      savedRange &&
      surfaceRef.current?.contains(savedRange.commonAncestorContainer)
    ) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }
    try {
      document.execCommand("styleWithCSS", false, "true" as any);
    } catch {
      /* noop */
    }
    document.execCommand("foreColor", false, normalized);
    textColorRangeRef.current = null;
    refreshToolbarState();
    setToolbarState((current) => ({ ...current, textColor: normalized }));
    setTextColor(normalized);
    commit();
  };

  const insertMath = () => {
    const sel = window.getSelection();
    let range: Range | null = null;
    if (
      sel &&
      sel.rangeCount > 0 &&
      surfaceRef.current?.contains(sel.anchorNode)
    ) {
      range = sel.getRangeAt(0).cloneRange();
    }
    setTempMathVal("");
    setEditingMath({ mode: "new", isBlock: false, savedRange: range });
  };

  const insertList = (ordered: boolean) => {
    ensureFocus();
    document.execCommand(ordered ? "insertOrderedList" : "insertUnorderedList");
    // Gắn class cho cả list cấp cao do trình duyệt tạo. Trước đây chỉ list
    // bị Chrome lồng trong .rle-p mới được gắn class, nên list cấp cao vẫn
    // dùng CSS mặc định và marker dính sát mép trái editor.
    surfaceRef.current
      ?.querySelectorAll("ol, ul")
      .forEach((list) => list.classList.add("rle-list"));
    // Chrome nhét <ul>/<ol> vào TRONG <p class="rle-p"> đang có sẵn thay vì
    // thay hẳn nó — đẩy list ra làm khối ngang hàng để reconcile() nhận đúng.
    surfaceRef.current
      ?.querySelectorAll(".rle-p > ul, .rle-p > ol")
      .forEach((list) => {
        list.classList.add("rle-list");
        list.parentElement?.replaceWith(list);
      });
    refreshToolbarState();
    commit();
  };

  const insertTable = () => {
    const selection = window.getSelection();
    const savedRange =
      selection &&
      selection.rangeCount > 0 &&
      surfaceRef.current?.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null;
    setTableDialog({ rows: "2", columns: "2", savedRange });
  };

  const confirmInsertTable = () => {
    if (!tableDialog) return;
    const rowCount = Number(tableDialog.rows);
    const colCount = Number(tableDialog.columns);
    if (
      !Number.isInteger(rowCount) ||
      !Number.isInteger(colCount) ||
      rowCount < 1 ||
      colCount < 1 ||
      rowCount > 30 ||
      colCount > 20
    ) {
      toast.error("Số hàng phải từ 1–30 và số cột phải từ 1–20.");
      return;
    }
    ensureFocus();
    if (tableDialog.savedRange) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(tableDialog.savedRange);
    }
    const rows = Array.from(
      { length: rowCount },
      () => `<tr>${Array.from({ length: colCount }, () => "<td>​</td>").join("")}</tr>`,
    ).join("");
    const columns = `<colgroup>${Array.from(
      { length: colCount },
      () => `<col style="width:${100 / colCount}%">`,
    ).join("")}</colgroup>`;
    // onMouseDown của nút toolbar giữ nguyên selection trong contenteditable;
    // insertHTML vì vậy chèn bảng tại caret thay vì luôn append xuống cuối.
    const existingTables = new Set(
      surfaceRef.current?.querySelectorAll("table.rle-table") || [],
    );
    document.execCommand(
      "insertHTML",
      false,
      `<table class="rle-table">${columns}<tbody>${rows}</tbody></table><p class="rle-p">​</p>`,
    );
    const insertedTable = Array.from(
      surfaceRef.current?.querySelectorAll<HTMLElement>("table.rle-table") || [],
    ).find((table) => !existingTables.has(table));
    if (insertedTable) focusParagraphAfter(insertedTable);
    setTableDialog(null);
    commit();
  };

  const editTable = (command: "add-row" | "delete-row" | "add-column" | "delete-column" | "merge-right" | "split-horizontal" | "merge-down" | "split-vertical") => {
    const cell = activeTableCellRef.current;
    const row = cell?.parentElement as HTMLTableRowElement | null;
    const table = cell?.closest("table") as HTMLTableElement | null;
    if (!cell || !row || !table || !surfaceRef.current?.contains(table)) return;
    const rowIndex = row.rowIndex;
    const buildGrid = () => {
      const grid: HTMLTableCellElement[][] = [];
      Array.from(table.rows).forEach((tableRow, r) => {
        grid[r] ||= [];
        let col = 0;
        Array.from(tableRow.cells).forEach((tableCell) => {
          while (grid[r][col]) col += 1;
          for (let rr = r; rr < r + tableCell.rowSpan; rr++) {
            grid[rr] ||= [];
            for (let cc = col; cc < col + tableCell.colSpan; cc++)
              grid[rr][cc] = tableCell;
          }
          col += tableCell.colSpan;
        });
      });
      return grid;
    };
    if (command === "add-row") {
      const grid = buildGrid();
      const insertAt = rowIndex + 1;
      const width = Math.max(...grid.map((gridRow) => gridRow.length));
      const newRow = table.insertRow(insertAt);
      const extended = new Set<HTMLTableCellElement>();
      let col = 0;
      while (col < width) {
        const covering = grid[insertAt]?.[col];
        const originRow = covering?.parentElement as HTMLTableRowElement | null;
        if (covering && originRow && originRow.rowIndex < insertAt) {
          if (!extended.has(covering)) {
            covering.rowSpan += 1;
            extended.add(covering);
          }
          col += covering.colSpan;
        } else {
          newRow.insertCell().textContent = "​";
          col += 1;
        }
      }
      selectTableCell(newRow.cells[0] || cell);
    } else if (command === "delete-row") {
      if (table.rows.length === 1) {
        table.remove();
        selectTableCell(null);
      } else {
        const grid = buildGrid();
        const affected = Array.from(new Set(grid[rowIndex] || []));
        affected.forEach((affectedCell) => {
          const originRow = affectedCell.parentElement as HTMLTableRowElement;
          if (originRow.rowIndex < rowIndex) {
            affectedCell.rowSpan -= 1;
          } else if (affectedCell.rowSpan > 1) {
            const logicalCol = grid[rowIndex].findIndex((slot) => slot === affectedCell);
            const nextRow = table.rows[rowIndex + 1];
            affectedCell.rowSpan -= 1;
            const before = Array.from(nextRow.cells).find((candidate) =>
              grid[rowIndex + 1].findIndex((slot) => slot === candidate) > logicalCol,
            );
            nextRow.insertBefore(affectedCell, before || null);
          }
        });
        table.deleteRow(rowIndex);
        const nextRow = table.rows[Math.min(rowIndex, table.rows.length - 1)];
        selectTableCell(nextRow.cells[0] || null);
      }
    } else if (command === "add-column") {
      const grid = buildGrid();
      const logicalCol = grid[rowIndex].findIndex((slot) => slot === cell);
      const insertAt = logicalCol + cell.colSpan;
      let colgroup = table.querySelector(":scope > colgroup");
      if (!colgroup) {
        colgroup = document.createElement("colgroup");
        table.insertBefore(colgroup, table.firstChild);
        Array.from({ length: grid[0].length }, () => {
          const column = document.createElement("col");
          column.style.width = `${100 / grid[0].length}%`;
          colgroup!.append(column);
        });
      }
      const existingColumns = Array.from(colgroup.children) as HTMLTableColElement[];
      existingColumns.forEach((column) => {
        column.style.width = `${(Number.parseFloat(column.style.width) || 100 / existingColumns.length) * existingColumns.length / (existingColumns.length + 1)}%`;
      });
      const newColumn = document.createElement("col");
      newColumn.style.width = `${100 / (existingColumns.length + 1)}%`;
      colgroup.insertBefore(newColumn, colgroup.children[insertAt] || null);
      Array.from(table.rows).forEach((currentRow, r) => {
        const newCell = document.createElement("td");
        newCell.textContent = "​";
        const before = Array.from(currentRow.cells).find((candidate) =>
          grid[r].findIndex((slot) => slot === candidate) >= insertAt,
        );
        currentRow.insertBefore(newCell, before || null);
      });
      selectTableCell(cell);
    } else if (command === "delete-column") {
      const grid = buildGrid();
      const logicalCol = grid[rowIndex].findIndex((slot) => slot === cell);
      if (Math.max(...grid.map((gridRow) => gridRow.length)) === 1) {
        table.remove();
        selectTableCell(null);
      } else {
        const columns = Array.from(
          table.querySelectorAll<HTMLTableColElement>(":scope > colgroup > col"),
        );
        const removedWidth = Number.parseFloat(columns[logicalCol]?.style.width || "0");
        columns[logicalCol]?.remove();
        const remainingColumns = columns.filter((_, index) => index !== logicalCol);
        const remainingTotal = 100 - removedWidth;
        if (remainingTotal > 0) {
          remainingColumns.forEach((column) => {
            column.style.width = `${(Number.parseFloat(column.style.width) || 0) * 100 / remainingTotal}%`;
          });
        }
        const affected = new Set<HTMLTableCellElement>();
        grid.forEach((gridRow) => {
          const affectedCell = gridRow[logicalCol];
          if (!affectedCell || affected.has(affectedCell)) return;
          affected.add(affectedCell);
          if (affectedCell.colSpan > 1) affectedCell.colSpan -= 1;
          else affectedCell.remove();
        });
        const currentRow = table.rows[Math.min(rowIndex, table.rows.length - 1)];
        selectTableCell(currentRow.cells[0] || null);
      }
    } else if (command === "merge-right") {
      const next = cell.nextElementSibling as HTMLTableCellElement | null;
      if (!next) {
        toast.error("Ô hiện tại không có ô bên phải để gộp.");
        return;
      }
      cell.colSpan += next.colSpan;
      if ((next.textContent || "").replace(/​/g, "").trim()) {
        cell.append(document.createTextNode(" "));
        while (next.firstChild) cell.append(next.firstChild);
      }
      next.remove();
    } else if (command === "split-horizontal") {
      if (cell.colSpan <= 1) {
        toast.error("Ô hiện tại chưa được gộp theo chiều ngang.");
        return;
      }
      cell.colSpan -= 1;
      const newCell = document.createElement("td");
      newCell.textContent = "​";
      cell.after(newCell);
    } else if (command === "merge-down") {
      const grid = buildGrid();
      const logicalCol = grid[rowIndex].findIndex((slot) => slot === cell);
      const targetRow = rowIndex + cell.rowSpan;
      const below = grid[targetRow]?.[logicalCol];
      if (
        !below ||
        below.parentElement !== table.rows[targetRow] ||
        below.colSpan !== cell.colSpan
      ) {
        toast.error("Không có ô tương thích ngay bên dưới để gộp.");
        return;
      }
      cell.rowSpan += below.rowSpan;
      if ((below.textContent || "").replace(/​/g, "").trim()) {
        cell.append(document.createElement("br"));
        while (below.firstChild) cell.append(below.firstChild);
      }
      below.remove();
    } else if (command === "split-vertical") {
      if (cell.rowSpan <= 1) {
        toast.error("Ô hiện tại chưa được gộp theo chiều dọc.");
        return;
      }
      const grid = buildGrid();
      const logicalCol = grid[rowIndex].findIndex((slot) => slot === cell);
      const span = cell.rowSpan;
      cell.rowSpan = 1;
      for (let r = rowIndex + 1; r < rowIndex + span; r++) {
        const targetRow = table.rows[r];
        const newCell = document.createElement("td");
        newCell.textContent = "​";
        const before = Array.from(targetRow.cells).find((candidate) => {
          const candidateCol = grid[r].findIndex((slot) => slot === candidate);
          return candidateCol > logicalCol;
        });
        targetRow.insertBefore(newCell, before || null);
      }
    }
    commit();
  };

  const insertCodeBlock = () => {
    ensureFocus();
    const surface = surfaceRef.current;
    const selection = window.getSelection();
    if (!surface || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!surface.contains(range.commonAncestorContainer)) return;
    range.deleteContents();
    range.collapse(true);

    const anchor =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as HTMLElement)
        : range.startContainer.parentElement;
    const paragraph = anchor?.closest("p.rle-p") as HTMLParagraphElement | null;
    const code = document.createElement("pre");
    code.className = "rle-code";
    code.dataset.lang = "";
    code.textContent = "// nhập mã";
    const paragraphAfter = document.createElement("p");
    paragraphAfter.className = "rle-p";
    paragraphAfter.textContent = "​";

    if (paragraph && surface.contains(paragraph)) {
      // Không chèn <pre> trực tiếp vào trong <p>. HTML đó không hợp lệ và
      // Chrome sẽ tự sửa DOM theo cách khác nhau ở dòng đầu/dòng sau, gây
      // lặp nội dung khối mã. Tách đoạn tại con trỏ rồi đặt khối mã ở giữa.
      const tailRange = document.createRange();
      tailRange.selectNodeContents(paragraph);
      tailRange.setStart(range.startContainer, range.startOffset);
      const tail = tailRange.extractContents();
      if ((tail.textContent || "").replace(/\u200b/g, "").length || tail.childNodes.length) {
        paragraphAfter.replaceChildren(tail);
      }
      const paragraphIsEmpty = !(paragraph.textContent || "").replace(/\u200b/g, "").trim();
      if (paragraphIsEmpty) paragraph.replaceWith(code, paragraphAfter);
      else paragraph.after(code, paragraphAfter);
    } else {
      range.insertNode(paragraphAfter);
      range.insertNode(code);
    }

    const codeRange = document.createRange();
    codeRange.selectNodeContents(code);
    codeRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(codeRange);
    commit();
  };

  const chooseSide = (next: "right" | "center") => {
    setSide(next);
    sideRef.current = next;
    const surface = surfaceRef.current;
    surface
      ?.querySelectorAll(".rle-image:not(.rle-imginline)")
      .forEach((elRaw) => {
        const el = elRaw as HTMLElement;
        const figureId = el.dataset.figureId || "";
        let anchor = Array.from(
          surface.querySelectorAll<HTMLElement>(":scope > .rle-image-anchor"),
        ).find((candidate) => candidate.dataset.figureId === figureId);
        el.classList.remove("side-right", "side-center");
        el.classList.add(`side-${next}`);
        const pct = Math.min(
          100,
          Math.max(
            1,
            Number(el.querySelector<HTMLInputElement>(".rle-iz-input")?.value) || 100,
          ),
        );
        el.style.setProperty("--rle-image-width", `${pct}%`);
        if (next === "right") {
          if (!anchor) {
            anchor = document.createElement("span");
            anchor.className = "rle-image-anchor";
            anchor.contentEditable = "false";
            anchor.dataset.figureId = figureId;
            anchor.hidden = true;
            el.before(anchor);
          }
          // Vị trí tạm để float bao quanh cả chuỗi A → B. reconcileBlocks bỏ
          // qua ảnh này và ghi node image tại anchor nên TreeDoc không đổi thứ tự.
          surface.insertBefore(el, surface.firstChild);
        } else if (anchor) {
          // Trả ảnh về đúng mốc giữa hai đoạn rồi loại bỏ mốc tạm.
          anchor.replaceWith(el);
        }
      });
    commit();
  };

  // ---------- công thức: bấm atom -> mở lại đúng modal MathLiveEditor toàn màn hình ----------
  const handleSurfaceMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const tableCell = target.closest("td") as HTMLTableCellElement | null;
    selectTableCell(tableCell);
    if (tableCell) {
      const table = tableCell.closest("table") as HTMLTableElement;
      const rect = tableCell.getBoundingClientRect();
      const nearRight = Math.abs(e.clientX - rect.right) <= 7;
      const nearBottom = Math.abs(e.clientY - rect.bottom) <= 7;
      if (nearRight || nearBottom) {
        const grid: HTMLTableCellElement[][] = [];
        Array.from(table.rows).forEach((tableRow, rowIndex) => {
          grid[rowIndex] ||= [];
          let columnIndex = 0;
          Array.from(tableRow.cells).forEach((cell) => {
            while (grid[rowIndex][columnIndex]) columnIndex += 1;
            for (let row = rowIndex; row < rowIndex + cell.rowSpan; row++) {
              grid[row] ||= [];
              for (
                let column = columnIndex;
                column < columnIndex + cell.colSpan;
                column++
              )
                grid[row][column] = cell;
            }
            columnIndex += cell.colSpan;
          });
        });
        const originRow = tableCell.parentElement as HTMLTableRowElement;
        const logicalStart = grid[originRow.rowIndex].findIndex(
          (slot) => slot === tableCell,
        );
        const columns = Array.from(
          table.querySelectorAll<HTMLTableColElement>(":scope > colgroup > col"),
        );
        const boundaryColumn = logicalStart + tableCell.colSpan - 1;
        if (nearRight && boundaryColumn < columns.length - 1) {
          e.preventDefault();
          const tableWidth = table.getBoundingClientRect().width;
          const leftStart = Number.parseFloat(columns[boundaryColumn].style.width);
          const rightStart = Number.parseFloat(columns[boundaryColumn + 1].style.width);
          const pairTotal = leftStart + rightStart;
          const minPercent = Math.min(20, (48 / tableWidth) * 100);
          const startX = e.clientX;
          const onMove = (event: MouseEvent) => {
            const delta = ((event.clientX - startX) / tableWidth) * 100;
            const left = Math.max(
              minPercent,
              Math.min(pairTotal - minPercent, leftStart + delta),
            );
            columns[boundaryColumn].style.width = `${left}%`;
            columns[boundaryColumn + 1].style.width = `${pairTotal - left}%`;
          };
          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            commit();
          };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
          return;
        }
        if (nearBottom) {
          e.preventDefault();
          const resizedRow = table.rows[
            Math.min(originRow.rowIndex + tableCell.rowSpan - 1, table.rows.length - 1)
          ];
          const startY = e.clientY;
          const startHeight = resizedRow.getBoundingClientRect().height;
          const onMove = (event: MouseEvent) => {
            const height = Math.max(28, startHeight + event.clientY - startY);
            resizedRow.style.height = `${height}px`;
            resizedRow.dataset.height = String(Math.round(height));
          };
          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            commit();
          };
          document.body.style.cursor = "row-resize";
          document.body.style.userSelect = "none";
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
          return;
        }
      }
    }
    const mathEl = target.closest(
      ".rle-math, .rle-mathblock",
    ) as HTMLElement | null;
    if (mathEl) {
      e.preventDefault();
      setTempMathVal(mathEl.dataset.tex || "");
      setEditingMath({
        mode: "edit",
        el: mathEl,
        isBlock: mathEl.classList.contains("rle-mathblock"),
      });
      return;
    }
    // CHỈ chặn mousedown cho <button> (−/+/✂/✕) — nếu khớp luôn cả ô nhập %
    // (nó cũng có data-imgcmd), preventDefault() trên mousedown sẽ chặn mất
    // hành vi focus mặc định, làm ô nhập không bấm/gõ trực tiếp được nữa.
    const imgCmdBtn = target.closest(
      "button[data-imgcmd]",
    ) as HTMLElement | null;
    if (imgCmdBtn) {
      e.preventDefault();
      handleImageCmd(imgCmdBtn);
    }
  };

  const closeMathEditor = () => {
    const kbd = (window as any).mathVirtualKeyboard;
    if (kbd) {
      kbd.hide({ animate: false });
      kbd.container = null;
    }
    setEditingMath(null);
  };

  const saveMath = () => {
    if (!editingMath) return;
    const tex = tempMathVal.trim() || "x";
    if (editingMath.mode === "edit") {
      const { el, isBlock } = editingMath;
      el.dataset.tex = tex;
      el.innerHTML = isBlock
        ? wrapDisplayMath(escapeHtml(tex))
        : wrapInlineMath(escapeHtml(tex));
      queueTypeset();
    } else {
      ensureFocus();
      const selection = window.getSelection();
      if (editingMath.savedRange) {
        selection?.removeAllRanges();
        selection?.addRange(editingMath.savedRange);
      }
      const surface = surfaceRef.current;
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!surface || !range || !surface.contains(range.commonAncestorContainer))
        return;
      range.deleteContents();
      range.collapse(true);
      if (editingMath.isBlock) {
        const mathBlock = document.createElement("div");
        mathBlock.className = "rle-mathblock";
        mathBlock.contentEditable = "false";
        mathBlock.dataset.tex = tex;
        mathBlock.innerHTML = wrapDisplayMath(escapeHtml(tex));
        const paragraphAfter = document.createElement("p");
        paragraphAfter.className = "rle-p";
        paragraphAfter.append(document.createElement("br"));
        const anchor = range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as HTMLElement)
          : range.startContainer.parentElement;
        const paragraph = anchor?.closest("p.rle-p") as HTMLParagraphElement | null;

        if (paragraph && surface.contains(paragraph)) {
          const tailRange = document.createRange();
          tailRange.selectNodeContents(paragraph);
          tailRange.setStart(range.startContainer, range.startOffset);
          const tail = tailRange.extractContents();
          const hasTail = !!(tail.textContent || "").replace(/\u200b/g, "").trim() ||
            !!tail.querySelector?.(".rle-math, img, br");
          if (hasTail) paragraphAfter.replaceChildren(tail);
          const paragraphIsEmpty = !(paragraph.textContent || "")
            .replace(/\u200b/g, "").trim() && !paragraph.querySelector(".rle-math");
          if (paragraphIsEmpty) paragraph.replaceWith(mathBlock, paragraphAfter);
          else paragraph.after(mathBlock, paragraphAfter);
        } else {
          range.insertNode(paragraphAfter);
          range.insertNode(mathBlock);
        }
        const afterRange = document.createRange();
        afterRange.setStart(paragraphAfter, 0);
        afterRange.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(afterRange);
      } else {
        const mathInline = document.createElement("span");
        mathInline.className = "rle-math";
        mathInline.contentEditable = "false";
        mathInline.dataset.tex = tex;
        mathInline.innerHTML = wrapInlineMath(escapeHtml(tex));
        const caretSpacer = document.createTextNode("​");
        range.insertNode(caretSpacer);
        range.insertNode(mathInline);
        const afterRange = document.createRange();
        // Đặt caret BÊN TRONG text node editable sau atom. Nếu đặt ở boundary
        // sau node, Chrome có thể không tạo paragraph mới khi nhấn Enter ở cuối.
        afterRange.setStart(caretSpacer, caretSpacer.data.length);
        afterRange.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(afterRange);
      }
      queueTypeset();
    }
    closeMathEditor();
    commit();
  };

  const deleteMath = () => {
    if (editingMath?.mode === "edit") editingMath.el.remove();
    closeMathEditor();
    commit();
  };

  // ---------- ảnh: cụm nút cỡ + nút xoá/sửa ----------
  const handleImageCmd = (btn: HTMLElement) => {
    const card = btn.closest(".rle-image") as HTMLElement | null;
    if (!card) return;
    const figureId = card.dataset.figureId || "";
    const cmd = btn.dataset.imgcmd;

    if (cmd === "del") {
      surfaceRef.current
        ?.querySelectorAll<HTMLElement>(":scope > .rle-image-anchor")
        .forEach((anchor) => {
          if (anchor.dataset.figureId === figureId) anchor.remove();
        });
      card.remove();
      commit();
      return;
    }
    if (cmd === "edit") {
      const imgInfo = findImageInfo(figureId, imagesRef.current);
      if (imgInfo)
        setEditingImg({ el: card, src: resolveImgSrc(imgInfo.storage_path) });
      return;
    }
    if (cmd === "inc" || cmd === "dec" || cmd === "pct") {
      const imgInfo = findImageInfo(figureId, imagesRef.current);
      if (!imgInfo) return;
      const input = card.querySelector<HTMLInputElement>(".rle-iz-input");
      const imgEl = card.querySelector<HTMLImageElement>(".rle-image-img");
      let pct: number;
      if (cmd === "pct") {
        pct = parseInt(input?.value || "", 10) || 45;
      } else if (imgInfo.width) {
        pct = Math.round(imgInfo.width * 100);
      } else if (imgEl && imgEl.getBoundingClientRect().width > 0) {
        // width chưa từng lưu (NULL) -> ảnh đang hiện đúng cỡ GỐC, không phải
        // 45% mặc định của ô nhập — lấy đúng cỡ đang thấy làm mốc %, không
        // thì bấm +/− lần đầu sẽ nhảy cỡ đột ngột (từ gốc sang 45%).
        const availableWidth = surfaceRef.current?.clientWidth || card.clientWidth || 1;
        pct = Math.round((imgEl.getBoundingClientRect().width / availableWidth) * 100);
      } else {
        pct = parseInt(input?.value || "", 10) || 45;
      }
      if (cmd === "inc") pct += 1;
      if (cmd === "dec") pct -= 1;
      pct = Math.min(100, Math.max(1, pct));
      if (input) input.value = String(pct);
      if (imgEl) {
        // max-height:240px là giới hạn TẠM cho ảnh chưa từng lưu width (xem
        // imageCardHtml) — hễ đã có width tường minh (đang tự chỉnh) thì bỏ
        // hẳn, không thì nó vẫn ghì chiều cao, làm % không khớp cỡ hiện ra.
        imgEl.style.maxHeight = "none";
        card.style.setProperty("--rle-image-width", pct + "%");
      }
      onImageWidthChangeRef.current?.(imgInfo.storage_path, pct / 100);
    }
  };

  // Xem trước SỐ ĐANG GÕ (chưa kẹp [5,90], chưa ghi đè input.value) — kẹp
  // ngay giữa lúc gõ dở sẽ tự phá số đang gõ (gõ "30" bị kẹp ở "3" thành
  // "5" rồi không gõ tiếp được). Kẹp/chốt lại đúng lúc rời ô, xem handleImageCmd.
  const handleImageZoomLiveInput = (input: HTMLInputElement) => {
    const card = input.closest(".rle-image") as HTMLElement | null;
    if (!card) return;
    const figureId = card.dataset.figureId || "";
    const imgInfo = findImageInfo(figureId, imagesRef.current);
    if (!imgInfo) return;
    const raw = Math.min(100, Math.max(1, parseInt(input.value, 10)));
    if (isNaN(raw)) return;
    const imgEl = card.querySelector<HTMLImageElement>(".rle-image-img");
    if (imgEl) {
      imgEl.style.maxHeight = "none";
      card.style.setProperty("--rle-image-width", raw + "%");
    }
    onImageWidthChangeRef.current?.(imgInfo.storage_path, raw / 100);
  };

  const applyNaturalImageWidth = (
    card: HTMLElement,
    imgInfo: EditorImage,
    imgEl: HTMLImageElement,
    notifyParent = true,
  ) => {
    const update = () => {
      const availableWidth = surfaceRef.current?.clientWidth || card.clientWidth || 1;
      const naturalWidth = imgEl.naturalWidth || imgEl.getBoundingClientRect().width;
      const pct = Math.min(100, Math.max(1, Math.round((naturalWidth / availableWidth) * 100)));
      imgInfo.width = pct / 100;
      card.style.setProperty("--rle-image-width", pct + "%");
      imgEl.style.height = "auto";
      const input = card.querySelector<HTMLInputElement>(".rle-iz-input");
      if (input) input.value = String(pct);
      if (notifyParent)
        onImageWidthChangeRef.current?.(imgInfo.storage_path, pct / 100);
    };
    if (imgEl.complete && imgEl.naturalWidth) requestAnimationFrame(update);
    else imgEl.addEventListener("load", update, { once: true });
  };

  const handleImgSave = useCallback(
    async (result: ImageEditResult) => {
      if (!editingImg) return;
      const figureId = editingImg.el.dataset.figureId || "";
      const imgInfo = findImageInfo(figureId, imagesRef.current);
      if (!imgInfo) throw new Error("Không tìm thấy thông tin ảnh");

      // Ảnh của câu hỏi mới chưa nằm trên server. Giữ kết quả cắt dưới dạng
      // Blob mới để luồng Lưu câu hỏi upload đúng phiên bản đã cắt.
      if (imgInfo.pendingFile) {
        const oldUrl = imgInfo.url || imgInfo.storage_path;
        const nextUrl = URL.createObjectURL(result.blob);
        imgInfo.pendingFile = result.blob;
        imgInfo.storage_path = nextUrl;
        imgInfo.url = nextUrl;
        const imgEl =
          editingImg.el.querySelector<HTMLImageElement>(".rle-image-img");
        if (imgEl) {
          imgEl.src = nextUrl;
          applyNaturalImageWidth(editingImg.el, imgInfo, imgEl);
        }
        if (oldUrl.startsWith("blob:")) URL.revokeObjectURL(oldUrl);
        setEditingImg(null);
        commit();
        return;
      }

      const authToken =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const fd = new FormData();
      // Backend chỉ nhận đường dẫn canonical `/static/images/...`. Bản cũ
      // bóc mất prefix này nên mọi ảnh đã lưu đều bị API từ chối khi cắt.
      fd.append("img_path", imgInfo.storage_path);
      fd.append("file", result.blob, "edited.png");
      const res = await fetch("/api/questions/images/edit", {
        method: "POST",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error("Save failed");

      const imgEl =
        editingImg.el.querySelector<HTMLImageElement>(".rle-image-img");
      if (imgEl) {
        imgEl.src = resolveImgSrc(imgInfo.storage_path) + "?t=" + Date.now();
        applyNaturalImageWidth(editingImg.el, imgInfo, imgEl);
      }
      setEditingImg(null);
    },
    [editingImg],
  );

  // ---------- chèn ảnh MỚI: nút "Chèn ảnh" hoặc dán Ctrl+V ----------
  const canInsertImage =
    imageEditable && (!!questionId || !!importJobId || allowPendingImage) && !hasImage && !uploadingImg;

  const doInsertImageFile = async (file: File | Blob) => {
    if ((!questionId && !importJobId && !allowPendingImage) || hasImage || uploadingImg) return;
    setUploadingImg(true);
    try {
      const localUrl = !questionId && !importJobId
        ? URL.createObjectURL(file)
        : "";
      const img: EditorImage = questionId
        ? await api.uploadQuestionImage(questionId, file)
        : importJobId
          ? await api.uploadStagedImage(importJobId, file)
          : {
              id: `pending-${crypto.randomUUID()}`,
              storage_path: localUrl,
              url: localUrl,
              img_type: "graphic",
              width: null,
              pendingFile: file,
            };
      // Cập nhật NGAY tại chỗ (không đợi vòng React cha->con) để +/− bấm liền
      // sau đó tìm thấy đúng ảnh — commit(img) bên dưới mới là nguồn thật báo
      // lên cha, gộp CHUNG một lần với content (xem ghi chú ở Props.onChange).
      imagesRef.current = [...imagesRef.current, img];
      const wrap = document.createElement("div");
      wrap.innerHTML = imageCardHtml(
        String(img.id),
        imagesRef.current,
        imageEditable,
        sideRef.current,
      );
      const cardEl = wrap.firstElementChild as HTMLElement;
      const insertedImg = cardEl.querySelector<HTMLImageElement>(".rle-image-img");
      // Trôi phải: đứng ĐẦU để bao được chữ. Ở giữa: đứng CUỐI (hình minh
      // hoạ sau phần mô tả) — khớp đúng quy ước ở renderDocForEdit()/chooseSide().
      if (sideRef.current === "right")
        surfaceRef.current?.insertBefore(cardEl, surfaceRef.current.firstChild);
      else surfaceRef.current?.appendChild(cardEl);
      focusParagraphAfter(cardEl);
      // `commit(img)` ngay dưới sẽ chuyển chính object `img` lên cha; chỉ cần
      // cập nhật object này khi ảnh load, tránh một callback state thứ hai đua
      // với lần thêm ảnh đầu tiên.
      if (insertedImg) applyNaturalImageWidth(cardEl, img, insertedImg, false);
      if (surfaceRef.current)
        wireImageZoomInputs(
          surfaceRef.current,
          handleImageZoomLiveInput,
          handleImageCmd,
        );
      setHasImage(true);
      commit(img);
    } catch (e) {
      toast.error((e as Error).message || "Lỗi chèn ảnh");
    } finally {
      setUploadingImg(false);
    }
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) doInsertImageFile(f);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!canInsertImage) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const blob = items[i].getAsFile();
        if (blob) {
          e.preventDefault();
          doInsertImageFile(blob);
        }
        return;
      }
    }
  };

  const iconBtn: React.CSSProperties = {
    width: 30,
    height: 28,
    padding: 0,
    border: "none",
    borderRadius: "4px",
    background: "transparent",
    cursor: "pointer",
    fontSize: "0.85rem",
    color: "var(--text-primary)",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const sep: React.CSSProperties = {
    width: 1,
    height: 18,
    background: "var(--border-strong)",
    margin: "0 0.3rem",
    flexShrink: 0,
  };

  return (
    <div
      style={{
        border: `1px solid ${isFocused ? "var(--accent-primary)" : "var(--text-placeholder)"}`,
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}
    >
      <div
        className="rle-toolbar"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          padding: "0.35rem 0.4rem",
          background: "var(--bg-base)",
          borderBottom: "1.5px solid var(--border-strong)",
        }}
      >
        <button type="button" title="Đậm" aria-pressed={toolbarState.bold} style={{ ...iconBtn, fontWeight: 700 }} onMouseDown={(e) => { e.preventDefault(); applyMark("bold"); }}>B</button>
        <button type="button" title="Nghiêng" aria-pressed={toolbarState.italic} style={{ ...iconBtn, fontStyle: "italic" }} onMouseDown={(e) => { e.preventDefault(); applyMark("italic"); }}>I</button>
        <button type="button" title="Gạch chân" aria-pressed={toolbarState.underline} style={{ ...iconBtn, textDecoration: "underline" }} onMouseDown={(e) => { e.preventDefault(); applyMark("underline"); }}>U</button>
        <button type="button" title="Tô nền (bấm lần nữa để xóa)" aria-pressed={toolbarState.highlight} style={iconBtn} onMouseDown={(e) => { e.preventDefault(); toggleHighlight(); }}>
          <span style={{ background: "#fff3a3", borderRadius: 2, padding: "0 3px", fontSize: "0.85em" }}>A</span>
        </button>
        <button
          type="button"
          title="Màu chữ"
          aria-pressed={!!toolbarState.textColor}
          style={iconBtn}
          onMouseDown={(e) => { e.preventDefault(); rememberTextColorRange(); }}
          onClick={() => textColorInputRef.current?.click()}
        >
          <span style={{ position: "relative", display: "inline-flex", justifyContent: "center", width: 17, height: 19, fontWeight: 600 }}>
            A
            <span aria-hidden style={{ position: "absolute", left: 1, right: 1, bottom: 0, height: 3, background: textColor }} />
          </span>
        </button>

        <div style={sep} />
        <button type="button" title="Chèn công thức" style={iconBtn} onMouseDown={(e) => e.preventDefault()} onClick={insertMath}>∑</button>
        <button
          type="button"
          title={
            !imageEditable ? "" : hasImage ? "Mỗi câu chỉ chèn được một ảnh" : (!questionId && !importJobId && !allowPendingImage) ? "Chỉ chèn ảnh trong phần nội dung đề bài" : "Chèn ảnh từ máy tính (hoặc dán Ctrl+V)"
          }
          style={{ ...iconBtn, opacity: canInsertImage ? 1 : 0.4, cursor: canInsertImage ? "pointer" : "not-allowed" }}
          disabled={!canInsertImage}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <ToolbarIcon name="image" />
        </button>

        <div style={sep} />
        <button type="button" title="Danh sách số thứ tự" aria-pressed={toolbarState.ordered} style={iconBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => insertList(true)}><ToolbarIcon name="ordered-list" /></button>
        <button type="button" title="Danh sách gạch đầu dòng" aria-pressed={toolbarState.bullet} style={iconBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => insertList(false)}><ToolbarIcon name="bullet-list" /></button>
        <div style={sep} />
        <button type="button" title="Căn trái" aria-pressed={toolbarState.alignment === "left"} style={iconBtn} onMouseDown={(e) => { e.preventDefault(); applyAlignment("left"); }}><ToolbarIcon name="align-left" /></button>
        <button type="button" title="Căn giữa" aria-pressed={toolbarState.alignment === "center"} style={iconBtn} onMouseDown={(e) => { e.preventDefault(); applyAlignment("center"); }}><ToolbarIcon name="align-center" /></button>
        <button type="button" title="Căn phải" aria-pressed={toolbarState.alignment === "right"} style={iconBtn} onMouseDown={(e) => { e.preventDefault(); applyAlignment("right"); }}><ToolbarIcon name="align-right" /></button>
        <button type="button" title="Căn đều hai bên" aria-pressed={toolbarState.alignment === "justify"} style={iconBtn} onMouseDown={(e) => { e.preventDefault(); applyAlignment("justify"); }}><ToolbarIcon name="align-justify" /></button>
        <div style={sep} />
        <button type="button" title="Chèn bảng" style={iconBtn} onMouseDown={(e) => e.preventDefault()} onClick={insertTable}><ToolbarIcon name="table" /></button>
        {hasActiveTableCell && (
          <>
            <button type="button" title="Thêm hàng bên dưới" style={iconBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => editTable("add-row")}><ToolbarIcon name="row-add" /></button>
            <button type="button" title="Xóa hàng hiện tại" style={iconBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => editTable("delete-row")}><ToolbarIcon name="row-delete" /></button>
            <button type="button" title="Thêm cột bên phải" style={iconBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => editTable("add-column")}><ToolbarIcon name="column-add" /></button>
            <button type="button" title="Xóa cột hiện tại" style={iconBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => editTable("delete-column")}><ToolbarIcon name="column-delete" /></button>
            <button type="button" title="Gộp với ô bên phải" style={iconBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => editTable("merge-right")}><ToolbarIcon name="merge-right" /></button>
            <button type="button" title="Tách ô theo chiều ngang" style={iconBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => editTable("split-horizontal")}><ToolbarIcon name="split-horizontal" /></button>
            <button type="button" title="Gộp với ô bên dưới" style={iconBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => editTable("merge-down")}><ToolbarIcon name="merge-down" /></button>
            <button type="button" title="Tách ô theo chiều dọc" style={iconBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => editTable("split-vertical")}><ToolbarIcon name="split-vertical" /></button>
          </>
        )}
        <button type="button" title="Khối mã" style={iconBtn} onMouseDown={(e) => e.preventDefault()} onClick={insertCodeBlock}><ToolbarIcon name="code" /></button>

        {showLayoutControl && (
          <>
            <div style={{ ...sep, marginLeft: "auto" }} />
            <button
              type="button"
              title="Trôi phải (chữ chạy quanh ảnh)"
              style={{ ...iconBtn, color: side === "right" ? "var(--accent-primary)" : iconBtn.color, background: side === "right" ? "var(--accent-primary-soft)" : "transparent" }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => chooseSide("right")}
            >
              <IconFloatRight />
            </button>
            <button
              type="button"
              title="Ở giữa"
              style={{ ...iconBtn, color: side === "center" ? "var(--accent-primary)" : iconBtn.color, background: side === "center" ? "var(--accent-primary-soft)" : "transparent" }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => chooseSide("center")}
            >
              <IconCentered />
            </button>
          </>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" style={{ display: "none" }} onChange={handleFilePicked} />
      <input ref={textColorInputRef} type="color" value={textColor} aria-label="Chọn màu chữ" style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} onChange={(event) => applyTextColor(event.target.value)} />

      <div style={{ position: "relative", background: "var(--bg-surface)" }}>
        <div
          ref={surfaceRef}
          contentEditable
          suppressContentEditableWarning
          className="rle-surface"
          style={{
            position: "relative",
            // Mặc định vừa đúng một dòng. Khi có thêm paragraph do Enter,
            // contentEditable tự tăng chiều cao theo nội dung.
            padding: "0.55rem 0.85rem",
            background: "var(--bg-surface)",
            minHeight: minHeight || "2.75rem",
            maxHeight: maxHeight,
            overflowY: maxHeight ? "auto" : "visible",
            lineHeight: 1.5,
          }}
          onMouseDown={handleSurfaceMouseDown}
          onMouseUp={refreshToolbarState}
          onKeyUp={refreshToolbarState}
          onSelect={refreshToolbarState}
          onFocus={() => {
            setIsFocused(true);
            try {
              document.execCommand("defaultParagraphSeparator", false, "p");
            } catch {
              /* noop */
            }
            requestAnimationFrame(refreshToolbarState);
          }}
          onBlur={handleBlur}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
        {isEmpty && !isFocused && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "0.55rem",
              left: "0.85rem",
              color: "var(--text-placeholder)",
              lineHeight: 1.5,
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {placeholder || "Nhập nội dung..."}
          </div>
        )}
      </div>
      {uploadingImg && (
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>Đang tải ảnh lên...</div>
      )}

      {tableDialog &&
        portalTarget &&
        createPortal(
          <div
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setTableDialog(null);
            }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              display: "grid",
              placeItems: "center",
              padding: "1rem",
              background: "var(--overlay)",
            }}
          >
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="rle-table-dialog-title"
              onSubmit={(event) => {
                event.preventDefault();
                confirmInsertTable();
              }}
              style={{
                width: "min(360px, 100%)",
                padding: "1.25rem",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-surface)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <h3 id="rle-table-dialog-title" style={{ margin: "0 0 1rem" }}>
                Chèn bảng
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.75rem",
                }}
              >
                <label className="form-group" style={{ margin: 0 }}>
                  <span className="form-label">Số hàng</span>
                  <input
                    autoFocus
                    className="input"
                    type="number"
                    min={1}
                    max={30}
                    value={tableDialog.rows}
                    onChange={(event) =>
                      setTableDialog({ ...tableDialog, rows: event.target.value })
                    }
                  />
                </label>
                <label className="form-group" style={{ margin: 0 }}>
                  <span className="form-label">Số cột</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={20}
                    value={tableDialog.columns}
                    onChange={(event) =>
                      setTableDialog({
                        ...tableDialog,
                        columns: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.6rem",
                  marginTop: "1.25rem",
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setTableDialog(null)}
                >
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary">
                  Chèn bảng
                </button>
              </div>
            </form>
          </div>,
          portalTarget,
        )}

      {editingMath &&
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
            <h3 style={{ marginBottom: "1rem" }}>
              {editingMath.mode === "new" ? "Thêm công thức" : "Sửa công thức"}
            </h3>
            {editingMath.mode === "new" && (
              <div style={{ display: "flex", gap: 6, marginBottom: "0.85rem" }}>
                <button
                  type="button"
                  className={`btn btn-sm ${!editingMath.isBlock ? "btn-primary" : "btn-secondary"}`}
                  onClick={() =>
                    setEditingMath({ ...editingMath, isBlock: false })
                  }
                >
                  Trong dòng
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${editingMath.isBlock ? "btn-primary" : "btn-secondary"}`}
                  onClick={() =>
                    setEditingMath({ ...editingMath, isBlock: true })
                  }
                >
                  Khối riêng
                </button>
              </div>
            )}
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
              {editingMath.mode === "edit" ? (
                <button className="btn btn-danger btn-sm" onClick={deleteMath}>
                  Xóa công thức
                </button>
              ) : (
                <span />
              )}
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
          onSave={handleImgSave}
          onClose={() => setEditingImg(null)}
        />
      )}
    </div>
  );
}
