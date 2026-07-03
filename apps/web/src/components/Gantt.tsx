import { Fragment, useMemo } from "react";
import type { CalendarDef, Resource, ScheduleResult } from "@atelier/scheduling-engine";
import type { Project } from "../domain";
import {
  dayOffset,
  monthBands,
  nonWorkingOffsets,
  offsetToUTC,
  weekStarts,
  type TimeRange,
} from "../gantt-utils";

export const ROW_H = 32;
const BAR_H = 18;
const BAR_Y = (ROW_H - BAR_H) / 2;

interface BarGeom {
  x: number;
  w: number;
  cy: number;
  row: number;
}

interface Props {
  project: Project;
  schedule: ScheduleResult;
  visibleIds: string[];
  range: TimeRange;
  dayWidth: number;
  calendar: CalendarDef;
  resources: Resource[];
  selectedTaskId: string | null;
  onSelect: (id: string) => void;
  todayISO: string;
  /** Draw captured baseline bars beneath each task bar. */
  showBaseline?: boolean;
}

/** Orthogonal dependency path. exit/enter: +1 = rightward, -1 = leftward. */
function elbow(x1: number, y1: number, x2: number, y2: number, exit: 1 | -1, enter: 1 | -1): string {
  const sx = x1 + 10 * exit;
  const ex = x2 - 10 * enter;
  const direct = enter === 1 ? sx <= ex : sx >= ex;
  if (direct) return `M ${x1} ${y1} H ${sx} V ${y2} H ${x2}`;
  const detourY = y1 + (y2 >= y1 ? ROW_H / 2 : -ROW_H / 2);
  return `M ${x1} ${y1} H ${sx} V ${detourY} H ${ex} V ${y2} H ${x2}`;
}

export function GanttHeader({ range, dayWidth }: { range: TimeRange; dayWidth: number }) {
  const width = range.days * dayWidth;
  const months = monthBands(range, dayWidth < 10);
  const weeks = weekStarts(range);
  return (
    <svg width={width} height={48} className="gantt-header-svg">
      {months.map((m) => (
        <Fragment key={m.offset}>
          <line
            x1={m.offset * dayWidth}
            y1={0}
            x2={m.offset * dayWidth}
            y2={48}
            stroke="var(--paper-2)"
          />
          {m.days * dayWidth >= 52 && (
            <text x={m.offset * dayWidth + 8} y={16} className="gantt-month">
              {m.label}
            </text>
          )}
        </Fragment>
      ))}
      {dayWidth >= 5 &&
        weeks.map((w) => (
          <Fragment key={w}>
            <line x1={w * dayWidth} y1={26} x2={w * dayWidth} y2={48} stroke="var(--paper-2)" />
            <text x={w * dayWidth + 4} y={41} className="gantt-day">
              {new Date(offsetToUTC(range, w)).getUTCDate()}
            </text>
          </Fragment>
        ))}
    </svg>
  );
}

