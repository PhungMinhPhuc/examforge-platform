export type TableCellModel = {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  content: string;
  textAlign?: string;
};
export type TableModel = {
  cells: TableCellModel[];
  widths?: string[];
  rowHeights?: Array<{ data?: string; style?: string }>;
};
export type TableRect = { r0: number; c0: number; r1: number; c1: number };

export function buildGrid(model: TableModel) {
  const grid: Array<Array<TableCellModel | undefined>> = [];
  let cols = 0;
  model.cells.forEach((cell) => {
    for (let row = cell.row; row < cell.row + cell.rowSpan; row += 1) {
      grid[row] ??= [];
      for (
        let column = cell.col;
        column < cell.col + cell.colSpan;
        column += 1
      ) {
        grid[row][column] = cell;
        cols = Math.max(cols, column + 1);
      }
    }
  });
  return { grid, rows: grid.length, cols };
}

export function cellAt(model: TableModel, row: number, column: number) {
  return buildGrid(model).grid[row]?.[column] ?? null;
}

export function cellRect(cell: TableCellModel): TableRect {
  return {
    r0: cell.row,
    c0: cell.col,
    r1: cell.row + cell.rowSpan - 1,
    c1: cell.col + cell.colSpan - 1,
  };
}

export function unionRect(a: TableRect, b: TableRect): TableRect {
  return {
    r0: Math.min(a.r0, b.r0),
    c0: Math.min(a.c0, b.c0),
    r1: Math.max(a.r1, b.r1),
    c1: Math.max(a.c1, b.c1),
  };
}

export function expandRectToWholeCells(
  model: TableModel,
  rect: TableRect,
): TableRect {
  const { grid, rows, cols } = buildGrid(model);
  let { r0, c0, r1, c1 } = rect;
  let changed = true;
  while (changed) {
    changed = false;
    for (let row = r0; row <= r1; row += 1)
      for (let column = c0; column <= c1; column += 1) {
        const cell = grid[row]?.[column];
        if (!cell) continue;
        const expanded = unionRect({ r0, c0, r1, c1 }, cellRect(cell));
        if (
          expanded.r0 !== r0 ||
          expanded.c0 !== c0 ||
          expanded.r1 !== r1 ||
          expanded.c1 !== c1
        ) {
          ({ r0, c0, r1, c1 } = expanded);
          changed = true;
        }
      }
  }
  return {
    r0: Math.max(0, r0),
    c0: Math.max(0, c0),
    r1: Math.min(rows - 1, r1),
    c1: Math.min(cols - 1, c1),
  };
}

export function computeSelectionRect(
  model: TableModel,
  anchor: TableCellModel,
  focus: TableCellModel,
) {
  const { rows, cols } = buildGrid(model);
  const rect = unionRect(cellRect(anchor), cellRect(focus));
  // Pointer selection follows only the anchor/focus rectangle. Do not let an
  // unrelated merged cell crossed on the way recursively balloon the visual
  // selection. Structural commands still normalize before mutating the grid.
  return {
    r0: Math.max(0, rect.r0),
    c0: Math.max(0, rect.c0),
    r1: Math.min(rows - 1, rect.r1),
    c1: Math.min(cols - 1, rect.c1),
  };
}

export function computeSelectionRectFromRects(
  model: TableModel,
  anchor: TableRect,
  focus: TableRect,
) {
  return expandRectToWholeCells(model, unionRect(anchor, focus));
}

export function cellsIntersectingRect(model: TableModel, rect: TableRect) {
  const { grid } = buildGrid(model);
  const seen = new Set<string>();
  const cells: TableCellModel[] = [];
  for (let row = rect.r0; row <= rect.r1; row += 1)
    for (let column = rect.c0; column <= rect.c1; column += 1) {
      const cell = grid[row]?.[column];
      if (cell && !seen.has(cell.id)) {
        seen.add(cell.id);
        cells.push(cell);
      }
    }
  return cells;
}

