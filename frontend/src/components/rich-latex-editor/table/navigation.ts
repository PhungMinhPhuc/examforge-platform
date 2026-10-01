import { adjacentCell, appendRow, cellAt } from "./model";
import { renderTableModel, tableModelFromDom } from "./domAdapter";

function placeCaret(cell: HTMLTableCellElement, atStart: boolean) {
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(atStart);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function navigateTableCell(
  cell: HTMLTableCellElement,
  direction: "next" | "previous" | "up" | "down",
) {
  const table = cell.closest("table") as HTMLTableElement | null;
  if (!table) return false;
  const model = tableModelFromDom(table);
  const current = model.cells.find(
    (candidate) => candidate.id === cell.dataset.cellId,
  );
  if (!current) return false;
  let target =
    direction === "next" || direction === "previous"
      ? adjacentCell(model, current.id, direction)
      : cellAt(
          model,
          direction === "up" ? current.row - 1 : current.row + current.rowSpan,
          current.col,
        );
  if (!target && direction === "next") {
    let nextId = 1;
    const expanded = appendRow(
      model,
      () => `rle-appended-${Date.now()}-${nextId++}`,
    );
    renderTableModel(table, expanded);
    target =
      expanded.cells.find((candidate) => candidate.row > current.row) ?? null;
  }
  if (!target) return false;
  const targetElement = table.querySelector<HTMLTableCellElement>(
    `td[data-cell-id="${target.id}"]`,
  );
  if (!targetElement) return false;
  placeCaret(targetElement, direction !== "previous");
  return true;
}

export function cellAtCaret() {
  const node = window.getSelection()?.anchorNode;
  const element =
    node?.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node?.parentElement;
  return element?.closest("td") as HTMLTableCellElement | null;
}

export function caretIsAtCellBoundary(
  cell: HTMLTableCellElement,
  edge: "start" | "end",
) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return false;
  const active = selection.getRangeAt(0).cloneRange();
  const comparison = document.createRange();
  comparison.selectNodeContents(cell);
  comparison.collapse(edge === "start");
  return active.compareBoundaryPoints(Range.START_TO_START, comparison) === 0;
}

