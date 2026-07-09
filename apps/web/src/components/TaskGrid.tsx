import { useEffect, useMemo, useRef, useState } from "react";
import {
  taskPlannedCost,
  type CalendarDef,
  type Resource,
  type ScheduleResult,
  type Task,
} from "@atelier/scheduling-engine";
import { durationCustomFields, formatTaskDuration } from "../duration";
import { fmtDate, todayISO, type Project } from "../domain";
import { canEditTaskPercent, progressDiverges, scheduledPercentOf } from "../progress";

interface Props {
  project: Project;
  schedule: ScheduleResult;
  calendar?: CalendarDef;
  visibleIds: string[];
  collapsed: Record<string, boolean>;
  selectedTaskId: string | null;
  onToggle: (taskId: string) => void;
  onSelect: (taskId: string) => void;
  onUpdate: (taskId: string, patch: Partial<Task>) => void;
  onReorder?: (taskId: string, newIndex: number) => void;
  showVariance?: boolean;
  resources?: Resource[];
}

interface EditState {
  taskId: string;
  field: "name" | "duration" | "percentComplete";
}

function EditableCell({
  value,
  numeric,
  onCommit,
  onCancel,
}: {
  value: string;
  numeric?: boolean;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="cell-input"
      defaultValue={value}
      inputMode={numeric ? "numeric" : undefined}
      onBlur={(e) => onCommit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(e.currentTarget.value);
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}

function calDayDiff(current: string, baseline: string): number {
  const dc = new Date(current + "T00:00:00Z");
  const db = new Date(baseline + "T00:00:00Z");
  return Math.round((dc.getTime() - db.getTime()) / 86400000);
}

function fmtDayDiff(d: number): string {
  if (d === 0) return "±0";
  return d > 0 ? `+${d} j` : `${d} j`;
}

export function TaskGrid({
  project,
  schedule,
  calendar,
  visibleIds,
  collapsed,
  selectedTaskId,
  onToggle,
  onSelect,
  onUpdate,
  onReorder,
  showVariance = false,
  resources,
}: Props) {
  const [edit, setEdit] = useState<EditState | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; place: "before" | "after" } | null>(null);
  const tasksById = new Map(project.tasks.map((t) => [t.id, t]));
  const canReorder = !!onReorder;
  const statusDate = project.evmStatusDate ?? todayISO();
  const cal = calendar ?? { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] as string[] };

  const resourceMap = useMemo(
    () => new Map((resources ?? []).map((r) => [r.id, r])),
    [resources],
  );

  function commit(task: Task, field: EditState["field"], raw: string) {
    setEdit(null);
    if (field === "name") {
      const name = raw.trim();
      if (name && name !== task.name) onUpdate(task.id, { name });
      return;
    }
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n)) return;
    if (field === "duration" && n >= 0 && n !== task.duration) {
      if (n === 0) {
        const start = schedule.tasks.get(task.id)?.startDate;
        onUpdate(task.id, {
          duration: 0,
          custom: { ...task.custom, ...durationCustomFields(0) },
          ...(start ? { constraint: { type: "MSO", date: start } } : {}),
        });
      } else {
        onUpdate(task.id, {
          duration: n,
          custom: { ...task.custom, ...durationCustomFields(n) },
        });
      }
    }
    if (field === "percentComplete") {
      const pct = Math.max(0, Math.min(100, Math.round(n)));
      if (pct !== task.percentComplete) onUpdate(task.id, { percentComplete: pct });
    }
  }

  function applyDrop(targetId: string, place: "before" | "after") {
    if (!onReorder || !dragId || dragId === targetId) return;
    const dragged = tasksById.get(dragId);
    const target = tasksById.get(targetId);
    if (!dragged || !target || dragged.parentId !== target.parentId) return;

    const siblings = project.tasks
      .filter((t) => t.parentId === dragged.parentId)
      .sort((a, b) => a.order - b.order);
    const from = siblings.findIndex((t) => t.id === dragId);
    let to = siblings.findIndex((t) => t.id === targetId);
    if (from < 0 || to < 0) return;
    if (place === "after") to += 1;
    // After removal of `from`, indices ≥ from shift left.
    if (from < to) to -= 1;
    if (from === to) return;
    onReorder(dragId, to);
  }

  return (
    <table className="task-grid">
      <colgroup>
        {canReorder && <col style={{ width: 28 }} />}
        <col style={{ width: 44 }} />
        <col />
        <col style={{ width: 52 }} />
        <col style={{ width: 62 }} />
        <col style={{ width: 62 }} />
        <col style={{ width: 44 }} />
        {showVariance && (
          <>
            <col style={{ width: 52 }} />
            <col style={{ width: 52 }} />
            <col style={{ width: 58 }} />
          </>
        )}
      </colgroup>
      <tbody>
        {visibleIds.map((id) => {
          const task = tasksById.get(id);
          const s = schedule.tasks.get(id);
          if (!task || !s) return null;
          const selected = selectedTaskId === id;
          const isEditing = (f: EditState["field"]) => edit?.taskId === id && edit.field === f;
          const dropBefore = dropTarget?.id === id && dropTarget.place === "before";
          const dropAfter = dropTarget?.id === id && dropTarget.place === "after";

          let deltaDeb = "—";
          let deltaFin = "—";
          let cvPct = 0;
          let hasCv = false;

          if (showVariance && !s.isSummary && task.baseline) {
            deltaDeb = fmtDayDiff(calDayDiff(s.startDate, task.baseline.start));
            deltaFin = fmtDayDiff(calDayDiff(s.finishDate, task.baseline.finish));
            if (resources) {
              const cost = taskPlannedCost(task, s.duration, resourceMap);
              const ev = (cost * task.percentComplete) / 100;
              const ac = task.actualCost ?? ev;
              cvPct = cost > 0 ? ((ev - ac) / cost) * 100 : 0;
              hasCv = true;
            }
          }

          return (
            <tr
              key={id}
              className={[
                s.isSummary ? "summary" : "",
                s.critical && !s.isSummary ? "critical" : "",
                selected ? "selected" : "",
                dragId === id ? "dragging" : "",
                dropBefore ? "drop-before" : "",
                dropAfter ? "drop-after" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelect(id)}
              onDragOver={
                canReorder && dragId
                  ? (e) => {
                      const dragged = tasksById.get(dragId);
                      if (!dragged || dragged.parentId !== task.parentId || dragId === id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const place = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                      setDropTarget({ id, place });
                    }
                  : undefined
              }
              onDragLeave={
                canReorder
                  ? () => {
                      setDropTarget((cur) => (cur?.id === id ? null : cur));
                    }
                  : undefined
              }
              onDrop={
                canReorder
                  ? (e) => {
                      e.preventDefault();
                      const place = dropTarget?.id === id ? dropTarget.place : "before";
                      applyDrop(id, place);
                      setDragId(null);
                      setDropTarget(null);
                    }
                  : undefined
              }
            >
              {canReorder && (
                <td className="drag-cell">
                  <span
                    className="drag-handle"
                    draggable
                    title="Glisser pour réordonner"
                    aria-label="Réordonner"
                    onClick={(e) => e.stopPropagation()}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", id);
                      setDragId(id);
                      onSelect(id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropTarget(null);
                    }}
                  >
                    ⋮⋮
                  </span>
                </td>
              )}
              <td className="wbs num">{s.wbs}</td>
              <td className="name" style={{ paddingLeft: 10 + s.level * 16 }}>
                {s.isSummary ? (
                  <button
                    className={`chevron${collapsed[id] ? " closed" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(id);
                    }}
                    aria-label={collapsed[id] ? "Déplier" : "Replier"}
                  >
                    ▾
                  </button>
                ) : (
                  <span className="chevron-spacer" />
                )}
                {s.isMilestone && <span className="ms-mark">◆</span>}
                {isEditing("name") ? (
                  <EditableCell
                    value={task.name}
                    onCommit={(v) => commit(task, "name", v)}
                    onCancel={() => setEdit(null)}
                  />
                ) : (
                  <span
                    className="name-text"
                    onDoubleClick={() => setEdit({ taskId: id, field: "name" })}
                    title={task.name}
                  >
                    {task.name}
                  </span>
                )}
              </td>
              <td className="num">
                {s.isSummary ? (
                  <span className="ro">{s.duration} j</span>
                ) : isEditing("duration") ? (
                  <EditableCell
                    value={String(task.duration)}
                    numeric
                    onCommit={(v) => commit(task, "duration", v)}
                    onCancel={() => setEdit(null)}
                  />
                ) : (
                  <span onDoubleClick={() => setEdit({ taskId: id, field: "duration" })}>
                    {formatTaskDuration(task)}
                  </span>
                )}
              </td>
              <td className="num">{fmtDate(s.startDate)}</td>
              <td className="num">{fmtDate(s.finishDate)}</td>
              <td className="num">
                {(() => {
                  const pctEditable = canEditTaskPercent(project, schedule, id);
                  if (s.isSummary) return <span className="ro" />;
                  if (isEditing("percentComplete") && pctEditable) {
                    return (
                      <EditableCell
                        value={String(task.percentComplete)}
                        numeric
                        onCommit={(v) => commit(task, "percentComplete", v)}
                        onCancel={() => setEdit(null)}
                      />
                    );
                  }
                  return (
                    <span
                      className={!pctEditable ? "ro" : undefined}
                      title={
                        progressDiverges(task, schedule, cal, project.projectStart, statusDate)
                          ? `Planifié ${scheduledPercentOf(task, schedule, cal, project.projectStart, statusDate)} % à la date de statut`
                          : !pctEditable
                            ? "Avancement guidé (mode projet)"
                            : undefined
                      }
                      onDoubleClick={() => {
                        if (pctEditable) setEdit({ taskId: id, field: "percentComplete" });
                      }}
                    >
                      {task.percentComplete} %
                      {progressDiverges(task, schedule, cal, project.projectStart, statusDate) && (
                        <span className="pct-diverge" aria-label="Diverge du planning">
                          {" "}
                          ≠
                        </span>
                      )}
                    </span>
                  );
                })()}
              </td>
              {showVariance && (
                <>
                  <td className="num var-cell">{deltaDeb}</td>
                  <td className="num var-cell">{deltaFin}</td>
                  <td className={`num var-cell${hasCv ? (cvPct > 0 ? " evm-good" : cvPct < 0 ? " evm-bad" : "") : ""}`}>
                    {hasCv ? `${cvPct >= 0 ? "+" : ""}${cvPct.toFixed(1)} %` : "—"}
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
