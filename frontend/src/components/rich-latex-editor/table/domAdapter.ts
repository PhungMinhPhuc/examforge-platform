import { buildGrid, type TableModel } from "./model";

let nextCellId = 1;

export function buildDomGrid(table: HTMLTableElement) {
  const grid: Array<Array<HTMLTableCellElement | undefined>> = [];
  Array.from(table.rows).forEach((row, rowIndex) => {
    grid[rowIndex] ??= [];
    let column = 0;
    Array.from(row.cells).forEach((cell) => {
      while (grid[rowIndex][column]) column += 1;
      for (let y = rowIndex; y < rowIndex + cell.rowSpan; y += 1) {
        grid[y] ??= [];
        for (let x = column; x < column + cell.colSpan; x += 1)
          grid[y][x] = cell;
      }
      column += cell.colSpan;
    });
  });
  return grid;
}

export function tableModelFromDom(table: HTMLTableElement): TableModel {
  const grid = buildDomGrid(table);
  const seen = new Set<HTMLTableCellElement>();
  const cells: TableModel["cells"] = [];
  grid.forEach((row, rowIndex) =>
    row.forEach((cell, columnIndex) => {
      if (!cell || seen.has(cell)) return;
      seen.add(cell);
      cell.dataset.cellId ||= `rle-cell-${nextCellId++}`;
      cells.push({
        id: cell.dataset.cellId,
        row: rowIndex,
        col: columnIndex,
        rowSpan: cell.rowSpan || 1,
        colSpan: cell.colSpan || 1,
        content: cell.innerHTML,
        textAlign: cell.style.textAlign || undefined,
      });
    }),
  );
  return {
    cells,
    widths: Array.from(table.querySelectorAll<HTMLElement>(":scope > colgroup > col"))
      .map((column) => column.style.width),
    rowHeights: Array.from(table.rows).map((row) => ({
      data: row.dataset.height,
      style: row.style.height,
    })),
  };
}

export function renderTableModel(table: HTMLTableElement, model: TableModel) {
  const { grid, rows, cols } = buildGrid(model);
  let colgroup = table.querySelector(":scope > colgroup");
  if (!colgroup) {
    colgroup = document.createElement("colgroup");
    table.prepend(colgroup);
  }
  colgroup.replaceChildren(
    ...Array.from({ length: cols }, (_, index) => {
      const column = document.createElement("col");
      column.style.width = model.widths?.length === cols && model.widths[index]
        ? model.widths[index]
        : `${100 / cols}%`;
      return column;
    }),
  );
  const tbody = table.tBodies[0] ?? table.createTBody();
  tbody.replaceChildren(
    ...Array.from({ length: rows }, (_, rowIndex) => {
      const row = document.createElement("tr");
      const rowHeight = model.rowHeights?.[rowIndex];
      if (rowHeight?.data) row.dataset.height = rowHeight.data;
      if (rowHeight?.style) row.style.height = rowHeight.style;
      for (let columnIndex = 0; columnIndex < cols; columnIndex += 1) {
        const cell = grid[rowIndex]?.[columnIndex];
        if (!cell || cell.row !== rowIndex || cell.col !== columnIndex)
          continue;
        const element = document.createElement("td");
        element.dataset.cellId = cell.id;
        element.rowSpan = cell.rowSpan;
        element.colSpan = cell.colSpan;
        element.innerHTML = cell.content || "&#8203;";
        element.style.textAlign = cell.textAlign ?? "";
        row.append(element);
      }
      return row;
    }),
  );
}
