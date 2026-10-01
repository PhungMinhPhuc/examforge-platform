import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Icon } from "@/components/icons";
import RibbonScroller from "@/components/RibbonScroller";
import { COMMANDS_BY_TAB } from "../commands/definitions";
import type { CommandDispatcher, EditorCommand } from "../commands/types";
import type { EditorContext, RibbonTab, ToolbarState } from "../types";
import { RibbonButton } from "./RibbonButton";
import AnchoredOverlay from "@/components/AnchoredOverlay";

type Props = {
  activeTab: RibbonTab;
  context: EditorContext;
  expanded: boolean;
  onSelectTab: (tab: RibbonTab) => void;
  onToggle: () => void;
  dispatch: CommandDispatcher;
  formattingState: ToolbarState;
  disabledCommands?: ReadonlySet<EditorCommand["id"]>;
  hiddenCommands?: ReadonlySet<EditorCommand["id"]>;
  pressedCommands?: ReadonlySet<EditorCommand["id"]>;
};

const LABELS: Record<RibbonTab, string> = {
  edit: "Edit",
  table: "Table",
  picture: "Picture",
};

const TEXT_COLORS = [
  { label: "Đỏ", value: "#e53935" },
  { label: "Cam", value: "#f57c00" },
  { label: "Vàng", value: "#fbc02d" },
  { label: "Lục", value: "#388e3c" },
  { label: "Blue chuẩn", value: "#0000ff" },
  { label: "Xanh dương", value: "#1565c0" },
  { label: "Đen", value: "#000000" },
  { label: "Tím", value: "#8e24aa" },
] as const;

