"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import ImageEditorModal, { ImageEditResult } from "./ImageEditorModal";
import { A4_REFERENCE_WIDTH_PX, TreeDoc, isTreeDoc, imagesById, treeToHtml, resolveImgSrc } from "@/lib/docTree";
import { queueTypeset } from "@/lib/mathjax";

interface Props {
  content: string | TreeDoc | null | undefined;
  className?: string;
  layoutType?: string;
  images?: { id?: number | string; storage_path: string; url?: string; width?: number | null; img_type?: string }[];
  editable?: boolean;
  preserveLineBreaks?: boolean;
  imageZoomable?: boolean;
  onImageWidthChange?: (storagePath: string, width: number) => void;
}

/** Ảnh SVG (TikZ) chưa đặt `width` (kích thước gốc) — đánh dấu
 * `data-native-scale` ở docTree.ts::imgHtml / immersedFigureHtml — phóng lên
 * x1.5 so với `naturalWidth` đọc được SAU khi ảnh load xong (chỉ lúc đó mới
 * biết đúng kích thước gốc thật). Chỉ đổi cách HIỂN THỊ trên web, không đụng
 * `width` lưu CSDL — gọi TRƯỚC wireLocalZoom để cụm zoom (nếu có) nhận đúng
 * kích thước đã phóng làm mốc 100%. */
function applyNativeSvgScale(container: HTMLElement) {
  container.querySelectorAll<HTMLImageElement>("img[data-native-scale]").forEach((img) => {
    const scale = parseFloat(img.dataset.nativeScale || "1") || 1;
    const apply = () => {
      const w = img.naturalWidth;
      if (w) img.style.width = Math.round(w * scale) + "px";
    };
    if (img.complete) apply();
    else img.addEventListener("load", apply, { once: true });
  });
}

/** Zoom CỤC BỘ (người xem, không riêng gì giáo viên) — chỉ đổi cách hiển thị
 * trên máy đang xem, KHÔNG gọi API, KHÔNG đổi `width` thật trong CSDL. Nhớ
 * lại qua localStorage theo đúng ảnh (khoá theo src) để lần sau mở lại
 * không phải chỉnh lại, nhưng không đồng bộ giữa các máy/tài khoản. */
function wireLocalZoom(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>(".lr-side-fig").forEach((fig) => {
    const imgRaw = fig.querySelector("img");
    const inputRaw = fig.querySelector<HTMLInputElement>(".lr-zoom-input");
    if (!imgRaw || !inputRaw) return;
    const imgEl: HTMLImageElement = imgRaw;
    const inputEl: HTMLInputElement = inputRaw;

    function setup(basePx: number) {
      if (!basePx) return;
      const key = "lr_zoom_" + imgEl.getAttribute("data-img-key");
      let zoom = parseFloat(localStorage.getItem(key) || "") || 1;
      const clamp = (v: number) => Math.max(0.01, v);

      function render() {
        zoom = clamp(zoom);
        inputEl.value = String(Math.round(zoom * 100));
        imgEl.style.width = Math.round(basePx * zoom) + "px";
      }
      function setZoom(v: number) {
        zoom = clamp(v);
        localStorage.setItem(key, String(zoom));
        render();
      }
      fig.querySelectorAll<HTMLButtonElement>(".lr-zoom-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          setZoom(zoom + (btn.dataset.dir === "1" ? 0.1 : -0.1));
        });
      });
      // Gõ số: áp trực tiếp lên ảnh để xem trước, KHÔNG viết đè inputEl.value
      // (đang gõ dở) và KHÔNG áp min/max — ghi đè input lúc đang gõ làm mất
      // ký tự vừa gõ / con trỏ nhảy lung tung (gõ "50" thành "450"...). Chốt
      // + áp giới hạn tối thiểu + lưu localStorage khi rời khỏi ô (blur);
      // để trống thì trở về kích thước gốc 100%.
      inputEl.addEventListener("input", () => {
        const raw = parseInt(inputEl.value, 10);
        if (!isNaN(raw) && raw > 0) {
          imgEl.style.width = Math.round(basePx * (raw / 100)) + "px";
        }
      });
      inputEl.addEventListener("blur", () => {
        const raw = parseInt(inputEl.value, 10);
        setZoom(isNaN(raw) ? 1 : raw / 100);
      });
      render();
    }

    const declaredBasePx = parseInt(fig.dataset.basePx || "", 10);
    if (declaredBasePx) {
      setup(declaredBasePx);
      return;
    }
    // Ảnh gốc (không có width lưu, vd TikZ SVG) — không có mốc % nào từ CSDL,
    // lấy kích thước ĐÃ HIỂN THỊ sau khi ảnh load
    // làm mốc 100%, giống cách editor suy baseline cho ảnh chưa từng chỉnh.
    const deriveFromRendered = () => {
      const w = imgEl.getBoundingClientRect().width || imgEl.naturalWidth;
      if (w) setup(Math.round(w));
    };
    if (imgEl.complete) deriveFromRendered();
    else imgEl.addEventListener("load", deriveFromRendered, { once: true });
  });
}

