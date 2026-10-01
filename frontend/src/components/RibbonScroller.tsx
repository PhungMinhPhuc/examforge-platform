"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "@/components/icons";

export default function RibbonScroller({
  children,
  role = "toolbar",
  ariaLabel,
  resetKey,
  className = "",
}: {
  children: ReactNode;
  role?: "toolbar" | "tabpanel";
  ariaLabel?: string;
  resetKey?: string | number;
  className?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  const updateScrollState = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setCanScrollBack(viewport.scrollLeft > 1);
    setCanScrollForward(
      viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1,
    );
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = 0;
    const frame = requestAnimationFrame(updateScrollState);
    const resizeObserver = new ResizeObserver(updateScrollState);
    const mutationObserver = new MutationObserver(updateScrollState);
    resizeObserver.observe(viewport);
    mutationObserver.observe(viewport, { childList: true, subtree: true });
    viewport.addEventListener("scroll", updateScrollState, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      viewport.removeEventListener("scroll", updateScrollState);
    };
  }, [resetKey, updateScrollState]);

  const scrollByGroup = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const groups = Array.from(
      viewport.querySelectorAll<HTMLElement>(".ui-ribbon__tool-group"),
    );
    const current = viewport.scrollLeft;
    const target = direction > 0
      ? groups.find((group) => group.offsetLeft > current + 2)?.offsetLeft
      : groups
          .filter((group) => group.offsetLeft < current - 2)
          .at(-1)?.offsetLeft;
    viewport.scrollTo({
      left: target ?? current + direction * viewport.clientWidth * 0.75,
      behavior: "smooth",
    });
  };

  return (
    <div className="ui-ribbon__scroll-shell">
      <button
        className="ui-button ui-button--outline ui-button--icon ui-button--small ui-ribbon__scroll-button ui-ribbon__scroll-button--back"
        type="button"
        aria-label="Nhóm công cụ trước"
        title="Nhóm công cụ trước"
        disabled={!canScrollBack}
        onClick={() => scrollByGroup(-1)}
      >
        <Icon name="chevron-left" />
      </button>
      <div
        className={`ui-ribbon__tool-row ui-ribbon__tool-viewport ${canScrollBack || canScrollForward ? "ui-ribbon__tool-viewport--overflowing" : ""} ${className}`.trim()}
        ref={viewportRef}
        role={role}
        aria-label={ariaLabel}
      >
        {children}
      </div>
      <button
        className="ui-button ui-button--outline ui-button--icon ui-button--small ui-ribbon__scroll-button ui-ribbon__scroll-button--forward"
        type="button"
        aria-label="Nhóm công cụ tiếp theo"
        title="Nhóm công cụ tiếp theo"
        disabled={!canScrollForward}
        onClick={() => scrollByGroup(1)}
      >
        <Icon name="chevron-right" />
      </button>
    </div>
  );
}
