import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { EditorCommandId } from "../commands/types";
import {
  applyAlignment,
  applyStyleCommand,
  applyTagCommand,
} from "../formatting/commands";
import {
  createEditorHistory,
  type SelectionSnapshot,
} from "../history/editorHistory";
import {
  copySelectedImage,
  deleteSelectedImage,
  selectImage,
} from "../image/selection";
import { handleListTab, toggleList } from "../lists/commands";
import {
  deleteSelectedColumns, deleteSelectedRows, insertSelectedColumn,
  insertSelectedRow, mergeTableSelection, splitSelectedCell,
  tableCommandCapabilities,
} from "../table/commands";
import {
  clearSelectedCells,
  pasteIntoSelection,
  readClipboardData,
  tableSelectionClipboard,
  writeTableSelectionClipboard,
} from "../table/clipboard";
import { observeCrossBlockTableSelection } from "../table/crossBlockSelection";
import {
  caretIsAtCellBoundary,
  cellAtCaret,
  navigateTableCell,
} from "../table/navigation";
import {
  paintTableSelection,
  selectedDomCells,
  selectionFromCells,
  singleCellSelection,
  type ActiveTableSelection,
} from "../table/selection";
import { observeTableColumnResize } from "../table/resize";

function execNativeCommand(command: string, value?: string) {
  return typeof document.execCommand === "function"
    ? document.execCommand(command, false, value)
    : false;
}

export function insertBlockAtSelection(surface: HTMLElement, node: Node) {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!selection || !range || !surface.contains(range.commonAncestorContainer))
    return false;
  const rangeElement = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer as Element
    : range.commonAncestorContainer.parentElement;
  const cell = rangeElement?.closest<HTMLTableCellElement>("td, th") ?? null;
  if (cell) {
    if (!(node instanceof HTMLTableElement)) return false;
    let depth = 0;
    let ancestor: HTMLTableElement | null = cell.closest("table");
    while (ancestor) {
      depth += 1;
      ancestor = ancestor.parentElement?.closest("table") ?? null;
    }
    if (depth >= 3) return false;
    const empty = !(cell.textContent || "").replace(/[\u200b\u00a0]/g, "").trim() &&
      !cell.querySelector("table, .rle-math, .rle-code, .rle-image, img");
    const trailing = document.createElement("br");
    if (empty) cell.replaceChildren(node, trailing);
    else {
      range.deleteContents();
      range.insertNode(node);
      node.after(trailing);
    }
    const caret = document.createRange();
    caret.setStartAfter(trailing);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
    return true;
  }
  range.deleteContents();
  const trailing = document.createElement("p");
  trailing.className = "rle-p";
  trailing.style.textAlign = "justify";
  trailing.append(document.createElement("br"));
  const anchor = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as HTMLElement
    : range.startContainer.parentElement;
  const paragraph = anchor?.closest("p.rle-p") as HTMLParagraphElement | null;
  if (paragraph && surface.contains(paragraph)) {
    const tailRange = document.createRange();
    tailRange.selectNodeContents(paragraph);
    tailRange.setStart(range.startContainer, range.startOffset);
    const tail = tailRange.extractContents();
    if (tail.childNodes.length) trailing.replaceChildren(tail);
    const empty = !(paragraph.textContent || "").replace(/\u200b/g, "").trim();
    if (empty) paragraph.replaceWith(node, trailing);
    else paragraph.after(node, trailing);
  } else {
    range.insertNode(node);
    node.parentNode?.insertBefore(trailing, node.nextSibling);
  }
  range.selectNodeContents(trailing);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function createTable(rows: number, columns: number) {
  const table = document.createElement("table");
  table.className = "rle-table";
  const colgroup = table.createTHead().appendChild(document.createElement("tr"));
  table.deleteTHead();
  const realColgroup = document.createElement("colgroup");
  for (let column = 0; column < columns; column += 1) {
    const col = document.createElement("col");
    col.style.width = `${100 / columns}%`;
    realColgroup.append(col);
  }
  table.append(realColgroup);
  const body = table.createTBody();
  for (let row = 0; row < rows; row += 1) {
    const tr = body.insertRow();
    for (let column = 0; column < columns; column += 1) {
      const cell = tr.insertCell();
      cell.dataset.cellId = `cell-${crypto.randomUUID()}`;
      cell.append(document.createElement("br"));
    }
  }
  void colgroup;
  return table;
}

