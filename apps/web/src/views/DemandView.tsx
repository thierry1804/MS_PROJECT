import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DEMAND_STAGES,
  DEMAND_STAGE_LABELS,
  demandPriority,
  EUR,
  todayISO,
  type Demand,
  type DemandStage,
} from "../domain";
import { useStore } from "../store";
import "../styles/demand.css";

function uid() {
  return `dm-${Math.random().toString(36).slice(2, 8)}`;
}

function prioClass(p: number): string {
  if (p >= 16) return "high";
  if (p >= 9) return "mid";
  return "low";
}

export function DemandView() {
  const portfolio = useStore((s) => s.portfolio);
  const addDemand = useStore((s) => s.addDemand);
  const moveDemand = useStore((s) => s.moveDemand);
  const convertDemand = useStore((s) => s.convertDemand);
  const navigate = useNavigate();

  const demands = portfolio.demands ?? [];
  const byStage = (stage: DemandStage) =>
    demands.filter((d) => d.stage === stage).sort((a, b) => demandPriority(b) - demandPriority(a));

  const [showForm, setShowForm] = useState(false);

  const totalPipeline = demands
    .filter((d) => d.stage !== "rejetee")
    .reduce((s, d) => s + d.estBudget, 0);

  return (
    <>
      <div className="view-header dm-header">
        <div>
          <h1>Pipeline de demandes</h1>
          <span className="sub tnum">
            {demands.length} demandes · {EUR.format(totalPipeline)} de budget potentiel en pipeline
          </span>
        </div>
        <button className="toolbar-btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Fermer" : "+ Nouvelle demande"}
        </button>
      </div>

      {showForm && <DemandForm onSubmit={(d) => { addDemand(d); setShowForm(false); }} />}

      <div className="view-body dm-board">
        {DEMAND_STAGES.map((stage) => {
          const items = byStage(stage);
          return (
            <div key={stage} className={`dm-col ${stage}`}>
              <div className="dm-col-head">
                <span>{DEMAND_STAGE_LABELS[stage]}</span>
                <span className="dm-col-count tnum">{items.length}</span>
              </div>
              <div className="dm-col-body">
                {items.map((d) => (
                  <DemandCard
                    key={d.id}
                    demand={d}
                    onMove={(s) => moveDemand(d.id, s)}
                    onConvert={() => {
                      const id = convertDemand(d.id);
                      if (id) navigate(`/projets/${id}`);
                    }}
                    onOpen={d.convertedProjectId ? () => navigate(`/projets/${d.convertedProjectId}`) : undefined}
                  />
                ))}
                {items.length === 0 && <p className="dm-empty">—</p>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function DemandCard({
  demand,
  onMove,
  onConvert,
  onOpen,
}: {
  demand: Demand;
  onMove: (stage: DemandStage) => void;
  onConvert: () => void;
  onOpen?: () => void;
}) {
  const p = demandPriority(demand);
  return (
    <div className="dm-card">
      <div className="dm-card-top">
        <span className={`dm-prio ${prioClass(p)}`} title="Priorité = valeur × (6 − effort)">
          {p}
        </span>
        <span className="dm-card-title">{demand.title}</span>
      </div>
      <p className="dm-card-desc">{demand.description}</p>
      <div className="dm-card-meta tnum">
        <span>{demand.sponsor}</span>
        <span>{EUR.format(demand.estBudget)}</span>
      </div>
      <div className="dm-scores">
        <span className="dm-score">Valeur <b>{demand.value}</b>/5</span>
        <span className="dm-score">Effort <b>{demand.effort}</b>/5</span>
      </div>
      <div className="dm-actions">
        {demand.stage === "idee" && (
          <>
            <button className="dm-btn go" onClick={() => onMove("qualifiee")}>Qualifier ›</button>
            <button className="dm-btn no" onClick={() => onMove("rejetee")}>Rejeter</button>
          </>
        )}
        {demand.stage === "qualifiee" && (
          <>
            <button className="dm-btn go" onClick={() => onMove("approuvee")}>Approuver ›</button>
            <button className="dm-btn back" onClick={() => onMove("idee")}>‹</button>
            <button className="dm-btn no" onClick={() => onMove("rejetee")}>Rejeter</button>
          </>
        )}
        {demand.stage === "approuvee" &&
          (demand.convertedProjectId ? (
            <button className="dm-btn open" onClick={onOpen}>Ouvrir le projet ›</button>
          ) : (
            <>
              <button className="dm-btn convert" onClick={onConvert}>Créer le projet</button>
              <button className="dm-btn back" onClick={() => onMove("qualifiee")}>‹</button>
            </>
          ))}
        {demand.stage === "rejetee" && (
          <button className="dm-btn back" onClick={() => onMove("idee")}>Réactiver</button>
        )}
      </div>
    </div>
  );
}

function DemandForm({ onSubmit }: { onSubmit: (d: Demand) => void }) {
  const [title, setTitle] = useState("");
  const [sponsor, setSponsor] = useState("");
  const [budget, setBudget] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState(3);
  const [effort, setEffort] = useState(3);

  function submit() {
    if (!title.trim()) return;
    onSubmit({
      id: uid(),
      title: title.trim(),
      sponsor: sponsor.trim() || "—",
      description: description.trim(),
      estBudget: Math.max(0, Number(budget) || 0),
      value,
      effort,
      stage: "idee",
      createdAt: todayISO(),
    });
  }

  return (
    <div className="dm-form">
      <input className="dm-in grow" placeholder="Intitulé de la demande" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className="dm-in" placeholder="Sponsor" value={sponsor} onChange={(e) => setSponsor(e.target.value)} />
      <input className="dm-in num" type="number" min={0} placeholder="Budget €" value={budget} onChange={(e) => setBudget(e.target.value)} />
      <label className="dm-lbl">Valeur
        <select className="dm-in mini" value={value} onChange={(e) => setValue(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label className="dm-lbl">Effort
        <select className="dm-in mini" value={effort} onChange={(e) => setEffort(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <button className="dm-btn convert" onClick={submit} disabled={!title.trim()}>Ajouter</button>
    </div>
  );
}
