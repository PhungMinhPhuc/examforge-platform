// Cây tài liệu dùng cho content/solution/option-content (jsonb) — kiểu và bộ
// ghi HTML/chữ trơn phải khớp đúng backend/src/engine/doctree/schema.py và
// doctree/write/html.py|text.py (một lược đồ, hai nơi triển khai).

export type Mark = "bold" | "italic" | "underline" | "highlight";

export type InlineNode =
  | { type: "text"; text: string; marks?: Mark[]; color?: string }
  | { type: "math"; tex: string }
  | { type: "hard_break" }
  | { type: "image_inline"; figure_id: number | string };

export type TableCell = {
  content: InlineNode[];
  colspan?: number;
  rowspan?: number;
};
export type ColumnNode = {
  width: number;
  align?: "left" | "center" | "right";
  valign?: "top" | "center" | "bottom";
  content: BlockNode[];
};

export type BlockNode =
  | {
      type: "paragraph";
      content: InlineNode[];
      align?: "left" | "center" | "right" | "justify";
    }
  | { type: "math_block"; tex: string }
  | {
      type: "table";
      rows: TableCell[][];
      align?: string[];
      widths?: number[];
      row_heights?: number[];
    }
  | { type: "list"; items: BlockNode[][]; ordered?: boolean }
  | { type: "image"; figure_id: number | string; caption?: string | null }
  | { type: "code_block"; text: string; lang?: string | null }
  | { type: "columns"; columns: ColumnNode[]; align?: string; gap?: number };

export type TreeDoc = {
  type: "doc";
  side?: "left" | "right" | "center";
  content: BlockNode[];
};

/** Cây rỗng — điểm khởi đầu cho một ô soạn thảo mới (câu mới, phương án mới). */
export function emptyDoc(): TreeDoc {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        align: "justify",
        content: [{ type: "text", text: "" }],
      },
    ],
  };
}

// `content`/`solution` có thể vẫn là chuỗi thường (đáp án `sa`, xem
// q_shortans_details.content) — không phải cây. Hai component dùng chung
// điều kiện này để rẽ nhánh.
export function isTreeDoc(value: unknown): value is TreeDoc {
  return (
    !!value &&
    typeof value === "object" &&
    (value as any).type === "doc" &&
    Array.isArray((value as any).content)
  );
}

export type ImageRow = {
  storage_path: string;
  url?: string;
  width?: number | null;
  img_type?: string;
};
export type ImagesById = Record<string, ImageRow>;

// Hệ quy chiếu duy nhất của q_images.width: TOÀN BỘ bề ngang tờ A4.
// Khai đủ đơn vị tại một chỗ để preview/editor dễ đối chiếu khi debug.
export const A4_REFERENCE_WIDTH_MM = 210;
export const A4_REFERENCE_WIDTH_IN = A4_REFERENCE_WIDTH_MM / 25.4;
export const A4_REFERENCE_WIDTH_PT = A4_REFERENCE_WIDTH_IN * 72;
export const A4_REFERENCE_WIDTH_PX = A4_REFERENCE_WIDTH_IN * 96;

/** Nhãn A/B/C/D của phương án đúng trong câu trắc nghiệm (mc) — dùng để
 * hiện dòng "Chọn X" ở cuối lời giải. Tự tính lúc hiển thị (không lưu vào
 * CSDL), khớp quy ước `chr(65 + idx)` đã dùng ở backend
 * (pdf_html/renderer.py, word_exporter.py, doctree/write/tex.py). */
export function mcCorrectLabel(
  options?: { is_correct?: boolean }[],
): string | null {
  const idx = (options || []).findIndex((o) => o.is_correct);
  return idx >= 0 ? String.fromCharCode(65 + idx) : null;
}

/** q_images trả về theo mảng {id, storage_path, width, img_type} — gộp
 * thành map figure_id -> row để tra nhanh lúc dựng HTML/atom ảnh. */
export function imagesById(
  images?: {
    id?: number | string;
    storage_path: string;
    url?: string;
    width?: number | null;
    img_type?: string;
  }[],
): ImagesById {
  const map: ImagesById = {};
  (images || []).forEach((img) => {
    if (img.id != null) map[String(img.id)] = img;
  });
  return map;
}

