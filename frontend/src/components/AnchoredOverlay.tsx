"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

type Props = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  overlayRef?: RefObject<HTMLDivElement | null>;
};

export default function AnchoredOverlay({
  anchorRef,
  overlayRef,
  children,
  className,
  style,
  ...props
}: Props) {
  const internalRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const overlay = internalRef.current;
    if (!anchor || !overlay) return;

    const update = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const overlayRect = overlay.getBoundingClientRect();
      const rootStyle = getComputedStyle(document.documentElement);
      const gap = Number.parseFloat(rootStyle.getPropertyValue("--space-1")) || 4;
      const edge = Number.parseFloat(rootStyle.getPropertyValue("--space-2")) || 8;
      const roomBelow = window.innerHeight - anchorRect.bottom - edge;
      const top =
        roomBelow >= overlayRect.height || roomBelow >= anchorRect.top
          ? anchorRect.bottom + gap
          : anchorRect.top - overlayRect.height - gap;
      const left = Math.min(
        Math.max(edge, anchorRect.left),
        Math.max(edge, window.innerWidth - overlayRect.width - edge),
      );
      setPosition({ left, top: Math.max(edge, top), visibility: "visible" });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    observer.observe(overlay);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      {...props}
      ref={(node) => {
        internalRef.current = node;
        if (overlayRef) overlayRef.current = node;
      }}
      className={className}
      style={{ ...style, ...position }}
    >
      {children}
    </div>,
    document.body,
  );
}
