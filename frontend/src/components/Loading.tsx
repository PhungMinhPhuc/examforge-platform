import type { CSSProperties, ReactNode } from "react";

export function Spinner({
  size = "medium",
  label,
  className = "",
}: {
  size?: "small" | "medium" | "large";
  label?: ReactNode;
  className?: string;
}) {
  const indicator = (
    <span
      className={`ui-spinner ui-spinner--${size} ${className}`.trim()}
      aria-hidden="true"
    />
  );
  return label ? (
    <span className="ui-spinner__label" role="status">
      {indicator}
      <span>{label}</span>
    </span>
  ) : (
    <span role="status" aria-label="Đang xử lý">
      {indicator}
    </span>
  );
}

export function ProgressBar({
  value,
  max = 100,
  label = "Tiến độ",
  className = "",
}: {
  value?: number;
  max?: number;
  label?: string;
  className?: string;
}) {
  const determinate = typeof value === "number";
  const percent = determinate
    ? Math.min(100, Math.max(0, (value / Math.max(1, max)) * 100))
    : undefined;
  return (
    <div
      className={`ui-progress ${determinate ? "" : "ui-progress--indeterminate"} ${className}`.trim()}
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? max : undefined}
      aria-valuenow={determinate ? value : undefined}
    >
      <span
        className="ui-progress__value"
        style={percent === undefined ? undefined : { width: `${percent}%` }}
      />
    </div>
  );
}

export function Skeleton({
  className = "",
  circle = false,
  style,
}: {
  className?: string;
  circle?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`ui-skeleton ${circle ? "ui-skeleton--circle" : ""} ${className}`.trim()}
      style={style}
      aria-hidden="true"
    />
  );
}
