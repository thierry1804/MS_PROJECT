import { useEffect } from "react";
import "../styles/modal.css";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  danger,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onCancel} aria-label="Fermer">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <p className="confirm-message">{message}</p>
        </div>
        <footer className="modal-foot">
          <span />
          <div className="modal-actions">
            <button className="modal-btn ghost" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button
              className={`modal-btn ${danger ? "danger" : "primary"}`}
              onClick={onConfirm}
              autoFocus
            >
              {confirmLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
