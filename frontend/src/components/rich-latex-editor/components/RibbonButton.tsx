import { Icon } from "@/components/icons";
import type { EditorCommand, CommandDispatcher } from "../commands/types";

type Props = { command: EditorCommand; dispatch: CommandDispatcher };

export function RibbonButton({ command, dispatch }: Props) {
  return (
    <button
      className="ui-ribbon__tool-button ui-ribbon__tool-button--icon"
      type="button"
      title={command.label}
      aria-label={command.label}
      aria-pressed={command.pressed}
      disabled={command.disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => dispatch(command.id)}
    >
      <Icon name={command.icon} />
    </button>
  );
}
