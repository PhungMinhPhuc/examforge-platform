"use client";

import { useEffect, useState } from "react";
import DatePicker from "@/components/DatePicker";

type DateTimePickerSize = "small" | "medium" | "large";

interface DateTimePickerProps {
  value?: string;
  defaultDate?: Date | null;
  defaultTime?: string;
  size?: DateTimePickerSize;
  minuteStep?: number;
  disabled?: boolean;
  onChange?: (value: string) => void;
}

const parseLocalDateTime = (value?: string) => {
  if (!value) return { date: null, time: "" };
  const [datePart, timePart = ""] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const date = year && month && day ? new Date(year, month - 1, day) : null;
  return { date, time: timePart.slice(0, 5) };
};

const formatLocalDateTime = (date: Date | null, time: string) => {
  if (!date || !time) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}T${time}`;
};

export default function DateTimePicker({
  value,
  defaultDate = null,
  defaultTime = "",
  size = "medium",
  minuteStep = 1,
  disabled = false,
  onChange,
}: DateTimePickerProps) {
  const initialValue = parseLocalDateTime(value);
  const [date, setDate] = useState<Date | null>(
    initialValue.date ?? defaultDate,
  );
  const [time, setTime] = useState(initialValue.time || defaultTime);

  const [initialHour = "12", initialMinute = "00"] = (
    initialValue.time || defaultTime
  ).split(":");
  const numericHour = Number(initialHour);
  const [hour, setHour] = useState(
    String(numericHour % 12 || 12).padStart(2, "0"),
  );
  const [minute, setMinute] = useState(initialMinute || "00");
  const [period, setPeriod] = useState<"AM" | "PM">(
    numericHour >= 12 ? "PM" : "AM",
  );

  /* Controlled form values may be populated asynchronously by an API response. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (value === undefined) return;
    const next = parseLocalDateTime(value);
    setDate(next.date);
    setTime(next.time);
    if (next.time) {
      const [nextHour, nextMinute] = next.time.split(":");
      const hour24 = Number(nextHour);
      setHour(String(hour24 % 12 || 12).padStart(2, "0"));
      setMinute(nextMinute);
      setPeriod(hour24 >= 12 ? "PM" : "AM");
    }
  }, [value]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const commitTime = (
    nextHour: string,
    nextMinute: string,
    nextPeriod: "AM" | "PM",
  ) => {
    const hour12 = Number(nextHour) % 12;
    const hour24 = hour12 + (nextPeriod === "PM" ? 12 : 0);
    const nextTime = `${String(hour24).padStart(2, "0")}:${nextMinute}`;
    setTime(nextTime);
    onChange?.(formatLocalDateTime(date, nextTime));
  };

  const changeDate = (nextDate: Date | null) => {
    setDate(nextDate);
    onChange?.(formatLocalDateTime(nextDate, time));
  };

  return (
    <div className={`ui-datetime-picker ui-datetime-picker--${size}`}>
      <DatePicker
        value={date}
        onChange={changeDate}
        size={size}
        disabled={disabled}
        placeholder="Chọn ngày và giờ..."
        overlayMonthPicker
        closeOnSelect={false}
        displaySuffix={` · ${time || "--:--"}`}
        popupAddon={
          <div className="ui-datetime-picker__time-panel" aria-label="Chọn giờ">
            <select
              className="ui-datetime-picker__time-column"
              aria-label="Giờ"
              size={7}
              value={hour}
              onChange={(event) => {
                setHour(event.target.value);
                commitTime(event.target.value, minute, period);
              }}
            >
              {Array.from({ length: 12 }, (_, index) =>
                String(index + 1).padStart(2, "0"),
              ).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              className="ui-datetime-picker__time-column"
              aria-label="Phút"
              size={7}
              value={minute}
              onChange={(event) => {
                setMinute(event.target.value);
                commitTime(hour, event.target.value, period);
              }}
            >
              {Array.from({ length: Math.ceil(60 / minuteStep) }, (_, index) =>
                String(index * minuteStep).padStart(2, "0"),
              ).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              className="ui-datetime-picker__time-column ui-datetime-picker__period-column"
              aria-label="Buổi"
              size={2}
              value={period}
              onChange={(event) => {
                const nextPeriod = event.target.value as "AM" | "PM";
                setPeriod(nextPeriod);
                commitTime(hour, minute, nextPeriod);
              }}
            >
              <option>AM</option>
              <option>PM</option>
            </select>
          </div>
        }
      />
    </div>
  );
}
