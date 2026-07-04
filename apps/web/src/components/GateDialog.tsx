import { useState } from "react";
import "../styles/modal.css";

interface Props {
  title: string;
  criteria: string[];
  onCancel: () => void;
  onConfirm: (info: { approver: string; comment?: string; criteria: string[] }) => void;
}

export function GateDialog({ title, criteria, onCancel, onConfirm }: Props) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [approver, setApprover] = useState("");
  const [comment, setComment] = useState("");

  const allChecked = criteria.length === 0 || criteria.every((_, i) => checked[i]);
  const valid = allChecked && approver.trim().length > 0;

  function submit() {
    if (!valid) return;
    onConfirm({ approver: approver.trim(), comment: comment.trim() || undefined, criteria });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onCancel} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className="modal-body">
          {criteria.length > 0 && (
            <div className="gate-checklist">
              {criteria.map((c, i) => (
                <label key={i} className="gate-check">
                  <input
                    type="checkbox"
                    checked={!!checked[i]}
                    onChange={(e) => setChecked((prev) => ({ ...prev, [i]: e.target.checked }))}
                  />
                  {c}
                </label>
              ))}
            </div>
          )}

          <label className="modal-field">
            <span>Approbateur</span>
            <input
              value={approver}
              onChange={(e) => setApprover(e.target.value)}
              placeholder="Nom de l'approbateur"
              autoFocus
            />
          </label>

          <label className="modal-field">
            <span>Commentaire (optionnel)</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Contexte de la décision…"
            />
          </label>
        </div>

        <footer className="modal-foot">
          <span className="modal-hint">Toutes les conditions doivent être cochées pour valider la gate.</span>
          <div className="modal-actions">
            <button className="modal-btn ghost" onClick={onCancel}>
              Annuler
            </button>
            <button className="modal-btn primary" disabled={!valid} onClick={submit}>
              Valider la gate
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
