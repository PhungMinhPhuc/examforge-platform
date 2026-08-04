"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import ImageEditorModal, { ImageEditResult } from "./ImageEditorModal";

interface Props {
  content: string;
  className?: string;
  layoutType?: string;
  images?: { storage_path: string; img_scale?: number; img_type?: string }[];
  editable?: boolean;
  preserveLineBreaks?: boolean;
}

declare global {
  interface Window {
    MathJax?: {
      typesetPromise: (elements?: HTMLElement[]) => Promise<void>;
      typesetClear: (elements?: HTMLElement[]) => void;
    };
  }
}

export default function LatexRenderer({
  content,
  className = "",
  layoutType = "normal",
  images = [],
  editable = false,
  preserveLineBreaks = false,
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

      if (result.kind === "scale") {
        // SVG: chỉ lưu tỉ lệ vào DB, không sửa file.
        const fd = new FormData();
        fd.append("img_path", imgPath);
        fd.append("scale", String(result.scale));
        const res = await fetch("/api/questions/images/scale", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        if (!res.ok) throw new Error("Save failed");
        editingEl.style.zoom = String(result.scale * 1.5);
        setEditingSrc(null);
        setEditingEl(null);
        return;
      }

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

    let extractedImages: string[] = [];

    // Khắc phục nội dung bị pandoc escape khi import từ Word (\textbackslash, \{, \}...).
    // Chỉ chạy khi có dấu hiệu lỗi để KHÔNG ảnh hưởng nội dung đúng (vd \{ \} hợp lệ).
    let source = content;
    if (
      source.includes("\\textbackslash") ||
      source.includes("\\textbraceleft")
    ) {
      source = source
        .replace(/\\textbackslash\\textbackslash(?:\{\})?/g, "\\\\")
        .replace(/\\textbackslash\s?/g, "\\")
        .replace(/\\textbraceleft\s?/g, "{")
        .replace(/\\textbraceright\s?/g, "}")
        .replace(/\\textbar(?:\{\})?\s?/g, "\\vert ")
        .replace(/\\\{/g, "{")
        .replace(/\\\}/g, "}")
        .replace(/\\\^\{\}/g, "^");
    }

    // Convert markdown image syntax ![alt](src) to HTML <img> tags
    let cleaned = source.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (match, alt, src) => {
        // Normalize path: ensure it starts with / for API serving
        let imgSrc = src.replace(/\\\\/g, "/");
        if (!imgSrc.startsWith("http")) {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api";
          if (apiUrl.endsWith("/") && imgSrc.startsWith("/")) {
            imgSrc = apiUrl + imgSrc.slice(1);
          } else if (!apiUrl.endsWith("/") && !imgSrc.startsWith("/")) {
            imgSrc = apiUrl + "/" + imgSrc;
          } else {
            imgSrc = apiUrl + imgSrc;
          }
        }

        let scale = 1;
        if (images && images.length > 0) {
          const matchName = imgSrc.split("/").pop();
          if (matchName) {
            const imgInfo = images.find(
              (img) =>
                img.storage_path &&
                img.storage_path.replace(/\\\\/g, "/").endsWith(matchName),
            );
            if (imgInfo && imgInfo.img_scale) {
              scale = imgInfo.img_scale;
            }
          }
        }

        if ((layoutType || "").startsWith("immini")) {
          const imgHtml = `<img src="${imgSrc}" alt="${alt || "Hình vẽ"}" style="max-width:100%; width:auto; height:auto; zoom:${scale}; border-radius: var(--radius-sm); border: 1px solid var(--border); object-fit: contain; background-color: #fff;"/>`;
          extractedImages.push(imgHtml);
          return "";
        }
        return `<img src="${imgSrc}" alt="${alt || "Hình vẽ"}" style="max-width:100%; width:auto; height:auto; zoom:${scale}; display:block; margin: 10px auto; object-fit: contain; background-color: #fff;"/>`;
      },
    );

    // [Backwards compat] Remove TikZ blocks from old DB records
    cleaned = cleaned
      .replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, "")
      .replace(/\\tikz\s*\[[^\]]*\]\s*\{[\s\S]*?\}/g, "")
      .replace(/\\tikz\s*\{[\s\S]*?\}/g, "");

    // Remove other visual-only LaTeX environments
    cleaned = cleaned
      .replace(/\\begin\{center\}|\\end\{center\}/g, "")
      .replace(/\\begin\{figure\*?\}[\s\S]*?\\end\{figure\*?\}/g, "")
      .replace(/\\begin\{table\*?\}(?:\[[^\]]*\])?/g, "")
      .replace(/\\end\{table\*?\}/g, "")
      .replace(
        /\\caption\{([^}]*)\}/g,
        '<div style="text-align: center; font-style: italic; font-size: 0.9em; margin-top: 0.5rem; color: var(--text-secondary);">$1</div>',
      )
      .replace(/\\centering/g, "")
      .replace(/\\includegraphics\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/g, "");

    // Convert tabular to HTML table
    cleaned = cleaned.replace(
      /\\begin\{(tabular|tabularx|longtable)\}(?:\[[^\]]*\])?(?:\{[^}]*\})*([\s\S]*?)\\end\{\1\}/g,
      (match, envName, tableContent) => {
        let html =
          '<div style="overflow-x: auto; margin: 1rem 0;"><table style="border-collapse: collapse; width: 100%; font-size: 0.9em;">';
        const rows = tableContent.split(/\\\\/);
        rows.forEach((row: string) => {
          let r = row
            .replace(/\\hline/g, "")
            .replace(/\\cline\{[^}]*\}/g, "")
            .trim();
          if (!r) return;
          html += "<tr>";
          const cells = r.split(/(?<!\\)&/);
          cells.forEach((cell: string) => {
            let cellContent = cell.trim();
            let colspan = 1;

            const multiMatch = cellContent.match(
              /^\\multicolumn\{(\d+)\}\{[^}]*\}\{([\s\S]*)\}$/,
            );
            if (multiMatch) {
              colspan = parseInt(multiMatch[1], 10);
              cellContent = multiMatch[2];
            }

            html += `<td colspan="${colspan}" style="border: 1px solid var(--border); padding: 0.5rem; text-align: center;">${cellContent}</td>`;
          });
          html += "</tr>";
        });
        html += "</table></div>";
        // Temporarily encode to avoid <br/> conversion later
        return html.replace(/\\\\/g, "");
      },
    );

    // Convert itemize to HTML lists
    cleaned = cleaned.replace(
      /\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g,
      (match, listContent) => {
        let html =
          '<ul style="margin-left: 1.5rem; margin-top: 0.5rem; list-style-type: disc;">';
        const items = listContent
          .split(/\\item\s*/)
          .filter((i: string) => i.trim());
        items.forEach((item: string) => {
          html += `<li style="margin-bottom: 0.25rem;">${item.trim()}</li>`;
        });
        html += "</ul>";
        return html;
      },
    );

    // Convert enumerate to HTML lists
    cleaned = cleaned.replace(
      /\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g,
      (match, listContent) => {
        let html = '<ol style="margin-left: 1.5rem; margin-top: 0.5rem;">';
        const items = listContent
          .split(/\\item\s*/)
          .filter((i: string) => i.trim());
        items.forEach((item: string) => {
          html += `<li style="margin-bottom: 0.25rem;">${item.trim()}</li>`;
        });
        html += "</ol>";
        return html;
      },
    );

    // Remove excessive blank lines around block math to prevent huge gaps
    cleaned = cleaned.replace(/\n{2,}(\$\$|\\\[)/g, "\n$1");
    cleaned = cleaned.replace(/(\$\$|\\\])\n{2,}/g, "$1\n");

    const parts = cleaned.split(
      /(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g,
    );

    cleaned = parts
      .map((part) => {
        // Nếu là display math
        if (
          (part.startsWith("$$") && part.endsWith("$$")) ||
          (part.startsWith("\\[") && part.endsWith("\\]"))
        )
          return part;

        // Nếu là inline math
        if (
          (part.startsWith("$") && part.endsWith("$")) ||
          (part.startsWith("\\(") && part.endsWith("\\)"))
        ) {
          const isParen = part.startsWith("\\(");
          const inner = isParen ? part.slice(2, -2) : part.slice(1, -1);
          if (!inner.includes("\\displaystyle")) {
            return isParen
              ? `\\(\\displaystyle ${inner}\\)`
              : `$\\displaystyle ${inner}$`;
          }
          return part;
        }

        // Nếu là text thường, áp dụng các regex format HTML
        let textPart = part.replace(
          /^#{1,6}\s+(.+)$/gm,
          '<strong style="display:block; margin:.45rem 0 .2rem;">$1</strong>',
        );
        textPart = preserveLineBreaks
          ? textPart.replace(/\n/g, "<br/>")
          : textPart
              .replace(/\n\n/g, "<br/><br/>")
              .replace(/(?<!\n)\n(?!\n)/g, " ");
        return (
          textPart
            .replace(/\\newline/g, "<br/>")
            .replace(/\\\\/g, "<br/>")
            .replace(
              /\\subsubsection\*?\{([^}]+)\}/g,
              "<br/><strong>$1</strong><br/>",
            )
            .replace(
              /\\subsection\*?\{([^}]+)\}/g,
              '<br/><strong style="font-size: 1.1em;">$1</strong><br/>',
            )
            .replace(
              /\\section\*?\{([^}]+)\}/g,
              '<br/><strong style="font-size: 1.2em;">$1</strong><br/>',
            )
            .replace(/\\textbf\{([^}]+)\}/g, "<strong>$1</strong>")
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/\\textit\{([^}]+)\}/g, "<em>$1</em>")
            .replace(/\\underline\{([^}]+)\}/g, "<u>$1</u>")
            .replace(/\\ul\{([^}]+)\}/g, "<u>$1</u>")
            .replace(
              /\\hl\{([^}]+)\}/g,
              '<mark style="background:#fff3a3; padding:0 .15em; border-radius:2px;">$1</mark>',
            )
            .replace(/\\text\{([^}]+)\}/g, "$1")
            .replace(/\n- (.*?)(?=\n|$)/g, "<br/>• $1")
            // \vert is a math command; in plain text (an option ending with "|") it would
            // show up literally as "\vert" — render it as the vertical bar it stands for.
            .replace(/\\vert\b\s?/g, "|")
            // Ký tự LaTeX bị pandoc escape — hiện lại dạng thường (\% là phổ biến nhất)
            .replace(/\\%/g, "%")
            .replace(/\\#/g, "#")
            .replace(/\\&/g, "&amp;")
            .replace(/\\_/g, "_")
            .replace(/\\hspace\*?\{[^}]*\}/g, " ")
            .replace(/\\vspace\*?\{[^}]*\}/g, "")
            .replace(/\\noindent/g, "")
            .replace(/\\medskip|\\bigskip|\\smallskip/g, "<br/>")
            .replace(/\\displaystyle\s*/g, "")
            .replace(/\\quad/g, "&nbsp;&nbsp;&nbsp;&nbsp;")
            .replace(
              /\\qquad/g,
              "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;",
            )
            .replace(/\\hfil/g, "&nbsp;&nbsp;")
            .replace(/\\hfill/g, "&nbsp;&nbsp;")
        );
      })
      .join("");

    if ((layoutType || "").startsWith("immini") && extractedImages.length > 0) {
      cleaned = `
        <div style="display: flex; flex-wrap: wrap; gap: 1.5rem; align-items: flex-start; justify-content: space-between;">
          <div style="flex: 1 1 300px; min-width: 0;">
            ${cleaned}
          </div>
          <div style="flex: 0 1 auto; max-width: 55%; display: flex; flex-direction: column; gap: 1rem; align-items: flex-end;">
            ${extractedImages.join("")}
          </div>
        </div>
      `;
    }

    ref.current.innerHTML = cleaned;

    if (editable) {
      ref.current.querySelectorAll("img").forEach((img) => {
        (img as HTMLImageElement).style.cursor = "pointer";
      });
    }

    // Trigger MathJax to re-render
    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetClear([ref.current]);
      window.MathJax.typesetPromise([ref.current]).catch(console.error);
    }
  }, [content, layoutType, editable, preserveLineBreaks]);

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
