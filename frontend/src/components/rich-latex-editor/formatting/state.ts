import type { ToolbarState, TextAlignment } from "../types";
import { DEFAULT_TOOLBAR_STATE } from "../types";
import type { ActiveTableSelection } from "../table/selection";
import { selectedDomCells } from "../table/selection";

function safeCommandState(command: string) {
  try {
    return typeof document.queryCommandState === "function"
      ? document.queryCommandState(command)
      : false;
  } catch {
    return false;
  }
}

function selectionElement(surface: HTMLElement) {
  const node = window.getSelection()?.anchorNode;
  if (!node || !surface.contains(node)) return null;
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as HTMLElement)
    : node.parentElement;
}

function hasAncestor(element: Element | null, selector: string, root: Element) {
  const match = element?.closest(selector);
  return !!match && root.contains(match);
}

function selectedTextNodes(surface: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return [];
  const range = selection.getRangeAt(0);
  const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (node.data.length && range.intersectsNode(node)) nodes.push(node);
    node = walker.nextNode() as Text | null;
  }
  return nodes;
}

function nodeHasAncestor(node: Node, selector: string, root: Element) {
  const element = node.parentElement;
  return hasAncestor(element, selector, root);
}

function nodeHasHighlight(node: Node, root: Element) {
  let element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement;
  while (element && element !== root) {
    const style = element.getAttribute("style") || "";
    if (element.dataset.rleHighlightReset === "true") return false;
    if (/background(-color)?\s*:/i.test(style))
      return !/background(-color)?\s*:[^;]*(?:transparent|rgba?\(0,\s*0,\s*0,\s*0\))/i.test(
        style,
      );
    if (element.tagName === "MARK") return true;
    element = element.parentElement;
  }
  return false;
}

function uniformSelectionMatch(
  surface: HTMLElement,
  collapsedElement: Element,
  selector: string,
) {
  const nodes = selectedTextNodes(surface);
  return nodes.length
    ? nodes.every((node) => nodeHasAncestor(node, selector, surface))
    : hasAncestor(collapsedElement, selector, surface);
}

function elementAlignment(element: Element | null): TextAlignment {
  const block = element?.closest("p.rle-p, li, td") as HTMLElement | null;
  const alignment = block
    ? block.style.textAlign || getComputedStyle(block).textAlign
    : "justify";
  return alignment === "center" || alignment === "right" || alignment === "left"
    ? alignment
    : "justify";
}

function activeAlignment(
  surface: HTMLElement,
  element: Element | null,
): TextAlignment | null {
  const nodes = selectedTextNodes(surface);
  if (!nodes.length) return elementAlignment(element);
  const values = nodes.map((node) => elementAlignment(node.parentElement));
  return values.every((value) => value === values[0]) ? values[0] : null;
}

function activeColor(element: Element | null, root: Element) {
  let current = element as HTMLElement | null;
  while (current && current !== root) {
    if (current.style.color) return current.style.color;
    current = current.parentElement;
  }
  return undefined;
}

function tableState(selection: ActiveTableSelection): ToolbarState {
  const cells = selectedDomCells(selection);
  const every = (selector: string) =>
    cells.length > 0 &&
    cells.every((cell) => {
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let node = walker.nextNode() as Text | null;
      while (node) {
        if (node.data.replace(/\u200b/g, "").length) nodes.push(node);
        node = walker.nextNode() as Text | null;
      }
      return nodes.length
        ? nodes.every((text) => nodeHasAncestor(text, selector, cell))
        : !!cell.querySelector(selector);
    });
  const alignments = cells.map((cell) => elementAlignment(cell));
  const alignment = alignments.every((value) => value === alignments[0])
    ? alignments[0]
    : null;
  return {
    ...DEFAULT_TOOLBAR_STATE,
    bold: every("b, strong"),
    italic: every("i, em"),
    underline: every("u"),
    subscript: every("sub"),
    superscript: every("sup"),
    highlight:
      cells.length > 0 &&
      cells.every((cell) => {
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        const nodes: Text[] = [];
        let node = walker.nextNode() as Text | null;
        while (node) {
          if (node.data.replace(/\u200b/g, "").length) nodes.push(node);
          node = walker.nextNode() as Text | null;
        }
        return (
          nodes.length > 0 &&
          nodes.every((text) => nodeHasHighlight(text, cell))
        );
      }),
    alignment,
  };
}

export function readToolbarState(
  surface: HTMLElement,
  tableSelection: ActiveTableSelection | null,
): ToolbarState {
  if (tableSelection) return tableState(tableSelection);
  const element = selectionElement(surface);
  if (!element) return DEFAULT_TOOLBAR_STATE;
  const selectedNodes = selectedTextNodes(surface);
  const hasRange = selectedNodes.length > 0;
  const highlight = nodeHasHighlight(element, surface);
  const match = (selector: string) =>
    uniformSelectionMatch(surface, element, selector);
  const commandOrMatch = (command: string, selector: string) =>
    hasRange ? match(selector) : safeCommandState(command) || match(selector);
  return {
    bold: commandOrMatch("bold", "b, strong"),
    italic: commandOrMatch("italic", "i, em"),
    underline: commandOrMatch("underline", "u"),
    subscript: commandOrMatch("subscript", "sub"),
    superscript: commandOrMatch("superscript", "sup"),
    highlight: hasRange
      ? selectedNodes.every((node) => nodeHasHighlight(node, surface))
      : highlight,
    textColor: activeColor(element, surface),
    ordered: commandOrMatch("insertOrderedList", "ol"),
    bullet: commandOrMatch("insertUnorderedList", "ul"),
    alignment: activeAlignment(surface, element),
  };
}
