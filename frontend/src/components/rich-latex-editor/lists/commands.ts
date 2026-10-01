function currentListItem() {
  const node = window.getSelection()?.anchorNode;
  const element =
    node?.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node?.parentElement;
  return element?.closest("li") as HTMLLIElement | null;
}

function extractItemAsParagraph(item: HTMLLIElement) {
  const list = item.parentElement as HTMLOListElement | HTMLUListElement;
  const trailing = list.cloneNode(false) as HTMLOListElement | HTMLUListElement;
  let sibling = item.nextElementSibling;
  while (sibling) {
    const next = sibling.nextElementSibling;
    trailing.append(sibling);
    sibling = next;
  }
  const paragraph = document.createElement("p");
  paragraph.className = "rle-p";
  paragraph.append(...Array.from(item.childNodes));
  item.remove();

  if (list.children.length) list.after(paragraph);
  else list.replaceWith(paragraph);
  if (trailing.children.length) paragraph.after(trailing);
  return paragraph;
}

export function toggleList(ordered: boolean) {
  const item = currentListItem();
  if (!item) {
    document.execCommand(ordered ? "insertOrderedList" : "insertUnorderedList");
    return;
  }
  const list = item.parentElement as HTMLOListElement | HTMLUListElement;
  const expected = ordered ? "OL" : "UL";
  if (list.tagName !== expected) {
    const replacement = document.createElement(ordered ? "ol" : "ul");
    replacement.className = "rle-list";
    replacement.append(...Array.from(list.childNodes));
    list.replaceWith(replacement);
    return;
  }
  extractItemAsParagraph(item);
}

export function demoteListItem(item: HTMLLIElement) {
  const previous = item.previousElementSibling as HTMLLIElement | null;
  if (!previous) return false;
  const parentList = item.parentElement as HTMLOListElement | HTMLUListElement;
  let nested = previous.lastElementChild as
    | HTMLOListElement
    | HTMLUListElement
    | null;
  if (!nested || !/^(OL|UL)$/.test(nested.tagName)) {
    nested = document.createElement(parentList.tagName.toLowerCase()) as
      | HTMLOListElement
      | HTMLUListElement;
    nested.className = "rle-list";
    previous.append(nested);
  }
  nested.append(item);
  return true;
}

export function promoteListItem(item: HTMLLIElement) {
  const list = item.parentElement as HTMLOListElement | HTMLUListElement;
  const parentItem = list.parentElement?.closest("li") as HTMLLIElement | null;
  if (parentItem) {
    parentItem.parentElement?.insertBefore(item, parentItem.nextSibling);
    if (!list.children.length) list.remove();
    return true;
  }
  extractItemAsParagraph(item);
  return true;
}

export function handleListTab(event: KeyboardEvent) {
  if (event.key !== "Tab") return false;
  const item = currentListItem();
  if (!item) return false;
  event.preventDefault();
  return event.shiftKey ? promoteListItem(item) : demoteListItem(item);
}
