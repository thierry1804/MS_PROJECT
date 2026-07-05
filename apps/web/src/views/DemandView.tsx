import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GateDialog } from "../components/GateDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  DEMAND_STAGES,
  DEMAND_STAGE_LABELS,
  GATE_CRITERIA,
  demandPriority,
  fmtDate,
  EUR,
  todayISO,
  type Demand,
  type DemandStage,
} from "../domain";
import { useStore } from "../store";
import "../styles/demand.css";

interface GateTarget {
  demandId: string;
  stage: DemandStage;
}

const GATE_TITLES: Partial<Record<DemandStage, string>> = {
  qualifiee: "Qualifier la demande",
  approuvee: "Approuver la demande",
};

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
  const deleteDemand = useStore((s) => s.deleteDemand);
  const navigate = useNavigate();

  const demands = portfolio.demands ?? [];
  const byStage = (stage: DemandStage) =>
    demands.filter((d) => d.stage === stage).sort((a, b) => demandPriority(b) - demandPriority(a));

  const [showForm, setShowForm] = useState(false);
  const [gateTarget, setGateTarget] = useState<GateTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Demand | null>(null);

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
                    onGate={(s) => setGateTarget({ demandId: d.id, stage: s })}
                    onConvert={() => {
                      const id = convertDemand(d.id);
                      if (id) navigate(`/projets/${id}`);
                    }}
                    onOpen={d.convertedProjectId ? () => navigate(`/projets/${d.convertedProjectId}`) : undefined}
                    onDelete={d.stage === "rejetee" ? () => setDeleteTarget(d) : undefined}
                  />
                ))}
                {items.length === 0 && <p className="dm-empty">—</p>}
              </div>
            </div>
          );
        })}
      </div>

      {gateTarget && (
        <GateDialog
          title={GATE_TITLES[gateTarget.stage] ?? "Valider le changement d'état"}
          criteria={GATE_CRITERIA[gateTarget.stage] ?? []}
          onCancel={() => setGateTarget(null)}
          onConfirm={(info) => {
            moveDemand(gateTarget.demandId, gateTarget.stage, info);
            setGateTarget(null);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Supprimer cette demande ?"
          message={`« ${deleteTarget.title} » sera définitivement retirée du pipeline. Cette action est irréversible.`}
          confirmLabel="Supprimer"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            deleteDemand(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />
      )}
    </>
  );
}

function DemandCard({
  demand,
  onMove,
  onGate,
  onConvert,
  onOpen,
  onDelete,
}: {
  demand: Demand;
  onMove: (stage: DemandStage) => void;
  onGate: (stage: DemandStage) => void;
  onConvert: () => void;
  onOpen?: () => void;
  onDelete?: () => void;
}) {
  const p = demandPriority(demand);
  const lastGate = demand.gateHistory?.[demand.gateHistory.length - 1];
  const otherStages = DEMAND_STAGES.filter((s) => s !== demand.stage);
  const [stageSelectKey, setStageSelectKey] = useState(0);

  function requestStage(target: DemandStage) {
    if (GATE_CRITERIA[target]) {
      onGate(target);
    } else {
      onMove(target);
    }
  }

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
      {lastGate && (
        <div className="dm-gate-trace" title={lastGate.comment}>
          ✓ {DEMAND_STAGE_LABELS[lastGate.stage]} par {lastGate.approver} le {fmtDate(lastGate.at, true)}
        </div>
      )}
      <div className="dm-actions">
        <label className="dm-stage-move">
          <span className="dm-stage-label">État</span>
          <select
            key={stageSelectKey}
            className="dm-stage-select"
            defaultValue=""
            aria-label={`Déplacer « ${demand.title} » vers un autre état`}
            onChange={(e) => {
              const target = e.target.value as DemandStage;
              if (!target) return;
              requestStage(target);
              setStageSelectKey((k) => k + 1);
            }}
          >
            <option value="" disabled>
              Déplacer vers…
            </option>
            {otherStages.map((stage) => (
              <option key={stage} value={stage}>
                {DEMAND_STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </label>
        {demand.stage === "approuvee" &&
          (demand.convertedProjectId ? (
            <button className="dm-btn open" onClick={onOpen}>
              Ouvrir le projet ›
            </button>
          ) : (
            <button className="dm-btn convert" onClick={onConvert}>
              Créer le projet
            </button>
          ))}
        {onDelete && (
          <button className="dm-btn no" onClick={onDelete}>
            Supprimer
          </button>
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