function wirePreviewImageZoom(
  container: HTMLElement,
  images: Props["images"],
  onWidthChange?: Props["onImageWidthChange"],
  includeBlockImages = false,
) {
  const rows = imagesById(images || []);
  container.querySelectorAll<HTMLImageElement>("img[data-figure-id]").forEach((img) => {
    const figureId = img.dataset.figureId || "";
    const row = rows[figureId];
    if (!row || img.closest(".lr-side-fig")) return;
    const inline = img.classList.contains("doc-figure-inline");
    // Ảnh inline luôn có zoom trên mọi trang dùng LatexRenderer. Ảnh block
    // giữa trang chỉ có khi caller chủ động bật `imageZoomable`, giữ giao
    // diện các trang đọc không bị thêm điều khiển ngoài yêu cầu.
    if (!inline && !includeBlockImages) return;
    const controls = document.createElement("span");
    controls.className = `lr-preview-zoom${inline ? " is-inline" : ""}`;
    const localOnly = !onWidthChange;
    controls.innerHTML = `<button type="button" data-dir="-1">−</button><input type="number" min="1"><span>%</span><button type="button" data-dir="1">+</button>`;
    const input = controls.querySelector("input") as HTMLInputElement;
    const renderedWidth = img.getBoundingClientRect().width;
    const baseWidthPx = renderedWidth || Math.round((row.width ?? 0.15) * A4_REFERENCE_WIDTH_PX);

    const localKey = `lr_inline_width_${row.storage_path || row.url || figureId}`;
    const apply = (pct: number, notify = true) => {
      pct = Math.max(1, Math.round(pct));
      input.value = String(pct);
      img.style.maxHeight = "none";
      img.style.width = localOnly
        ? Math.round((pct / 100) * baseWidthPx) + "px"
        : Math.round((pct / 100) * A4_REFERENCE_WIDTH_PX) + "px";
      if (notify) {
        if (onWidthChange) onWidthChange(row.storage_path, pct / 100);
        else localStorage.setItem(localKey, String(pct));
      }
    };
    const storedPct = !onWidthChange
      ? Number(localStorage.getItem(localKey) || "")
      : 0;
    const initialPct = Number.isFinite(storedPct) && storedPct >= 1
      ? storedPct
      : localOnly ? 100 : Math.round((row.width ?? 0.15) * 100);
    input.value = String(initialPct);
    if (storedPct >= 5) apply(initialPct, false);
    controls.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const current = parseInt(input.value, 10) || (localOnly ? 100 : Math.round((row.width ?? 0.15) * 100));
        apply(current + (button.dataset.dir === "1" ? 1 : -1));
      });
    });
    input.addEventListener("input", () => {
      const value = parseInt(input.value, 10);
      if (!Number.isNaN(value)) apply(value, false);
    });
    input.addEventListener("blur", () => apply(parseInt(input.value, 10) || (localOnly ? 100 : 1)));

    if (inline) {
      const wrapper = document.createElement("span");
      wrapper.className = "lr-preview-inline-image";
      img.parentNode?.insertBefore(wrapper, img);
      wrapper.appendChild(img);
      wrapper.appendChild(controls);
    } else {
      img.parentNode?.insertBefore(controls, img);
    }
  });
}

/** Cụm ảnh trôi (layout immini) — vẫn dựng tay ở đây (không qua treeToHtml,
 * hàm đó chỉ lo phần dựng HTML dùng chung với PDF) vì cần gắn thêm cụm nút
 * zoom cục bộ (−/%/+, chỉ có ở web). Ảnh KHÔNG có `width` lưu (kích thước
 * gốc, vd TikZ SVG) vẫn có cụm nút — `wireLocalZoom` tự suy mốc 100% từ
 * kích thước đã render sau khi ảnh load (xem `deriveFromRendered`). */
function immersedFigureHtml(figureId: number | string, images: ReturnType<typeof imagesById>): string {
  const row = images[String(figureId)];
  if (!row) return "";
  const imgSrc = resolveImgSrc(row.url || row.storage_path);
  const widthPx = row.width != null ? Math.round(row.width * A4_REFERENCE_WIDTH_PX) : null;
  const sizeCss = widthPx ? `width:${widthPx}px; height:auto;` : `width:auto; height:auto;`;
  const zoomCluster = `<span class="lr-local-zoom">
        <button type="button" class="lr-zoom-btn" data-dir="-1" title="Thu nhỏ (chỉ mình bạn thấy)">−</button>
        <input type="number" class="lr-zoom-input" value="100" min="1" title="Gõ thẳng % (chỉ mình bạn thấy)">
        <span class="lr-zoom-sign">%</span>
        <button type="button" class="lr-zoom-btn" data-dir="1" title="Phóng to (chỉ mình bạn thấy)">+</button>
      </span>`;
  // Ảnh gốc SVG (TikZ) — đánh dấu để applyNativeSvgScale phóng x1.5 lên
  // naturalWidth NGAY khi ảnh load, TRƯỚC khi wireLocalZoom đo kích thước đã
  // render làm mốc 100% — nhờ vậy cụm zoom tự nhận đúng cỡ đã phóng làm gốc,
  // không cần sửa gì thêm ở wireLocalZoom.
  const scaleAttr = !widthPx && row.img_type === "tikz" ? ` data-native-scale="1.5"` : "";
  return `<span class="lr-side-fig" data-base-px="${widthPx ?? ""}">
    ${zoomCluster}
    <img src="${imgSrc}" alt="Hình vẽ" data-img-key="${imgSrc}"${scaleAttr} style="${sizeCss} display:block; border-radius: var(--radius-sm); border: 1px solid var(--border); object-fit: contain; background-color: #fff;"/>
  </span>`;
}

