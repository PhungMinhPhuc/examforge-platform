import type { ActiveTableSelection } from "./selection";
import { buildDomGrid } from "./domAdapter";
import { selectedDomCells } from "./selection";

export function tableSelectionClipboard(selection: ActiveTableSelection) {
  const grid = buildDomGrid(selection.table);
  const rows: string[][] = [];
  const emitted = new Set<HTMLTableCellElement>();
  for (let row = selection.rect.r0; row <= selection.rect.r1; row += 1) {
    const values: string[] = [];
    for (
      let column = selection.rect.c0;
      column <= selection.rect.c1;
      column += 1
    ) {
      const cell = grid[row]?.[column];
      if (!cell || emitted.has(cell)) values.push("");
      else {
        emitted.add(cell);
        values.push(cell.innerHTML);
      }
    }
    rows.push(values);
  }
  return {
    text: rows
      .map((row) =>
        row
          .map((value) => {
            const node = document.createElement("div");
            node.innerHTML = value;
            return node.textContent ?? "";
          })
          .join("\t"),
      )
      .join("\n"),
    html: `<table><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${value}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
  };
}

export function clearSelectedCells(selection: ActiveTableSelection) {
  selectedDomCells(selection).forEach((cell) => {
    cell.innerHTML = "&#8203;";
  });
}
export function pasteIntoSelection(
  selection: ActiveTableSelection,
  html: string,
  text: string,
) {
  const source = clipboardMatrix(html, text);
  if (!source.length) return;
  const grid = buildDomGrid(selection.table);
  const written = new Set<HTMLTableCellElement>();
  source.forEach((row, rowOffset) => row.forEach((value, columnOffset) => {
    const target = grid[selection.rect.r0 + rowOffset]?.[
      selection.rect.c0 + columnOffset
    ];
    if (!target || written.has(target)) return;
    written.add(target);
    target.innerHTML = sanitizeInlineHtml(value) || "&#8203;";
  }));
}

const ALLOWED_INLINE = new Set([
  "B", "STRONG", "I", "EM", "U", "S", "SUP", "SUB", "SPAN", "BR",
  "TABLE", "TBODY", "THEAD", "TFOOT", "TR", "TD", "TH", "COLGROUP", "COL",
]);

function sanitizeInlineHtml(value: string) {
  const template = document.createElement("template");
  template.innerHTML = value;
  Array.from(template.content.querySelectorAll("script,style,iframe,object,embed,svg,math"))
    .forEach((element) => element.remove());
  Array.from(template.content.querySelectorAll("*"))
    .reverse()
    .forEach((element) => {
      if (!ALLOWED_INLINE.has(element.tagName)) {
        element.replaceWith(...Array.from(element.childNodes));
        return;
      }
      const mathAtom = element.classList.contains("rle-math");
      const imageAtom = element.classList.contains("rle-imginline");
      const semanticAttributes = mathAtom
        ? new Map([["class", "rle-math"], ["data-tex", element.getAttribute("data-tex") ?? ""], ["contenteditable", "false"]])
        : imageAtom
          ? new Map([["class", "rle-imginline rle-image"], ["data-figure-id", element.getAttribute("data-figure-id") ?? ""], ["contenteditable", "false"]])
          : null;
      const tableAttributes: Map<string, string> | null = element.tagName === "TD" || element.tagName === "TH"
        ? new Map<string, string>([
            ["colspan", element.getAttribute("colspan") ?? ""],
            ["rowspan", element.getAttribute("rowspan") ?? ""],
          ].filter((entry): entry is [string, string] => Boolean(entry[1])))
        : element.tagName === "TABLE"
          ? new Map<string, string>([["class", "rle-table"]])
          : null;
      Array.from(element.attributes).forEach((attribute) => {
        if (attribute.name !== "style") element.removeAttribute(attribute.name);
      });
      semanticAttributes?.forEach((attributeValue, attributeName) =>
        element.setAttribute(attributeName, attributeValue),
      );
      tableAttributes?.forEach((attributeValue, attributeName) =>
        element.setAttribute(attributeName, attributeValue),
      );
      if (element instanceof HTMLElement && element.hasAttribute("style")) {
        const color = element.style.color;
        const background = element.style.backgroundColor;
        element.removeAttribute("style");
        if (color) element.style.color = color;
        if (background) element.style.backgroundColor = background;
      }
    });
  return template.innerHTML;
}

function clipboardMatrix(html: string, text: string) {
  if (html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    const table = template.content.querySelector("table");
    if (table)
      return Array.from(table.rows).map((row) =>
        Array.from(row.cells).map((cell) => cell.innerHTML),
      );
    return [[html]];
  }
  return text.split(/\r?\n/).map((row) =>
    row.split("\t").map((value) => value.replaceAll("\n", "<br>")),
  );
}

export async function writeTableSelectionClipboard(selection: ActiveTableSelection) {
  const data = tableSelectionClipboard(selection);
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined")
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": new Blob([data.text], { type: "text/plain" }),
      "text/html": new Blob([data.html], { type: "text/html" }),
    })]);
  else if (navigator.clipboard?.writeText)
    await navigator.clipboard.writeText(data.text);
  else throw new Error("Clipboard write is not available");
  return data;
}

export async function readClipboardData() {
  if (navigator.clipboard?.read) {
    const item = (await navigator.clipboard.read())[0];
    const html = item?.types.includes("text/html")
      ? await (await item.getType("text/html")).text() : "";
    const text = item?.types.includes("text/plain")
      ? await (await item.getType("text/plain")).text() : "";
    return { html, text };
  }
  if (navigator.clipboard?.readText)
    return { html: "", text: await navigator.clipboard.readText() };
  throw new Error("Clipboard read is not available");
}
