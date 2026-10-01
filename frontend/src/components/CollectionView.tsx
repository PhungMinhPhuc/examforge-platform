import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ViewMode } from "@/components/ViewModeToggle";

type CollectionViewProps<T> = {
  items: readonly T[];
  mode: ViewMode;
  getKey: (item: T) => string | number;
  renderItem: (item: T) => ReactNode;
  empty?: ReactNode;
  ariaLabel?: string;
};

export function CollectionView<T>({
  items,
  mode,
  getKey,
  renderItem,
  empty = "Không có dữ liệu",
  ariaLabel = "Danh sách",
}: CollectionViewProps<T>) {
  if (!items.length) return <div className="empty-state">{empty}</div>;

  return (
    <div
      className={`ui-collection ui-collection--${mode}`}
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <div className="ui-collection__entry" key={getKey(item)}>
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
}

type CollectionItemProps = {
  leading?: ReactNode;
  badges?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  details?: ReactNode;
  href?: string;
  interactive?: boolean;
};

export function CollectionItem({
  leading,
  badges,
  title,
  description,
  metadata,
  actions,
  details,
  href,
  interactive = false,
}: CollectionItemProps) {
  const router = useRouter();
  const isInteractive = interactive || href != null;

  const activate = () => {
    if (href) router.push(href);
  };

  return (
    <article
      className={`ui-collection-item${isInteractive ? " ui-collection-item--interactive" : ""}`}
      role={href ? "link" : undefined}
      tabIndex={href ? 0 : undefined}
      onClick={href ? activate : undefined}
      onKeyDown={
        href
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                activate();
              }
            }
          : undefined
      }
    >
      {leading && <div className="ui-collection-item__leading">{leading}</div>}
      <div className="ui-collection-item__main">
        {badges && <div className="ui-collection-item__badges">{badges}</div>}
        <div className="ui-collection-item__title">{title}</div>
        {description && (
          <div className="ui-collection-item__description">{description}</div>
        )}
        {metadata && (
          <div className="ui-collection-item__metadata">{metadata}</div>
        )}
      </div>
      {actions && (
        <div
          className="ui-collection-item__actions"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      )}
      {details && (
        <div
          className="ui-collection-item__details"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {details}
        </div>
      )}
    </article>
  );
}
