import type { IconName } from "@/components/icons";
import type { RibbonTab } from "../types";

export type EditorCommandId =
  | "undo"
  | "redo"
  | "copy"
  | "cut"
  | "paste"
  | "bold"
  | "italic"
  | "underline"
  | "subscript"
  | "superscript"
  | "highlight"
  | "text-color"
  | "ordered-list"
  | "bullet-list"
  | "align-left"
  | "align-center"
  | "align-right"
  | "align-justify"
  | "insert-math"
  | "insert-image"
  | "insert-table"
  | "insert-code"
  | "insert-row-above"
  | "insert-row-below"
  | "delete-rows"
  | "insert-col-left"
  | "insert-col-right"
  | "delete-columns"
  | "merge-cells"
  | "split-cells"
  | "image-center"
  | "image-float-right"
  | "image-grow"
  | "image-shrink"
  | "image-crop"
  | "image-rotate-left"
  | "image-rotate-right"
  | "image-replace"
  | "image-delete";

export type EditorCommand = {
  id: EditorCommandId;
  label: string;
  icon: IconName;
  tab: RibbonTab;
  group: string;
  pressed?: boolean;
  disabled?: boolean;
};

export type CommandDispatcher = (id: EditorCommandId, value?: string) => void;
