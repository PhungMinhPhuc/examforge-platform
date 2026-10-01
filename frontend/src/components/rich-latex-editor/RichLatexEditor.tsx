"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import { emptyDoc, isTreeDoc, type BlockNode } from "@/lib/docTree";
import api from "@/lib/api";
import { queueTypeset } from "@/lib/mathjax";
import { EditorRibbon } from "./components/EditorRibbon";
import { EditorSurface } from "./components/EditorSurface";
import { MathDialog } from "./dialogs/MathDialog";
import { TableDialog } from "./dialogs/TableDialog";
import { insertBlockAtSelection, useEditorController } from "./hooks/useEditorController";
import { useFormattingState } from "./hooks/useFormattingState";
import { useRibbonState } from "./hooks/useRibbonState";
import { editorAdapter } from "./model/editorAdapter";
import {
  captureSelectionBookmark,
  deleteMathAtom,
  endOfSurfaceBookmark,
  insertCodeBlockAtBookmark,
  insertMathAtBookmark,
  restoreSelectionBookmark,
  updateMathAtom,
  type SelectionBookmark,
} from "./math/commands";
import type { RichLatexEditorProps } from "./types";
import { selectedDomCells } from "./table/selection";
import styles from "./styles/editor.module.css";

const UNSET_CONTENT = Symbol("unset-editor-content");

