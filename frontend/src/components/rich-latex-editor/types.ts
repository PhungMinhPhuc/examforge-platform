import type { TreeDoc } from "@/lib/docTree";

export type EditorImage = {
  id?: number | string;
  storage_path: string;
  url?: string;
  width?: number | null;
  img_type?: string;
  asset_exists?: boolean;
  pendingFile?: File | Blob;
};

export type RichLatexEditorProps = {
  content: TreeDoc | null | undefined;
  onChange: (value: TreeDoc, newImage?: EditorImage) => void;
  placeholder?: string;
  imageEditable?: boolean;
  images?: EditorImage[];
  minHeight?: string;
  maxHeight?: string;
  onImageWidthChange?: (storagePath: string, width: number) => void;
  questionId?: number;
  importJobId?: string;
  allowPendingImage?: boolean;
  showLayoutControl?: boolean;
  layoutType?: string;
};

export type RibbonTab = "edit" | "table" | "picture";
export type EditorContext = Exclude<RibbonTab, "edit"> | null;
export type TextAlignment = "left" | "center" | "right" | "justify";

export type ToolbarState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  subscript: boolean;
  superscript: boolean;
  highlight: boolean;
  textColor?: string;
  ordered: boolean;
  bullet: boolean;
  alignment: TextAlignment | null;
};

export const DEFAULT_TOOLBAR_STATE: ToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  subscript: false,
  superscript: false,
  highlight: false,
  ordered: false,
  bullet: false,
  alignment: "justify",
};
