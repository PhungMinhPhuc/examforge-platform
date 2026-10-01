import {
  type TreeDoc,
  type BlockNode,
  type InlineNode,
  type TableNode,
  type CodeBlockNode,
  type Mark,
  emptyDoc,
  resolveImgSrc,
  wrapInlineMath,
  wrapDisplayMath,
} from "@/lib/docTree";
import type { EditorImage } from "../types";
import {
  filledIconMarkup,
  isStrokeIcon,
  strokeIconPaths,
  type FilledIconName,
  type IconName,
} from "@/components/icons";


function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function staticIconHtml(name: IconName): string {
  const strokeIcon = isStrokeIcon(name);
  const markup = strokeIcon
    ? strokeIconPaths[name]
    : filledIconMarkup[name as FilledIconName];
  const paint = strokeIcon
    ? 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="var(--icon-stroke-regular)"'
    : 'fill="currentColor"';

  return `<svg data-icon-name="${name}" aria-hidden="true" focusable="false" width="var(--icon-size-control)" height="var(--icon-size-control)" viewBox="0 0 24 24" ${paint}>${markup}</svg>`;
}

export function findImageInfo(
  figureId: string,
  images: EditorImage[],
): EditorImage | undefined {
  return images.find((i) => String(i.id) === figureId);
}

function normalizedFigureId(raw: string): number | string {
  const value = raw.trim();
  return /^\d+$/.test(value) ? Number(value) : value;
}

function parseStringArray(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.every((item) => typeof item === "string")
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function renderInlineForEdit(
  nodes: Array<InlineNode | TableNode | CodeBlockNode>,
  images: EditorImage[],
  imageEditable: boolean,
  legacyImageChrome: boolean,
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
                  : m === "subscript"
                    ? "sub"
                    : m === "superscript"
                      ? "sup"
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
      if (n.type === "math_block") {
        return `<span class="rle-mathblock rle-mathblock-cell" contenteditable="false" data-tex="${escapeHtml(n.tex)}">${wrapDisplayMath(escapeHtml(n.tex))}</span>`;
      }
      if (n.type === "hard_break") return "<br>";
      if (n.type === "code_block")
        return `<pre class="rle-code" data-lang="${escapeHtml(n.lang || "")}">${escapeHtml(n.text)}</pre>`;
      if (n.type === "image_inline") {
        return imageInlineCardHtml(
          String(n.figure_id),
          images,
          imageEditable && legacyImageChrome,
        );
      }
      if (n.type === "table")
        return renderBlockForEdit(
          n,
          images,
          imageEditable,
          "center",
          legacyImageChrome,
        );
      return "";
    })
    .join("");
}

