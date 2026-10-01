export { default, default as RichLatexEditor } from "./RichLatexEditor";
export { mergeTableSelection, splitSelectedCell } from "./table/commands";
export { buildTableGrid, buildTableModelGrid } from "./table/grid";

export type {
  EditorImage,
  RichLatexEditorProps,
} from "./types";
export type { EditorCommandId, CommandDispatcher } from "./commands/types";
export type { TableCellModel, TableModel, TableRect, TableSelection } from "./table/types";
