"use client";

import type { MouseEventHandler, ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";

export type BreadcrumbItem = {
  label: ReactNode;
  href?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  truncate?: boolean;
};

type BreadcrumbProps = {
  items: BreadcrumbItem[];
  size?: "small" | "medium" | "large";
  ariaLabel?: string;
};

export default function Breadcrumb({
  items,
  size = "small",
  ariaLabel = "Breadcrumb",
}: BreadcrumbProps) {
  const sizeClass =
    size === "medium" ? "" : `ui-breadcrumb--${size === "small" ? "sm" : "lg"}`;

  return (
    <nav className={sizeClass} aria-label={ariaLabel}>
      <ol className="ui-breadcrumb__list">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          const content = item.truncate ? (
            <span className="ui-breadcrumb__label">{item.label}</span>
          ) : (
            item.label
          );
          return (
            <li className="ui-breadcrumb__item" key={index}>
              {item.href && !current ? (
                <Link
                  href={item.href}
                  className={`ui-breadcrumb__button${item.truncate ? " ui-breadcrumb__button--truncated" : ""}`}
                  onClick={item.onClick}
                >
                  {content}
                </Link>
              ) : (
                <span
                  className={`ui-breadcrumb__button${item.truncate ? " ui-breadcrumb__button--truncated" : ""}`}
                  aria-current={current ? "page" : undefined}
                >
                  {content}
                </span>
              )}
              {!current ? (
                <span className="ui-breadcrumb__divider" aria-hidden="true">
                  <Icon name="chevron-right" />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