export function useEditorController(
  surfaceRef: RefObject<HTMLDivElement | null>,
  onMutation: () => void,
) {
  const [tableSelection, setTableSelection] =
    useState<ActiveTableSelection | null>(null);
  const selectedImage = useRef<HTMLElement | null>(null);
  const dragAnchor = useRef<HTMLTableCellElement | null>(null);
  const draggingCellRange = useRef(false);
  const history = useRef<ReturnType<typeof createEditorHistory> | null>(null);
  const tableSelectionRef = useRef<ActiveTableSelection | null>(null);

  const updateTableSelection = useCallback(
    (value: ActiveTableSelection | null) => {
      tableSelectionRef.current = value;
      setTableSelection(value);
      const surface = surfaceRef.current;
      if (surface) paintTableSelection(surface, value);
    },
    [surfaceRef],
  );

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const capture = (): SelectionSnapshot => {
      const currentTableSelection = tableSelectionRef.current;
      if (currentTableSelection)
        return {
          kind: "table",
          tableIndex: [...surface.querySelectorAll("table")].indexOf(
            currentTableSelection.table,
          ),
          rect: currentTableSelection.rect,
          anchorId: currentTableSelection.anchorId,
        };
      if (selectedImage.current)
        return {
          kind: "image",
          imageIndex: [...surface.querySelectorAll(".rle-image")].indexOf(
            selectedImage.current,
          ),
        };
      return null;
    };
    history.current = createEditorHistory(surface, capture, (snapshot) => {
      updateTableSelection(null);
      selectedImage.current = selectImage(surface, null);
      if (snapshot?.kind === "table") {
        const table = surface.querySelectorAll("table")[snapshot.tableIndex] as
          | HTMLTableElement
          | undefined;
        if (table)
          updateTableSelection({
            table,
            rect: snapshot.rect,
            anchorId: snapshot.anchorId,
          });
      } else if (snapshot?.kind === "image")
        selectedImage.current = selectImage(
          surface,
          surface.querySelectorAll<HTMLElement>(".rle-image")[
            snapshot.imageIndex
          ] ?? null,
        );
    });
  }, [surfaceRef, updateTableSelection]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    return observeCrossBlockTableSelection(surface);
  }, [surfaceRef]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    return observeTableColumnResize(surface, onMutation);
  }, [onMutation, surfaceRef]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const down = (event: PointerEvent) => {
      const target = event.target as Element;
      const image = target.closest<HTMLElement>(".rle-image");
      if (image) {
        selectedImage.current = selectImage(surface, image);
        updateTableSelection(null);
        return;
      }
      selectedImage.current = selectImage(surface, null);
      const cell = target.closest<HTMLTableCellElement>("td");
      if (!cell) {
        updateTableSelection(null);
        return;
      }
      const table = cell.closest("table") as HTMLTableElement;
      if (event.defaultPrevented) return;
      dragAnchor.current = cell;
      draggingCellRange.current = false;
      updateTableSelection(
        event.shiftKey && tableSelection?.table === table
          ? selectionFromCells(
              table,
              table.querySelector(
                `[data-cell-id="${tableSelection.anchorId}"]`,
              ) as HTMLTableCellElement,
              cell,
            )
          : singleCellSelection(table, cell),
      );
    };
    const move = (event: PointerEvent) => {
      if (!dragAnchor.current || !(event.buttons & 1)) return;
      const cell = event.target instanceof Element
        ? event.target.closest<HTMLTableCellElement>("td")
        : null;
      const table = dragAnchor.current.closest("table") as HTMLTableElement;
      if (cell?.closest("table") === table) {
        if (cell !== dragAnchor.current) {
          draggingCellRange.current = true;
          // Once the gesture crosses a cell boundary it becomes a table-cell
          // range, not a browser text selection. Keeping both selections is
          // visually misleading and also makes Copy operate on the wrong one.
          event.preventDefault();
          window.getSelection()?.removeAllRanges();
        }
        updateTableSelection(
          selectionFromCells(table, dragAnchor.current, cell),
        );
      }
    };
    const up = () => {
      if (draggingCellRange.current)
        window.getSelection()?.removeAllRanges();
      draggingCellRange.current = false;
      dragAnchor.current = null;
    };
    surface.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      surface.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [onMutation, surfaceRef, tableSelection, updateTableSelection]);

  const dispatch = useCallback(
    async (command: EditorCommandId, value?: string) => {
      const surface = surfaceRef.current;
      if (!surface) return;
      const currentSelection = window.getSelection();
      const ownedRange = currentSelection?.rangeCount
        ? currentSelection.getRangeAt(0).cloneRange()
        : null;
      const hasOwnedRange = !!ownedRange &&
        surface.contains(ownedRange.commonAncestorContainer);
      const cellRangeSelection = tableSelection &&
          selectedDomCells(tableSelection).length > 1
        ? tableSelection
        : null;
      const needsTextRange = /^(bold|italic|underline|superscript|subscript|highlight|text-color|ordered-list|bullet-list|align-)/.test(command);
      if (!cellRangeSelection && needsTextRange) {
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        if (!range || !surface.contains(range.commonAncestorContainer)) return;
      }
      const snapshot = (label: string) => history.current?.snapshot(label);
      let mutated = false;
      if (
        ["bold", "italic", "underline", "superscript", "subscript"].includes(
          command,
        )
      ) {
        snapshot(command);
        applyTagCommand(command as never, cellRangeSelection);
        mutated = true;
      } else if (command === "highlight" || command === "text-color") {
        snapshot(command);
        applyStyleCommand(
          command === "highlight" ? "backgroundColor" : "color",
          value ?? "",
          cellRangeSelection,
        );
        mutated = true;
      } else if (command.startsWith("align-")) {
        snapshot(command);
        applyAlignment(command.slice(6), cellRangeSelection);
        mutated = true;
      } else if (command === "ordered-list" || command === "bullet-list") {
        snapshot(command);
        toggleList(command === "ordered-list");
        mutated = true;
      } else if (command === "copy") {
        try {
          if (cellRangeSelection) await writeTableSelectionClipboard(cellRangeSelection);
          else if (hasOwnedRange) execNativeCommand("copy");
        } catch {
          return;
        }
      } else if (command === "cut") {
        if (cellRangeSelection) {
          try {
            await writeTableSelectionClipboard(cellRangeSelection);
          } catch {
            return;
          }
          snapshot(command);
          clearSelectedCells(cellRangeSelection);
          mutated = true;
        } else if (hasOwnedRange) mutated = execNativeCommand("cut");
      } else if (command === "paste") {
        let data: Awaited<ReturnType<typeof readClipboardData>>;
        try {
          data = await readClipboardData();
        } catch {
          mutated = hasOwnedRange ? execNativeCommand("paste") : false;
          if (mutated) onMutation();
          return;
        }
        if (!cellRangeSelection && !hasOwnedRange) return;
        snapshot(command);
        if (cellRangeSelection) pasteIntoSelection(cellRangeSelection, data.html, data.text);
        else {
          currentSelection?.removeAllRanges();
          currentSelection?.addRange(ownedRange!);
          execNativeCommand("insertText", data.text);
        }
        mutated = true;
      } else if (command === "insert-table") {
        const dimensions = value ? JSON.parse(value) as { rows: number; columns: number } : { rows: 2, columns: 2 };
        const rows = Math.max(1, Math.min(30, Math.trunc(dimensions.rows)));
        const columns = Math.max(1, Math.min(20, Math.trunc(dimensions.columns)));
        snapshot(command);
        mutated = insertBlockAtSelection(surface, createTable(rows, columns));
      } else if (command === "insert-code") {
        const data = value ? JSON.parse(value) as { text?: string; lang?: string } : {};
        const code = document.createElement("pre");
        code.className = "rle-code";
        code.dataset.lang = data.lang ?? "";
        code.textContent = data.text ?? "";
        snapshot(command);
        mutated = insertBlockAtSelection(surface, code);
      } else if (command === "insert-math") {
        const math = document.createElement("span");
        math.className = "rle-math";
        math.contentEditable = "false";
        math.dataset.tex = value ?? "";
        math.textContent = `\\(${value ?? ""}\\)`;
        snapshot(command);
        mutated = insertBlockAtSelection(surface, math);
      } else if (["insert-row-above", "insert-row-below", "delete-rows", "insert-col-left", "insert-col-right", "delete-columns"].includes(command)) {
        if (!tableSelection) return;
        const caps = tableCommandCapabilities(tableSelection.table, tableSelection.rect);
        if ((command === "delete-rows" && !caps.canDeleteRows) ||
            (command === "delete-columns" && !caps.canDeleteColumns)) return;
        snapshot(command);
        const next = command === "insert-row-above"
          ? insertSelectedRow(tableSelection.table, tableSelection.rect, "above", tableSelection.anchorId)
          : command === "insert-row-below"
            ? insertSelectedRow(tableSelection.table, tableSelection.rect, "below", tableSelection.anchorId)
            : command === "delete-rows"
              ? deleteSelectedRows(tableSelection.table, tableSelection.rect)
              : command === "insert-col-left"
                ? insertSelectedColumn(tableSelection.table, tableSelection.rect, "left")
                : command === "insert-col-right"
                  ? insertSelectedColumn(tableSelection.table, tableSelection.rect, "right")
                  : deleteSelectedColumns(tableSelection.table, tableSelection.rect);
        updateTableSelection(next);
        mutated = true;
      } else if (command === "merge-cells" && tableSelection) {
        if (!tableCommandCapabilities(tableSelection.table, tableSelection.rect).canMerge) return;
        snapshot(command);
        const result = mergeTableSelection(
          tableSelection.table,
          tableSelection.rect,
        );
        if (result)
          updateTableSelection({
            table: tableSelection.table,
            rect: result.rect,
            anchorId: result.mergedId!,
          });
        mutated = !!result;
      } else if (command === "split-cells" && tableSelection) {
        if (!tableCommandCapabilities(tableSelection.table, tableSelection.rect).canSplit) return;
        snapshot(command);
        const result = splitSelectedCell(
          tableSelection.table,
          tableSelection.rect,
          tableSelection.rect.r1 - tableSelection.rect.r0 + 1,
          tableSelection.rect.c1 - tableSelection.rect.c0 + 1,
        );
        if (result)
          updateTableSelection({
            table: tableSelection.table,
            rect: result.rect,
            anchorId: result.newIds[0],
          });
        mutated = !!result;
      } else if (command === "undo") {
        mutated = history.current?.undo() ?? false;
        if (!mutated && hasOwnedRange) mutated = execNativeCommand("undo");
      } else if (command === "redo") {
        mutated = history.current?.redo() ?? false;
        if (!mutated && hasOwnedRange) mutated = execNativeCommand("redo");
      } else if (command === "image-delete") {
        snapshot(command);
        deleteSelectedImage(selectedImage.current);
        selectedImage.current = null;
        mutated = true;
      }
      if (mutated) onMutation();
    },
    [onMutation, surfaceRef, tableSelection, updateTableSelection],
  );

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const keydown = (event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey;
      const selection = window.getSelection();
      const selectionElement = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? selection.anchorNode as HTMLElement
        : selection?.anchorNode?.parentElement;
      const codeBlock = selectionElement?.closest("pre.rle-code") as HTMLElement | null;
      if (codeBlock && event.key === "Tab") {
        event.preventDefault();
        history.current?.snapshot("indent-code");
        execNativeCommand("insertText", "  ");
        onMutation();
        return;
      }
      if (
        codeBlock &&
        (event.key === "Escape" ||
          (event.key === "Enter" && !event.shiftKey && !event.altKey))
      ) {
        event.preventDefault();
        history.current?.snapshot("leave-code");
        let paragraph = codeBlock.nextElementSibling as HTMLElement | null;
        if (!paragraph?.matches("p.rle-p")) {
          paragraph = document.createElement("p");
          paragraph.className = "rle-p";
          paragraph.style.textAlign = "justify";
          paragraph.append(document.createElement("br"));
          codeBlock.after(paragraph);
        }
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
        onMutation();
        return;
      }
      if (
        codeBlock &&
        event.key === "Backspace" &&
        !(codeBlock.textContent || "").replace(/\u200b/g, "").length
      ) {
        event.preventDefault();
        history.current?.snapshot("delete-code");
        const target = codeBlock.previousElementSibling ?? codeBlock.nextElementSibling;
        codeBlock.remove();
        if (target) {
          const range = document.createRange();
          range.selectNodeContents(target);
          range.collapse(false);
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
        onMutation();
        return;
      }
      if (ctrl && event.key.toLowerCase() === "b") {
        event.preventDefault();
        dispatch("bold");
      } else if (ctrl && event.key.toLowerCase() === "i") {
        event.preventDefault();
        dispatch("italic");
      } else if (ctrl && event.key.toLowerCase() === "u") {
        event.preventDefault();
        dispatch("underline");
      } else if (
        ctrl &&
        event.shiftKey &&
        (event.key === "+" || event.key === "=")
      ) {
        event.preventDefault();
        dispatch("superscript");
      } else if (ctrl && !event.shiftKey && event.key === "=") {
        event.preventDefault();
        dispatch("subscript");
      } else if (ctrl && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch(event.shiftKey ? "redo" : "undo");
      } else if (ctrl && event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch("redo");
      } else if (ctrl && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        dispatch("bullet-list");
      } else if (ctrl && event.key.toLowerCase() === "a") {
        event.preventDefault();
        updateTableSelection(null);
        selectedImage.current = selectImage(surface, null);
        const range = document.createRange();
        range.selectNodeContents(surface);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      } else if (event.key === "Escape") updateTableSelection(null);
      else if (handleListTab(event)) onMutation();
      else if (event.key === "Tab") {
        const cell = cellAtCaret();
        if (
          cell &&
          !event.ctrlKey &&
          navigateTableCell(cell, event.shiftKey ? "previous" : "next")
        )
          event.preventDefault();
      } else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        const cell = cellAtCaret();
        if (!cell) return;
        const direction =
          event.key === "ArrowLeft"
            ? "previous"
            : event.key === "ArrowRight"
              ? "next"
              : event.key === "ArrowUp"
                ? "up"
                : "down";
        const boundary =
          direction === "previous"
            ? caretIsAtCellBoundary(cell, "start")
            : direction === "next"
              ? caretIsAtCellBoundary(cell, "end")
              : true;
        if (boundary && navigateTableCell(cell, direction))
          event.preventDefault();
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        tableSelection && selectedDomCells(tableSelection).length > 1
      ) {
        event.preventDefault();
        history.current?.snapshot("clear cells");
        clearSelectedCells(tableSelection);
        onMutation();
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedImage.current && (() => {
          const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
          if (!range) return false;
          const anchor = selection?.anchorNode;
          return !!anchor && (
            selectedImage.current!.contains(anchor) ||
            (!range.collapsed && range.intersectsNode(selectedImage.current!))
          );
        })()
      ) {
        event.preventDefault();
        history.current?.snapshot("delete image");
        deleteSelectedImage(selectedImage.current);
        selectedImage.current = null;
        onMutation();
      }
    };
    const clipboard = (event: ClipboardEvent) => {
      if (tableSelection && selectedDomCells(tableSelection).length > 1) {
        if (event.type === "paste") {
          event.preventDefault();
          history.current?.snapshot("paste cells");
          pasteIntoSelection(
            tableSelection,
            event.clipboardData?.getData("text/html") ?? "",
            event.clipboardData?.getData("text/plain") ?? "",
          );
          onMutation();
          return;
        }
        const data = tableSelectionClipboard(tableSelection);
        event.preventDefault();
        event.clipboardData?.setData("text/html", data.html);
        event.clipboardData?.setData("text/plain", data.text);
        if (event.type === "cut") {
          history.current?.snapshot("cut cells");
          clearSelectedCells(tableSelection);
          onMutation();
        }
      } else if (
        selectedImage.current &&
        (event.type === "copy" || event.type === "cut")
      ) {
        const html = copySelectedImage(selectedImage.current);
        if (!html) return;
        event.preventDefault();
        event.clipboardData?.setData("text/html", html);
        if (event.type === "cut") {
          history.current?.snapshot("cut image");
          deleteSelectedImage(selectedImage.current);
          selectedImage.current = null;
          onMutation();
        }
      }
    };
    surface.addEventListener("keydown", keydown);
    surface.addEventListener("copy", clipboard);
    surface.addEventListener("cut", clipboard);
    surface.addEventListener("paste", clipboard);
    return () => {
      surface.removeEventListener("keydown", keydown);
      surface.removeEventListener("copy", clipboard);
      surface.removeEventListener("cut", clipboard);
      surface.removeEventListener("paste", clipboard);
    };
  }, [dispatch, onMutation, surfaceRef, tableSelection, updateTableSelection]);

  const snapshotHistory = useCallback(
    (label: string) => history.current?.snapshot(label),
    [],
  );
  const clearHistory = useCallback(() => history.current?.clear(), []);

  const tableCapabilities = tableSelection
    ? tableCommandCapabilities(tableSelection.table, tableSelection.rect)
    : null;
  const getSelectedImage = useCallback(() => selectedImage.current, []);
  const setSelectedImage = useCallback((element: HTMLElement | null) => {
    const surface = surfaceRef.current;
    selectedImage.current = surface ? selectImage(surface, element) : element;
  }, [surfaceRef]);
  const resizeSelectedImage = useCallback((width: number) => {
    const element = selectedImage.current;
    if (!element) return null;
    element.dataset.rleWidth = String(width);
    element.style.setProperty("--rle-image-width", `${Math.round(width * 100)}%`);
    if (element.classList.contains("rle-imginline")) {
      const image = element.querySelector<HTMLElement>(".rle-image-img");
      if (image) image.style.width = `${Math.round(width * 100)}%`;
    }
    return element;
  }, []);
  const removeSelectedImage = useCallback(() => {
    const element = selectedImage.current;
    if (!element) return null;
    element.remove();
    selectedImage.current = null;
    return element;
  }, []);
  return {
    dispatch,
    tableSelection,
    tableCapabilities,
    selectedImage,
    snapshotHistory,
    clearHistory,
    getSelectedImage,
    setSelectedImage,
    resizeSelectedImage,
    removeSelectedImage,
  };
}
