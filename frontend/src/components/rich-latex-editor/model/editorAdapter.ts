import type { TreeDoc } from "@/lib/docTree";
import {
  normalizeEditableBlocks,
  reconcileDoc,
  renderDocForEdit,
} from "./treeDomCodec";
import type { EditorImage } from "../types";

export type EditorAdapter = {
  render(doc: TreeDoc, images: EditorImage[], imageEditable: boolean): string;
  reconcile(
    surface: HTMLElement,
    side: "left" | "right" | "center",
  ): TreeDoc;
  normalize(surface: HTMLElement): void;
};

export const editorAdapter: EditorAdapter = {
  render(doc, images, imageEditable) {
    return renderDocForEdit(doc, images, imageEditable, false);
  },
  reconcile(surface, side) {
    const snapshot = surface.cloneNode(true) as HTMLElement;
    return reconcileDoc(snapshot, side);
  },
  normalize(surface) {
    normalizeEditableBlocks(surface);
  },
};
