import type { SVGProps } from "react";

import {
  filledIconDefaultSizes,
  filledIconMarkup,
  isStrokeIcon,
  strokeIconPaths,
  type FilledIconName,
  type IconName,
} from "./iconRegistry";

export interface IconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "children" | "name"
> {
  name: IconName;
  size?: number | string;
  title?: string;
}

/**
 * Renders an icon from the shared, type-safe registry.
 *
 * Decorative icons are hidden from assistive technology by default. Pass
 * `title` or `aria-label` when the icon conveys meaning by itself.
 */
export function Icon({
  name,
  size,
  title,
  "aria-label": ariaLabel,
  role,
  ...svgProps
}: IconProps) {
  const strokeIcon = isStrokeIcon(name);
  const markup = strokeIcon
    ? strokeIconPaths[name]
    : filledIconMarkup[name as FilledIconName];
  const resolvedSize =
    size ?? (strokeIcon ? 20 : filledIconDefaultSizes[name as FilledIconName]);
  const accessibleName = ariaLabel ?? title;

  return (
    <svg
      {...svgProps}
      aria-hidden={accessibleName ? undefined : true}
      aria-label={accessibleName}
      fill={strokeIcon ? "none" : "currentColor"}
      focusable="false"
      height={resolvedSize}
      role={role ?? (accessibleName ? "img" : undefined)}
      stroke={strokeIcon ? "currentColor" : undefined}
      strokeLinecap={strokeIcon ? "round" : undefined}
      strokeLinejoin={strokeIcon ? "round" : undefined}
      strokeWidth={strokeIcon ? 1.8 : undefined}
      viewBox="0 0 24 24"
      width={resolvedSize}
    >
      {title ? <title>{title}</title> : null}
      <g dangerouslySetInnerHTML={{ __html: markup }} />
    </svg>
  );
}
