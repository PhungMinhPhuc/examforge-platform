"use client";

import { Icon } from "@/components/icons";

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  maxVisible?: number;
  className?: string;
};

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  maxVisible = 5,
  className = "",
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const visibleCount = Math.min(maxVisible, totalPages);
  const start = Math.max(
    1,
    Math.min(page - Math.floor(visibleCount / 2), totalPages - visibleCount + 1),
  );
  const pages = Array.from({ length: visibleCount }, (_, index) => start + index);

  return (
    <nav className={`ui-pagination ${className}`.trim()} aria-label="Phân trang">
      <button
        className="ui-button ui-button--secondary ui-pagination__edge"
        type="button"
        onClick={() => onPageChange(1)}
        disabled={page === 1}
      >
        <Icon name="chevrons-left" />
        <span className="ui-pagination__edge-label">Đầu</span>
      </button>
      <button
        className="ui-button ui-button--secondary ui-button--icon"
        type="button"
        aria-label="Trang trước"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
      >
        <Icon name="chevron-left" />
      </button>
      <span className="ui-pagination__pages">
        {pages.map((pageNumber) => (
          <button
            key={pageNumber}
            className={`ui-button ui-button--secondary ui-button--icon ${page === pageNumber ? "ui-button--selected" : ""}`}
            type="button"
            aria-label={`Trang ${pageNumber}`}
            aria-current={page === pageNumber ? "page" : undefined}
            onClick={() => onPageChange(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
      </span>
      <button
        className="ui-button ui-button--secondary ui-button--icon"
        type="button"
        aria-label="Trang sau"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
      >
        <Icon name="chevron-right" />
      </button>
      <button
        className="ui-button ui-button--secondary ui-pagination__edge"
        type="button"
        onClick={() => onPageChange(totalPages)}
        disabled={page === totalPages}
      >
        <span className="ui-pagination__edge-label">Cuối</span>
        <Icon name="chevrons-right" />
      </button>
    </nav>
  );
}
