import { buildDomGrid, tableModelFromDom } from "./domAdapter";
import { cellRect, computeSelectionRect, type TableRect } from "./model";

export type ActiveTableSelection = {
  table: HTMLTableElement;
  rect: TableRect;
  anchorId: string;
};

export function selectionFromCells(
  table: HTMLTableElement,
  anchor: HTMLTableCellElement,
  focus: HTMLTableCellElement,
): ActiveTableSelection | null {
  const model = tableModelFromDom(table);
  const anchorCell = model.cells.find(
    (cell) => cell.id === anchor.dataset.cellId,
  );
  const focusCell = model.cells.find(
    (cell) => cell.id === focus.dataset.cellId,
  );
  return anchorCell && focusCell
    ? {
        table,
        rect: computeSelectionRect(model, anchorCell, focusCell),
        anchorId: anchorCell.id,
      }
    : null;
}

export function singleCellSelection(
  table: HTMLTableElement,
  element: HTMLTableCellElement,
): ActiveTableSelection | null {
  const model = tableModelFromDom(table);
  const cell = model.cells.find(
    (candidate) => candidate.id === element.dataset.cellId,
  );
  return cell ? { table, rect: cellRect(cell), anchorId: cell.id } : null;
}

export function selectedDomCells(selection: ActiveTableSelection) {
  const grid = buildDomGrid(selection.table);
  const cells = new Set<HTMLTableCellElement>();
  for (let row = selection.rect.r0; row <= selection.rect.r1; row += 1)
    for (
      let column = selection.rect.c0;
      column <= selection.rect.c1;
      column += 1
    ) {
      const cell = grid[row]?.[column];
      if (cell) cells.add(cell);
    }
  return [...cells];
}

export function paintTableSelection(
  surface: HTMLElement,
  selection: ActiveTableSelection | null,
) {
  surface
    .querySelectorAll(".rle-table[data-rle-active]")
    .forEach((table) => table.removeAttribute("data-rle-active"));
  surface
    .querySelectorAll(".rle-table td[data-rle-selected]")
    .forEach((cell) => cell.removeAttribute("data-rle-selected"));
  if (selection) {
    selection.table.setAttribute("data-rle-active", "true");
    const cells = selectedDomCells(selection);
    // A caret/single-cell click activates the table as one object. Cell fill
    // is reserved for an actual multi-cell range.
    if (cells.length > 1)
      cells.forEach((cell) => cell.setAttribute("data-rle-selected", "true"));
  }
}
