import { useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { GateDialog } from "../components/GateDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { NewDemandModal } from "../components/NewDemandModal";
import {
  DEMAND_STAGES,
  DEMAND_STAGE_LABELS,
  GATE_CRITERIA,
  demandPriority,
  fmtDate,
  EUR,
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

const DND_MIME = "application/x-atelier-demand";

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
  const projects = portfolio.projects;
  const byStage = (stage: DemandStage) =>
    demands.filter((d) => d.stage === stage).sort((a, b) => demandPriority(b) - demandPriority(a));

  const [showForm, setShowForm] = useState(false);
  const [gateTarget, setGateTarget] = useState<GateTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Demand | null>(null);
  const [dragDemandId, setDragDemandId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<DemandStage | null>(null);

  const totalPipeline = demands
    .filter((d) => d.stage !== "rejetee")
    .reduce((s, d) => s + d.estBudget, 0);

  function requestStage(demandId: string, target: DemandStage) {
    const demand = demands.find((d) => d.id === demandId);
    if (!demand || demand.stage === target) return;
    if (GATE_CRITERIA[target]) {
      setGateTarget({ demandId, stage: target });
    } else {
      moveDemand(demandId, target);
    }
  }

  function onColumnDragOver(e: DragEvent, stage: DemandStage) {
    if (!dragDemandId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropStage !== stage) setDropStage(stage);
  }

  function onColumnDrop(e: DragEvent, stage: DemandStage) {
    e.preventDefault();
    const id = e.dataTransfer.getData(DND_MIME) || dragDemandId;
    setDropStage(null);
    setDragDemandId(null);
    if (!id) return;
    requestStage(id, stage);
  }

  return (
    <>
      <div className="view-header dm-header">
        <div>
          <h1>Pipeline de demandes</h1>
          <span className="sub tnum">
            {demands.length} demandes · {EUR.format(totalPipeline)} de budget potentiel en pipeline
          </span>
        </div>
        <button className="toolbar-btn primary" onClick={() => setShowForm(true)}>
          + Nouvelle demande
        </button>
      </div>

      {showForm && (
        <NewDemandModal
          projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
          onClose={() => setShowForm(false)}
          onCreate={(d) => {
            addDemand(d);
            setShowForm(false);
          }}
        />
      )}

      <div className="view-body dm-board">
        {DEMAND_STAGES.map((stage) => {
          const items = byStage(stage);
          const isDropTarget = dropStage === stage && !!dragDemandId;
          return (
            <div
              key={stage}
              className={`dm-col ${stage}${isDropTarget ? " dm-col-drop" : ""}`}
              onDragOver={(e) => onColumnDragOver(e, stage)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null) && dropStage === stage) {
                  setDropStage(null);
                }
              }}
              onDrop={(e) => onColumnDrop(e, stage)}
            >
              <div className="dm-col-head">
                <span>{DEMAND_STAGE_LABELS[stage]}</span>
                <span className="dm-col-count tnum">{items.length}</span>
              </div>
              <div className="dm-col-body">
                {items.map((d) => (
                  <DemandCard
                    key={d.id}
                    demand={d}
                    projects={projects}
                    dragging={dragDemandId === d.id}
                    onDragStart={(id) => setDragDemandId(id)}
                    onDragEnd={() => {
                      setDragDemandId(null);
                      setDropStage(null);
                    }}
                    onMove={(s) => requestStage(d.id, s)}
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
  projects,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onConvert,
  onOpen,
  onDelete,
}: {
  demand: Demand;
  projects: { id: string; code: string; name: string }[];
  dragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMove: (stage: DemandStage) => void;
  onConvert: () => void;
  onOpen?: () => void;
  onDelete?: () => void;
}) {
  const p = demandPriority(demand);
  const lastGate = demand.gateHistory?.[demand.gateHistory.length - 1];
  const otherStages = DEMAND_STAGES.filter((s) => s !== demand.stage);
  const [stageSelectKey, setStageSelectKey] = useState(0);
  const dependsOn = demand.dependsOnProjectId
    ? projects.find((pr) => pr.id === demand.dependsOnProjectId)
    : undefined;

  return (
    <div
      className={`dm-card${dragging ? " dm-card-dragging" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_MIME, demand.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(demand.id);
      }}
      onDragEnd={onDragEnd}
    >
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
      {(demand.budgetSponsor || demand.desiredDate || demand.strategicAxis || dependsOn) && (
        <div className="dm-card-pmo">
          {demand.budgetSponsor && <span>Budget : {demand.budgetSponsor}</span>}
          {demand.desiredDate && <span>Échéance : {fmtDate(demand.desiredDate, true)}</span>}
          {demand.strategicAxis && <span>Axe : {demand.strategicAxis}</span>}
          {dependsOn && (
            <span>
              Dépend de : {dependsOn.code}
            </span>
          )}
        </div>
      )}
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
              onMove(target);
              setStageSelectKey((k) => k + 1);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
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
            <button className="dm-btn open" onClick={onOpen} onMouseDown={(e) => e.stopPropagation()}>
              Ouvrir le projet ›
            </button>
          ) : (
            <button className="dm-btn convert" onClick={onConvert} onMouseDown={(e) => e.stopPropagation()}>
              Créer le projet
            </button>
          ))}
        {onDelete && (
          <button className="dm-btn no" onClick={onDelete} onMouseDown={(e) => e.stopPropagation()}>
            Supprimer
          </button>
        )}
      </div>
    </div>
  );
}
