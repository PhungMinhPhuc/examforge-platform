import MathLiveEditor from "../../MathLiveEditor";
import styles from "../styles/dialog.module.css";
import { Icon } from "@/components/icons";

type Props = {
  open: boolean;
  mode: "new" | "edit";
  value: string;
  block: boolean;
  onValueChange: (value: string) => void;
  onBlockChange: (block: boolean) => void;
  onCancel: () => void;
  onSubmit: () => void;
  onDelete?: () => void;
};

export function MathDialog(props: Props) {
  if (!props.open) return null;
  return (
    <div
      className="ui-modal-backdrop ui-modal-backdrop--editor ui-modal-backdrop--math"
      role="presentation"
    >
      <section
        className="ui-modal ui-modal--medium"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rle-math-dialog-title"
      >
        <header className="ui-modal__header">
          <div className="ui-modal__heading"><h2 className="ui-modal__title" id="rle-math-dialog-title">{props.mode === "new" ? "Thêm công thức" : "Sửa công thức"}</h2></div>
          <button className="ui-modal__close" type="button" aria-label="Đóng" onClick={props.onCancel}><Icon name="close" /></button>
        </header>
        <div className="ui-modal__body">
          {props.mode === "new" && (
          <div className={styles.kind} role="group" aria-label="Kiểu công thức">
            <button
              className="ui-button ui-button--secondary"
              type="button"
              aria-pressed={!props.block}
              onClick={() => props.onBlockChange(false)}
            >
              Trong dòng
            </button>
            <button
              className="ui-button ui-button--secondary"
              type="button"
              aria-pressed={props.block}
              onClick={() => props.onBlockChange(true)}
            >
              Khối riêng
            </button>
          </div>
        )}
        <MathLiveEditor
          value={props.value}
          onChange={props.onValueChange}
          autoFocus
        />
        </div>
        <footer className="ui-modal__footer" style={{ justifyContent: "space-between" }}>
          {props.mode === "edit" && props.onDelete ? (
            <button className="ui-button ui-button--danger" type="button" onClick={props.onDelete}>
              <Icon name="trash" />
              Xóa công thức
            </button>
          ) : (
            <span />
          )}
          <div className={styles.actions}>
            <button className="ui-button ui-button--secondary" type="button" onClick={props.onCancel}>
              Hủy
            </button>
            <button className="ui-button ui-button--primary" type="button" onClick={props.onSubmit}>
              Xác nhận
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
