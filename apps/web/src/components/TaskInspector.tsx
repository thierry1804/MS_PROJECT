import { useMemo, useState } from "react";
import {
  taskPlannedCost,
  type ConstraintType,
  type DependencyType,
  type Resource,
  type ScheduleResult,
  type Task,
} from "@atelier/scheduling-engine";
import { EUR, fmtDate, type CustomFieldDef, type Project } from "../domain";

const DEP_LABELS: Record<DependencyType, string> = {
  FS: "Fin → Début",
  SS: "Début → Début",
  FF: "Fin → Fin",
  SF: "Début → Fin",
};

const CONSTRAINT_LABELS: Record<ConstraintType, string> = {
  ASAP: "Dès que possible",
  SNET: "Pas avant le",
  MSO: "Doit démarrer le",
};

interface Props {
  project: Project;
  schedule: ScheduleResult;
  task: Task;
  resources: Resource[];
  customFields: CustomFieldDef[];
  onClose: () => void;
  onUpdate: (taskId: string, patch: Partial<Task>) => void;
  onUpdateActualCost: (taskId: string, cost: number) => void;
  onAddDependency: (predecessorId: string, type: DependencyType, lag: number) => void;
  onRemoveDependency: (predecessorId: string) => void;
  onSelect: (taskId: string) => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="insp-section">
      <h3 className="insp-h">{title}</h3>
      {children}
    </section>
  );
}

