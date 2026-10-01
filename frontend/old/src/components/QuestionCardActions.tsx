"use client";

type QuestionCardActionsProps = {
  onDetail: () => void;
  onDelete?: () => void;
  detailLabel?: string;
  deleteLabel?: string;
  disabled?: boolean;
  className?: string;
};

export default function QuestionCardActions({
  onDetail,
  onDelete,
  detailLabel = "Chi tiết",
  deleteLabel = "Xóa",
  disabled = false,
  className = "",
}: QuestionCardActionsProps) {
  return (
    <div className={`ui-question-card-actions ${className}`.trim()}>
      <button className="ui-button ui-button--secondary ui-button--small" type="button" disabled={disabled} onClick={onDetail}>
        {detailLabel}
      </button>
      {onDelete ? (
        <button className="ui-button ui-button--danger ui-button--small" type="button" disabled={disabled} onClick={onDelete}>
          {deleteLabel}
        </button>
      ) : null}
    </div>
  );
}
