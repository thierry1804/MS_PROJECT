import { useEffect, useMemo, useRef, useState } from "react";
import { taskPlannedCost, type Resource, type ScheduleResult, type Task } from "@atelier/scheduling-engine";
import { fmtDate } from "../domain";
import type { Project } from "../domain";

interface Props {
  project: Project;
  schedule: ScheduleResult;
  visibleIds: string[];
  collapsed: Record<string, boolean>;
  selectedTaskId: string | null;
  onToggle: (taskId: string) => void;
  onSelect: (taskId: string) => void;
  onUpdate: (taskId: string, patch: Partial<Task>) => void;
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
  visibleIds,
  collapsed,
  selectedTaskId,
  onToggle,
  onSelect,
  onUpdate,
  showVariance = false,
  resources,
}: Props) {
  const [edit, setEdit] = useState<EditState | null>(null);
  const tasksById = new Map(project.tasks.map((t) => [t.id, t]));

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
    if (field === "duration" && n >= 0 && n !== task.duration) onUpdate(task.id, { duration: Math.round(n) });
    if (field === "percentComplete") {
      const pct = Math.max(0, Math.min(100, Math.round(n)));
      if (pct !== task.percentComplete) onUpdate(task.id, { percentComplete: pct });
    }
  }

  return (
    <table className="task-grid">
      <colgroup>
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
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelect(id)}
            >
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
                    {task.duration} j
                  </span>
                )}
              </td>
              <td className="num">{fmtDate(s.startDate)}</td>
              <td className="num">{fmtDate(s.finishDate)}</td>
              <td className="num">
                {s.isSummary || s.isMilestone ? (
                  <span className="ro">{s.isSummary ? "" : `${task.percentComplete} %`}</span>
                ) : isEditing("percentComplete") ? (
                  <EditableCell
                    value={String(task.percentComplete)}
                    numeric
                    onCommit={(v) => commit(task, "percentComplete", v)}
                    onCancel={() => setEdit(null)}
                  />
                ) : (
                  <span onDoubleClick={() => setEdit({ taskId: id, field: "percentComplete" })}>
                    {task.percentComplete} %
                  </span>
                )}
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
