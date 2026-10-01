"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/icons";

type QuestionCardRailProps = {
  number: ReactNode;
  onDetail: () => void;
  onDelete?: () => void;
  disabled?: boolean;
  className?: string;
};

export default function QuestionCardRail({
  number,
  onDetail,
  onDelete,
  disabled = false,
  className = "",
}: QuestionCardRailProps) {
  return (
    <div className={`ui-question-card-rail ${className}`.trim()}>
      <div className="question-num ui-question-card-rail__number">{number}</div>
      <div className="ui-question-card-rail__actions">
        <button
          className="ui-button ui-button--secondary ui-button--small ui-button--icon"
          type="button"
          aria-label="Xem chi tiết câu hỏi"
          title="Chi tiết"
          disabled={disabled}
          onClick={onDetail}
        >
          <Icon name="more-horizontal" />
        </button>
        {onDelete ? (
          <button
            className="ui-button ui-button--danger ui-button--small ui-button--icon"
            type="button"
            aria-label="Xóa câu hỏi"
            title="Xóa"
            disabled={disabled}
            onClick={onDelete}
          >
            <Icon name="trash" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
