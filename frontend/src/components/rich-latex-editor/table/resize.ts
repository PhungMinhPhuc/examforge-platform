export function resizeTableBoundary(
  table: HTMLTableElement,
  leftColumn: number,
  deltaPixels: number,
) {
  const columns = Array.from(
    table.querySelectorAll<HTMLTableColElement>(":scope > colgroup > col"),
  );
  if (leftColumn < 0 || leftColumn >= columns.length - 1) return false;
  const tableWidth = table.getBoundingClientRect().width;
  if (tableWidth <= 0) return false;
  const widths = columns.map((column) =>
    Number.parseFloat(column.style.width) / 100,
  );
  const fallback = 1 / columns.length;
  const left = Number.isFinite(widths[leftColumn]) ? widths[leftColumn] : fallback;
  const right = Number.isFinite(widths[leftColumn + 1]) ? widths[leftColumn + 1] : fallback;
  const pair = left + right;
  const nextLeft = Math.max(0.05, Math.min(pair - 0.05, left + deltaPixels / tableWidth));
  const nextRight = pair - nextLeft;
  const percentage = (ratio: number) => `${Number((ratio * 100).toFixed(6))}%`;
  columns[leftColumn].style.width = percentage(nextLeft);
  columns[leftColumn + 1].style.width = percentage(nextRight);
  return true;
}

export function resizeTableRow(
  table: HTMLTableElement,
  rowIndex: number,
  deltaPixels: number,
) {
  const row = table.rows.item(rowIndex);
  if (!row) return false;
  const declared = Number.parseFloat(row.dataset.height || row.style.height);
  const current = Number.isFinite(declared) && declared > 0
    ? declared
    : row.getBoundingClientRect().height;
  if (current <= 0) return false;
  const height = Math.max(20, Math.round((current + deltaPixels) * 100) / 100);
  row.dataset.height = String(height);
  row.style.height = `${height}px`;
  return true;
}

const RESIZE_HIT_SLOP = 6;

type BoundaryHit = {
  table: HTMLTableElement;
  boundary: number;
  cell: HTMLTableCellElement;
  axis: "column" | "row";
};

function boundaryAtPoint(surface: HTMLElement, target: EventTarget | null, x: number, y: number): BoundaryHit | null {
  const targetElement = target instanceof Element ? target : null;
  const targetTable = targetElement?.closest<HTMLTableElement>("table.rle-table");
  const tables = targetTable ? [targetTable] : Array.from(surface.querySelectorAll<HTMLTableElement>("table.rle-table"));
  for (const table of tables) {
    const columns = table.querySelectorAll(":scope > colgroup > col").length;
    const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>("td"))
      .filter((cell) => cell.closest("table") === table);
    if (columns >= 2) {
      for (const cell of cells) {
        const bounds = cell.getBoundingClientRect();
        if (y < bounds.top - RESIZE_HIT_SLOP || y > bounds.bottom + RESIZE_HIT_SLOP || Math.abs(x - bounds.right) > RESIZE_HIT_SLOP) continue;
        const grid = buildDomGrid(table);
        const col = grid.findIndex((row) => row.includes(cell)) < 0
          ? -1
          : (grid.find((row) => row.includes(cell))?.indexOf(cell) ?? -1);
        const span = Math.max(1, cell.colSpan || 1);
        const boundary = col >= 0 ? col + span - 1 : cell.cellIndex + span - 1;
        if (boundary < columns - 1)
          return { table, boundary, cell, axis: "column" };
      }
    }
    for (const cell of cells) {
      const bounds = cell.getBoundingClientRect();
      if (x < bounds.left - RESIZE_HIT_SLOP || x > bounds.right + RESIZE_HIT_SLOP || Math.abs(y - bounds.bottom) > RESIZE_HIT_SLOP) continue;
      const grid = buildDomGrid(table);
      const row = grid.findIndex((gridRow) => gridRow.includes(cell));
      const span = Math.max(1, cell.rowSpan || 1);
      const physicalRow = cell.parentElement as HTMLTableRowElement | null;
      const boundary = row >= 0 ? row + span - 1 : physicalRow?.rowIndex ?? -1;
      // The bottom edge of the last row is also a real row-height handle.
      if (boundary >= 0 && boundary < table.rows.length)
        return { table, boundary, cell, axis: "row" };
    }
  }
  return null;
}

/** Installs Word-like column/row-boundary hover and pointer drag behavior. */
export function observeTableColumnResize(surface: HTMLElement, onCommit: () => void) {
  let drag: (BoundaryHit & { previous: number; pointerId: number; changed: boolean }) | null = null;
  let hoveredCell: HTMLTableCellElement | null = null;
  let hoveredAxis: BoundaryHit["axis"] | null = null;
  const showBoundary = (cell: HTMLTableCellElement | null, axis: BoundaryHit["axis"] | null = null) => {
    if (hoveredCell !== cell)
      hoveredCell?.removeAttribute(`data-rle-${hoveredAxis}-boundary`);
    else if (hoveredAxis && hoveredAxis !== axis)
      hoveredCell?.removeAttribute(`data-rle-${hoveredAxis}-boundary`);
    hoveredCell = cell;
    hoveredAxis = axis;
    if (cell && axis) cell.setAttribute(`data-rle-${axis}-boundary`, "true");
    surface.toggleAttribute("data-rle-column-resize", !!cell && axis === "column");
    surface.toggleAttribute("data-rle-row-resize", !!cell && axis === "row");
  };
  const hover = (event: PointerEvent) => {
    if (drag) return;
    const hit = boundaryAtPoint(
      surface,
      event.target,
      event.clientX,
      event.clientY,
    );
    showBoundary(hit?.cell ?? null, hit?.axis ?? null);
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const hit = boundaryAtPoint(surface, event.target, event.clientX, event.clientY);
    if (!hit) return;
    event.preventDefault();
    showBoundary(hit.cell, hit.axis);
    drag = {
      ...hit,
      previous: hit.axis === "column" ? event.clientX : event.clientY,
      pointerId: event.pointerId,
      changed: false,
    };
    surface.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const coordinate = drag.axis === "column" ? event.clientX : event.clientY;
    const delta = coordinate - drag.previous;
    const resized = drag.axis === "column"
      ? resizeTableBoundary(drag.table, drag.boundary, delta)
      : resizeTableRow(drag.table, drag.boundary, delta);
    if (delta && resized) {
      drag.previous = coordinate;
      drag.changed = true;
    }
  };
  const up = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const changed = drag.changed;
    surface.releasePointerCapture?.(drag.pointerId);
    drag = null;
    showBoundary(null);
    if (changed) onCommit();
  };
  const leave = () => { if (!drag) showBoundary(null); };
  surface.addEventListener("pointermove", hover);
  surface.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  surface.addEventListener("pointerleave", leave);
  return () => {
    showBoundary(null);
    surface.removeEventListener("pointermove", hover);
    surface.removeEventListener("pointerdown", down);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    surface.removeEventListener("pointerleave", leave);
  };
}
import { buildDomGrid } from "./domAdapter";
