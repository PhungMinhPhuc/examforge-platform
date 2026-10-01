import type { ActiveTableSelection } from "../table/selection";
import { selectedDomCells } from "../table/selection";

type TagCommand = "bold" | "italic" | "underline" | "superscript" | "subscript";
const TAGS: Record<
  TagCommand,
  { exec: string; tag: string; opposite?: string }
> = {
  bold: { exec: "bold", tag: "b" },
  italic: { exec: "italic", tag: "i" },
  underline: { exec: "underline", tag: "u" },
  superscript: { exec: "superscript", tag: "sup", opposite: "sub" },
  subscript: { exec: "subscript", tag: "sub", opposite: "sup" },
};

function unwrap(element: Element) {
  element.replaceWith(...Array.from(element.childNodes));
}
function setCellTag(
  cell: HTMLTableCellElement,
  tag: string,
  enabled: boolean,
  opposite?: string,
) {
  if (opposite) cell.querySelectorAll(opposite).forEach(unwrap);
  if (!enabled) {
    cell.querySelectorAll(tag).forEach(unwrap);
    return;
  }
  // Normalize partially formatted cells before applying the mark to the
  // whole cell; otherwise repeated mixed-selection toggles create wrappers.
  cell.querySelectorAll(tag).forEach(unwrap);
  const wrapper = document.createElement(tag);
  wrapper.append(...Array.from(cell.childNodes));
  cell.append(wrapper);
}

function cellFullyTagged(cell: HTMLTableCellElement, tag: string) {
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (node.data.replace(/[\u200b\s]/g, "").length) textNodes.push(node);
    node = walker.nextNode() as Text | null;
  }
  return (
    textNodes.length > 0 &&
    textNodes.every((text) => text.parentElement?.closest(tag))
  );
}

export function applyTagCommand(
  command: TagCommand,
  tableSelection: ActiveTableSelection | null,
) {
  const config = TAGS[command];
  if (!tableSelection) {
    document.execCommand(config.exec);
    return;
  }
  const cells = selectedDomCells(tableSelection);
  // Word-style toggle policy: remove only when the entire range has the
  // mark; a mixed range becomes uniformly enabled on the first toggle.
  const enable = !cells.every((cell) => cellFullyTagged(cell, config.tag));
  cells.forEach((cell) =>
    setCellTag(cell, config.tag, enable, config.opposite),
  );
}

function clearStyleInRange(
  range: Range,
  selection: Selection,
  property: "color" | "backgroundColor",
) {
  const common =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement;
  const surface = common?.closest<HTMLElement>("[contenteditable]");
  if (!surface) return;
  const marker = (kind: "start" | "end") => {
    const element = document.createElement("span");
    element.dataset.rleFormatBoundary = kind;
    element.contentEditable = "false";
    return element;
  };
  let end = marker("end");
  const endRange = range.cloneRange();
  endRange.collapse(false);
  endRange.insertNode(end);
  const start = marker("start");
  const startRange = range.cloneRange();
  startRange.collapse(true);
  startRange.insertNode(start);

  const selector =
    property === "backgroundColor"
      ? "mark, .rle-fmt, [style]"
      : ".rle-fmt, [style], font[color]";
  const isTargetStyle = (element: HTMLElement) =>
    property === "backgroundColor"
      ? element.tagName === "MARK" ||
        /background(-color)?\s*:/i.test(element.getAttribute("style") || "")
      : element.hasAttribute("color") ||
        /(?:^|;)\s*color\s*:/i.test(element.getAttribute("style") || "");
  const isInlineFormat = (element: HTMLElement) =>
    element.matches(".rle-fmt, mark, span, font") ||
    getComputedStyle(element).display === "inline";
  const closestInlineTarget = (boundary: HTMLElement) => {
    let current = boundary.parentElement;
    while (current && current !== surface) {
      if (isTargetStyle(current) && isInlineFormat(current)) return current;
      current = current.parentElement;
    }
    return null;
  };
  const splitOutOfStyle = (boundary: HTMLElement) => {
    let wrapper = closestInlineTarget(boundary);
    while (wrapper && surface.contains(wrapper)) {
      const beforeRange = document.createRange();
      beforeRange.selectNodeContents(wrapper);
      beforeRange.setEndBefore(boundary);
      const afterRange = document.createRange();
      afterRange.selectNodeContents(wrapper);
      afterRange.setStartAfter(boundary);
      const before = wrapper.cloneNode(false) as HTMLElement;
      const after = wrapper.cloneNode(false) as HTMLElement;
      before.append(beforeRange.cloneContents());
      after.append(afterRange.cloneContents());
      const replacement: Node[] = [];
      if (before.childNodes.length) replacement.push(before);
      replacement.push(boundary);
      if (after.childNodes.length) replacement.push(after);
      wrapper.replaceWith(...replacement);
      wrapper = closestInlineTarget(boundary);
    }
  };
  splitOutOfStyle(start);
  // Splitting the start ancestor clones its remaining contents, including the
  // end marker. Continue with that live clone rather than the detached node.
  end =
    surface.querySelector<HTMLElement>("[data-rle-format-boundary='end']") ??
    end;
  splitOutOfStyle(end);

  const selectedRange = document.createRange();
  selectedRange.setStartAfter(start);
  selectedRange.setEndBefore(end);
  surface.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    if (!selectedRange.intersectsNode(element) || !isTargetStyle(element))
      return;
    if (!isInlineFormat(element)) {
      const contents = document.createRange();
      contents.selectNodeContents(element);
      const fullySelected =
        selectedRange.compareBoundaryPoints(Range.START_TO_START, contents) <= 0 &&
        selectedRange.compareBoundaryPoints(Range.END_TO_END, contents) >= 0;
      if (!fullySelected) return;
    }
    if (property === "backgroundColor" && element.tagName === "MARK")
      unwrap(element);
    else {
      element.style.removeProperty(
        property === "backgroundColor" ? "background-color" : "color",
      );
      if (property === "color") element.removeAttribute("color");
      if (
        !element.getAttribute("style") &&
        (element.classList.contains("rle-fmt") || element.tagName === "FONT")
      )
        unwrap(element);
    }
  });
  const next = document.createRange();
  next.setStartAfter(start);
  next.setEndBefore(end);
  start.remove();
  end.remove();
  selection.removeAllRanges();
  selection.addRange(next);
}

