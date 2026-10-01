"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  label?: ReactNode;
  className?: string;
};

export default function Radio({ label, className, disabled, ...inputProps }: Props) {
  return (
    <span
      className={[
        "ui-radio",
        disabled ? "ui-radio--disabled" : "",
        className ?? "",
      ].filter(Boolean).join(" ")}
    >
      <input
        {...inputProps}
        className="ui-radio__input"
        type="radio"
        disabled={disabled}
      />
      <span className="ui-radio__indicator" aria-hidden="true" />
      {label != null && <span className="ui-radio__label">{label}</span>}
    </span>
  );
}
