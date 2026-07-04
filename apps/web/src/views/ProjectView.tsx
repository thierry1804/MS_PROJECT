import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { detectOverallocations } from "@atelier/scheduling-engine";
import { Gantt, GanttHeader } from "../components/Gantt";
import { TaskGrid } from "../components/TaskGrid";
import { TaskInspector } from "../components/TaskInspector";
import { HealthBadge, StatusBadge } from "../components/badges";
import {
  DocIcon,
  DownloadIcon,
  FlagIcon,
  GapIcon,
  IndentIcon,
  OutdentIcon,
  PlusIcon,
  ScaleIcon,
  SubtaskIcon,
  TrashIcon,
} from "../components/icons";
import { exportProjectCsv } from "../export";
import { EUR, fmtDate, todayISO } from "../domain";
import { buildRange } from "../gantt-utils";
import { metricsOf, scheduleOf, useStore } from "../store";
import "../styles/project.css";
import "../styles/inspector.css";

const ZOOMS = [
  { label: "Jour", dw: 24 },
  { label: "Semaine", dw: 11 },
  { label: "Mois", dw: 4.5 },
];

function evmClass(val: number): string {
  return val >= 1.0 ? "evm-good" : val >= 0.8 ? "evm-warn" : "evm-bad";
}

export function ProjectView() {
  const { projectId } = useParams();
  const portfolio = useStore((s) => s.portfolio);
  const collapsed = useStore((s) => s.collapsed);
  const selectedTaskId = useStore((s) => s.selectedTaskId);
  const selectTask = useStore((s) => s.selectTask);
  const toggleCollapse = useStore((s) => s.toggleCollapse);
  const updateTask = useStore((s) => s.updateTask);
  const updateActualCost = useStore((s) => s.updateActualCost);
  const addDependency = useStore((s) => s.addDependency);
  const removeDependency = useStore((s) => s.removeDependency);
  const captureBaseline = useStore((s) => s.captureBaseline);
  const applyLeveling = useStore((s) => s.applyLeveling);
  const addTask = useStore((s) => s.addTask);
  const addSubTask = useStore((s) => s.addSubTask);
  const indentTask = useStore((s) => s.indentTask);
  const outdentTask = useStore((s) => s.outdentTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const [zoom, setZoom] = useState(1);
  const [showVariance, setShowVariance] = useState(false);

  const gridBodyRef = useRef<HTMLDivElement>(null);
  const ganttHeadRef = useRef<HTMLDivElement>(null);

  const project = portfolio.projects.find((p) => p.id === projectId);
  if (!project) {
    return (
      <div className="view-header">
        <h1>Projet introuvable</h1>
      </div>
    );
  }

  const schedule = scheduleOf(project, portfolio);
  const metrics = metricsOf(project, portfolio);

  const tasksById = useMemo(() => new Map(project.tasks.map((t) => [t.id, t])), [project.tasks]);
  const visibleIds = useMemo(() => {
    const hidden = (id: string): boolean => {
      let cur = tasksById.get(id)?.parentId ?? null;
      while (cur) {
        if (collapsed[cur]) return true;
        cur = tasksById.get(cur)?.parentId ?? null;
      }
      return false;
    };
    return schedule.outline.filter((id) => !hidden(id));
  }, [schedule, collapsed, tasksById]);

  const range = useMemo(
    () => buildRange(project.projectStart, schedule.projectFinishDate),
    [project.projectStart, schedule.projectFinishDate],
  );

  const dw = ZOOMS[zoom]!.dw;
  const today = todayISO();
  const selectedTask = selectedTaskId ? tasksById.get(selectedTaskId) ?? null : null;

  const overallocations = useMemo(
    () => detectOverallocations(project.tasks, schedule, portfolio.resources),
    [project.tasks, schedule, portfolio.resources],
  );
  const overloadedResources = useMemo(
    () => new Set(overallocations.map((o) => o.resourceId)).size,
    [overallocations],
  );

  function onGanttScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (gridBodyRef.current) gridBodyRef.current.scrollTop = el.scrollTop;
    if (ganttHeadRef.current) ganttHeadRef.current.scrollLeft = el.scrollLeft;
  }

  return (
    <>
      <div className="view-header project-header">
        <div className="project-title-row">
          <h1>{project.name}</h1>
          <span className="project-code tnum">{project.code}</span>
          <StatusBadge status={project.status} />
          <HealthBadge health={project.health} />
        </div>

        <div className="project-toolbar">
          <div className="tb-cluster" role="group" aria-label="Édition des tâches">
            <button
              className="tb-btn tb-accent"
              onClick={() => addTask(project.id)}
              title="Ajouter une tâche racine vide"
            >
              <PlusIcon />
              <span className="tb-label">Tâche</span>
            </button>
            {selectedTaskId && (
              <>
                <button
                  className="tb-btn"
                  onClick={() => addSubTask(project.id, selectedTaskId)}
                  title={`Ajouter une sous-tâche à « ${selectedTask?.name} »`}
                  aria-label="Ajouter une sous-tâche"
                >
                  <SubtaskIcon />
                  <span className="tb-label tier2">Sous-tâche</span>
                </button>
                <div className="tb-seg" role="group" aria-label="Niveau hiérarchique">
                  <button
                    className="tb-icon"
                    onClick={() => outdentTask(project.id, selectedTaskId)}
                    disabled={!selectedTask || selectedTask.parentId == null}
                    title="Hausser d'un niveau (Maj+Tab)"
                    aria-label="Hausser d'un niveau"
                  >
                    <OutdentIcon />
                  </button>
                  <button
                    className="tb-icon"
                    onClick={() => indentTask(project.id, selectedTaskId)}
                    title="Abaisser : sous-tâche de la ligne du dessus (Tab)"
                    aria-label="Abaisser d'un niveau"
                  >
                    <IndentIcon />
                  </button>
                </div>
                <button
                  className="tb-icon tb-danger"
                  onClick={() => {
                    if (confirm("Supprimer cette tâche et ses sous-tâches ?")) deleteTask(project.id, selectedTaskId);
                  }}
                  title="Supprimer la tâche et son sous-arbre"
                  aria-label="Supprimer la tâche"
                >
                  <TrashIcon />
                </button>
              </>
            )}
          </div>

          <div className="tb-cluster" role="group" aria-label="Analyse">
            <button
              className={`tb-btn${project.baselineCapturedAt ? " on" : ""}`}
              onClick={() => captureBaseline(project.id)}
              title="Capturer la baseline pour le suivi des écarts"
              aria-label="Capturer la baseline"
            >
              <FlagIcon />
              <span className="tb-label tier1">
                {project.baselineCapturedAt ? `Baseline · ${fmtDate(project.baselineCapturedAt)}` : "Capturer baseline"}
              </span>
            </button>
            <button
              className={`tb-btn${showVariance ? " on" : ""}`}
              onClick={() => setShowVariance((v) => !v)}
              title="Colonnes d'écart planning/coût et baseline sur le Gantt"
              aria-pressed={showVariance}
              aria-label="Afficher les écarts"
            >
              <GapIcon />
              <span className="tb-label tier1">Écarts</span>
            </button>
            <button
              className={`tb-btn${overloadedResources > 0 ? " tb-warn" : ""}`}
              onClick={() => applyLeveling(project.id)}
              disabled={overloadedResources === 0}
              title="Niveler : décale les tâches pour résorber les surcharges de ressources"
              aria-label="Niveler les ressources"
            >
              <ScaleIcon />
              <span className="tb-label tier1">Niveler{overloadedResources > 0 ? ` · ${overloadedResources}` : ""}</span>
            </button>
          </div>

          <div className="tb-cluster" role="group" aria-label="Sortie">
            <button
              className="tb-btn"
              onClick={() => exportProjectCsv(project, schedule, portfolio.resources)}
              title="Exporter les tâches en CSV"
              aria-label="Exporter en CSV"
            >
              <DownloadIcon />
              <span className="tb-label tier1">Export CSV</span>
            </button>
            <Link
              className="tb-btn"
              to={`/projets/${project.id}/rapport`}
              title="Rapport flash pour comité"
              aria-label="Rapport flash"
            >
              <DocIcon />
              <span className="tb-label tier1">Rapport</span>
            </Link>
          </div>

          <div className="zoom-switch" role="group" aria-label="Échelle de temps">
            {ZOOMS.map((z, i) => (
              <button
                key={z.label}
                className={i === zoom ? "active" : ""}
                onClick={() => setZoom(i)}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>

        <div className="project-meta tnum">
          <span className="pm-owner">{project.manager}</span>
          <span className="pm-dot" />
          <span>
            {fmtDate(project.projectStart, true)} <span className="pm-arrow">→</span>{" "}
            {fmtDate(schedule.projectFinishDate, true)}
          </span>
          <span className="pm-dot" />
          <span>
            Budget {EUR.format(project.budget)}{" "}
            <span className="pm-sub">· plan {EUR.format(metrics.plannedCost)}</span>
          </span>
          <span className="pm-dot" />
          <span>{Math.round(metrics.percentComplete)} % réalisé</span>
          {metrics.criticalCount > 0 && (
            <span className="crit-count">
              {metrics.criticalCount} tâche{metrics.criticalCount > 1 ? "s" : ""} critique
              {metrics.criticalCount > 1 ? "s" : ""}
            </span>
          )}
          {overloadedResources > 0 && (
            <span className="overload-count">
              {overloadedResources} ressource{overloadedResources > 1 ? "s" : ""} en surcharge
            </span>
          )}
        </div>
      </div>

      <div className="evm-strip tnum">
        <div className="evm-chip" title="Budget At Completion : budget total approuvé pour l'ensemble du projet, tel que planifié à l'origine.">
          <span className="evm-label">BAC</span>
          <span className="evm-value">{EUR.format(metrics.bac)}</span>
        </div>
        <div
          className="evm-chip"
          title="Planned Value : coût du travail qui devrait être fait à la date du jour, selon le planning initial."
        >
          <span className="evm-label">VP (PV)</span>
          <span className="evm-value">{EUR.format(metrics.pv)}</span>
        </div>
        <div
          className="evm-chip"
          title="Earned Value : valeur budgétée du travail réellement accompli à ce jour (indépendant du coût réel dépensé)."
        >
          <span className="evm-label">VA (EV)</span>
          <span className="evm-value">{EUR.format(metrics.earnedValue)}</span>
        </div>
        <div
          className="evm-chip"
          title="Actual Cost : coût réellement dépensé à ce jour pour le travail accompli (issu des feuilles de temps et coûts saisis)."
        >
          <span className="evm-label">CR (AC)</span>
          <span className="evm-value">{EUR.format(metrics.ac)}</span>
        </div>
        <div className="evm-sep" />
        <div
          className="evm-chip"
          title="Indice de performance délais = VA ÷ VP. Égal à 1 : conforme au planning. En dessous de 1 : le projet avance plus lentement que prévu."
        >
          <span className="evm-label">IDP (SPI)</span>
          <span className={`evm-value ${evmClass(metrics.spi)}`}>{metrics.spi.toFixed(2)}</span>
        </div>
        <div
          className="evm-chip"
          title="Indice de performance coûts = VA ÷ CR. Égal à 1 : dans le budget. En dessous de 1 : le travail coûte plus cher que prévu."
        >
          <span className="evm-label">ICP (CPI)</span>
          <span className={`evm-value ${evmClass(metrics.cpi)}`}>{metrics.cpi.toFixed(2)}</span>
        </div>
        <div className="evm-sep" />
        <div
          className="evm-chip"
          title="Estimate At Completion = BAC ÷ ICP. Coût total désormais prévu à la fin du projet, compte tenu de la performance actuelle."
        >
          <span className="evm-label">EAC</span>
          <span className="evm-value">{EUR.format(metrics.eac)}</span>
        </div>
        <div
          className="evm-chip"
          title="Estimate To Complete = EAC − CR. Montant qu'il reste à dépenser pour terminer le projet."
        >
          <span className="evm-label">ETC</span>
          <span className={`evm-value ${metrics.etc < 0 ? "evm-good" : ""}`}>{EUR.format(metrics.etc)}</span>
        </div>
      </div>

      <div className="project-split">
        <div className="grid-pane">
          <div className="grid-head tnum">
            <span style={{ width: 44 }} className="h num">
              N°
            </span>
            <span className="h grow">Tâche</span>
            <span style={{ width: 52 }} className="h num">
              Durée
            </span>
            <span style={{ width: 62 }} className="h num">
              Début
            </span>
            <span style={{ width: 62 }} className="h num">
              Fin
            </span>
            <span style={{ width: 44 }} className="h num">
              %
            </span>
            {showVariance && (
              <>
                <span style={{ width: 52 }} className="h num">Δdébut</span>
                <span style={{ width: 52 }} className="h num">Δfin</span>
                <span style={{ width: 58 }} className="h num">CV%</span>
              </>
            )}
          </div>
          <div className="grid-body" ref={gridBodyRef}>
            <TaskGrid
              project={project}
              schedule={schedule}
              visibleIds={visibleIds}
              collapsed={collapsed}
              selectedTaskId={selectedTaskId}
              onToggle={toggleCollapse}
              onSelect={selectTask}
              onUpdate={(taskId, patch) => updateTask(project.id, taskId, patch)}
              showVariance={showVariance}
              resources={portfolio.resources}
            />
            <div style={{ height: 16 }} />
          </div>
        </div>

        <div className="gantt-pane">
          <div className="gantt-head" ref={ganttHeadRef}>
            <GanttHeader range={range} dayWidth={dw} />
          </div>
          <div className="gantt-body" onScroll={onGanttScroll}>
            <Gantt
              project={project}
              schedule={schedule}
              visibleIds={visibleIds}
              range={range}
              dayWidth={dw}
              calendar={portfolio.calendar}
              resources={portfolio.resources}
              selectedTaskId={selectedTaskId}
              onSelect={selectTask}
              todayISO={today}
              showBaseline={showVariance}
            />
            <div style={{ height: 16, width: range.days * dw }} />
          </div>
        </div>

        {selectedTask && (
          <TaskInspector
            project={project}
            schedule={schedule}
            task={selectedTask}
            resources={portfolio.resources}
            customFields={portfolio.customFields ?? []}
            onClose={() => selectTask(null)}
            onUpdate={(taskId, patch) => updateTask(project.id, taskId, patch)}
            onUpdateActualCost={(taskId, cost) => updateActualCost(project.id, taskId, cost)}
            onAddDependency={(predId, type, lag) =>
              addDependency(project.id, { predecessorId: predId, successorId: selectedTask.id, type, lag })
            }
            onRemoveDependency={(predId) => removeDependency(project.id, predId, selectedTask.id)}
            onSelect={selectTask}
          />
        )}
      </div>

      <div className="project-hint">
        Double-clic sur nom, durée ou % pour éditer : le planning recalcule aussitôt. Rouge = chemin
        critique.
      </div>
    </>
  );
}
