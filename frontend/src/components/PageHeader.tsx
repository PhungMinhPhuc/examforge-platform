import type { ReactNode } from "react";
import Breadcrumb, { type BreadcrumbItem } from "@/components/Breadcrumb";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  className?: string;
  sticky?: boolean;
};

export default function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className = "",
  sticky = false,
}: PageHeaderProps) {
  const classes = [
    "ui-page-header",
    sticky ? "ui-page-header--sticky" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <header className={classes}>
      <div className="ui-page-header__heading">
        {breadcrumbs?.length ? <Breadcrumb items={breadcrumbs} /> : null}
        <h1 className="ui-page-header__title">{title}</h1>
        {description ? (
          <p className="ui-page-header__description">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="ui-page-header__actions">{actions}</div>
      ) : null}
    </header>
  );
}
