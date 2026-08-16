"use client";

import {
  useRef,
  useLayoutEffect,
  useState,
  ReactNode,
  CSSProperties,
} from "react";

/**
 * Lưới đáp án tự chọn số cột dựa trên KẾT QUẢ RENDER thật, không đếm ký tự.
 *
 * Cách hoạt động: thử số cột nhiều nhất (tối đa 4), nếu có ô nào bị xuống dòng
 * (chiều cao nội dung > 1 dòng) thì giảm cột dần cho tới khi mọi ô gọn 1 dòng,
 * hoặc còn 1 cột. Nhờ đo chiều cao đã render nên công thức toán (nguồn dài, render
 * ngắn) không bị nhầm là dài, còn chữ thật dài sẽ tự xuống ít cột hơn.
 */
export default function AdaptiveOptionGrid({
  count,
  children,
  style,
}: {
  count: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(() => Math.min(4, Math.max(1, count)));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = (n: number) => {
      el.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
    };

    // Đo theo BỀ RỘNG NỘI TẠI (max-content):
    // So sánh chiều rộng lý tưởng (nếu không xuống dòng) với chiều rộng thực tế.
    // Nếu lý tưởng > thực tế -> nội dung đang bị bẻ dòng hoặc tràn ngang.
    const anyWraps = () => {
      const cells = Array.from(
        el.querySelectorAll<HTMLElement>("[data-opt-cell]"),
      );
      return cells.some((cell) => {
        const content =
          cell.querySelector<HTMLElement>(".latex-content") || cell;

        const avail = content.getBoundingClientRect().width;

        const prevWidth = content.style.width;
        const prevMaxWidth = content.style.maxWidth;
        const prevFlexShrink = content.style.flexShrink;

        // Ép width để đo kích thước lý tưởng, chống shrink nếu là flex item
        content.style.width = "max-content";
        content.style.maxWidth = "none";
        content.style.flexShrink = "0";

        const needed = content.getBoundingClientRect().width;

        // Khôi phục
        content.style.width = prevWidth;
        content.style.maxWidth = prevMaxWidth;
        content.style.flexShrink = prevFlexShrink;

        // Xóa thông tin debug cũ nếu có
        const oldDebug = cell.querySelector(".debug-info");
        if (oldDebug) oldDebug.remove();

        // +2px dung sai để tránh giảm cột vì sai số làm tròn.
        return needed > avail + 2;
      });
    };

    const fit = () => {
      let c = Math.min(4, Math.max(1, count));
      apply(c);
      let guard = 0;
      while (c > 1 && anyWraps() && guard < 6) {
        if (c === 4) {
          c = 2;
        } else {
          c = 1;
        }
        apply(c);
        guard += 1;
      }
      setCols(c);
    };

    fit();
    // Đo lại sau khi MathJax/KaTeX render xong và khi đổi kích thước.
    const t = window.setTimeout(fit, 400);
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, [count]);

  return (
    <div
      ref={ref}
      style={{
        display: "grid",
        rowGap: "0.4rem",
        columnGap: "0.75rem",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        alignItems: "baseline",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