export default function LatexRenderer({
  content,
  className = "",
  layoutType = "normal",
  images = [],
  editable = false,
  preserveLineBreaks = false,
  imageZoomable = false,
  onImageWidthChange,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const [editingSrc, setEditingSrc] = useState<string | null>(null);
  const [editingEl, setEditingEl] = useState<HTMLImageElement | null>(null);

  // Click delegation — runs once on mount, checks editableRef at call time
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const handleClick = (e: MouseEvent) => {
      if (!editableRef.current) return;
      const img = (e.target as Element).closest(
        "img",
      ) as HTMLImageElement | null;
      if (img) {
        setEditingSrc(img.src);
        setEditingEl(img);
      }
    };
    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, []);

  const handleSave = useCallback(
    async (result: ImageEditResult) => {
      if (!editingEl || !editingSrc) return;

      const url = new URL(editingSrc, window.location.href);
      const imgPath = url.pathname
        .replace(/^\/api/, "")
        .replace(/^\/static\/images\//, "");
      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;

      // Modal giờ chỉ còn cắt ảnh raster (SVG không mở modal này — xem
      // RichLatexEditor.tsx); cỡ hiển thị đổi qua cụm nút −/%/+ riêng.
      const formData = new FormData();
      formData.append("img_path", imgPath);
      formData.append("file", result.blob, "edited.png");

      const res = await fetch("/api/questions/images/edit", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error("Save failed");

      const newSrc = editingSrc.split("?")[0] + "?t=" + Date.now();
      editingEl.src = newSrc;
      setEditingSrc(null);
      setEditingEl(null);
    },
    [editingSrc, editingEl],
  );

  useEffect(() => {
    if (!ref.current || !content) return;

    let cleaned: string;

    if (typeof content === "string") {
      // Chỉ còn xảy ra với đáp án `sa` (q_shortans_details.content vẫn là
      // text thường, luôn là số) — hiển thị tối giản, không cần dựng cây.
      const escaped = content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      cleaned = preserveLineBreaks
        ? escaped.replace(/\n/g, "<br/>")
        : escaped.replace(/\n\n/g, "<br/><br/>").replace(/(?<!\n)\n(?!\n)/g, " ");
    } else if (isTreeDoc(content)) {
      const imgMap = imagesById(images);
      const immini = (layoutType || "").startsWith("immini");
      if (immini) {
        // Ảnh nổi (immini): tách nút ảnh ra dựng riêng (kèm cụm zoom cục bộ),
        // xuất TRƯỚC chữ (bất kể vị trí gốc) để float neo đúng hàng đầu.
        const figNode = content.content.find((n) => n.type === "image");
        const restNodes = content.content.filter((n) => n !== figNode);
        const figHtml = figNode && figNode.type === "image" ? immersedFigureHtml(figNode.figure_id, imgMap) : "";
        const restHtml = treeToHtml({ ...content, content: restNodes }, imgMap);
        cleaned = figHtml ? `<div class="lr-side">${figHtml}${restHtml}</div>` : restHtml;
      } else {
        cleaned = treeToHtml(content, imgMap);
      }
    } else {
      return;
    }

    ref.current.innerHTML = cleaned;

    if (editable) {
      ref.current.querySelectorAll("img").forEach((img) => {
        (img as HTMLImageElement).style.cursor = "pointer";
      });
    }

    applyNativeSvgScale(ref.current);
    wireLocalZoom(ref.current);
    wirePreviewImageZoom(
      ref.current,
      images,
      onImageWidthChange,
      imageZoomable,
    );

    // Trigger MathJax to re-render (xếp hàng tuần tự, xem queueTypeset ở trên)
    queueTypeset();
  }, [content, layoutType, images, editable, preserveLineBreaks, imageZoomable, onImageWidthChange]);

  if (!content) return null;

  return (
    <>
      <div ref={ref} className={`latex-content ${className}`} />
      {editingSrc && (
        <ImageEditorModal
          src={editingSrc}
          onSave={handleSave}
          onClose={() => {
            setEditingSrc(null);
            setEditingEl(null);
          }}
        />
      )}
    </>
  );
}