function documentsEqual(
  left: RichLatexEditorProps["content"] | typeof UNSET_CONTENT,
  right: RichLatexEditorProps["content"] | typeof UNSET_CONTENT,
) {
  if (left === right) return true;
  if (left === UNSET_CONTENT || right === UNSET_CONTENT) return false;
  const normalized = (value: RichLatexEditorProps["content"]) => value
    ? { ...value, side: value.side ?? "center" }
    : value;
  const stable = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record).filter((key) => record[key] !== undefined)
        .sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
        .join(",")}}`;
    }
    return JSON.stringify(value);
  };
  return stable(normalized(left)) === stable(normalized(right));
}

function blockHasImage(block: BlockNode): boolean {
  if (block.type === "image") return true;
  if (block.type === "paragraph")
    return block.content.some((node) => node.type === "image_inline");
  if (block.type === "table")
    return block.rows.some((row) => row.some((cell) =>
      cell.content.some((node) =>
        node.type === "image_inline" ||
        (node.type === "table" && blockHasImage(node))
      )));
  if (block.type === "list")
    return block.items.some((item) => item.some(blockHasImage));
  if (block.type === "columns")
    return block.columns.some((column) => column.content.some(blockHasImage));
  return false;
}
type MathDialogState =
  | { mode: "new"; bookmark: SelectionBookmark; value: string; block: boolean }
  | { mode: "edit"; element: HTMLElement; value: string; block: boolean };

export default function RichLatexEditor(props: RichLatexEditorProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const insertedImagesRef = useRef(
    new Map<string, NonNullable<RichLatexEditorProps["images"]>[number]>(),
  );
  const ownedBlobUrlsRef = useRef(new Set<string>());
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [mathDialog, setMathDialog] = useState<MathDialogState | null>(null);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const imageBookmarkRef = useRef<SelectionBookmark | null>(null);
  const tableRangeRef = useRef<SelectionBookmark | null>(null);
  const composingRef = useRef(false);
  const compositionCommitFrameRef = useRef<number | null>(null);
  const typingCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmittedDocRef = useRef<
    RichLatexEditorProps["content"] | typeof UNSET_CONTENT
  >(UNSET_CONTENT);
  const previousPropDocRef = useRef<
    RichLatexEditorProps["content"] | typeof UNSET_CONTENT
  >(UNSET_CONTENT);
  const externalSyncRef = useRef(false);
  const ribbon = useRibbonState();
  const sourceDoc = isTreeDoc(props.content) ? props.content : emptyDoc();
  const side = sourceDoc.side ??
    (props.layoutType?.startsWith("immini") ? "right" : "center");
  const doc = useMemo(
    () => sourceDoc.side === side ? sourceDoc : { ...sourceDoc, side },
    [side, sourceDoc],
  );
  const html = useMemo(
    () =>
      editorAdapter.render(
        doc,
        props.images ?? [],
        props.imageEditable ?? false,
      ),
    [doc, props.images, props.imageEditable],
  );
  const shouldSyncHtml = useCallback(() => {
    const propChanged = !documentsEqual(doc, previousPropDocRef.current);
    const isLocalEcho = documentsEqual(doc, lastEmittedDocRef.current);
    // Never copy the previous controlled value back over the live editable
    // DOM. UniKey emits ordinary input events, so a render between replacement
    // keystrokes must remain a local pending edit.
    const shouldSync = previousPropDocRef.current === UNSET_CONTENT ||
      (propChanged && !isLocalEcho);
    previousPropDocRef.current = doc;
    externalSyncRef.current = shouldSync;
    return shouldSync;
  }, [doc]);

  const emitChange = useCallback((
    newImage?: NonNullable<RichLatexEditorProps["images"]>[number],
    nextSide = side,
  ) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const liveIds = new Set(
      Array.from(surface.querySelectorAll<HTMLElement>(".rle-image"))
        .map((element) => element.dataset.figureId ?? ""),
    );
    insertedImagesRef.current.forEach((image, id) => {
      if (liveIds.has(id)) return;
      // Giữ blob URL sống để Undo có thể khôi phục atom; URL được thu hồi khi
      // đổi tài liệu thật hoặc unmount.
      insertedImagesRef.current.delete(id);
    });
    const nextDoc = editorAdapter.reconcile(surface, nextSide);
    // This must be synchronous. React state would schedule an intermediate
    // render where props still contain the pre-input document and could reset
    // both the DOM and caret before a UniKey replacement input arrives.
    lastEmittedDocRef.current = nextDoc;
    props.onChange(nextDoc, newImage);
  }, [props, side]);
  const scheduleTypingCommit = useCallback(() => {
    if (typingCommitTimerRef.current)
      clearTimeout(typingCommitTimerRef.current);
    typingCommitTimerRef.current = setTimeout(() => {
      typingCommitTimerRef.current = null;
      emitChange();
    }, 400);
  }, [emitChange]);
  const flushTypingCommit = useCallback(() => {
    if (!typingCommitTimerRef.current) return;
    clearTimeout(typingCommitTimerRef.current);
    typingCommitTimerRef.current = null;
    emitChange();
  }, [emitChange]);

  const controller = useEditorController(surfaceRef, emitChange);
  const disabledCommands = useMemo(() => {
    const disabled = new Set<import("./commands/types").EditorCommandId>();
    const caps = controller.tableCapabilities;
    if (!caps) return disabled;
    if (!caps.canDeleteRows) disabled.add("delete-rows");
    if (!caps.canDeleteColumns) disabled.add("delete-columns");
    if (!caps.canMerge) disabled.add("merge-cells");
    if (!caps.canSplit) disabled.add("split-cells");
    return disabled;
  }, [controller.tableCapabilities]);
  const { formattingState, refreshFormattingState } = useFormattingState(
    surfaceRef,
    controller.tableSelection && selectedDomCells(controller.tableSelection).length > 1
      ? controller.tableSelection
      : null,
  );
  const imageInfo = useCallback((element: HTMLElement) => {
    const id = element.dataset.figureId ?? "";
    return insertedImagesRef.current.get(id) ??
      props.images?.find((image) => String(image.id) === id);
  }, [props.images]);
  const changeImageWidth = useCallback((delta: number) => {
    const element = controller.getSelectedImage();
    if (!element) return;
    const info = imageInfo(element);
    // The DOM is the live editing state. Reading the images prop first makes
    // repeated clicks start from the same (parent-owned) value until the
    // persistence callback is echoed back, so grow/shrink appears stuck.
    const renderedWidth = Number(element.dataset.rleWidth);
    const current = Number.isFinite(renderedWidth) && renderedWidth > 0
      ? renderedWidth
      : info?.width ?? 0.45;
    const width = Math.max(0.05, Math.min(1, current + delta));
    controller.resizeSelectedImage(width);
    if (info?.storage_path)
      props.onImageWidthChange?.(info.storage_path, width);
  }, [controller, imageInfo, props]);
  const dispatch = useCallback(
    (
      command: Parameters<typeof controller.dispatch>[0],
      value?: Parameters<typeof controller.dispatch>[1],
    ) => {
      const surface = surfaceRef.current;
      if (!surface) return;
      if (command === "insert-math") {
        const bookmark =
          captureSelectionBookmark(surface) ?? endOfSurfaceBookmark(surface);
        setMathDialog({ mode: "new", bookmark, value: "", block: false });
        return;
      }
      if (command === "insert-table") {
        tableRangeRef.current =
          captureSelectionBookmark(surface) ?? endOfSurfaceBookmark(surface);
        setTableDialogOpen(true);
        return;
      }
      if (command === "insert-code") {
        const bookmark =
          captureSelectionBookmark(surface) ?? endOfSurfaceBookmark(surface);
        controller.snapshotHistory("insert-code");
        if (insertCodeBlockAtBookmark(surface, bookmark)) emitChange();
        return;
      }
      if (command === "insert-image") {
        imageBookmarkRef.current =
          captureSelectionBookmark(surface) ?? endOfSurfaceBookmark(surface);
        fileInputRef.current?.click();
        return;
      }
      if (command === "image-grow" || command === "image-shrink") {
        if (!props.imageEditable || !props.onImageWidthChange) return;
        // Width is persisted outside this editor. A DOM-only snapshot cannot
        // safely reverse that callback, so resizing is intentionally excluded
        // from the local structural history.
        changeImageWidth(command === "image-grow" ? 0.05 : -0.05);
        return;
      }
      if (command === "image-delete") {
        if (!props.imageEditable) return;
        const element = controller.getSelectedImage();
        if (!element) return;
        controller.snapshotHistory(command);
        controller.removeSelectedImage();
        insertedImagesRef.current.delete(element.dataset.figureId ?? "");
        emitChange();
        ribbon.setContext(null);
        return;
      }
      if (command === "image-center" || command === "image-float-right") {
        if (!props.imageEditable || !props.showLayoutControl) return;
        const element = controller.getSelectedImage();
        if (!element) return;
        const nextSide = command === "image-float-right" ? "right" : "center";
        element.classList.remove("side-left", "side-center", "side-right");
        element.classList.add(`side-${nextSide}`);
        emitChange(undefined, nextSide);
        return;
      }
      controller.dispatch(
        command,
        value ?? (command === "highlight"
          ? formattingState.highlight
            ? ""
            : "#fff3a3"
          : undefined),
      );
      requestAnimationFrame(refreshFormattingState);
    },
    [changeImageWidth, controller, emitChange, formattingState.highlight,
      props, refreshFormattingState, ribbon],
  );
  const canInsertImage = !!props.imageEditable && !uploadingImage &&
    !doc.content.some(blockHasImage) &&
    (!!props.questionId || !!props.importJobId || !!props.allowPendingImage);
  const insertImageFile = useCallback(async (file: File) => {
    const surface = surfaceRef.current;
    if (!surface || !canInsertImage || surface.querySelector(".rle-image")) return;
    setUploadingImage(true);
    setImageError(null);
    try {
      const image = props.questionId
        ? await api.uploadQuestionImage(props.questionId, file)
        : props.importJobId
          ? await api.uploadStagedImage(props.importJobId, file)
          : (() => {
              const url = URL.createObjectURL(file);
              return {
                id: `pending-${crypto.randomUUID()}`,
                storage_path: url,
                url,
                img_type: "graphic",
                width: null,
                pendingFile: file,
              };
            })();
      const id = String(image.id);
      if (image.pendingFile && image.storage_path.startsWith("blob:"))
        ownedBlobUrlsRef.current.add(image.storage_path);
      insertedImagesRef.current.set(id, image);
      const bookmark = imageBookmarkRef.current ?? endOfSurfaceBookmark(surface);
      const targetRange = restoreSelectionBookmark(surface, bookmark);
      const targetElement = targetRange?.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? targetRange.commonAncestorContainer as Element
        : targetRange?.commonAncestorContainer.parentElement;
      const insideCell = !!targetElement?.closest("td, th");
      const holder = document.createElement("div");
      holder.innerHTML = editorAdapter.render(
        insideCell
          ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "image_inline", figure_id: image.id! }] }] }
          : { type: "doc", side, content: [{ type: "image", figure_id: image.id! }] },
        [...(props.images ?? []), image],
        true,
      );
      const element = holder.querySelector<HTMLElement>(insideCell ? ".rle-imginline" : ".rle-image");
      if (!element) return;
      if (insideCell && targetRange) {
        targetRange.deleteContents();
        targetRange.insertNode(element);
        const spacer = document.createTextNode("\u200b");
        element.after(spacer);
        const selection = window.getSelection();
        const caret = document.createRange();
        caret.setStart(spacer, spacer.data.length);
        caret.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(caret);
      } else {
        if (targetRange) {
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(targetRange);
        }
        if (!insertBlockAtSelection(surface, element)) {
          surface.append(element);
          const trailing = document.createElement("p");
          trailing.className = "rle-p";
          trailing.style.textAlign = "justify";
          trailing.append(document.createElement("br"));
          element.after(trailing);
        }
      }
      controller.setSelectedImage(element);
      element.setAttribute("data-rle-selected", "true");
      ribbon.activateContext("picture");
      emitChange(image);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Không thể tải ảnh lên");
    } finally {
      setUploadingImage(false);
    }
  }, [canInsertImage, controller, emitChange, props, ribbon, side]);
  const handleImageFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void insertImageFile(file);
  };
  const setRibbonContext = ribbon.setContext;
  const clearSelectedImage = controller.setSelectedImage;
  const getSelectedImage = controller.getSelectedImage;
  useEffect(() => queueTypeset(), [html]);
  useEffect(() => {
    if (!externalSyncRef.current) return;
    externalSyncRef.current = false;
    controller.clearHistory();
    controller.setSelectedImage(null);
    ribbon.setContext(null);
    const liveUrls = new Set((props.images ?? [])
      .filter((image) => image.pendingFile && image.storage_path.startsWith("blob:"))
      .map((image) => image.storage_path));
    ownedBlobUrlsRef.current.forEach((url) => {
      if (liveUrls.has(url)) return;
      if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
      ownedBlobUrlsRef.current.delete(url);
    });
  // Sync ngoài thay DOM atomically; ref selection cũ không còn hợp lệ.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, shouldSyncHtml]);
  useEffect(() => () => {
    if (compositionCommitFrameRef.current != null)
      cancelAnimationFrame(compositionCommitFrameRef.current);
    if (typingCommitTimerRef.current)
      clearTimeout(typingCommitTimerRef.current);
    ownedBlobUrlsRef.current.forEach((url) => {
      if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
    });
    ownedBlobUrlsRef.current.clear();
    insertedImagesRef.current.clear();
  }, []);
  useEffect(() => {
    const updateContextFromSelection = () => {
      const surface = surfaceRef.current;
      const node = window.getSelection()?.anchorNode;
      if (!surface || !node || !surface.contains(node)) {
        clearSelectedImage(null);
        setRibbonContext(null);
        return;
      }
      const element =
        node.nodeType === Node.ELEMENT_NODE
          ? (node as Element)
          : node.parentElement;
      const selected = getSelectedImage();
      const range = window.getSelection()?.rangeCount
        ? window.getSelection()!.getRangeAt(0)
        : null;
      const selectedByRange = selected && range && !range.collapsed &&
          range.intersectsNode(selected)
        ? selected
        : null;
      const image = element?.closest<HTMLElement>(".rle-image") ?? selectedByRange;
      if (image && props.imageEditable) {
        clearSelectedImage(image);
        setRibbonContext("picture");
      } else {
        clearSelectedImage(null);
        if (element?.closest("table.rle-table")) setRibbonContext("table");
        else setRibbonContext(null);
      }
    };
    document.addEventListener("selectionchange", updateContextFromSelection);
    return () =>
      document.removeEventListener(
        "selectionchange",
        updateContextFromSelection,
      );
  }, [clearSelectedImage, getSelectedImage, props.imageEditable, setRibbonContext]);
  const handleSurfaceClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target as Element;
      const math = target.closest<HTMLElement>(".rle-math, .rle-mathblock");
      if (math) {
        event.preventDefault();
        setMathDialog({
          mode: "edit",
          element: math,
          value: math.dataset.tex ?? "",
          block: math.classList.contains("rle-mathblock"),
        });
        return;
      }
      const image = target.closest<HTMLElement>(".rle-image");
      if (image && props.imageEditable) {
        controller.setSelectedImage(image);
        const selection = window.getSelection();
        const range = document.createRange();
        // Keep an object caret for keyboard commands without selecting the
        // replaced element itself; selectNode() paints a blue overlay across
        // the whole bitmap in Chromium.
        range.selectNodeContents(image);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
        ribbon.activateContext("picture");
      }
      else if (target.closest("table.rle-table")) ribbon.setContext("table");
      else {
        controller.setSelectedImage(null);
        ribbon.setContext(null);
      }
    },
    [controller, props.imageEditable, ribbon],
  );
  const saveMath = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface || !mathDialog) return;
    const tex = mathDialog.value.trim() || "x";
    controller.snapshotHistory(
      mathDialog.mode === "new" ? "insert-math" : "edit-math",
    );
    const changed = mathDialog.mode === "new"
      ? insertMathAtBookmark(
          surface,
          mathDialog.bookmark,
          tex,
          mathDialog.block,
        )
      : surface.contains(mathDialog.element)
        ? (updateMathAtom(mathDialog.element, tex), mathDialog.element)
        : null;
    if (!changed) {
      setMathDialog(null);
      return;
    }
    setMathDialog(null);
    emitChange();
    queueTypeset();
  }, [controller, emitChange, mathDialog]);
  const removeMath = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface || mathDialog?.mode !== "edit") return;
    if (!surface.contains(mathDialog.element)) return;
    controller.snapshotHistory("delete-math");
    deleteMathAtom(mathDialog.element);
    setMathDialog(null);
    emitChange();
  }, [controller, emitChange, mathDialog]);
  const hiddenCommands = new Set<import("./commands/types").EditorCommandId>();
  const unsupportedImageCommands = [
    "image-crop", "image-rotate-left", "image-rotate-right", "image-replace",
  ] as const;
  if (!props.imageEditable) {
    ["image-center", "image-float-right", "image-grow", "image-shrink", "image-delete"]
      .forEach((command) => hiddenCommands.add(command as import("./commands/types").EditorCommandId));
  }
  if (!props.showLayoutControl) {
    hiddenCommands.add("image-center");
    hiddenCommands.add("image-float-right");
  }
  if (!props.onImageWidthChange) {
    hiddenCommands.add("image-grow");
    hiddenCommands.add("image-shrink");
  }
  const pressedImageCommands = new Set<import("./commands/types").EditorCommandId>();
  if (side === "right") pressedImageCommands.add("image-float-right");
  else pressedImageCommands.add("image-center");

  return (
    <section className={styles.editor}>
      <EditorRibbon
        {...ribbon}
        onSelectTab={ribbon.selectTab}
        onToggle={ribbon.toggle}
        dispatch={dispatch}
        formattingState={formattingState}
        disabledCommands={new Set([
          ...disabledCommands,
          ...unsupportedImageCommands,
          ...(!canInsertImage ? ["insert-image" as const] : []),
        ])}
        hiddenCommands={hiddenCommands}
        pressedCommands={pressedImageCommands}
      />
      <EditorSurface
        surfaceRef={surfaceRef}
        html={html}
        syncHtml={shouldSyncHtml}
        placeholder={props.placeholder}
        minHeight={props.minHeight}
        maxHeight={props.maxHeight}
        onInput={(event) => {
          if (
            composingRef.current ||
            (event.nativeEvent as InputEvent).isComposing
          ) return;
          // IMEs normally dispatch a final input after compositionend. Commit
          // that finalized DOM instead of the temporary replacement syllable.
          if (compositionCommitFrameRef.current != null) {
            cancelAnimationFrame(compositionCommitFrameRef.current);
            compositionCommitFrameRef.current = null;
          }
          scheduleTypingCommit();
        }}
        onCompositionStart={() => {
          composingRef.current = true;
          if (typingCommitTimerRef.current) {
            clearTimeout(typingCommitTimerRef.current);
            typingCommitTimerRef.current = null;
          }
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          // Fallback for engines that omit the trailing input. Waiting a frame
          // lets the native IME finish replacing its composition range first.
          if (compositionCommitFrameRef.current != null)
            cancelAnimationFrame(compositionCommitFrameRef.current);
          compositionCommitFrameRef.current = requestAnimationFrame(() => {
            compositionCommitFrameRef.current = null;
            scheduleTypingCommit();
          });
        }}
        onBlur={flushTypingCommit}
        onClick={handleSurfaceClick}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={handleImageFile}
      />
      {imageError && <div role="alert">{imageError}</div>}
      <MathDialog
        open={!!mathDialog}
        mode={mathDialog?.mode ?? "new"}
        value={mathDialog?.value ?? ""}
        block={mathDialog?.block ?? false}
        onValueChange={(value) =>
          setMathDialog((current) => (current ? { ...current, value } : null))
        }
        onBlockChange={(block) =>
          setMathDialog((current) => (current ? { ...current, block } : null))
        }
        onCancel={() => setMathDialog(null)}
        onSubmit={saveMath}
        onDelete={mathDialog?.mode === "edit" ? removeMath : undefined}
      />
      <TableDialog
        open={tableDialogOpen}
        onCancel={() => {
          tableRangeRef.current = null;
          setTableDialogOpen(false);
        }}
        onSubmit={(rows, columns) => {
          const bookmark = tableRangeRef.current;
          const surface = surfaceRef.current;
          const restored = surface && bookmark
            ? restoreSelectionBookmark(surface, bookmark)
            : null;
          if (surface && (restored || restoreSelectionBookmark(
            surface,
            endOfSurfaceBookmark(surface),
          ))) {
            controller.dispatch("insert-table", JSON.stringify({ rows, columns }));
            ribbon.activateContext("table");
          }
          tableRangeRef.current = null;
          setTableDialogOpen(false);
        }}
      />
    </section>
  );
}
