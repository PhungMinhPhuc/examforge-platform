import { wrapDisplayMath, wrapInlineMath } from "@/lib/docTree";

export type SelectionBookmark = {
  range: Range;
  startContainer: Node;
  endContainer: Node;
};

export function captureSelectionBookmark(
  surface: HTMLElement,
): SelectionBookmark | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  return surface.contains(range.commonAncestorContainer)
    ? {
        range: range.cloneRange(),
        startContainer: range.startContainer,
        endContainer: range.endContainer,
      }
    : null;
}

export function endOfSurfaceBookmark(surface: HTMLElement): SelectionBookmark {
  const range = document.createRange();
  const lastBlock = surface.lastElementChild;
  const target = lastBlock?.matches("p.rle-p, li") ? lastBlock : surface;
  range.selectNodeContents(target);
  range.collapse(false);
  return {
    range,
    startContainer: range.startContainer,
    endContainer: range.endContainer,
  };
}

export function restoreSelectionBookmark(
  surface: HTMLElement,
  bookmark: SelectionBookmark,
): Range | null {
  const { range, startContainer, endContainer } = bookmark;
  if (
    !startContainer.isConnected ||
    !endContainer.isConnected ||
    !surface.contains(startContainer) ||
    !surface.contains(endContainer) ||
    !surface.contains(range.commonAncestorContainer)
  )
    return null;
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return range;
}

function mathElement(tex: string, block: boolean) {
  const element = document.createElement(block ? "div" : "span");
  element.className = block ? "rle-mathblock" : "rle-math";
  element.contentEditable = "false";
  element.dataset.tex = tex;
  element.textContent = block ? wrapDisplayMath(tex) : wrapInlineMath(tex);
  return element;
}

function paragraphAfterBlock() {
  const paragraph = document.createElement("p");
  paragraph.className = "rle-p";
  paragraph.dataset.rleCaretHost = "true";
  paragraph.style.textAlign = "justify";
  paragraph.append(document.createElement("br"));
  return paragraph;
}

function isEmptyParagraph(node: Node | null): node is HTMLParagraphElement {
  return node instanceof HTMLParagraphElement &&
    node.matches("p.rle-p") &&
    !(node.textContent || "").replace(/[\u200b\u00a0]/g, "").trim() &&
    !node.querySelector(".rle-math, .rle-mathblock, .rle-code, .rle-image, table, img");
}

function placeCaret(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function isInsideTableCell(node: Node) {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return !!element?.closest("td, th");
}

function tableCellAt(node: Node) {
  const element = node.nodeType === Node.ELEMENT_NODE
    ? node as Element
    : node.parentElement;
  return element?.closest<HTMLTableCellElement>("td, th") ?? null;
}

function isEmptyCellPlaceholder(cell: HTMLTableCellElement) {
  const text = (cell.textContent || "").replace(/[\u200b\u00a0]/g, "").trim();
  return !text && !cell.querySelector(
    ".rle-math, .rle-mathblock, .rle-code, .rle-image, img",
  );
}

export function insertMathAtBookmark(
  surface: HTMLElement,
  bookmark: SelectionBookmark,
  tex: string,
  block: boolean,
): HTMLElement | null {
  const range = restoreSelectionBookmark(surface, bookmark);
  if (!range) return null;
  range.deleteContents();
  range.collapse(true);
  const atom = mathElement(tex, block);
  if (block && isInsideTableCell(range.commonAncestorContainer)) {
    const cell = tableCellAt(range.commonAncestorContainer);
    const replacesPlaceholder = !!cell && isEmptyCellPlaceholder(cell);
    atom.classList.add("rle-mathblock-cell");
    const line = document.createElement("br");
    if (replacesPlaceholder) cell.replaceChildren(atom, line);
    else {
      range.insertNode(atom);
      atom.after(line);
    }
    const parent = line.parentNode;
    if (parent) placeCaret(parent, Array.from(parent.childNodes).indexOf(line) + 1);
    return atom;
  }
  if (!block) {
    const spacer = document.createTextNode("\u200b");
    range.insertNode(atom);
    atom.after(spacer);
    placeCaret(spacer, spacer.data.length);
    return atom;
  }

  const anchor =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as HTMLElement)
      : range.startContainer.parentElement;
  const paragraph = anchor?.closest("p.rle-p") as HTMLParagraphElement | null;
  const after = paragraphAfterBlock();
  if (paragraph && surface.contains(paragraph)) {
    const tailRange = document.createRange();
    tailRange.selectNodeContents(paragraph);
    tailRange.setStart(range.startContainer, range.startOffset);
    const tail = tailRange.extractContents();
    if (tail.childNodes.length) after.replaceChildren(tail);
    const empty = !(paragraph.textContent || "").replace(/\u200b/g, "").trim();
    if (empty) paragraph.replaceWith(atom, after);
    else paragraph.after(atom, after);
  } else {
    range.insertNode(atom);
    atom.after(after);
  }
  placeCaret(after, 0);
  return atom;
}

