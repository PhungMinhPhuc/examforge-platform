import type { ActiveTableSelection } from "../table/selection";

export type SelectionSnapshot =
  | {
      kind: "table";
      tableIndex: number;
      rect: ActiveTableSelection["rect"];
      anchorId: string;
    }
  | { kind: "image"; imageIndex: number }
  | null;

type Entry = { html: string; selection: SelectionSnapshot; label: string };

export function createEditorHistory(
  surface: HTMLElement,
  capture: () => SelectionSnapshot,
  restore: (value: SelectionSnapshot) => void,
) {
  const undoStack: Entry[] = [];
  const redoStack: Entry[] = [];
  const current = (label: string): Entry => ({
    html: surface.innerHTML,
    selection: capture(),
    label,
  });
  const apply = (entry: Entry) => {
    surface.innerHTML = entry.html;
    restore(entry.selection);
  };
  return {
    snapshot(label: string) {
      undoStack.push(current(label));
      redoStack.length = 0;
    },
    undo() {
      const entry = undoStack.pop();
      if (!entry) return false;
      redoStack.push(current(entry.label));
      apply(entry);
      return true;
    },
    redo() {
      const entry = redoStack.pop();
      if (!entry) return false;
      undoStack.push(current(entry.label));
      apply(entry);
      return true;
    },
    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}

