"use client";

import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

export type ToastKind = "info" | "success" | "warning" | "error";

type ToastProps = {
  kind?: ToastKind;
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  className?: string;
};

const ICON_BY_KIND: Record<ToastKind, IconName> = {
  info: "info",
  success: "check-circle",
  warning: "warning",
  error: "x-circle",
};

export default function Toast({
  kind = "info",
  children,
  actionLabel,
  onAction,
  onDismiss,
  className = "",
}: ToastProps) {
  return (
    <div
      className={`ui-toast ui-toast--${kind} ${className}`.trim()}
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon className="ui-toast__icon" name={ICON_BY_KIND[kind]} />
      <span className="ui-toast__message">{children}</span>
      {actionLabel ? (
        <button className="ui-toast__action" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
      {onDismiss ? (
        <button
          className="ui-toast__close"
          type="button"
          aria-label="Đóng thông báo"
          onClick={onDismiss}
        >
          <Icon name="close" />
        </button>
      ) : null}
    </div>
  );
}
