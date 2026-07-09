import { useEffect, useState } from "react";
import { todayISO, type Demand } from "../domain";
import "../styles/modal.css";

interface ProjectOption {
  id: string;
  code: string;
  name: string;
}

interface Props {
  projects: ProjectOption[];
  onClose: () => void;
  onCreate: (demand: Demand) => void;
}

function uid() {
  return `dm-${Math.random().toString(36).slice(2, 8)}`;
}

export function NewDemandModal({ projects, onClose, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [sponsor, setSponsor] = useState("");
  const [budgetSponsor, setBudgetSponsor] = useState("");
  const [budget, setBudget] = useState("");
  const [description, setDescription] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [strategicAxis, setStrategicAxis] = useState("");
  const [dependsOnProjectId, setDependsOnProjectId] = useState("");
  const [value, setValue] = useState(3);
  const [effort, setEffort] = useState(3);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const valid = title.trim().length > 0;
  const priority = value * (6 - effort);

  function submit() {
    if (!valid) return;
    onCreate({
      id: uid(),
      title: title.trim(),
      sponsor: sponsor.trim() || "—",
      description: description.trim(),
      estBudget: Math.max(0, Number(budget) || 0),
      value,
      effort,
      stage: "idee",
      createdAt: todayISO(),
      ...(budgetSponsor.trim() ? { budgetSponsor: budgetSponsor.trim() } : {}),
      ...(desiredDate ? { desiredDate } : {}),
      ...(strategicAxis.trim() ? { strategicAxis: strategicAxis.trim() } : {}),
      ...(dependsOnProjectId ? { dependsOnProjectId } : {}),
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-demand"
        role="dialog"
        aria-modal="true"
        aria-label="Nouvelle demande"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2>Nouvelle demande</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <label className="modal-field">
            <span>Intitulé</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nom de la demande"
              autoFocus
            />
          </label>

          <label className="modal-field">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Objectif, périmètre, contexte…"
              rows={3}
            />
          </label>

          <div className="modal-row">
            <label className="modal-field">
              <span>Sponsor</span>
              <input
                value={sponsor}
                onChange={(e) => setSponsor(e.target.value)}
                placeholder="Sponsor métier"
              />
            </label>
            <label className="modal-field">
              <span>Sponsor budgétaire</span>
              <input
                value={budgetSponsor}
                onChange={(e) => setBudgetSponsor(e.target.value)}
                placeholder="Optionnel"
              />
            </label>
          </div>

          <div className="modal-row">
            <label className="modal-field">
              <span>Budget estimé (€)</span>
              <input
                type="number"
                min={0}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="0"
              />
            </label>
            <label className="modal-field">
              <span>Échéance souhaitée</span>
              <input type="date" value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} />
            </label>
          </div>

          <div className="modal-row">
            <label className="modal-field">
              <span>Axe stratégique</span>
              <input
                value={strategicAxis}
                onChange={(e) => setStrategicAxis(e.target.value)}
                placeholder="Ex. Digital, Conformité…"
              />
            </label>
            <label className="modal-field">
              <span>Dépend d’un projet</span>
              <select value={dependsOnProjectId} onChange={(e) => setDependsOnProjectId(e.target.value)}>
                <option value="">Aucun</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="modal-row">
            <label className="modal-field">
              <span>Valeur métier</span>
              <select value={value} onChange={(e) => setValue(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
            </label>
            <label className="modal-field">
              <span>Effort estimé</span>
              <select value={effort} onChange={(e) => setEffort(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-field modal-prio-preview">
              <span>Priorité</span>
              <div className="modal-prio-value tnum" title="valeur × (6 − effort)">
                {priority}
              </div>
            </div>
          </div>
        </div>

        <footer className="modal-foot">
          <span className="modal-hint">La demande entre en colonne Idées.</span>
          <div className="modal-actions">
            <button className="modal-btn ghost" onClick={onClose}>
              Annuler
            </button>
            <button className="modal-btn primary" onClick={submit} disabled={!valid}>
              Ajouter la demande
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
