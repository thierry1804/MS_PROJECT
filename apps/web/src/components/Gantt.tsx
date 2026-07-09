import { Fragment, useMemo, useRef, useState } from "react";
import {
  parseISO,
  toISO,
  workingDaysBetween,
  type CalendarDef,
  type Resource,
  type ScheduleResult,
  type Task,
} from "@atelier/scheduling-engine";
import { durationCustomFields } from "../duration";
import {
  DAY_MS,
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
const HANDLE_W = 6;

interface BarGeom {
  x: number;
  w: number;
  cy: number;
  row: number;
}

type DragMode = "move" | "resize-start" | "resize-end";

interface DragState {
  taskId: string;
  mode: DragMode;
  originX: number;
  /** Inclusive calendar-day offsets from range.start. */
  origStartOff: number;
  origEndOff: number;
  previewStartOff: number;
  previewEndOff: number;
}

interface Props {
  project: ProjectLike;
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
  /** Commit schedule edits from bar drag (move / resize). */
  onUpdate?: (taskId: string, patch: Partial<Task>) => void;
  /** When true, bars are display-only (e.g. PNG export). */
  readOnly?: boolean;
}

interface ProjectLike {
  tasks: Task[];
  dependencies: {
    predecessorId: string;
    successorId: string;
    type: "FS" | "SS" | "FF" | "SF";
  }[];
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

function inclusiveWorkingDuration(cal: CalendarDef, startISO: string, finishISO: string): number {
  const endExclusive = toISO(parseISO(finishISO) + DAY_MS);
  return Math.max(0, workingDaysBetween(cal, startISO, endExclusive));
}

function offsetToISO(range: TimeRange, offset: number): string {
  return toISO(offsetToUTC(range, offset));
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
  onUpdate,
  readOnly = false,
}: Props) {
  const dw = dayWidth;
  const width = range.days * dw;
  const height = visibleIds.length * ROW_H;
  const resourceById = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
  const tasksById = useMemo(() => new Map(project.tasks.map((t) => [t.id, t])), [project.tasks]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const geoms = new Map<string, BarGeom>();
  visibleIds.forEach((id, row) => {
    const s = schedule.tasks.get(id);
    if (!s) return;
    let startOff = dayOffset(range, s.startDate);
    let endOff = dayOffset(range, s.finishDate);
    if (drag?.taskId === id) {
      startOff = drag.previewStartOff;
      endOff = drag.previewEndOff;
    }
    const x = startOff * dw;
    const w = Math.max(dw * 0.5, (endOff + 1) * dw - x);
    geoms.set(id, { x, w, cy: row * ROW_H + ROW_H / 2, row });
  });

  const nonWorking = useMemo(() => nonWorkingOffsets(range, calendar), [range, calendar]);
  const weeks = useMemo(() => weekStarts(range), [range]);
  const todayX = dayOffset(range, todayISO) * dw;
  const editable = !readOnly && !!onUpdate;

  function clientXToSvgX(clientX: number): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = 0;
    const ctm = svg.getScreenCTM();
    if (!ctm) return clientX - svg.getBoundingClientRect().left;
    return pt.matrixTransform(ctm.inverse()).x;
  }

  function beginDrag(taskId: string, mode: DragMode, clientX: number) {
    const s = schedule.tasks.get(taskId);
    if (!s || s.isSummary || !editable) return;
    if (s.isMilestone && mode !== "move") return;
    const origStartOff = dayOffset(range, s.startDate);
    const origEndOff = dayOffset(range, s.finishDate);
    const next: DragState = {
      taskId,
      mode,
      originX: clientXToSvgX(clientX),
      origStartOff,
      origEndOff,
      previewStartOff: origStartOff,
      previewEndOff: origEndOff,
    };
    setDrag(next);
    onSelect(taskId);

    const onMove = (ev: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      const dx = clientXToSvgX(ev.clientX) - cur.originX;
      const dayDelta = Math.round(dx / dw);
      let start = cur.origStartOff;
      let end = cur.origEndOff;
      if (cur.mode === "move") {
        start = cur.origStartOff + dayDelta;
        end = cur.origEndOff + dayDelta;
      } else if (cur.mode === "resize-end") {
        end = Math.max(cur.origStartOff, cur.origEndOff + dayDelta);
      } else {
        start = Math.min(cur.origEndOff, cur.origStartOff + dayDelta);
      }
      start = Math.max(0, Math.min(range.days - 1, start));
      end = Math.max(0, Math.min(range.days - 1, end));
      if (start > end) end = start;
      setDrag({ ...cur, previewStartOff: start, previewEndOff: end });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const cur = dragRef.current;
      setDrag(null);
      if (!cur || !onUpdate) return;
      const changed =
        cur.previewStartOff !== cur.origStartOff || cur.previewEndOff !== cur.origEndOff;
      if (!changed) return;

      const task = tasksById.get(cur.taskId);
      const sched = schedule.tasks.get(cur.taskId);
      if (!task || !sched) return;

      const newStart = offsetToISO(range, cur.previewStartOff);
      const newFinish = offsetToISO(range, cur.previewEndOff);

      if (sched.isMilestone) {
        onUpdate(cur.taskId, { constraint: { type: "MSO", date: newStart } });
        return;
      }

      if (cur.mode === "move") {
        onUpdate(cur.taskId, { constraint: { type: "MSO", date: newStart } });
        return;
      }

      const dur = Math.max(1, inclusiveWorkingDuration(calendar, newStart, newFinish));
      if (cur.mode === "resize-start") {
        onUpdate(cur.taskId, {
          duration: dur,
          constraint: { type: "MSO", date: newStart },
          custom: { ...task.custom, ...durationCustomFields(dur) },
        });
      } else {
        onUpdate(cur.taskId, {
          duration: dur,
          custom: { ...task.custom, ...durationCustomFields(dur) },
        });
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className={`gantt-svg${drag ? " gantt-dragging" : ""}`}
    >
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
        const dragging = drag?.taskId === id;

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
            <g
              key={id}
              onClick={() => onSelect(id)}
              className={`bar-group${editable ? " bar-draggable" : ""}${dragging ? " bar-dragging" : ""}`}
              onPointerDown={
                editable
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      beginDrag(id, "move", e.clientX);
                    }
                  : undefined
              }
            >
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
              <title>{`${task.name}\n${s.startDate}`}</title>
            </g>
          );
        }

        const fill = s.critical ? "var(--critical)" : "var(--bar-fill)";
        const progW = dragging ? 0 : (g.w * task.percentComplete) / 100;
        const names = task.assignments
          .map((as) => resourceById.get(as.resourceId)?.name)
          .filter(Boolean)
          .join(", ");
        const tipStart = offsetToISO(range, Math.round(g.x / dw));
        const tipFinish = offsetToISO(range, Math.round((g.x + g.w) / dw) - 1);
        return (
          <g
            key={id}
            onClick={() => onSelect(id)}
            className={`bar-group${editable ? " bar-draggable" : ""}${dragging ? " bar-dragging" : ""}`}
          >
            <rect
              x={g.x}
              y={y + BAR_Y}
              width={g.w}
              height={BAR_H}
              rx={3}
              fill={fill}
              opacity={0.45}
              className="bar-body"
              onPointerDown={
                editable
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      beginDrag(id, "move", e.clientX);
                    }
                  : undefined
              }
            />
            {progW > 0 && (
              <rect
                x={g.x}
                y={y + BAR_Y}
                width={progW}
                height={BAR_H}
                rx={3}
                fill={fill}
                pointerEvents="none"
              />
            )}
            {editable && g.w >= HANDLE_W * 2 + 4 && (
              <>
                <rect
                  x={g.x}
                  y={y + BAR_Y}
                  width={HANDLE_W}
                  height={BAR_H}
                  fill="transparent"
                  className="bar-handle bar-handle-start"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    beginDrag(id, "resize-start", e.clientX);
                  }}
                />
                <rect
                  x={g.x + g.w - HANDLE_W}
                  y={y + BAR_Y}
                  width={HANDLE_W}
                  height={BAR_H}
                  fill="transparent"
                  className="bar-handle bar-handle-end"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    beginDrag(id, "resize-end", e.clientX);
                  }}
                />
              </>
            )}
            {dw >= 10 && names && (
              <text x={g.x + g.w + 8} y={g.cy + 4} className="bar-label" pointerEvents="none">
                {names}
              </text>
            )}
            <title>{`${task.name}\n${tipStart} → ${tipFinish}`}</title>
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
