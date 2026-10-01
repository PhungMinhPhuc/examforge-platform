import {
  cellRect,
  cellsIntersectingRect,
  mergeRect,
  splitCell,
  insertRow,
  deleteRows,
  insertColumn,
  deleteColumns,
  type TableRect,
} from "./model";
import { renderTableModel, tableModelFromDom } from "./domAdapter";

export function mergeTableSelection(table: HTMLTableElement, rect: TableRect) {
  const before = tableModelFromDom(table);
  if (cellsIntersectingRect(before, rect).length <= 1) return null;
  const result = mergeRect(before, rect);
  renderTableModel(table, result.model);
  return result;
}

export function splitSelectedCell(
  table: HTMLTableElement,
  rect: TableRect,
  rows: number,
  columns: number,
) {
  const before = tableModelFromDom(table);
  const selected = cellsIntersectingRect(before, rect);
  if (selected.length !== 1) return null;
  const result = splitCell(before, selected[0].id, rows, columns);
  renderTableModel(table, result.model);
  const first = result.model.cells.find((cell) => cell.id === result.newIds[0]);
  return { ...result, rect: first ? cellRect(first) : rect };
}

let nextInsertedCell = 1;
const makeCellId = () => `rle-inserted-${nextInsertedCell++}`;

export type TableCommandCapability = {
  canInsertRow: boolean;
  canDeleteRows: boolean;
  canInsertColumn: boolean;
  canDeleteColumns: boolean;
  canMerge: boolean;
  canSplit: boolean;
};

export function tableCommandCapabilities(
  table: HTMLTableElement,
  rect: TableRect,
): TableCommandCapability {
  const model = tableModelFromDom(table);
  const selected = cellsIntersectingRect(model, rect);
  const { rows, cols } = buildTableSize(model);
  const selectedRows = Math.max(0, rect.r1 - rect.r0 + 1);
  const selectedColumns = Math.max(0, rect.c1 - rect.c0 + 1);
  return {
    canInsertRow: !!selected.length,
    canDeleteRows: !!selected.length && rows - selectedRows >= 1,
    canInsertColumn: !!selected.length,
    canDeleteColumns: !!selected.length && cols - selectedColumns >= 1,
    canMerge: selected.length > 1,
    canSplit:
      selected.length === 1 &&
      (selected[0].rowSpan > 1 || selected[0].colSpan > 1),
  };
}

function buildTableSize(model: ReturnType<typeof tableModelFromDom>) {
  let rows = 0;
  let cols = 0;
  model.cells.forEach((cell) => {
    rows = Math.max(rows, cell.row + cell.rowSpan);
    cols = Math.max(cols, cell.col + cell.colSpan);
  });
  return { rows, cols };
}

function renderMutation(
  table: HTMLTableElement,
  model: ReturnType<typeof tableModelFromDom>,
  rect: TableRect,
  anchorId?: string,
) {
  if (!model.cells.length) {
    table.remove();
    return null;
  }
  renderTableModel(table, model);
  const anchor = model.cells.find((cell) => cell.id === anchorId) ??
    cellsIntersectingRect(model, rect)[0] ?? model.cells[0];
  return { table, rect: cellRect(anchor), anchorId: anchor.id };
}

export function insertSelectedRow(
  table: HTMLTableElement,
  rect: TableRect,
  where: "above" | "below",
  anchorId?: string,
) {
  const model = tableModelFromDom(table);
  const singleCell = rect.r0 === rect.r1 && rect.c0 === rect.c1;
  const liveAnchor = singleCell && anchorId
    ? model.cells.find((cell) => cell.id === anchorId)
    : undefined;
  const liveRect = liveAnchor ? cellRect(liveAnchor) : rect;
  const at = where === "above" ? liveRect.r0 : liveRect.r1 + 1;
  const next = insertRow(model, at, makeCellId);
  return renderMutation(table, next, { r0: at, c0: liveRect.c0, r1: at, c1: liveRect.c0 });
}

export function deleteSelectedRows(table: HTMLTableElement, rect: TableRect) {
  const next = deleteRows(tableModelFromDom(table), rect.r0, rect.r1);
  const row = Math.max(0, Math.min(rect.r0, buildTableSize(next).rows - 1));
  return renderMutation(table, next, { r0: row, c0: rect.c0, r1: row, c1: rect.c0 });
}

export function insertSelectedColumn(
  table: HTMLTableElement,
  rect: TableRect,
  where: "left" | "right",
) {
  const model = tableModelFromDom(table);
  const at = where === "left" ? rect.c0 : rect.c1 + 1;
  const next = insertColumn(model, at, makeCellId);
  return renderMutation(table, next, { r0: rect.r0, c0: at, r1: rect.r0, c1: at });
}

export function deleteSelectedColumns(table: HTMLTableElement, rect: TableRect) {
  const next = deleteColumns(tableModelFromDom(table), rect.c0, rect.c1);
  const column = Math.max(0, Math.min(rect.c0, buildTableSize(next).cols - 1));
  return renderMutation(table, next, { r0: rect.r0, c0: column, r1: rect.r0, c1: column });
}
