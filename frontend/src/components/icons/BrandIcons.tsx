import type { HTMLAttributes, SVGProps } from "react";

export interface GoogleIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children"
> {
  size?: number | string;
  title?: string;
}

export function GoogleIcon({
  size = 20,
  title,
  "aria-label": ariaLabel,
  role,
  ...svgProps
}: GoogleIconProps) {
  const accessibleName = ariaLabel ?? title;

  return (
    <svg
      {...svgProps}
      aria-hidden={accessibleName ? undefined : true}
      aria-label={accessibleName}
      focusable="false"
      height={size}
      role={role ?? (accessibleName ? "img" : undefined)}
      viewBox="0 0 48 48"
      width={size}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M24 9.5c3.54 0 6.72 1.22 9.22 3.6l6.86-6.86C35.9 2.34 30.46 0 24 0 14.62 0 6.52 5.38 2.58 13.22l7.98 6.2C12.46 13.72 17.76 9.5 24 9.5Z"
        fill="#EA4335"
      />
      <path
        d="M46.5 24.5c0-1.58-.14-3.1-.4-4.56H24v9.12h12.66c-.56 2.94-2.22 5.44-4.72 7.12l7.68 5.96C44.1 38 46.5 31.82 46.5 24.5Z"
        fill="#4285F4"
      />
      <path
        d="M10.56 28.58A14.7 14.7 0 0 1 9.78 24c0-1.58.28-3.12.78-4.58l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.88.92 7.56 2.58 10.78l7.98-6.2Z"
        fill="#FBBC05"
      />
      <path
        d="M24 48c6.46 0 11.88-2.12 15.84-5.78l-7.68-5.96c-2.12 1.42-4.84 2.26-8.16 2.26-6.24 0-11.54-4.22-13.44-9.94l-7.98 6.2C6.52 42.62 14.62 48 24 48Z"
        fill="#34A853"
      />
    </svg>
  );
}

export interface MicrosoftIconProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children"
> {
  size?: number | string;
  title?: string;
}

export function MicrosoftIcon({
  size = 20,
  title,
  "aria-label": ariaLabel,
  role,
  style,
  ...spanProps
}: MicrosoftIconProps) {
  const accessibleName = ariaLabel ?? title;

  return (
    <span
      {...spanProps}
      aria-hidden={accessibleName ? undefined : true}
      aria-label={accessibleName}
      role={role ?? (accessibleName ? "img" : undefined)}
      style={{
        display: "inline-grid",
        flex: "0 0 auto",
        gap: "8%",
        gridTemplateColumns: "repeat(2, 1fr)",
        height: size,
        lineHeight: 0,
        width: size,
        ...style,
      }}
      title={title}
    >
      <span style={{ background: "#F25022" }} />
      <span style={{ background: "#7FBA00" }} />
      <span style={{ background: "#00A4EF" }} />
      <span style={{ background: "#FFB900" }} />
    </span>
  );
}
