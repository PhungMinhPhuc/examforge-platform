type Cleanup = () => void;

/**
 * Makes a native text selection swallow an intersected table as one block.
 * If either range boundary ends inside a table while the other is outside,
 * that boundary is snapped to the corresponding outer edge of the table.
 */
export function observeCrossBlockTableSelection(surface: HTMLElement): Cleanup {
  let suppressSelectionChange = false;

  const clear = () => {
    surface
      .querySelectorAll("table[data-rle-fully-selected]")
      .forEach((table) => {
        table.removeAttribute("data-rle-fully-selected");
      });
  };

  const handleSelectionChange = () => {
    if (suppressSelectionChange) return;
    const selection = window.getSelection();
    const tables = Array.from(
      surface.querySelectorAll<HTMLTableElement>("table.rle-table, table"),
    );

    if (
      !selection ||
      selection.rangeCount === 0 ||
      selection.isCollapsed ||
      !selection.anchorNode ||
      !surface.contains(selection.anchorNode)
    ) {
      clear();
      return;
    }

    let activeRange = selection.getRangeAt(0);
    tables.forEach((table) => {
      const entirelyInsideTable = table.contains(
        activeRange.commonAncestorContainer,
      );
      const crossesTable =
        activeRange.intersectsNode(table) && !entirelyInsideTable;
      table.toggleAttribute("data-rle-fully-selected", crossesTable);
      if (!crossesTable) return;

      const startsInsideTable = table.contains(activeRange.startContainer);
      const endsInsideTable = table.contains(activeRange.endContainer);
      if (!startsInsideTable && !endsInsideTable) return;

      const expanded = activeRange.cloneRange();
      try {
        if (startsInsideTable) expanded.setStartBefore(table);
        if (endsInsideTable) expanded.setEndAfter(table);
        suppressSelectionChange = true;
        selection.removeAllRanges();
        selection.addRange(expanded);
        activeRange = expanded;
        window.setTimeout(() => {
          suppressSelectionChange = false;
        }, 0);
      } catch {
        suppressSelectionChange = false;
      }
    });
  };

  document.addEventListener("selectionchange", handleSelectionChange);
  return () => {
    document.removeEventListener("selectionchange", handleSelectionChange);
    clear();
  };
}