export function Gantt({
  project,
  schedule,
  visibleIds,
  range,
  dayWidth,
  calendar,
  resources,
  selectedTaskId,
  onSelect,
  todayISO,
  showBaseline = false,
}: Props) {
  const dw = dayWidth;
  const width = range.days * dw;
  const height = visibleIds.length * ROW_H;
  const resourceById = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
  const tasksById = useMemo(() => new Map(project.tasks.map((t) => [t.id, t])), [project.tasks]);

  const geoms = new Map<string, BarGeom>();
  visibleIds.forEach((id, row) => {
    const s = schedule.tasks.get(id);
    if (!s) return;
    const x = dayOffset(range, s.startDate) * dw;
    const endOff = dayOffset(range, s.finishDate) + 1;
    const w = Math.max(dw * 0.5, endOff * dw - x);
    geoms.set(id, { x, w, cy: row * ROW_H + ROW_H / 2, row });
  });

  const nonWorking = useMemo(() => nonWorkingOffsets(range, calendar), [range, calendar]);
  const weeks = useMemo(() => weekStarts(range), [range]);
  const todayX = dayOffset(range, todayISO) * dw;

  return (
    <svg width={width} height={height} className="gantt-svg">
      <defs>
        <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--ink-3)" />
        </marker>
        <marker id="arr-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--critical)" />
        </marker>
      </defs>

      {/* Fond : jours chômés */}
      {nonWorking.map((o) => (
        <rect key={o} x={o * dw} y={0} width={dw} height={height} fill="var(--weekend)" />
      ))}

      {/* Trames verticales hebdo + lignes de rangée */}
      {dw >= 3 &&
        weeks.map((w) => (
          <line key={w} x1={w * dw} y1={0} x2={w * dw} y2={height} stroke="var(--paper-2)" strokeWidth={1} />
        ))}
      {visibleIds.map((_, i) => (
        <line
          key={i}
          x1={0}
          y1={(i + 1) * ROW_H}
          x2={width}
          y2={(i + 1) * ROW_H}
          stroke="var(--paper-2)"
          strokeWidth={0.5}
        />
      ))}

      {/* Sélection */}
      {selectedTaskId && geoms.has(selectedTaskId) && (
        <rect
          x={0}
          y={geoms.get(selectedTaskId)!.row * ROW_H}
          width={width}
          height={ROW_H}
          fill="var(--accent-soft)"
          opacity={0.55}
        />
      )}

      {/* Liens */}
      {project.dependencies.map((dep, i) => {
        const from = geoms.get(dep.predecessorId);
        const to = geoms.get(dep.successorId);
        const sPred = schedule.tasks.get(dep.predecessorId);
        const sSucc = schedule.tasks.get(dep.successorId);
        if (!from || !to || !sPred || !sSucc) return null;
        const critical = sPred.critical && sSucc.critical;
        let x1: number, x2: number, exit: 1 | -1, enter: 1 | -1;
        switch (dep.type) {
          case "FS": x1 = from.x + from.w; x2 = to.x; exit = 1; enter = 1; break;
          case "SS": x1 = from.x; x2 = to.x; exit = -1; enter = 1; break;
          case "FF": x1 = from.x + from.w; x2 = to.x + to.w; exit = 1; enter = -1; break;
          case "SF": x1 = from.x; x2 = to.x + to.w; exit = -1; enter = -1; break;
        }
        return (
          <path
            key={i}
            d={elbow(x1, from.cy, x2, to.cy, exit, enter)}
            fill="none"
            stroke={critical ? "var(--critical)" : "var(--ink-3)"}
            strokeWidth={1.5}
            markerEnd={critical ? "url(#arr-crit)" : "url(#arr)"}
            opacity={0.9}
          />
        );
      })}

      {/* Baseline (fantôme sous la barre) */}
      {showBaseline &&
        visibleIds.map((id) => {
          const task = tasksById.get(id);
          const g = geoms.get(id);
          const s = schedule.tasks.get(id);
          if (!task?.baseline || !g || !s || s.isSummary) return null;
          const bx = dayOffset(range, task.baseline.start) * dw;
          const bEnd = (dayOffset(range, task.baseline.finish) + 1) * dw;
          const bw = Math.max(dw * 0.4, bEnd - bx);
          const by = g.row * ROW_H + BAR_Y + BAR_H + 1;
          return (
            <rect
              key={`bl-${id}`}
              x={bx}
              y={by}
              width={s.isMilestone ? Math.max(4, dw * 0.4) : bw}
              height={4}
              rx={2}
              fill="var(--ink-3)"
              opacity={0.55}
            >
              <title>{`Baseline : ${task.baseline.start} → ${task.baseline.finish}`}</title>
            </rect>
          );
        })}

      {/* Barres */}
      {visibleIds.map((id) => {
        const s = schedule.tasks.get(id);
        const g = geoms.get(id);
        const task = tasksById.get(id);
        if (!s || !g || !task) return null;
        const y = g.row * ROW_H;

        if (s.isSummary) {
          return (
            <g key={id} onClick={() => onSelect(id)} className="bar-group">
              <path
                d={`M ${g.x} ${y + 10} H ${g.x + g.w} V ${y + 18} L ${g.x + g.w - 5} ${y + 13} H ${g.x + 5} L ${g.x} ${y + 18} Z`}
                fill="var(--bar-summary)"
              />
            </g>
          );
        }

        if (s.isMilestone) {
          const cx = g.x;
          const done = task.percentComplete >= 100;
          return (
            <g key={id} onClick={() => onSelect(id)} className="bar-group">
              <path
                d={`M ${cx} ${g.cy - 7} L ${cx + 7} ${g.cy} L ${cx} ${g.cy + 7} L ${cx - 7} ${g.cy} Z`}
                fill={done ? "var(--milestone)" : s.critical ? "var(--critical)" : "var(--paper-0)"}
                stroke={s.critical ? "var(--critical)" : "var(--milestone)"}
                strokeWidth={1.5}
              />
              {dw >= 10 && (
                <text x={cx + 12} y={g.cy + 4} className="bar-label">
                  {task.name}
                </text>
              )}
            </g>
          );
        }

        const fill = s.critical ? "var(--critical)" : "var(--bar-fill)";
        const progW = (g.w * task.percentComplete) / 100;
        const names = task.assignments
          .map((as) => resourceById.get(as.resourceId)?.name)
          .filter(Boolean)
          .join(", ");
        return (
          <g key={id} onClick={() => onSelect(id)} className="bar-group">
            <rect x={g.x} y={y + BAR_Y} width={g.w} height={BAR_H} rx={3} fill={fill} opacity={0.45} />
            {progW > 0 && (
              <rect x={g.x} y={y + BAR_Y} width={progW} height={BAR_H} rx={3} fill={fill} />
            )}
            {dw >= 10 && names && (
              <text x={g.x + g.w + 8} y={g.cy + 4} className="bar-label">
                {names}
              </text>
            )}
          </g>
        );
      })}

      {/* Aujourd'hui */}
      {todayX >= 0 && todayX <= width && (
        <line
          x1={todayX}
          y1={0}
          x2={todayX}
          y2={height}
          stroke="var(--accent)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
      )}
    </svg>
  );
}