const TAG_OF: Record<Mark, string> = {
  bold: "strong",
  italic: "em",
  underline: "u",
  highlight: "mark",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Công thức TRONG DÒNG (`math`) vẫn nằm trong dòng chữ (không tách ra
// paragraph riêng như `math_block`), nhưng CỠ hiển thị dùng displaystyle
// (phân số/tổng/tích phân full cỡ như công thức khối) thay vì textstyle nén
// nhỏ mặc định của MathJax cho inline — theo yêu cầu người dùng, vì nhiều
// công thức inline trong dữ liệu thật (vd chuỗi biến đổi ở lời giải) dài và
// có phân số, nén nhỏ theo textstyle khó đọc.
export function wrapInlineMath(tex: string): string {
  return `\\(\\displaystyle ${tex}\\)`;
}
export function wrapDisplayMath(tex: string): string {
  return `\\[${tex}\\]`;
}

function defaultMathFmt(tex: string, display: boolean): string {
  return display ? wrapDisplayMath(tex) : wrapInlineMath(tex);
}

/** `storage_path` lưu trong CSDL là đường dẫn thẳng vào backend (vd
 * `/static/images/...`) — phải qua tiền tố API (`NEXT_PUBLIC_API_URL`, mặc
 * định `/api`) mới load được, vì Next dev server không tự phục vụ đường dẫn
 * đó. Dùng chung cho mọi nơi dựng `<img>` từ cây (treeToHtml lẫn ảnh trôi
 * immini ở LatexRenderer.tsx). */
export function resolveImgSrc(storagePath: string): string {
  let src = (storagePath || "").replace(/\\\\/g, "/");
  // URL preview trong trình duyệt (`blob:`) và ảnh dán dạng `data:` đã là
  // URL hoàn chỉnh; không được ghép thêm tiền tố API.
  if (!src || /^(?:https?:|blob:|data:)/i.test(src)) return src;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api";
  if (apiUrl.endsWith("/") && src.startsWith("/")) return apiUrl + src.slice(1);
  if (!apiUrl.endsWith("/") && !src.startsWith("/")) return apiUrl + "/" + src;
  return apiUrl + src;
}

function imgHtml(
  fid: number | string,
  images: ImagesById,
  cls: string,
): string {
  const row = images[String(fid)];
  if (!row) return `<span class="${cls} is-missing">[thiếu hình ${fid}]</span>`;
  const src = escapeHtml(resolveImgSrc(row.url || row.storage_path || ""));
  const figureAttr = ` data-figure-id="${escapeHtml(String(fid))}"`;
  if (row.width != null) {
    return `<img class="${cls}" src="${src}" alt=""${figureAttr} style="width:${(row.width * A4_REFERENCE_WIDTH_PX).toFixed(2)}px">`;
  }
  // Chưa đặt `width` (ảnh gốc) — với SVG (TikZ) hiển thị to hơn kích thước gốc
  // đọc được (x1.5) cho dễ nhìn trên WEB, theo yêu cầu người dùng (kích thước
  // gốc pdftocairo/dvisvgm dựng ra thường nhỏ hơn trông đợi). CHỈ áp dụng cho
  // khối ảnh chính (không phải ảnh nhỏ chèn trong dòng chữ), CHỈ ảnh hưởng
  // web (đọc naturalWidth SAU khi ảnh load, xem applyNativeSvgScale ở
  // LatexRenderer.tsx) — không đụng `width` lưu CSDL hay bất kỳ luồng xuất
  // PDF/Word nào (dùng hẳn code Python riêng, không qua file này).
  const scaleAttr =
    row.img_type === "tikz" && cls === "doc-figure"
      ? ` data-native-scale="1.5"`
      : "";
  return `<img class="${cls}" src="${src}" alt=""${figureAttr}${scaleAttr}>`;
}

function inlineHtml(
  nodes: InlineNode[],
  images: ImagesById,
  mathFmt: (tex: string, display: boolean) => string,
): string {
  return (nodes || [])
    .map((n) => {
      if (n.type === "text") {
        let s = escapeHtml(n.text);
        (n.marks || []).forEach((m) => {
          const tag = TAG_OF[m];
          s = `<${tag}>${s}</${tag}>`;
        });
        if (/^#[0-9a-f]{6}$/i.test(n.color || ""))
          s = `<span style="color:${n.color}">${s}</span>`;
        return s;
      }
      if (n.type === "math") return mathFmt(n.tex, false);
      if (n.type === "hard_break") return "<br>";
      if (n.type === "image_inline")
        return imgHtml(n.figure_id, images, "doc-figure-inline");
      return "";
    })
    .join("");
}

function blockHtml(
  nodes: BlockNode[],
  images: ImagesById,
  mathFmt: (tex: string, display: boolean) => string,
): string {
  return (nodes || [])
    .map((n) => {
      if (n.type === "paragraph")
        return `<p${n.align && n.align !== "left" ? ` style="text-align:${n.align}"` : ""}>${inlineHtml(n.content, images, mathFmt)}</p>`;
      if (n.type === "math_block")
        return `<p class="doc-math">${mathFmt(n.tex, true)}</p>`;
      if (n.type === "image")
        return `<figure class="doc-figure-block">${imgHtml(n.figure_id, images, "doc-figure")}</figure>`;
      if (n.type === "table") {
        const columns = n.widths?.length
          ? `<colgroup>${n.widths.map((width) => `<col style="width:${width * 100}%">`).join("")}</colgroup>`
          : "";
        const rows = n.rows
          .map((row, rowIndex) => {
            const cells = row
              .map((c) => {
                const colspan = c.colspan ? ` colspan="${c.colspan}"` : "";
                const rowspan = c.rowspan ? ` rowspan="${c.rowspan}"` : "";
                return `<td${colspan}${rowspan}>${inlineHtml(c.content, images, mathFmt)}</td>`;
              })
              .join("");
            const height = n.row_heights?.[rowIndex];
            return `<tr${height ? ` style="height:${height}px"` : ""}>${cells}</tr>`;
          })
          .join("");
        return `<table class="doc-table">${columns}${rows}</table>`;
      }
      if (n.type === "list") {
        const tag = n.ordered ? "ol" : "ul";
        const items = n.items
          .map((it) => `<li>${blockHtml(it, images, mathFmt)}</li>`)
          .join("");
        return `<${tag}>${items}</${tag}>`;
      }
      if (n.type === "columns") {
        const widths = n.columns.map((column) => `${column.width * 100}%`).join(" ");
        const gap = n.gap || 0;
        const columns = n.columns
          .map((column) => {
            const align = column.align || "left";
            const valign = column.valign === "bottom" ? "end" : column.valign === "center" ? "center" : "start";
            return `<div class="doc-column" style="text-align:${align};align-self:${valign}">${blockHtml(column.content, images, mathFmt)}</div>`;
          })
          .join("");
        return `<div class="doc-columns" style="display:grid;grid-template-columns:${widths};gap:${gap}%;break-inside:avoid;page-break-inside:avoid">${columns}</div>`;
      }
      if (n.type === "code_block") {
        const lang = escapeHtml(n.lang || "");
        return `<pre class="doc-code" data-lang="${lang}"><code>${escapeHtml(n.text)}</code></pre>`;
      }
      return "";
    })
    .join("");
}

/** Cây -> HTML, khớp doctree/write/html.py::doc_to_html. `side` left/right ->
 * đẩy ảnh lên TRƯỚC chữ để float neo đúng hàng đầu (nơi gọi tự bọc
 * `.lr-side`, xem LatexRenderer.tsx). */
export function treeToHtml(
  doc: TreeDoc,
  images: ImagesById,
  mathFmt: (tex: string, display: boolean) => string = defaultMathFmt,
): string {
  let nodes = doc.content || [];
  if (doc.side === "left" || doc.side === "right") {
    const imgs = nodes.filter((n) => n.type === "image");
    const rest = nodes.filter((n) => n.type !== "image");
    nodes = [...imgs, ...rest];
  }
  return blockHtml(nodes, images, mathFmt);
}

function inlineText(nodes: InlineNode[]): string {
  return (nodes || [])
    .map((n) => {
      if (n.type === "text") return n.text;
      if (n.type === "math") return n.tex;
      if (n.type === "hard_break") return "\n";
      return "";
    })
    .join("");
}

function blockText(nodes: BlockNode[]): string {
  const out: string[] = [];
  (nodes || []).forEach((n) => {
    if (n.type === "paragraph") out.push(inlineText(n.content));
    else if (n.type === "math_block") out.push(n.tex);
    else if (n.type === "code_block") out.push(n.text);
    else if (n.type === "table") {
      n.rows.forEach((row) =>
        out.push(row.map((c) => inlineText(c.content)).join(" | ")),
      );
    } else if (n.type === "list") {
      n.items.forEach((item) => out.push(blockText(item)));
    } else if (n.type === "columns") {
      n.columns.forEach((column) => out.push(blockText(column.content)));
    }
  });
  return out.filter(Boolean).join("\n");
}

/** Cây -> chữ trơn (tóm tắt/tìm kiếm), khớp doctree/write/text.py::doc_to_text. */
export function treeToPlainText(doc: unknown): string {
  if (typeof doc === "string") return doc.trim();
  if (!isTreeDoc(doc)) return "";
  return blockText(doc.content).trim();
}
