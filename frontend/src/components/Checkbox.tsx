"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { Icon } from "@/components/icons";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  label?: ReactNode;
  className?: string;
};

export default function Checkbox({ label, className, disabled, ...inputProps }: Props) {
  return (
    <span
      className={[
        "ui-checkbox",
        disabled ? "ui-checkbox--disabled" : "",
        className ?? "",
      ].filter(Boolean).join(" ")}
    >
      <input
        {...inputProps}
        className="ui-checkbox__input"
        type="checkbox"
        disabled={disabled}
      />
      <span className="ui-checkbox__indicator" aria-hidden="true">
        <Icon name="check" />
      </span>
      {label != null && <span className="ui-checkbox__label">{label}</span>}
    </span>
  );
}
