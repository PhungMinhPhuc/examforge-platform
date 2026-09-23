"use client";

import Combobox from "@/components/Combobox";

type TimePickerSize = "small" | "medium" | "large";
type TimePickerAppearance = "outline" | "underline" | "filled" | "filled-lighter" | "filled-darker";

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  increment?: number;
  startHour?: number;
  endHour?: number;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  size?: TimePickerSize;
  appearance?: TimePickerAppearance;
}

const formatTime = (minutes: number) => {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export default function TimePicker({
  value,
  onChange,
  increment = 30,
  startHour = 0,
  endHour = 23,
  placeholder = "Chọn giờ",
  clearable = false,
  disabled = false,
  invalid = false,
  size = "medium",
  appearance = "outline",
}: TimePickerProps) {
  const step = Math.max(1, increment);
  const options = [];

  for (let minutes = startHour * 60; minutes <= endHour * 60 + 59; minutes += step) {
    const time = formatTime(minutes);
    options.push({ value: time, label: time });
  }

  return (
    <Combobox
      className="ui-time-picker"
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      clearable={clearable}
      disabled={disabled}
      invalid={invalid}
      size={size}
      appearance={appearance}
    />
  );
}
