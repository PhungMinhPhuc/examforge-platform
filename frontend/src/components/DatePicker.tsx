"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";

type DateRangeType = "day" | "workweek" | "week" | "month";
type DatePickerAppearance = "outline" | "underline" | "filled" | "filled-lighter" | "filled-darker";
type DatePickerSize = "small" | "medium" | "large";
type DatePickerFormat = "short" | "dmy" | "long";

interface DatePickerProps {
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (value: Date | null) => void;
  placeholder?: string;
  allowTextInput?: boolean;
  required?: boolean;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  firstDayOfWeek?: 0 | 1;
  showWeekNumbers?: boolean;
  rangeType?: DateRangeType;
  overlayMonthPicker?: boolean;
  appearance?: DatePickerAppearance;
  size?: DatePickerSize;
  format?: DatePickerFormat;
  onValidationResult?: (error: string | null) => void;
  className?: string;
}

const monthNames = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];
const weekDaysSunday = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const weekDaysMonday = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const sameDay = (left?: Date | null, right?: Date | null) => Boolean(left && right && startOfDay(left).getTime() === startOfDay(right).getTime());
const inBounds = (date: Date, minDate?: Date, maxDate?: Date) =>
  (!minDate || startOfDay(date) >= startOfDay(minDate)) && (!maxDate || startOfDay(date) <= startOfDay(maxDate));
const formatDate = (date?: Date | null, format: DatePickerFormat = "short") => {
  if (!date) return "";
  if (format === "long") return date.toLocaleDateString("vi-VN", { day: "numeric", month: "long", year: "numeric" });
  if (format === "dmy") return `${date.getDate()}/${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}`;
  return date.toLocaleDateString("vi-VN");
};
const parseDate = (text: string) => {
  const match = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(year, Number(match[2]) - 1, Number(match[1]));
  return date.getFullYear() === year && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[1]) ? date : null;
};

