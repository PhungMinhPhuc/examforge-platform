"use client";

import Combobox from "@/components/Combobox";
import { Icon } from "@/components/icons";

export type QuestionFilterOption = string | {
  value: string | number;
  label: string;
  disabled?: boolean;
};

export type QuestionFilterSelect = {
  key: string;
  value: string;
  options: QuestionFilterOption[];
  placeholder?: string;
};

type QuestionFiltersProps = {
  search: string;
  selects: QuestionFilterSelect[];
  onChange: (key: string, value: string) => void;
  onReset: () => void;
  searchPlaceholder?: string;
  variant?: "surface" | "embedded";
  className?: string;
};

export default function QuestionFilters({
  search,
  selects,
  onChange,
  onReset,
  searchPlaceholder = "Tìm nội dung...",
  variant = "surface",
  className = "",
}: QuestionFiltersProps) {
  return (
    <div className={`ui-question-filters ui-question-filters--${variant} ${className}`.trim()}>
      <span className="ui-input ui-input--medium ui-searchbox ui-question-filters__search">
        <span className="ui-input__before ui-searchbox__icon">
          <Icon name="search" size="var(--control-icon-size)" />
        </span>
        <input
          className="ui-input__control ui-searchbox__input"
          type="search"
          aria-label="Tìm kiếm câu hỏi"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(event) => onChange("search", event.target.value)}
        />
        <button
          className="ui-input__after ui-searchbox__dismiss"
          type="button"
          aria-label="Xóa tìm kiếm"
          hidden={!search}
          onClick={() => onChange("search", "")}
        >
          <Icon name="x" size="var(--control-icon-size)" />
        </button>
      </span>
      {selects.map((select) => (
        <Combobox
          key={select.key}
          value={select.value}
          options={select.options}
          placeholder={select.placeholder}
          onChange={(value) => onChange(select.key, String(value))}
        />
      ))}
      <button className="ui-button ui-button--secondary" type="button" onClick={onReset}>
        Xóa lọc
      </button>
    </div>
  );
}
