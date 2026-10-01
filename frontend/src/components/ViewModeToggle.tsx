"use client";

import { Icon } from "@/components/icons";

export type ViewMode = "grid" | "list";

type Props = {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  ariaLabel?: string;
};

export default function ViewModeToggle({
  value,
  onChange,
  ariaLabel = "Chế độ hiển thị",
}: Props) {
  return (
    <div className="ui-button-group ui-view-mode-toggle" role="group" aria-label={ariaLabel}>
      <button
        className="ui-button ui-button--secondary ui-button--icon"
        type="button"
        aria-label="Hiển thị dạng lưới"
        aria-pressed={value === "grid"}
        title="Dạng lưới"
        onClick={() => onChange("grid")}
      >
        <Icon name="grid" size="var(--control-icon-size)" />
      </button>
      <button
        className="ui-button ui-button--secondary ui-button--icon"
        type="button"
        aria-label="Hiển thị dạng danh sách"
        aria-pressed={value === "list"}
        title="Dạng danh sách"
        onClick={() => onChange("list")}
      >
        <Icon name="list-bullet" size="var(--control-icon-size)" />
      </button>
    </div>
  );
}