export function TaskInspector({
  project,
  schedule,
  task,
  resources,
  customFields,
  onClose,
  onUpdate,
  onUpdateActualCost,
  onAddDependency,
  onRemoveDependency,
  onSelect,
}: Props) {
  const s = schedule.tasks.get(task.id);
  const resById = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
  const taskById = useMemo(() => new Map(project.tasks.map((t) => [t.id, t])), [project.tasks]);

  const [newPredId, setNewPredId] = useState("");
  const [newPredType, setNewPredType] = useState<DependencyType>("FS");
  const [newResId, setNewResId] = useState("");

  if (!s) return null;

  const isLeaf = !s.isSummary;
  const plannedCost = taskPlannedCost(task, s.duration, resById);
  const ev = (plannedCost * task.percentComplete) / 100;
  const ac = task.actualCost ?? ev;

  const predecessors = project.dependencies.filter((d) => d.successorId === task.id);
  const predIds = new Set(predecessors.map((d) => d.predecessorId));
  const assignedIds = new Set(task.assignments.map((a) => a.resourceId));

  // Summary tasks (those that are parents) and this task's ancestor/descendant chains:
  // linking to any of them would create a parent↔child cycle in the schedule.
  const summaryIds = new Set(project.tasks.map((t) => t.parentId).filter(Boolean) as string[]);
  const ancestors = new Set<string>();
  for (let p = task.parentId; p; p = taskById.get(p)?.parentId ?? null) ancestors.add(p);
  const descendants = new Set<string>();
  const walk = (id: string) => {
    for (const c of project.tasks) {
      if (c.parentId === id && !descendants.has(c.id)) {
        descendants.add(c.id);
        walk(c.id);
      }
    }
  };
  walk(task.id);

  // Candidate predecessors: leaf tasks that aren't self, already-linked, or in the family chain.
  const candidatePreds = project.tasks.filter(
    (t) =>
      t.id !== task.id &&
      !predIds.has(t.id) &&
      !summaryIds.has(t.id) &&
      !ancestors.has(t.id) &&
      !descendants.has(t.id),
  );
  const candidateResources = resources.filter((r) => !assignedIds.has(r.id));

  const constraintType: ConstraintType = task.constraint?.type ?? "ASAP";

  function setConstraintType(type: ConstraintType) {
    if (type === "ASAP") onUpdate(task.id, { constraint: undefined });
    else onUpdate(task.id, { constraint: { type, date: task.constraint?.date ?? s!.startDate } });
  }

  function setConstraintDate(date: string) {
    if (constraintType === "ASAP" || !date) return;
    onUpdate(task.id, { constraint: { type: constraintType, date } });
  }

  function setUnits(resourceId: string, units: number) {
    const assignments = task.assignments.map((a) =>
      a.resourceId === resourceId ? { ...a, units } : a,
    );
    onUpdate(task.id, { assignments });
  }

  function removeAssignment(resourceId: string) {
    onUpdate(task.id, { assignments: task.assignments.filter((a) => a.resourceId !== resourceId) });
  }

  function addAssignment() {
    if (!newResId || assignedIds.has(newResId)) return;
    onUpdate(task.id, { assignments: [...task.assignments, { resourceId: newResId, units: 1 }] });
    setNewResId("");
  }

  function changeDepType(predecessorId: string, type: DependencyType) {
    // Re-add replaces via remove + add to keep store action surface small.
    onRemoveDependency(predecessorId);
    onAddDependency(predecessorId, type, 0);
  }

  function addPredecessor() {
    if (!newPredId) return;
    onAddDependency(newPredId, newPredType, 0);
    setNewPredId("");
    setNewPredType("FS");
  }

  return (
    <aside className="inspector" aria-label="Détails de la tâche">
      <header className="insp-head">
        <span className="insp-wbs tnum">{s.wbs}</span>
        <input
          key={`${task.id}-name`}
          className="insp-name"
          defaultValue={task.name}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== task.name) onUpdate(task.id, { name: v });
          }}
        />
        <button className="insp-close" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </header>

      <div className="insp-tags">
        {s.isSummary && <span className="insp-tag">Récapitulatif</span>}
        {s.isMilestone && <span className="insp-tag milestone">Jalon</span>}
        {s.critical && <span className="insp-tag critical">Chemin critique</span>}
        {!s.critical && isLeaf && <span className="insp-tag slack">Marge {s.slack} j</span>}
      </div>

      <div className="insp-scroll">
        <Section title="Planning">
          <div className="insp-dates tnum">
            <div>
              <span className="insp-k">Début</span>
              <span className="insp-v">{fmtDate(s.startDate, true)}</span>
            </div>
            <span className="insp-arrow">→</span>
            <div>
              <span className="insp-k">Fin</span>
              <span className="insp-v">{fmtDate(s.finishDate, true)}</span>
            </div>
          </div>
          {isLeaf && !s.isMilestone && (
            <div className="insp-row">
              <label className="insp-field">
                <span className="insp-k">Durée (j)</span>
                <input
                  key={`${task.id}-dur`}
                  type="number"
                  min={0}
                  className="insp-input tnum"
                  defaultValue={task.duration}
                  onBlur={(e) => {
                    const n = Math.round(Number(e.currentTarget.value));
                    if (Number.isFinite(n) && n >= 0 && n !== task.duration)
                      onUpdate(task.id, { duration: n });
                  }}
                />
              </label>
              <label className="insp-field">
                <span className="insp-k">Avancement (%)</span>
                <input
                  key={`${task.id}-pct`}
                  type="number"
                  min={0}
                  max={100}
                  className="insp-input tnum"
                  defaultValue={task.percentComplete}
                  onBlur={(e) => {
                    const n = Math.max(0, Math.min(100, Math.round(Number(e.currentTarget.value))));
                    if (Number.isFinite(n) && n !== task.percentComplete)
                      onUpdate(task.id, { percentComplete: n });
                  }}
                />
              </label>
            </div>
          )}
          {s.isMilestone && (
            <label className="insp-check">
              <input
                type="checkbox"
                checked={task.percentComplete >= 100}
                onChange={(e) => onUpdate(task.id, { percentComplete: e.target.checked ? 100 : 0 })}
              />
              Jalon atteint
            </label>
          )}
        </Section>

        {isLeaf && (
          <Section title="Contrainte">
            <div className="insp-row">
              <select
                className="insp-select"
                value={constraintType}
                onChange={(e) => setConstraintType(e.target.value as ConstraintType)}
              >
                {(Object.keys(CONSTRAINT_LABELS) as ConstraintType[]).map((c) => (
                  <option key={c} value={c}>
                    {CONSTRAINT_LABELS[c]}
                  </option>
                ))}
              </select>
              {constraintType !== "ASAP" && (
                <input
                  key={`${task.id}-cdate`}
                  type="date"
                  className="insp-input tnum"
                  defaultValue={task.constraint?.date ?? s.startDate}
                  onChange={(e) => setConstraintDate(e.target.value)}
                />
              )}
            </div>
          </Section>
        )}

        {isLeaf && (
          <Section title="Ressources">
            {task.assignments.length === 0 && <p className="insp-empty">Aucune affectation.</p>}
            <ul className="insp-list">
              {task.assignments.map((a) => {
                const r = resById.get(a.resourceId);
                return (
                  <li key={a.resourceId} className="insp-assign">
                    <span className="insp-assign-name">{r?.name ?? a.resourceId}</span>
                    <input
                      type="number"
                      min={0}
                      step={10}
                      className="insp-input mini tnum"
                      value={Math.round(a.units * 100)}
                      onChange={(e) => setUnits(a.resourceId, Math.max(0, Number(e.target.value)) / 100)}
                    />
                    <span className="insp-pct">%</span>
                    <button
                      className="insp-del"
                      onClick={() => removeAssignment(a.resourceId)}
                      aria-label="Retirer"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
            {candidateResources.length > 0 && (
              <div className="insp-add">
                <select
                  className="insp-select grow"
                  value={newResId}
                  onChange={(e) => setNewResId(e.target.value)}
                >
                  <option value="">Ajouter une ressource…</option>
                  {candidateResources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.role ?? r.kind}
                    </option>
                  ))}
                </select>
                <button className="insp-add-btn" onClick={addAssignment} disabled={!newResId}>
                  +
                </button>
              </div>
            )}
          </Section>
        )}

        {isLeaf && (
          <Section title="Prédécesseurs">
            {predecessors.length === 0 && <p className="insp-empty">Aucun lien entrant.</p>}
            <ul className="insp-list">
              {predecessors.map((d) => {
                const pt = taskById.get(d.predecessorId);
                return (
                  <li key={d.predecessorId} className="insp-dep">
                    <button
                      className="insp-dep-name"
                      onClick={() => onSelect(d.predecessorId)}
                      title="Aller à la tâche"
                    >
                      {pt?.name ?? d.predecessorId}
                    </button>
                    <select
                      className="insp-select mini"
                      value={d.type}
                      onChange={(e) => changeDepType(d.predecessorId, e.target.value as DependencyType)}
                    >
                      {(Object.keys(DEP_LABELS) as DependencyType[]).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <button
                      className="insp-del"
                      onClick={() => onRemoveDependency(d.predecessorId)}
                      aria-label="Supprimer le lien"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
            {candidatePreds.length > 0 && (
              <div className="insp-add">
                <select
                  className="insp-select grow"
                  value={newPredId}
                  onChange={(e) => setNewPredId(e.target.value)}
                >
                  <option value="">Ajouter un prédécesseur…</option>
                  {candidatePreds.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select
                  className="insp-select mini"
                  value={newPredType}
                  onChange={(e) => setNewPredType(e.target.value as DependencyType)}
                >
                  {(Object.keys(DEP_LABELS) as DependencyType[]).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button className="insp-add-btn" onClick={addPredecessor} disabled={!newPredId}>
                  +
                </button>
              </div>
            )}
          </Section>
        )}

        {isLeaf && (
          <Section title="Coûts">
            <div className="insp-cost tnum">
              <div>
                <span className="insp-k">Coût planifié</span>
                <span className="insp-v">{EUR.format(plannedCost)}</span>
              </div>
              <div>
                <span className="insp-k">Valeur acquise</span>
                <span className="insp-v">{EUR.format(ev)}</span>
              </div>
              {task.baseline && (
                <div>
                  <span className="insp-k">Coût baseline</span>
                  <span className="insp-v">{EUR.format(task.baseline.cost)}</span>
                </div>
              )}
              <label className="insp-field">
                <span className="insp-k">Coût réel (CR)</span>
                <input
                  key={`${task.id}-ac`}
                  type="number"
                  min={0}
                  className="insp-input tnum"
                  defaultValue={Math.round(ac)}
                  onBlur={(e) => {
                    const n = Number(e.currentTarget.value);
                    if (Number.isFinite(n) && n >= 0) onUpdateActualCost(task.id, n);
                  }}
                />
              </label>
            </div>
          </Section>
        )}

        {customFields.length > 0 && (
          <Section title="Champs personnalisés">
            <div className="insp-cf">
              {customFields.map((f) => {
                const val = task.custom?.[f.id] ?? "";
                const set = (v: string | number) =>
                  onUpdate(task.id, { custom: { ...(task.custom ?? {}), [f.id]: v } });
                return (
                  <label key={f.id} className="insp-field">
                    <span className="insp-k">{f.name}</span>
                    {f.type === "select" ? (
                      <select className="insp-select" value={String(val)} onChange={(e) => set(e.target.value)}>
                        <option value="">—</option>
                        {(f.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        key={`${task.id}-${f.id}`}
                        className="insp-input"
                        type={f.type === "number" ? "number" : "text"}
                        defaultValue={String(val)}
                        onBlur={(e) => {
                          const raw = e.currentTarget.value;
                          set(f.type === "number" ? Number(raw) || 0 : raw);
                        }}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </Section>
        )}

        <Section title="Notes">
          <textarea
            key={`${task.id}-notes`}
            className="insp-notes"
            defaultValue={task.notes ?? ""}
            placeholder="Contexte, hypothèses, points d'attention…"
            onBlur={(e) => {
              const v = e.currentTarget.value;
              if (v !== (task.notes ?? "")) onUpdate(task.id, { notes: v || undefined });
            }}
          />
        </Section>
      </div>
    </aside>
  );
}
