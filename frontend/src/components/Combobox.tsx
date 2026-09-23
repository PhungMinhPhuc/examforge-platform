"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";

type ComboboxValue = string | number;
type ComboboxSize = "small" | "medium" | "large";
type ComboboxAppearance = "outline" | "underline" | "filled" | "filled-lighter" | "filled-darker";
type Option = string | {
  value: ComboboxValue;
  label: string;
  group?: string;
  secondary?: string;
  disabled?: boolean;
};

interface Props {
  value: ComboboxValue | ComboboxValue[];
  // Keep the legacy callback contract so existing consumers retain their narrow state types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (value: any) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  loading?: boolean;
  clearable?: boolean;
  filterable?: boolean;
  multiple?: boolean;
  size?: ComboboxSize;
  appearance?: ComboboxAppearance;
  emptyMessage?: string;
}

const optionValue = (option: Option): ComboboxValue =>
  typeof option === "object" ? option.value : option;
const optionLabel = (option: Option): string =>
  typeof option === "object" ? option.label : String(option);
const optionDisabled = (option: Option): boolean =>
  typeof option === "object" && Boolean(option.disabled);

export default function Combobox({
  value,
  onChange,
  options,
  placeholder,
  className,
  style,
  id,
  disabled = false,
  invalid = false,
  loading = false,
  clearable = false,
  filterable = true,
  multiple = false,
  size = "medium",
  appearance = "outline",
  emptyMessage = "Không có gợi ý",
}: Props) {
  const generatedId = useId();
  const inputId = id ?? `combobox-${generatedId}`;
  const listboxId = `${inputId}-listbox`;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedValues = Array.isArray(value) ? value : [value];
  const isSelected = (candidate: ComboboxValue) =>
    selectedValues.some((item) => String(item) === String(candidate));

  const displayValue = () => {
    if (multiple) {
      return options
        .filter((option) => isSelected(optionValue(option)))
        .map(optionLabel)
        .join(", ");
    }
    const selected = options.find((option) => isSelected(optionValue(option)));
    return selected ? optionLabel(selected) : value == null ? "" : String(value);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter((option) =>
    !filterable || optionLabel(option).toLowerCase().includes(search.toLowerCase()),
  );

  const selectOption = (option: Option) => {
    if (typeof option === "object" && option.disabled) return;
    const nextValue = optionValue(option);
    if (multiple) {
      const current = Array.isArray(value) ? value : [];
      onChange(isSelected(nextValue)
        ? current.filter((item) => String(item) !== String(nextValue))
        : [...current, nextValue]);
      setSearch("");
      return;
    }
    onChange(nextValue);
    setSearch(optionLabel(option));
    setOpen(false);
  };

  const moveActive = (direction: 1 | -1) => {
    if (!filtered.length) return;
    let next = activeIndex;
    do {
      next = (next + direction + filtered.length) % filtered.length;
    } while (optionDisabled(filtered[next]) && next !== activeIndex);
    setActiveIndex(next);
  };

  const hasValue = multiple
    ? Array.isArray(value) && value.length > 0
    : value !== "" && value !== null && value !== undefined;
  let previousGroup: string | undefined;

  return (
    <div
      ref={wrapperRef}
      className={[
        "ui-combobox",
        `ui-combobox--${size}`,
        appearance !== "outline" ? `ui-combobox--${appearance}` : "",
        open ? "ui-combobox--open" : "",
        invalid ? "ui-combobox--invalid" : "",
        disabled ? "ui-combobox--disabled" : "",
        clearable ? "ui-combobox--clearable" : "",
        className || "",
      ].filter(Boolean).join(" ")}
      style={style}
    >
      <input
        id={inputId}
        className="ui-combobox__input"
        role="combobox"
        aria-autocomplete={filterable ? "list" : "none"}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-activedescendant={activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined}
        disabled={disabled}
        readOnly={!filterable}
        value={open ? search : displayValue()}
        onChange={(event) => {
          setSearch(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          if (filterable) setSearch("");
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            moveActive(event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Enter" && open && activeIndex >= 0) {
            event.preventDefault();
            selectOption(filtered[activeIndex]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
      />
      <span className="ui-combobox__actions">
        {clearable && (
          <button
            type="button"
            className={`ui-combobox__clear ${!hasValue || disabled ? "ui-combobox__clear--hidden" : ""}`}
            aria-label="Xóa lựa chọn"
            aria-hidden={!hasValue || disabled}
            disabled={!hasValue || disabled}
            tabIndex={!hasValue || disabled ? -1 : 0}
            onClick={() => {
              onChange(multiple ? [] : "");
              setSearch("");
            }}
          >
            <Icon name="close" size="var(--control-icon-size)" />
          </button>
        )}
        <button type="button" className="ui-combobox__expand" aria-label={open ? "Đóng danh sách" : "Mở danh sách"} aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}>
          <Icon name="chevron-down" size="var(--control-icon-size)" />
        </button>
      </span>
      {open && (
        <div id={listboxId} className="ui-combobox__listbox" role="listbox" aria-multiselectable={multiple || undefined}>
          {loading ? (
            <div className="ui-combobox__loading">Đang tải…</div>
          ) : filtered.length > 0 ? (
            filtered.map((option, index) => {
              const label = optionLabel(option);
              const candidate = optionValue(option);
              const group = typeof option === "object" ? option.group : undefined;
              const showGroup = Boolean(group && group !== previousGroup);
              previousGroup = group;
              const optionDisabled = typeof option === "object" && option.disabled;
              return (
                <React.Fragment key={`${String(candidate)}-${index}`}>
                  {showGroup && <div className="ui-combobox__group-label">{group}</div>}
                  <div
                    id={`${inputId}-option-${index}`}
                    className={[
                      "ui-combobox__option",
                      isSelected(candidate) ? "ui-combobox__option--selected" : "",
                      activeIndex === index ? "ui-combobox__option--active" : "",
                      optionDisabled ? "ui-combobox__option--disabled" : "",
                    ].filter(Boolean).join(" ")}
                    role="option"
                    aria-selected={isSelected(candidate)}
                    aria-disabled={optionDisabled || undefined}
                    onMouseEnter={() => !optionDisabled && setActiveIndex(index)}
                    onClick={() => selectOption(option)}
                  >
                    <span>{label}</span>
                    {typeof option === "object" && option.secondary && <span className="ui-combobox__option-secondary">{option.secondary}</span>}
                  </div>
                </React.Fragment>
              );
            })
          ) : (
            <div className="ui-combobox__empty">{emptyMessage}</div>
          )}
        </div>
      )}
    </div>
  );
}
