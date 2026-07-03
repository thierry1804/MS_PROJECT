import { useEffect, useState } from "react";
import { todayISO, type ProjectDraft } from "../domain";
import "../styles/modal.css";

interface Props {
  onClose: () => void;
  onCreate: (draft: ProjectDraft) => void;
}

export function NewProjectModal({ onClose, onCreate }: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [manager, setManager] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [start, setStart] = useState(todayISO());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const valid = name.trim().length > 0 && code.trim().length > 0;

  function submit() {
    if (!valid) return;
    onCreate({
      code: code.trim(),
      name: name.trim(),
      manager: manager.trim(),
      description: description.trim(),
      budget: Math.max(0, Number(budget) || 0),
      projectStart: start,
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Nouveau projet" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Nouveau projet</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <div className="modal-row">
            <label className="modal-field code">
              <span>Code</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="PRJ" autoFocus />
            </label>
            <label className="modal-field grow">
              <span>Nom du projet</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Intitulé du projet" />
            </label>
          </div>

          <div className="modal-row">
            <label className="modal-field grow">
              <span>Chef de projet</span>
              <input value={manager} onChange={(e) => setManager(e.target.value)} placeholder="Nom du responsable" />
            </label>
            <label className="modal-field">
              <span>Budget (€)</span>
              <input type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" />
            </label>
            <label className="modal-field">
              <span>Démarrage</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
          </div>

          <label className="modal-field">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Objectif et périmètre du projet…"
              rows={3}
            />
          </label>
        </div>

        <footer className="modal-foot">
          <span className="modal-hint">Le projet est créé au statut « Cadrage », prêt à recevoir ses tâches.</span>
          <div className="modal-actions">
            <button className="modal-btn ghost" onClick={onClose}>
              Annuler
            </button>
            <button className="modal-btn primary" onClick={submit} disabled={!valid}>
              Créer le projet
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
