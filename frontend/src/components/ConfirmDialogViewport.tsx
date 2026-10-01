"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import {
  getConfirmDialogSnapshot,
  settleConfirmDialog,
  subscribeConfirmDialog,
} from "@/lib/confirmDialog";

export default function ConfirmDialogViewport() {
  const request = useSyncExternalStore(
    subscribeConfirmDialog,
    getConfirmDialogSnapshot,
    () => null,
  );
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!request) return;
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") settleConfirmDialog(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [request]);

  if (!request) return null;

  const titleId = `ui-confirm-dialog-title-${request.id}`;
  const descriptionId = `ui-confirm-dialog-description-${request.id}`;

  return (
    <div
      className="ui-modal-backdrop ui-confirm-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) settleConfirmDialog(false);
      }}
    >
      <section
        className="ui-modal ui-modal--small ui-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="ui-modal__header">
          <div className="ui-modal__heading">
            <h2 className="ui-modal__title" id={titleId}>
              {request.title ?? "Xác nhận thao tác"}
            </h2>
          </div>
          <button
            className="ui-modal__close"
            type="button"
            aria-label="Đóng"
            onClick={() => settleConfirmDialog(false)}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="ui-modal__body ui-confirm-dialog__message" id={descriptionId}>
          {request.message}
        </div>
        <footer className="ui-modal__footer">
          <button
            ref={cancelRef}
            className="ui-button ui-button--secondary"
            type="button"
            onClick={() => settleConfirmDialog(false)}
          >
            {request.cancelLabel ?? "Hủy"}
          </button>
          <button
            className={`ui-button ${request.intent === "danger" ? "ui-button--danger" : "ui-button--primary"}`}
            type="button"
            onClick={() => settleConfirmDialog(true)}
          >
            {request.confirmLabel ?? "Xác nhận"}
          </button>
        </footer>
      </section>
    </div>
  );
}
