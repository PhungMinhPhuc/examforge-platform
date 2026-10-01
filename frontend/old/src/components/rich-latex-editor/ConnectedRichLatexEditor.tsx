"use client";

import { useCallback, useRef, useState, type MouseEvent } from "react";
import LegacyRichLatexEditor from "../RichLatexEditor";
import type { EditorCommandId } from "./commands/types";
import { EditorRibbon } from "./components/EditorRibbon";
import { useRibbonState } from "./hooks/useRibbonState";
import { useFormattingState } from "./hooks/useFormattingState";
import type { RichLatexEditorProps } from "./types";
import styles from "./styles/connected.module.css";

const EXEC_COMMANDS: Partial<Record<EditorCommandId, string>> = {
  undo: "undo", redo: "redo", copy: "copy", cut: "cut", paste: "paste",
  bold: "bold", italic: "italic", underline: "underline",
  superscript: "superscript", subscript: "subscript",
};

const ICON_COMMANDS: Partial<Record<EditorCommandId, string>> = {
  "insert-math": "sigma", "insert-image": "image", "ordered-list": "list-ordered",
  "bullet-list": "list-bullet", "align-left": "align-left", "align-center": "align-center",
  "align-right": "align-right", "align-justify": "align-justify", "insert-table": "table",
  "insert-row-below": "insert-row-below", "delete-rows": "delete-rows",
  "insert-col-right": "insert-col-right", "delete-columns": "delete-columns",
  "merge-cells": "merge", "split-cells": "split", "insert-code": "code",
  "image-float-right": "float-right", "image-center": "image-centered",
};

export default function ConnectedRichLatexEditor(props: RichLatexEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedImageRef = useRef<HTMLElement | null>(null);
  const [selectedImageCanEdit, setSelectedImageCanEdit] = useState(false);
  const ribbon = useRibbonState();
  const { formattingState, refreshFormattingState } = useFormattingState(
    rootRef,
    null,
  );
  const hiddenCommands = new Set<EditorCommandId>(["paste"]);
  if (!props.imageEditable) hiddenCommands.add("insert-image");
  if (!props.showLayoutControl) {
    hiddenCommands.add("image-center");
    hiddenCommands.add("image-float-right");
  }
  if (!selectedImageCanEdit)
    hiddenCommands.add("image-crop");

  const dispatch = useCallback((command: EditorCommandId, value?: string) => {
    const root = rootRef.current;
    if (!root) return;
    const surface = root.querySelector<HTMLElement>(".rle-surface");
    const selection = window.getSelection();
    if (!selection?.anchorNode || !surface?.contains(selection.anchorNode))
      surface?.focus({ preventScroll: true });

    const exec = EXEC_COMMANDS[command];
    if (exec) {
      document.execCommand(exec, false, value);
      if (!["copy", "cut"].includes(command))
        surface?.dispatchEvent(new InputEvent("input", { bubbles: true }));
      requestAnimationFrame(refreshFormattingState);
      return;
    }

    if (command === "highlight" || command === "text-color") {
      if (command === "text-color" && value) {
        document.execCommand("foreColor", false, value);
        surface?.dispatchEvent(new InputEvent("input", { bubbles: true }));
      } else {
        const buttons = root.querySelectorAll<HTMLButtonElement>(".rle-toolbar > button");
        buttons[3]?.click();
      }
      requestAnimationFrame(refreshFormattingState);
      return;
    }

    if (command === "insert-math") {
      root
        .querySelector<HTMLButtonElement>('.rle-toolbar button[title="Chèn công thức"]')
        ?.click();
      return;
    }

    const imageCommands: Partial<Record<EditorCommandId, string>> = {
      "image-grow": "inc",
      "image-shrink": "dec",
      "image-crop": "edit",
      "image-delete": "del",
    };
    const imageCommand = imageCommands[command];
    if (imageCommand) {
      selectedImageRef.current
        ?.querySelector<HTMLButtonElement>(`button[data-imgcmd="${imageCommand}"]`)
        ?.click();
      return;
    }

    const iconName = ICON_COMMANDS[command];
    const icon = iconName
      ? root.querySelector<SVGSVGElement>(`.rle-toolbar svg[data-icon-name="${iconName}"]`)
      : null;
    icon?.closest<HTMLButtonElement>("button")?.click();
    requestAnimationFrame(refreshFormattingState);
  }, [refreshFormattingState]);

  const handleEditorClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    if (target.closest("nav")) return;
    const image = target.closest<HTMLElement>(".rle-image");
    selectedImageRef.current = image;
    setSelectedImageCanEdit(!!image?.querySelector('[data-imgcmd="edit"]'));
    if (target.closest("table.rle-table")) ribbon.setContext("table");
    else if (image) ribbon.setContext("picture");
    else ribbon.setContext(null);
  }, [ribbon]);

  return (
    <div className={styles.root} ref={rootRef} onClickCapture={handleEditorClick}>
      <EditorRibbon
        activeTab={ribbon.activeTab}
        context={ribbon.context}
        expanded={ribbon.expanded}
        onSelectTab={ribbon.selectTab}
        onToggle={ribbon.toggle}
        dispatch={dispatch}
        formattingState={formattingState}
        hiddenCommands={hiddenCommands}
      />
      <div className={styles.legacyHost}>
        <LegacyRichLatexEditor {...props} />
      </div>
    </div>
  );
}
