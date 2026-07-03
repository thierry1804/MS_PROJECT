import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { detectOverallocations } from "@atelier/scheduling-engine";
import { Gantt, GanttHeader } from "../components/Gantt";
import { TaskGrid } from "../components/TaskGrid";
import { TaskInspector } from "../components/TaskInspector";
import { HealthBadge, StatusBadge } from "../components/badges";
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
        <div>
          <div className="project-title-row">
            <h1>{project.name}</h1>
            <span className="project-code tnum">{project.code}</span>
            <StatusBadge status={project.status} />
            <HealthBadge health={project.health} />
          </div>
          <div className="project-meta tnum">
            <span>{project.manager}</span>
            <span>
              {fmtDate(project.projectStart, true)} → {fmtDate(schedule.projectFinishDate, true)}
            </span>
            <span>
              Budget {EUR.format(project.budget)} · plan {EUR.format(metrics.plannedCost)}
            </span>
            <span>{Math.round(metrics.percentComplete)} % réalisé</span>
            <span className="crit-count">{metrics.criticalCount} tâches critiques</span>
            {overloadedResources > 0 && (
              <span className="overload-count">
                {overloadedResources} ressource{overloadedResources > 1 ? "s" : ""} en surcharge
              </span>
            )}
          </div>
        </div>
        <div className="project-toolbar">
          <button
            className="toolbar-btn"
            onClick={() => captureBaseline(project.id)}
            title="Capturer la baseline pour le suivi des écarts"
          >
            {project.baselineCapturedAt ? `Baseline : ${fmtDate(project.baselineCapturedAt)}` : "Capturer baseline"}
          </button>
          <button
            className={`toolbar-btn${showVariance ? " active" : ""}`}
            onClick={() => setShowVariance((v) => !v)}
            title="Afficher les colonnes d'écart planning et coût, et la baseline sur le Gantt"
          >
            Écarts {showVariance ? "▴" : "▾"}
          </button>
          <button
            className="toolbar-btn"
            onClick={() => exportProjectCsv(project, schedule, portfolio.resources)}
            title="Exporter les tâches en CSV"
          >
            Export CSV
          </button>
          <button
            className={`toolbar-btn${overloadedResources > 0 ? " warn" : ""}`}
            onClick={() => applyLeveling(project.id)}
            disabled={overloadedResources === 0}
            title="Niveler : décale les tâches pour résorber les surcharges de ressources"
          >
            Niveler{overloadedResources > 0 ? ` (${overloadedResources})` : ""}
          </button>
          <Link className="toolbar-btn" to={`/projets/${project.id}/rapport`} title="Rapport flash pour comité">
            Rapport
          </Link>
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
      </div>

      <div className="evm-strip tnum">
        <div className="evm-chip">
          <span className="evm-label">BAC</span>
          <span className="evm-value">{EUR.format(metrics.bac)}</span>
        </div>
        <div className="evm-chip">
          <span className="evm-label">VP (PV)</span>
          <span className="evm-value">{EUR.format(metrics.pv)}</span>
        </div>
        <div className="evm-chip">
          <span className="evm-label">VA (EV)</span>
          <span className="evm-value">{EUR.format(metrics.earnedValue)}</span>
        </div>
        <div className="evm-chip">
          <span className="evm-label">CR (AC)</span>
          <span className="evm-value">{EUR.format(metrics.ac)}</span>
        </div>
        <div className="evm-sep" />
        <div className="evm-chip">
          <span className="evm-label">IDP (SPI)</span>
          <span className={`evm-value ${evmClass(metrics.spi)}`}>{metrics.spi.toFixed(2)}</span>
        </div>
        <div className="evm-chip">
          <span className="evm-label">ICP (CPI)</span>
          <span className={`evm-value ${evmClass(metrics.cpi)}`}>{metrics.cpi.toFixed(2)}</span>
        </div>
        <div className="evm-sep" />
        <div className="evm-chip">
          <span className="evm-label">EAC</span>
          <span className="evm-value">{EUR.format(metrics.eac)}</span>
        </div>
        <div className="evm-chip">
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
