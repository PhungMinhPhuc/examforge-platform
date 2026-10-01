"use client";

import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

export type MessageBarIntent = "info" | "success" | "warning" | "error";

type MessageBarProps = {
  intent?: MessageBarIntent;
  title?: ReactNode;
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  className?: string;
};

const ICON_BY_INTENT: Record<MessageBarIntent, IconName> = {
  info: "info",
  success: "check-circle",
  warning: "warning",
  error: "x-circle",
};

export default function MessageBar({
  intent = "info",
  title,
  children,
  actionLabel,
  onAction,
  onDismiss,
  className = "",
}: MessageBarProps) {
  return (
    <div
      className={`ui-message-bar ui-message-bar--${intent} ${className}`.trim()}
      role={intent === "error" || intent === "warning" ? "alert" : "status"}
    >
      <div className={`ui-message-bar__layout ${title != null ? "ui-message-bar__layout--with-detail" : ""}`.trim()}>
        <Icon className="ui-message-bar__icon" name={ICON_BY_INTENT[intent]} />
        {title != null ? (
          <>
            <strong className="ui-message-bar__title">{title}</strong>
            <div className="ui-message-bar__message">{children}</div>
          </>
        ) : (
          <div className="ui-message-bar__title ui-message-bar__title--plain">{children}</div>
        )}
        {actionLabel ? (
          <button className="ui-message-bar__action" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
        <button
          className="ui-message-bar__close"
          type="button"
          aria-label="Đóng thông báo"
          onClick={onDismiss}
        >
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}