export function mergeRect(model: TableModel, rect: TableRect) {
  const cleanRect = expandRectToWholeCells(model, rect);
  const involved = cellsIntersectingRect(model, cleanRect);
  if (!involved.length) return { model, mergedId: null, rect: cleanRect };
  const ordered = [...involved].sort((a, b) => a.row - b.row || a.col - b.col);
  const removed = new Set(ordered.map((cell) => cell.id));
  const mergedId = ordered[0].id;
  const merged: TableCellModel = {
    id: mergedId,
    row: cleanRect.r0,
    col: cleanRect.c0,
    rowSpan: cleanRect.r1 - cleanRect.r0 + 1,
    colSpan: cleanRect.c1 - cleanRect.c0 + 1,
    textAlign: ordered[0].textAlign,
    content: ordered
      .map((cell) => cell.content)
      .filter((value) => !isVisuallyEmptyCellContent(value))
      .join("<br>"),
  };
  return {
    model: {
      ...model,
      cells: model.cells.filter((cell) => !removed.has(cell.id)).concat(merged),
    },
    mergedId,
    rect: cleanRect,
  };
}

/** Empty editable cells are serialized with a BR (and sometimes a caret
 * zero-width character). Neither is document content and therefore neither
 * may become a separator when cells are merged. */
export function isVisuallyEmptyCellContent(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, "")
    .replace(/&(?:nbsp|#160|#x0*a0);/gi, "")
    .replace(/[\u200B-\u200D\u2060\uFEFF\s]/g, "")
    .replace(/<\/?(?:p|div|span)[^>]*>/gi, "") === "";
}

export function distribute(total: number, parts: number) {
  const base = Math.floor(total / parts);
  let remainder = total - base * parts;
  return Array.from({ length: parts }, () => base + (remainder-- > 0 ? 1 : 0));
}

export function splitCell(
  model: TableModel,
  cellId: string,
  requestedRows: number,
  requestedColumns: number,
) {
  const target = model.cells.find((cell) => cell.id === cellId);
  if (!target) return { model, newIds: [] as string[] };
  const rows = Math.max(1, Math.min(requestedRows, target.rowSpan));
  const columns = Math.max(1, Math.min(requestedColumns, target.colSpan));
  if (rows === 1 && columns === 1) return { model, newIds: [target.id] };
  const rowSizes = distribute(target.rowSpan, rows);
  const columnSizes = distribute(target.colSpan, columns);
  const cells: TableCellModel[] = [];
  let rowOffset = target.row;
  let nextId = 0;
  rowSizes.forEach((rowSpan, rowIndex) => {
    let columnOffset = target.col;
    columnSizes.forEach((colSpan, columnIndex) => {
      const first = rowIndex === 0 && columnIndex === 0;
      cells.push({
        id: first ? target.id : `${target.id}-split${nextId++}`,
        row: rowOffset,
        col: columnOffset,
        rowSpan,
        colSpan,
        content: first ? target.content : "",
      });
      columnOffset += colSpan;
    });
    rowOffset += rowSpan;
  });
  return {
    model: {
      ...model,
      cells: model.cells.filter((cell) => cell.id !== target.id).concat(cells),
    },
    newIds: cells.map((cell) => cell.id),
  };
}

export function cellsInReadingOrder(model: TableModel) {
  return [...model.cells].sort((a, b) => a.row - b.row || a.col - b.col);
}
export function adjacentCell(
  model: TableModel,
  cellId: string,
  direction: "next" | "previous",
) {
  const cells = cellsInReadingOrder(model);
  const index = cells.findIndex((cell) => cell.id === cellId);
  return index < 0
    ? null
    : (cells[index + (direction === "next" ? 1 : -1)] ?? null);
}
export function appendRow(model: TableModel, makeId: () => string): TableModel {
  const { rows, cols } = buildGrid(model);
  return {
    ...model,
    cells: model.cells.concat(
      Array.from({ length: cols }, (_, column) => ({
        id: makeId(),
        row: rows,
        col: column,
        rowSpan: 1,
        colSpan: 1,
        content: "",
      })),
    ),
  };
}

export function insertRow(
  model: TableModel,
  index: number,
  makeId: () => string,
): TableModel {
  const { rows, cols } = buildGrid(model);
  const at = Math.max(0, Math.min(index, rows));
  const covered = new Set<number>();
  const cells = model.cells.map((cell) => {
    if (cell.row < at && cell.row + cell.rowSpan > at) {
      for (let column = cell.col; column < cell.col + cell.colSpan; column += 1)
        covered.add(column);
      return { ...cell, rowSpan: cell.rowSpan + 1 };
    }
    return cell.row >= at ? { ...cell, row: cell.row + 1 } : { ...cell };
  });
  for (let column = 0; column < cols; column += 1)
    if (!covered.has(column))
      cells.push({
        id: makeId(), row: at, col: column, rowSpan: 1, colSpan: 1, content: "",
      });
  const rowHeights = [...(model.rowHeights ?? [])];
  rowHeights.splice(at, 0, {});
  return { ...model, cells, rowHeights };
}

export function deleteRows(model: TableModel, start: number, end: number): TableModel {
  const { rows } = buildGrid(model);
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(rows - 1, Math.max(start, end));
  if (to < from) return model;
  const count = to - from + 1;
  const cells = model.cells.flatMap((cell) => {
    const cellEnd = cell.row + cell.rowSpan - 1;
    if (cellEnd < from) return [{ ...cell }];
    if (cell.row > to) return [{ ...cell, row: cell.row - count }];
    const overlap = Math.min(cellEnd, to) - Math.max(cell.row, from) + 1;
    const rowSpan = cell.rowSpan - overlap;
    if (rowSpan <= 0) return [];
    return [{ ...cell, row: Math.min(cell.row, from), rowSpan }];
  });
  const rowHeights = [...(model.rowHeights ?? [])];
  rowHeights.splice(from, count);
  return { ...model, cells, rowHeights };
}

export function insertColumn(
  model: TableModel,
  index: number,
  makeId: () => string,
): TableModel {
  const { rows, cols } = buildGrid(model);
  const at = Math.max(0, Math.min(index, cols));
  const covered = new Set<number>();
  const cells = model.cells.map((cell) => {
    if (cell.col < at && cell.col + cell.colSpan > at) {
      for (let row = cell.row; row < cell.row + cell.rowSpan; row += 1)
        covered.add(row);
      return { ...cell, colSpan: cell.colSpan + 1 };
    }
    return cell.col >= at ? { ...cell, col: cell.col + 1 } : { ...cell };
  });
  for (let row = 0; row < rows; row += 1)
    if (!covered.has(row))
      cells.push({
        id: makeId(), row, col: at, rowSpan: 1, colSpan: 1, content: "",
      });
  const widths = [...(model.widths ?? [])];
  widths.splice(at, 0, "");
  return { ...model, cells, widths };
}

export function deleteColumns(
  model: TableModel,
  start: number,
  end: number,
): TableModel {
  const { cols } = buildGrid(model);
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(cols - 1, Math.max(start, end));
  if (to < from) return model;
  const count = to - from + 1;
  const cells = model.cells.flatMap((cell) => {
    const cellEnd = cell.col + cell.colSpan - 1;
    if (cellEnd < from) return [{ ...cell }];
    if (cell.col > to) return [{ ...cell, col: cell.col - count }];
    const overlap = Math.min(cellEnd, to) - Math.max(cell.col, from) + 1;
    const colSpan = cell.colSpan - overlap;
    if (colSpan <= 0) return [];
    return [{ ...cell, col: Math.min(cell.col, from), colSpan }];
  });
  const widths = [...(model.widths ?? [])];
  widths.splice(from, count);
  return { ...model, cells, widths };
}
export function validateModel(model: TableModel) {
  const { grid, rows, cols } = buildGrid(model);
  const problems: string[] = [];
  for (let row = 0; row < rows; row += 1)
    for (let column = 0; column < cols; column += 1)
      if (!grid[row]?.[column]) problems.push(`gap at (${row},${column})`);
  return { ok: !problems.length, problems, rows, cols };
}