function isoWeek(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function rangeBounds(date: Date, type: DateRangeType, firstDay: 0 | 1) {
  if (type === "day") return [startOfDay(date), startOfDay(date)] as const;
  if (type === "month") return [new Date(date.getFullYear(), date.getMonth(), 1), new Date(date.getFullYear(), date.getMonth() + 1, 0)] as const;
  const start = startOfDay(date);
  const offset = (start.getDay() - firstDay + 7) % 7;
  start.setDate(start.getDate() - offset);
  const end = new Date(start);
  end.setDate(end.getDate() + (type === "workweek" ? 4 : 6));
  return [start, end] as const;
}

export default function DatePicker({
  value,
  defaultValue = null,
  onChange,
  placeholder = "Chọn ngày...",
  allowTextInput = false,
  required = false,
  disabled = false,
  minDate,
  maxDate,
  firstDayOfWeek = 0,
  showWeekNumbers = false,
  rangeType = "day",
  overlayMonthPicker = false,
  appearance = "outline",
  size = "medium",
  format = "short",
  onValidationResult,
  className,
}: DatePickerProps) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<Date | null>(defaultValue);
  const selectedDate = controlled ? value : internalValue;
  const initialView = selectedDate ?? new Date();
  const [viewDate, setViewDate] = useState(() => new Date(initialView.getFullYear(), initialView.getMonth(), 1));
  const [monthPanelDate, setMonthPanelDate] = useState(() => new Date(initialView.getFullYear(), initialView.getMonth(), 1));
  const [pickerMode, setPickerMode] = useState<"month" | "year">("month");
  const [yearRangeStart, setYearRangeStart] = useState(initialView.getFullYear());
  const [open, setOpen] = useState(false);
  const [showOverlayMonths, setShowOverlayMonths] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const inputId = `date-picker-${generatedId}`;

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const commit = (date: Date | null) => {
    if (!controlled) setInternalValue(date);
    onChange?.(date);
    setText(null);
    setError("");
    onValidationResult?.(null);
  };

  const reportError = (message: string) => {
    setError(message);
    onValidationResult?.(message);
  };

  const validateText = () => {
    const currentText = text ?? formatDate(selectedDate, format);
    if (!currentText.trim()) {
      if (required) reportError("Trường bắt buộc");
      else commit(null);
      return;
    }
    const parsed = parseDate(currentText);
    if (!parsed) return reportError("Định dạng ngày không hợp lệ");
    if (!inBounds(parsed, minDate, maxDate)) return reportError("Ngày nằm ngoài phạm vi cho phép");
    commit(parsed);
    setViewDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
  };

  const days = useMemo(() => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const offset = (first.getDay() - firstDayOfWeek + 7) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [viewDate, firstDayOfWeek]);

  const [rangeStart, rangeEnd] = selectedDate ? rangeBounds(selectedDate, rangeType, firstDayOfWeek) : [null, null];
  const weekDays = firstDayOfWeek === 1 ? weekDaysMonday : weekDaysSunday;

  const selectDate = (date: Date) => {
    if (!inBounds(date, minDate, maxDate)) return;
    commit(date);
    setViewDate(new Date(date.getFullYear(), date.getMonth(), 1));
    setOpen(false);
  };

  const moveMonth = (amount: number) => setViewDate((current) => {
    const next = new Date(current.getFullYear(), current.getMonth() + amount, 1);
    setMonthPanelDate(new Date(next.getFullYear(), next.getMonth(), 1));
    return next;
  });
  const moveYear = (amount: number) => {
    if (pickerMode === "year") setYearRangeStart((current) => current + amount * 12);
    else setMonthPanelDate((current) => new Date(current.getFullYear() + amount, current.getMonth(), 1));
  };

  const goToday = () => {
    const today = new Date();
    if (overlayMonthPicker && showOverlayMonths) {
      if (pickerMode === "year") setYearRangeStart(today.getFullYear());
      else setMonthPanelDate(new Date(today.getFullYear(), today.getMonth(), 1));
      return;
    }
    commit(today);
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setMonthPanelDate(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const dayPanel = (
    <div className="ui-calendar__day-panel">
      <div className="ui-calendar__header">
        <button className="ui-calendar__title" type="button" onClick={() => overlayMonthPicker && setShowOverlayMonths(true)}>{monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}</button>
        <div className="ui-calendar__nav-group">
          <button className="ui-calendar__nav" type="button" aria-label="Tháng trước" onClick={() => moveMonth(-1)}><Icon name="chevron-up" size="var(--control-icon-size)" /></button>
          <button className="ui-calendar__nav" type="button" aria-label="Tháng sau" onClick={() => moveMonth(1)}><Icon name="chevron-down" size="var(--control-icon-size)" /></button>
        </div>
      </div>
      <table className="ui-calendar__grid">
        <thead><tr>{showWeekNumbers && <th className="ui-calendar__week-number" />}{weekDays.map((day) => <th className="ui-calendar__weekday" key={day}>{day}</th>)}</tr></thead>
        <tbody>{Array.from({ length: 6 }, (_, row) => {
          const rowDays = days.slice(row * 7, row * 7 + 7);
          return <tr key={row}>{showWeekNumbers && <td className="ui-calendar__week-number">{isoWeek(rowDays[0])}</td>}{rowDays.map((date) => {
            const disabledDate = !inBounds(date, minDate, maxDate);
            const selected = sameDay(date, selectedDate);
            const inRange = Boolean(date.getMonth() === viewDate.getMonth() && !selected && rangeStart && rangeEnd && startOfDay(date) >= rangeStart && startOfDay(date) <= rangeEnd);
            const today = sameDay(date, new Date());
            const classes = ["ui-calendar__cell", date.getMonth() !== viewDate.getMonth() ? "ui-calendar__cell--outside" : "", selected ? "ui-calendar__cell--selected" : "", inRange && rangeType !== "day" ? "ui-calendar__cell--range" : "", disabledDate ? "ui-calendar__cell--disabled" : ""].filter(Boolean).join(" ");
            return <td className={classes} key={date.toISOString()}><button className="ui-calendar__day" type="button" disabled={disabledDate} onClick={() => selectDate(date)}>{today ? <span className="ui-calendar__today-marker">{date.getDate()}</span> : date.getDate()}</button></td>;
          })}</tr>;
        })}</tbody>
      </table>
    </div>
  );

  const monthPanel = (
      <div className="ui-calendar__month-panel">
        <div className="ui-calendar__month-header">
          <button className="ui-calendar__year-label" type="button" onClick={() => {
            if (pickerMode === "month") {
              setYearRangeStart(monthPanelDate.getFullYear());
              setPickerMode("year");
            } else setPickerMode("month");
          }}>{pickerMode === "year" ? `${yearRangeStart}–${yearRangeStart + 11}` : monthPanelDate.getFullYear()}</button>
          <div className="ui-calendar__nav-group">
            <button className="ui-calendar__nav" type="button" aria-label={pickerMode === "year" ? "Thập niên trước" : "Năm trước"} onClick={() => moveYear(-1)}><Icon name="chevron-up" size="var(--control-icon-size)" /></button>
            <button className="ui-calendar__nav" type="button" aria-label={pickerMode === "year" ? "Thập niên sau" : "Năm sau"} onClick={() => moveYear(1)}><Icon name="chevron-down" size="var(--control-icon-size)" /></button>
          </div>
        </div>
        <div className="ui-calendar__month-grid">{pickerMode === "year"
          ? Array.from({ length: 12 }, (_, index) => yearRangeStart + index).map((year) => <button className={`ui-calendar__month-cell ${year === new Date().getFullYear() ? "ui-calendar__month-cell--selected" : ""}`} type="button" key={year} onClick={() => { setMonthPanelDate((current) => new Date(year, current.getMonth(), 1)); setViewDate((current) => new Date(year, current.getMonth(), 1)); setPickerMode("month"); }}>{year}</button>)
          : monthNames.map((month, index) => <button className={`ui-calendar__month-cell ${index === new Date().getMonth() && monthPanelDate.getFullYear() === new Date().getFullYear() ? "ui-calendar__month-cell--selected" : ""}`} type="button" key={month} onClick={() => { setViewDate(new Date(monthPanelDate.getFullYear(), index, 1)); setMonthPanelDate(new Date(monthPanelDate.getFullYear(), index, 1)); setShowOverlayMonths(false); }}>{month.replace("Tháng ", "T")}</button>)}</div>
      </div>
  );

  return (
    <div ref={rootRef} className={["ui-date-picker", `ui-date-picker--${size}`, open ? "ui-date-picker--open" : "", disabled ? "ui-date-picker--disabled" : "", className ?? ""].filter(Boolean).join(" ")}>
      <span className={["ui-input", `ui-input--${size}`, appearance !== "outline" ? `ui-input--${appearance}` : "", error ? "ui-input--invalid" : "", disabled ? "ui-input--disabled" : "", "ui-picker__control"].filter(Boolean).join(" ")}>
        <input id={inputId} className="ui-input__control" value={text ?? formatDate(selectedDate, format)} placeholder={placeholder} readOnly={!allowTextInput} disabled={disabled} aria-invalid={Boolean(error) || undefined} onChange={(event) => setText(event.target.value)} onBlur={() => allowTextInput && validateText()} onClick={() => !disabled && setOpen((current) => !current)} />
        <button className="ui-picker__trigger" type="button" aria-label={open ? "Đóng lịch" : "Mở lịch"} disabled={disabled} onClick={() => setOpen((current) => !current)}><Icon name="calendar" size="var(--control-icon-size)" /></button>
      </span>
      <div className="ui-picker__popup" role="dialog" aria-label="Calendar">
        {overlayMonthPicker ? (
          <div className={`ui-calendar ui-calendar--overlay ${showWeekNumbers ? "ui-calendar--week-numbers" : ""}`}>
            <div className="ui-calendar__body">{showOverlayMonths ? monthPanel : dayPanel}</div>
            <button className="ui-calendar__today-button" type="button" onClick={goToday}>{showOverlayMonths ? (pickerMode === "year" ? "Năm nay" : "Tháng này") : "Hôm nay"}</button>
          </div>
        ) : (
          <div className={`ui-calendar ${showWeekNumbers ? "ui-calendar--week-numbers" : ""}`}>
            {dayPanel}
            <div className="ui-calendar__divider" />
            <div className="ui-calendar__month-wrapper">
              {monthPanel}
              <button className="ui-calendar__today-button" type="button" onClick={goToday}>Hôm nay</button>
            </div>
          </div>
        )}
      </div>
      {error && <div className="ui-field__validation ui-field__validation--error" role="alert"><Icon className="ui-field__validation-icon" name="x-circle" />{error}</div>}
    </div>
  );
}