export function updateMathAtom(element: HTMLElement, tex: string) {
  const block = element.classList.contains("rle-mathblock");
  element.dataset.tex = tex;
  element.textContent = block ? wrapDisplayMath(tex) : wrapInlineMath(tex);
}

export function deleteMathAtom(element: HTMLElement) {
  const next = element.nextSibling;
  const parent = element.parentNode;
  element.remove();
  if (next?.isConnected) placeCaret(next, 0);
  else if (parent?.isConnected) placeCaret(parent, parent.childNodes.length);
}

export function insertCodeBlockAtBookmark(
  surface: HTMLElement,
  bookmark: SelectionBookmark,
  text = "// nhập mã, bấm shift + enter để xuống dòng trong khối mã",
  lang = "",
): HTMLElement | null {
  const range = restoreSelectionBookmark(surface, bookmark);
  if (!range) return null;
  range.deleteContents();
  range.collapse(true);
  if (isInsideTableCell(range.commonAncestorContainer)) {
    const cell = tableCellAt(range.commonAncestorContainer);
    const replacesPlaceholder = !!cell && isEmptyCellPlaceholder(cell);
    const code = document.createElement("pre");
    code.className = "rle-code";
    code.dataset.lang = lang;
    code.textContent = text;
    const line = document.createElement("br");
    if (replacesPlaceholder) cell.replaceChildren(code, line);
    else {
      range.insertNode(code);
      code.after(line);
    }
    placeCaret(code, code.childNodes.length);
    return code;
  }
  const code = document.createElement("pre");
  code.className = "rle-code";
  code.dataset.lang = lang;
  code.textContent = text;
  const after = paragraphAfterBlock();
  const anchor =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as HTMLElement)
      : range.startContainer.parentElement;
  const paragraph = anchor?.closest("p.rle-p") as HTMLParagraphElement | null;
  if (paragraph && surface.contains(paragraph)) {
    const tailRange = document.createRange();
    tailRange.selectNodeContents(paragraph);
    tailRange.setStart(range.startContainer, range.startOffset);
    const tail = tailRange.extractContents();
    if (tail.childNodes.length) after.replaceChildren(tail);
    const empty = !(paragraph.textContent || "").replace(/\u200b/g, "").trim();
    if (empty) paragraph.replaceWith(code, after);
    else paragraph.after(code, after);
  } else if (range.startContainer === surface) {
    const offset = range.startOffset;
    const previous = surface.childNodes[offset - 1] ?? null;
    const following = surface.childNodes[offset] ?? null;
    if (isEmptyParagraph(previous)) {
      previous.replaceWith(code);
      if (following instanceof HTMLParagraphElement && following.matches("p.rle-p")) {
        // Paragraph kế tiếp đã là vị trí tiếp tục gõ; không tạo thêm dòng rỗng.
        after.remove();
      } else {
        code.after(after);
      }
    } else if (isEmptyParagraph(following)) {
      following.replaceWith(code, after);
    } else {
      range.insertNode(code);
      code.after(after);
    }
  } else {
    range.insertNode(code);
    code.after(after);
  }
  placeCaret(code, code.childNodes.length);
  return code;
}