export function imageCardHtml(
  figureId: string,
  images: EditorImage[],
  imageEditable: boolean,
  side: "left" | "right" | "center" = "center",
  caption?: string | null,
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
  return `<div class="rle-image side-${side}" contenteditable="false" data-figure-id="${escapeHtml(figureId)}"${caption != null ? ` data-caption="${escapeHtml(caption)}"` : ""}${widthFrac ? ` style="--rle-image-width:${Math.min(widthFrac * 100, 100)}%"` : ""}>
    ${imageEditable ? `<div class="rle-image-head">
      ${
        imgInfo
          ? `
      <div class="rle-image-zoom">
        <button type="button" class="ui-button ui-button--secondary ui-button--small ui-button--icon rle-iz-btn" data-imgcmd="dec" title="Thu nhỏ" aria-label="Thu nhỏ ảnh">${staticIconHtml("minus")}</button>
        <input type="number" class="rle-iz-input" value="${pctValue}" placeholder="Tự động" min="1" max="100" data-imgcmd="pct" title="Cỡ ảnh theo chiều ngang vùng soạn thảo (%)">
        <span class="rle-iz-sign">%</span>
        <button type="button" class="ui-button ui-button--secondary ui-button--small ui-button--icon rle-iz-btn" data-imgcmd="inc" title="Phóng to" aria-label="Phóng to ảnh">${staticIconHtml("plus")}</button>
      </div>`
          : "<span></span>"
      }
      <div class="rle-image-actions">
        ${imageEditable && !isTikz && !isStaged ? `<button type="button" class="ui-button ui-button--secondary ui-button--small ui-button--icon" data-imgcmd="edit" title="Cắt / đổi độ phân giải" aria-label="Cắt hoặc đổi độ phân giải ảnh">${staticIconHtml("cut")}</button>` : ""}
        <button type="button" class="ui-button ui-button--danger ui-button--small ui-button--icon" data-imgcmd="del" title="Xoá ảnh" aria-label="Xoá ảnh">${staticIconHtml("trash")}</button>
      </div>
    </div>` : ""}
    ${missing ? `<div class="ui-editor-feedback ui-editor-feedback--error">Ảnh không tồn tại (${escapeHtml(figureId)})</div>` : `<img src="${escapeHtml(imgSrc)}" alt="Hình vẽ" class="rle-image-img" style="height:auto;">`}
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
      <button type="button" class="ui-button ui-button--secondary ui-button--small ui-button--icon rle-iz-btn" data-imgcmd="dec" title="Thu nhỏ" aria-label="Thu nhỏ ảnh">${staticIconHtml("minus")}</button>
      <input type="number" class="rle-iz-input" value="${pctValue}" placeholder="Tự động" min="1" max="100" data-imgcmd="pct" title="Cỡ ảnh theo chiều ngang vùng soạn thảo (%)">
      <span class="rle-iz-sign">%</span>
      <button type="button" class="ui-button ui-button--secondary ui-button--small ui-button--icon rle-iz-btn" data-imgcmd="inc" title="Phóng to" aria-label="Phóng to ảnh">${staticIconHtml("plus")}</button>
      <button type="button" class="ui-button ui-button--danger ui-button--small ui-button--icon rle-iz-btn" data-imgcmd="del" title="Xoá ảnh" aria-label="Xoá ảnh">${staticIconHtml("trash")}</button>
    </span>`
        : ""
    }
    ${missing ? `<span class="text-danger">Ảnh không tồn tại</span>` : imgInfo ? `<img src="${escapeHtml(imgSrc)}" alt="Hình vẽ" class="rle-image-img" style="${widthFrac ? `width:${Math.min(widthFrac * 100, 100)}%;` : "width:auto;"}height:auto;">` : `<span aria-label="Hình ảnh">${staticIconHtml("image")}</span>`}
  </span>​`;
}

function renderBlockForEdit(
  node: BlockNode,
  images: EditorImage[],
  imageEditable: boolean,
  side: "left" | "right" | "center",
  legacyImageChrome: boolean,
): string {
  if (node.type === "paragraph")
    return `<p class="rle-p" style="text-align:${node.align || "justify"}">${renderInlineForEdit(node.content, images, imageEditable, legacyImageChrome)}</p>`;
  if (node.type === "math_block") {
    return `<div class="rle-mathblock" contenteditable="false" data-tex="${escapeHtml(node.tex)}">${wrapDisplayMath(escapeHtml(node.tex))}</div>`;
  }
  if (node.type === "image")
    return imageCardHtml(
      String(node.figure_id),
      images,
      imageEditable && legacyImageChrome,
      side,
      node.caption,
    );
  if (node.type === "list") {
    const tag = node.ordered ? "ol" : "ul";
    const items = node.items
      .map(
        (item) =>
          `<li>${item.map((block) => renderBlockForEdit(block, images, imageEditable, side, legacyImageChrome)).join("")}</li>`,
      )
      .join("");
    return `<${tag} class="rle-list">${items}</${tag}>`;
  }
  if (node.type === "table") {
    const columnCount =
      node.widths?.length ||
      Math.max(
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
        (row, rowIndex) => {
          let columnIndex = 0;
          const cells = row.map((c) => {
            const alignment = node.align?.[columnIndex];
            columnIndex += c.colspan || 1;
            const textAlign = alignment === "c"
              ? "center"
              : alignment === "r" ? "right" : "left";
            return `<td${c.colspan && c.colspan > 1 ? ` colspan="${c.colspan}"` : ""}${c.rowspan && c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ""}${alignment ? ` style="text-align:${textAlign}"` : ""}>${renderInlineForEdit(c.content, images, imageEditable, legacyImageChrome)}</td>`;
          }).join("");
          return `<tr${node.row_heights?.[rowIndex] ? ` data-height="${node.row_heights[rowIndex]}" style="height:${node.row_heights[rowIndex]}px"` : ""}>${cells}</tr>`;
        },
      )
      .join("");
    return `<table class="rle-table"${node.align ? ` data-align="${escapeHtml(JSON.stringify(node.align))}"` : ""}>${columns}<tbody>${rows}</tbody></table>`;
  }
  if (node.type === "columns") {
    const widths = node.columns
      .map((column) => `${column.width * 100}%`)
      .join(" ");
    const columns = node.columns
      .map((column, index) => {
        const body = column.content
          .map((block) =>
            renderBlockForEdit(block, images, imageEditable, "center", legacyImageChrome),
          )
          .join("");
        return `<div class="rle-column" data-width="${column.width}" data-align="${column.align || "left"}" data-valign="${column.valign || "top"}" style="text-align:${column.align || "left"}"><div class="rle-column-head" contenteditable="false">Cột ${index + 1}: <input class="rle-column-width" type="number" min="5" max="95" value="${Math.round(column.width * 100)}">%</div>${body}</div>`;
      })
      .join("");
    return `<div class="rle-columns" data-gap="${node.gap || 0}"${node.align ? ` data-align="${escapeHtml(node.align)}"` : ""} style="display:grid;grid-template-columns:${widths}">${columns}</div>`;
  }
  if (node.type === "code_block") {
    return `<pre class="rle-code" data-lang="${escapeHtml(node.lang || "")}">${escapeHtml(node.text)}</pre>`;
  }
  return "";
}

export function renderDocForEdit(
  doc: TreeDoc,
  images: EditorImage[],
  imageEditable: boolean,
  legacyImageChrome = true,
): string {
  const content = doc.content?.length ? doc.content : emptyDoc().content;
  const side: "left" | "right" | "center" = doc.side ?? "center";
  if (side === "right") {
    const imageBlocks = content.filter((block) => block.type === "image");
    if (imageBlocks.length) {
      const floatedImages = imageBlocks
        .map((block) => renderBlockForEdit(block, images, imageEditable, side, legacyImageChrome))
        .join("");
      const anchoredContent = content
        .map((block) =>
          block.type === "image"
            ? `<span class="rle-image-anchor" contenteditable="false" data-figure-id="${escapeHtml(String(block.figure_id))}"${block.caption != null ? ` data-caption="${escapeHtml(block.caption)}"` : ""} hidden></span>`
            : renderBlockForEdit(block, images, imageEditable, side, legacyImageChrome),
        )
        .join("");
      return floatedImages + anchoredContent;
    }
  }
  return content
    .map((b) => renderBlockForEdit(b, images, imageEditable, side, legacyImageChrome))
    .join("");
}


function marksOfNode(node: Node, root: HTMLElement): Mark[] {
  const marks: Mark[] = [];
  const resolved = {
    bold: false,
    italic: false,
    underline: false,
    highlight: false,
  };
  let el: HTMLElement | null = node.parentElement;
  while (el && el !== root) {
    const tag = el.tagName;
    const style = el.getAttribute("style") || "";
    // execCommand commonly represents "toggle off" with a CSS reset nested
    // inside the original semantic tag. Resolve each mark from the nearest
    // declaration outwards so an outer <b>/<i>/<u> cannot re-enable it.
    if (!resolved.bold) {
      if (/font-weight\s*:\s*(normal|[1-5]00)/i.test(style))
        resolved.bold = true;
      else if (
        tag === "B" ||
        tag === "STRONG" ||
        /font-weight\s*:\s*(bold|[6-9]00)/i.test(style)
      ) {
        marks.push("bold");
        resolved.bold = true;
      }
    }
    if (!resolved.italic) {
      if (/font-style\s*:\s*normal/i.test(style)) resolved.italic = true;
      else if (
        tag === "I" ||
        tag === "EM" ||
        /font-style\s*:\s*italic/i.test(style)
      ) {
        marks.push("italic");
        resolved.italic = true;
      }
    }
    if (!resolved.underline) {
      if (
        /text-decoration(?:-line)?\s*:[^;]*(?:none|no-underline)/i.test(style)
      )
        resolved.underline = true;
      else if (
        tag === "U" ||
        /text-decoration(?:-line)?\s*:[^;]*underline/i.test(style)
      ) {
        marks.push("underline");
        resolved.underline = true;
      }
    }
    if (tag === "SUB") marks.push("subscript");
    if (tag === "SUP") marks.push("superscript");
    if (!resolved.highlight) {
      if (
        el.dataset.rleHighlightReset === "true" ||
        /background(-color)?\s*:[^;]*(?:transparent|rgba?\(0,\s*0,\s*0,\s*0\))/i.test(style)
      )
        resolved.highlight = true;
      else if (
        tag === "MARK" ||
        /background(-color)?\s*:/i.test(style)
      ) {
        marks.push("highlight");
        resolved.highlight = true;
      }
    }
    el = el.parentElement;
  }
  return [...new Set(marks)];
}

export function normalizeTextColor(value: string): string | undefined {
  const color = value.trim().toLowerCase();
  const longHex = /^#([0-9a-f]{6})$/.exec(color);
  if (longHex) return `#${longHex[1]}`;
  const shortHex = /^#([0-9a-f]{3})$/.exec(color);
  if (shortHex)
    return `#${shortHex[1]
      .split("")
      .map((digit) => digit + digit)
      .join("")}`;
  const rgb =
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(
      color,
    );
  if (!rgb || (rgb[4] != null && Number(rgb[4]) === 0)) return undefined;
  const channel = (part: string) =>
    Math.max(0, Math.min(255, Number(part)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`;
}

export function textColorOfNode(node: Node, root: HTMLElement): string | undefined {
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

function reconcileTable(table: HTMLTableElement): TableNode {
  const rows = Array.from(
    table.querySelectorAll(":scope > tbody > tr"),
  ).map((tr) =>
    Array.from(tr.children).map((td) => {
      const cell = td as HTMLTableCellElement;
      return {
        content: reconcileInline(cell, true),
        ...(cell.colSpan > 1 ? { colspan: cell.colSpan } : {}),
        ...(cell.rowSpan > 1 ? { rowspan: cell.rowSpan } : {}),
      };
    }),
  );
  const rawWidths = Array.from(
    table.querySelectorAll(":scope > colgroup > col"),
  ).map((column) =>
    Number.parseFloat((column as HTMLTableColElement).style.width) / 100
  );
  const totalWidth = rawWidths.reduce((total, width) => total + width, 0);
  const rowHeights = Array.from(table.rows).map((row) =>
    Number(row.dataset.height || 0)
  );
  const domGrid: Array<Array<HTMLTableCellElement | undefined>> = [];
  Array.from(table.rows).forEach((row, rowIndex) => {
    domGrid[rowIndex] ??= [];
    let column = 0;
    Array.from(row.cells).forEach((cell) => {
      while (domGrid[rowIndex][column]) column += 1;
      for (let y = rowIndex; y < rowIndex + cell.rowSpan; y += 1) {
        domGrid[y] ??= [];
        for (let x = column; x < column + cell.colSpan; x += 1)
          domGrid[y][x] = cell;
      }
      column += cell.colSpan;
    });
  });
  const derivedAlign = Array.from(
    { length: Math.max(0, ...domGrid.map((row) => row.length)) },
    (_, column) => {
      const value = domGrid.map((row) => row[column])
        .find((cell) => !!cell?.style.textAlign)?.style.textAlign;
      return value === "center" ? "c" : value === "right" ? "r" : "l";
    },
  );
  const storedAlign = parseStringArray(table.dataset.align);
  const hasCellAlignment = domGrid.some((row) =>
    row.some((cell) => !!cell?.style.textAlign)
  );
  const tableAlign = hasCellAlignment ? derivedAlign : storedAlign;
  return {
    type: "table",
    rows,
    ...(tableAlign ? { align: tableAlign } : {}),
    ...(rawWidths.length && totalWidth > 0
      ? { widths: rawWidths.map((width) => width / totalWidth) }
      : {}),
    ...(rowHeights.some(Boolean)
      ? { row_heights: rowHeights.map((height) => height || 32) }
      : {}),
  };
}

function reconcileInline(container: HTMLElement): InlineNode[];
function reconcileInline(
  container: HTMLElement,
  allowNestedTables: true,
): Array<InlineNode | TableNode | CodeBlockNode>;
function reconcileInline(
  container: HTMLElement,
  allowNestedTables = false,
): Array<InlineNode | TableNode | CodeBlockNode> {
  const out: Array<InlineNode | TableNode | CodeBlockNode> = [];
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
    if (el.tagName === "TABLE" && allowNestedTables) {
      out.push(reconcileTable(el as HTMLTableElement));
      return;
    }
    if (el.classList.contains("rle-math")) {
      out.push({ type: "math", tex: el.dataset.tex || "" });
      return;
    }
    if (el.classList.contains("rle-mathblock")) {
      out.push({ type: "math_block", tex: el.dataset.tex || "" });
      return;
    }
    if (el.classList.contains("rle-imginline")) {
      out.push({
        type: "image_inline",
        figure_id: normalizedFigureId(el.dataset.figureId || ""),
      });
      return;
    }
    if (el.classList.contains("rle-code") && allowNestedTables) {
      out.push({
        type: "code_block",
        text: el.textContent || "",
        ...(el.dataset.lang ? { lang: el.dataset.lang } : {}),
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
  const merged: Array<InlineNode | TableNode | CodeBlockNode> = [];
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
        ...(el.dataset.caption != null ? { caption: el.dataset.caption } : {}),
      });
    } else if (
      el.classList.contains("rle-image") &&
      !anchoredImageIds.has(el.dataset.figureId || "")
    ) {
      blocks.push({
        type: "image",
        figure_id: normalizedFigureId(el.dataset.figureId || ""),
        ...(el.dataset.caption != null ? { caption: el.dataset.caption } : {}),
      });
    } else if (el.tagName === "OL" || el.tagName === "UL") {
      const items = Array.from(el.children).map((li) => {
        const nestedBlocks = reconcileBlocks(li as HTMLElement);
        if (nestedBlocks.length) return nestedBlocks;
        return [
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
        ];
      });
      blocks.push({ type: "list", ordered: el.tagName === "OL", items });
    } else if (el.tagName === "TABLE") {
      const table = el as HTMLTableElement;
      const rows = Array.from(
        table.querySelectorAll(":scope > tbody > tr"),
      ).map((tr) =>
        Array.from(tr.children).map((td) => {
          const cell = td as HTMLTableCellElement;
          return {
            content: reconcileInline(cell, true),
            ...(cell.colSpan > 1 ? { colspan: cell.colSpan } : {}),
            ...(cell.rowSpan > 1 ? { rowspan: cell.rowSpan } : {}),
          };
        }),
      );
      const rawWidths = Array.from(
        table.querySelectorAll(":scope > colgroup > col"),
      ).map(
        (column) =>
          Number.parseFloat((column as HTMLTableColElement).style.width) / 100,
      );
      const totalWidth = rawWidths.reduce((total, width) => total + width, 0);
      const rowHeights = Array.from(table.rows).map((row) =>
        Number(row.dataset.height || 0),
      );
      const domGrid: Array<Array<HTMLTableCellElement | undefined>> = [];
      Array.from(table.rows).forEach((row, rowIndex) => {
        domGrid[rowIndex] ??= [];
        let column = 0;
        Array.from(row.cells).forEach((cell) => {
          while (domGrid[rowIndex][column]) column += 1;
          for (let y = rowIndex; y < rowIndex + cell.rowSpan; y += 1) {
            domGrid[y] ??= [];
            for (let x = column; x < column + cell.colSpan; x += 1)
              domGrid[y][x] = cell;
          }
          column += cell.colSpan;
        });
      });
      const derivedAlign = Array.from(
        { length: Math.max(0, ...domGrid.map((row) => row.length)) },
        (_, column) => {
          const value = domGrid
            .map((row) => row[column])
            .find((cell) => !!cell?.style.textAlign)?.style.textAlign;
          return value === "center" ? "c" : value === "right" ? "r" : "l";
        },
      );
      const storedAlign = parseStringArray(table.dataset.align);
      const hasCellAlignment = domGrid.some((row) =>
        row.some((cell) => !!cell?.style.textAlign),
      );
      const tableAlign = hasCellAlignment ? derivedAlign : storedAlign;
      blocks.push({
        type: "table",
        rows,
        ...(tableAlign
          ? { align: tableAlign }
          : {}),
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
        ...(el.dataset.align ? { align: el.dataset.align } : {}),
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
export function normalizeEditableBlocks(surface: HTMLElement) {
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
    } else {
      while (element.firstChild) paragraph.append(element.firstChild);
      element.replaceWith(paragraph);
    }
  });
}

export function reconcileDoc(
  surface: HTMLElement,
  side: "left" | "right" | "center",
): TreeDoc {
  normalizeEditableBlocks(surface);
  const blocks = reconcileBlocks(surface);
  const doc: TreeDoc = {
    type: "doc",
    content: blocks.length ? blocks : emptyDoc().content,
  };
  // schema.py từ chối side:"center" ghi tường minh (đó là mặc định) — chỉ
  // gắn `side` khi thật sự trôi phải.
  if (side !== "center") doc.side = side;
  return doc;
}
