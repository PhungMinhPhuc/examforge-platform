import { useState } from "react";
import styles from "../styles/dialog.module.css";
import { Icon } from "@/components/icons";
import NumberInput from "@/components/NumberInput";

type Props = {
  open: boolean;
  onCancel: () => void;
  onSubmit: (rows: number, columns: number) => void;
};

export function TableDialog({ open, onCancel, onSubmit }: Props) {
  const [rows, setRows] = useState(2);
  const [columns, setColumns] = useState(2);
  if (!open) return null;
  return (
    <div className="ui-modal-backdrop ui-modal-backdrop--editor" role="presentation">
      <section
        className="ui-modal ui-modal--small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rle-table-title"
      >
        <header className="ui-modal__header">
          <div className="ui-modal__heading"><h2 className="ui-modal__title" id="rle-table-title">Chèn bảng</h2></div>
          <button className="ui-modal__close" type="button" aria-label="Đóng" onClick={onCancel}><Icon name="close" /></button>
        </header>
        <div className="ui-modal__body"><div className={styles.fields}>
          <label className={styles.field}>
            <span>Số hàng</span>
            <NumberInput
              className="ui-input-native"
              min={1}
              max={30}
              value={rows}
              onChange={setRows}
            />
          </label>
          <label className={styles.field}>
            <span>Số cột</span>
            <NumberInput
              className="ui-input-native"
              min={1}
              max={20}
              value={columns}
              onChange={setColumns}
            />
          </label>
        </div></div>
        <footer className="ui-modal__footer">
          <div className={styles.actions}>
            <button
              className="ui-button ui-button--secondary"
              type="button"
              onClick={onCancel}
            >
              Hủy
            </button>
            <button
              className="ui-button ui-button--primary"
              type="button"
              onClick={() =>
                onSubmit(
                  Math.max(1, Math.min(30, Math.trunc(rows) || 1)),
                  Math.max(1, Math.min(20, Math.trunc(columns) || 1)),
                )
              }
            >
              Chèn
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