export function EditorRibbon(props: Props) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const colorRangeRef = useRef<Range | null>(null);
  const colorSplitRef = useRef<HTMLDivElement>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [currentTextColor, setCurrentTextColor] = useState("#000000");
  const visibleTabs = Array.from(
    new Set<RibbonTab>(["edit", ...(props.context ? [props.context] : [])]),
  );
  const pressed = (id: EditorCommand["id"]) => {
    if (props.pressedCommands?.has(id)) return true;
    if (id.startsWith("align-"))
      return props.formattingState.alignment === id.slice(6);
    const keyByCommand = {
      bold: "bold",
      italic: "italic",
      underline: "underline",
      subscript: "subscript",
      superscript: "superscript",
      highlight: "highlight",
      "ordered-list": "ordered",
      "bullet-list": "bullet",
    } as const;
    const key = keyByCommand[id as keyof typeof keyByCommand];
    return key ? !!props.formattingState[key] : undefined;
  };
  const groups = COMMANDS_BY_TAB[props.activeTab].reduce<
    Record<string, EditorCommand[]>
  >((result, command) => {
    if (props.hiddenCommands?.has(command.id)) return result;
    (result[command.group] ??= []).push({
      ...command,
      pressed: pressed(command.id),
      disabled: props.disabledCommands?.has(command.id) ?? command.disabled,
    });
    return result;
  }, {});
  const saveTextColorRange = () => {
    const selection = window.getSelection();
    colorRangeRef.current = selection?.rangeCount
      ? selection.getRangeAt(0).cloneRange()
      : null;
  };
  const dispatchTextColor = (color: string) => {
    const selection = window.getSelection();
    if (colorRangeRef.current) {
      selection?.removeAllRanges();
      selection?.addRange(colorRangeRef.current);
    }
    setCurrentTextColor(color);
    setColorMenuOpen(false);
    props.dispatch("text-color", color);
  };
  const applyTextColor = (event: ChangeEvent<HTMLInputElement>) =>
    dispatchTextColor(event.target.value);

  useEffect(() => {
    if (!colorMenuOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (
        !colorSplitRef.current?.contains(event.target as Node) &&
        !colorMenuRef.current?.contains(event.target as Node)
      ) {
        setColorMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setColorMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [colorMenuOpen]);

  return (
    <nav className="ui-ribbon" aria-label="Thanh chỉnh sửa">
      <div className="ui-ribbon__tab-row">
        <div
          className="ui-ribbon__quick-actions"
          role="toolbar"
          aria-label="Thao tác nhanh"
        >
          {(["undo", "redo"] as const).map((name) => (
            <button
              key={name}
              className="ui-ribbon__tool-button ui-ribbon__tool-button--icon"
              type="button"
              aria-label={name === "undo" ? "Hoàn tác" : "Làm lại"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => props.dispatch(name)}
            >
              <Icon name={name} />
            </button>
          ))}
        </div>
        <div
          className="ui-tablist ui-tablist--ribbon ui-ribbon__tab-list"
          role="tablist"
          aria-label="Nhóm công cụ chỉnh sửa"
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              className={`ui-tab ui-tab--compact ${tab === "edit" ? "" : "ui-ribbon__tab--contextual"}`}
              type="button"
              role="tab"
              aria-selected={props.activeTab === tab}
              onClick={() => props.onSelectTab(tab)}
            >
              {LABELS[tab]}
            </button>
          ))}
        </div>
        <button
          className="ui-ribbon__toggle"
          type="button"
          aria-expanded={props.expanded}
          aria-label={props.expanded ? "Thu thanh công cụ" : "Mở thanh công cụ"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={props.onToggle}
        >
          <Icon name="chevron-down" />
        </button>
      </div>
      {props.expanded && (
        <RibbonScroller role="tabpanel" resetKey={props.activeTab}>
          {Object.entries(groups).map(([group, commands]) => (
            <div
              className="ui-ribbon__tool-group"
              role="group"
              aria-label={group}
              key={group}
            >
              {commands.map((command) =>
                command.id === "text-color" ? (
                  <div
                    className="ui-split-button ui-split-button--compact-menu"
                    ref={colorSplitRef}
                    key={command.id}
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    <button
                      className="ui-button ui-button--secondary ui-button--small ui-button--icon ui-ribbon__tool-button"
                      type="button"
                      title="Áp dụng màu chữ hiện tại"
                      aria-label="Áp dụng màu chữ hiện tại"
                      disabled={command.disabled}
                      style={{ color: currentTextColor || undefined }}
                      onClick={() => {
                        saveTextColorRange();
                        dispatchTextColor(currentTextColor);
                      }}
                    >
                      <Icon name="text-color" />
                    </button>
                    <button
                      className="ui-button ui-button--secondary ui-button--small ui-button--icon ui-ribbon__tool-button"
                      type="button"
                      title="Mở bảng màu chữ"
                      aria-label="Mở bảng màu chữ"
                      aria-haspopup="menu"
                      aria-expanded={colorMenuOpen}
                      disabled={command.disabled}
                      onClick={() => {
                        saveTextColorRange();
                        setColorMenuOpen((open) => !open);
                      }}
                    >
                      <Icon name="chevron-down" />
                    </button>
                    {colorMenuOpen && (
                      <AnchoredOverlay
                        anchorRef={colorSplitRef}
                        overlayRef={colorMenuRef}
                        className="ui-ribbon__color-menu ui-ribbon__color-menu--portal"
                        role="menu"
                        aria-label="Bảng màu chữ"
                      >
                        <button
                          className="ui-ribbon__automatic-color"
                          type="button"
                          role="radio"
                          aria-checked={!props.formattingState.textColor}
                          onClick={() => dispatchTextColor("")}
                        >
                          <span
                            className="ui-ribbon__automatic-color-sample"
                            aria-hidden="true"
                          />
                          Automatic
                        </button>
                        <p className="ui-ribbon__color-menu-title">Màu có sẵn</p>
                        <div
                          className="ui-ribbon__color-swatches"
                          role="radiogroup"
                          aria-label="Tám màu có sẵn"
                        >
                          {TEXT_COLORS.map((color) => (
                            <button
                              className="ui-ribbon__color-swatch"
                              key={color.value}
                              type="button"
                              role="radio"
                              aria-label={color.label}
                              aria-checked={
                                props.formattingState.textColor === color.value
                              }
                              style={{ backgroundColor: color.value }}
                              onClick={() => dispatchTextColor(color.value)}
                            />
                          ))}
                        </div>
                        <button
                          className="ui-ribbon__more-colors"
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            colorInputRef.current?.click();
                          }}
                        >
                          More Colors…
                        </button>
                        <input
                          ref={colorInputRef}
                          className="ui-ribbon__color-input"
                          type="color"
                          value={currentTextColor}
                          aria-label="Chọn màu chữ tùy ý"
                          onChange={applyTextColor}
                        />
                      </AnchoredOverlay>
                    )}
                  </div>
                ) : (
                  <RibbonButton
                    key={command.id}
                    command={command}
                    dispatch={props.dispatch}
                  />
                ),
              )}
            </div>
          ))}
        </RibbonScroller>
      )}
    </nav>
  );
}