function applyRangeStyle(property: "color" | "backgroundColor", value: string) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  if (selection.isCollapsed) {
    document.execCommand(
      property === "backgroundColor" ? "hiliteColor" : "foreColor",
      false,
      value || (property === "backgroundColor" ? "transparent" : "inherit"),
    );
    return;
  }
  const range = selection.getRangeAt(0);
  if (!value) {
    clearStyleInRange(range, selection, property);
    return;
  }
  // Always wrap exactly the selected fragment. Mutating a containing
  // `.rle-fmt` span would recolor text outside a partial selection.
  // A nested span is intentional here: its nearer color wins immediately,
  // and TreeDoc reconciliation flattens it into adjacent colored runs.
  const span = document.createElement("span");
  span.className = "rle-fmt";
  span.style[property] = value;
  span.append(range.extractContents());
  range.insertNode(span);
  selection.selectAllChildren(span);
}

export function applyStyleCommand(
  property: "color" | "backgroundColor",
  value: string,
  tableSelection: ActiveTableSelection | null,
) {
  if (!tableSelection) {
    applyRangeStyle(property, value);
    return;
  }
  selectedDomCells(tableSelection).forEach((cell) => {
    if (!value) {
      const selector =
        property === "backgroundColor" ? "mark, .rle-fmt" : ".rle-fmt";
      cell.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        if (element.tagName === "MARK") unwrap(element);
        else {
          element.style.removeProperty(
            property === "backgroundColor" ? "background-color" : "color",
          );
          if (!element.getAttribute("style")) unwrap(element);
        }
      });
      return;
    }
    let span = cell.querySelector(
      ":scope > span.rle-fmt",
    ) as HTMLSpanElement | null;
    if (!span) {
      span = document.createElement("span");
      span.className = "rle-fmt";
      span.append(...Array.from(cell.childNodes));
      cell.append(span);
    }
    span.style[property] = value;
  });
}

export function applyAlignment(
  alignment: string,
  tableSelection: ActiveTableSelection | null,
) {
  if (tableSelection) {
    selectedDomCells(tableSelection).forEach((cell) => {
      cell.style.textAlign = alignment;
    });
    return;
  }
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const anchor =
    selection.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? (selection.anchorNode as Element)
      : selection.anchorNode?.parentElement;
  const activeCell = anchor?.closest<HTMLTableCellElement>("td, th");
  if (
    activeCell &&
    activeCell.contains(range.startContainer) &&
    activeCell.contains(range.endContainer)
  ) {
    activeCell.style.textAlign = alignment;
    return;
  }
  const surface = (
    selection.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? (selection.anchorNode as Element)
      : selection.anchorNode?.parentElement
  )?.closest("[contenteditable='true']");
  if (!surface) return;
  const blocks = Array.from(
    surface.querySelectorAll<HTMLElement>("p.rle-p, li"),
  ).filter((block) => range.intersectsNode(block));
  if (!blocks.length) {
    const block = anchor?.closest<HTMLElement>("p.rle-p, li");
    if (block) blocks.push(block);
  }
  blocks.forEach((block) => {
    block.style.textAlign = alignment;
  });
}
