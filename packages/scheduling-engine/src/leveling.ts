import { indexToDate } from "./calendar";
import type { CalendarDef, Resource, ScheduleResult, Task } from "./types";

const EPS = 1e-6;

export interface Overallocation {
  resourceId: string;
  /** Working-day index from project start. */
  dayIndex: number;
  /** Total assigned units that day. */
  load: number;
  capacity: number;
}

/**
 * Per-resource days where assigned units exceed capacity.
 * Milestones and summaries carry no load.
 */
export function detectOverallocations(
  tasks: Task[],
  schedule: ScheduleResult,
  resources: Resource[],
): Overallocation[] {
  const capacity = new Map(resources.map((r) => [r.id, r.capacity]));
  const load = new Map<string, Map<number, number>>();
  for (const t of tasks) {
    const s = schedule.tasks.get(t.id);
    if (!s || s.isSummary || s.isMilestone) continue;
    for (const a of t.assignments) {
      let row = load.get(a.resourceId);
      if (!row) {
        row = new Map();
        load.set(a.resourceId, row);
      }
      for (let d = s.es; d < s.ef; d++) row.set(d, (row.get(d) ?? 0) + a.units);
    }
  }

  const out: Overallocation[] = [];
  for (const [resourceId, row] of load) {
    const cap = capacity.get(resourceId) ?? 1;
    for (const [dayIndex, units] of row) {
      if (units > cap + EPS) out.push({ resourceId, dayIndex, load: units, capacity: cap });
    }
  }
  return out.sort((a, b) => a.dayIndex - b.dayIndex);
}

export interface LevelingProposal {
  taskId: string;
  /** SNET date (ISO) the task should not start before. */
  notBefore: string;
  /** Working-day delay applied. */
  delayDays: number;
}

interface Item {
  taskId: string;
  es: number;
  duration: number;
  units: number;
  slack: number;
  critical: boolean;
}

/**
 * Greedy resource leveling: serialise conflicting assignments so no resource
 * exceeds its capacity. Tasks with less slack (critical first) keep their slot;
 * more-flexible tasks are pushed later. Returns SNET constraints to apply.
 *
 * Heuristic single pass — after applying, re-run the schedule; a second call can
 * resolve any residual conflicts introduced by dependency cascades.
 */
export function levelResources(
  tasks: Task[],
  schedule: ScheduleResult,
  resources: Resource[],
  calendar: CalendarDef,
  projectStart: string,
): LevelingProposal[] {
  const capacity = new Map(resources.map((r) => [r.id, r.capacity]));
  // taskId -> latest required start index across all its over-booked resources.
  const proposedStart = new Map<string, number>();

  for (const r of resources) {
    const cap = capacity.get(r.id) ?? 1;
    const items: Item[] = [];
    for (const t of tasks) {
      const s = schedule.tasks.get(t.id);
      if (!s || s.isSummary || s.isMilestone) continue;
      const asg = t.assignments.find((a) => a.resourceId === r.id);
      if (!asg) continue;
      items.push({ taskId: t.id, es: s.es, duration: s.ef - s.es, units: asg.units, slack: s.slack, critical: s.critical });
    }
    if (items.length < 2) continue;

    // Earlier first; on ties, keep the more constrained task (less slack) ahead.
    items.sort((a, b) => a.es - b.es || a.slack - b.slack);

    const committed = new Map<number, number>();
    const fits = (start: number, dur: number, units: number): boolean => {
      for (let d = start; d < start + dur; d++) {
        if ((committed.get(d) ?? 0) + units > cap + EPS) return false;
      }
      return true;
    };

    for (const it of items) {
      let start = Math.max(it.es, proposedStart.get(it.taskId) ?? 0);
      while (!fits(start, it.duration, it.units)) start++;
      for (let d = start; d < start + it.duration; d++) {
        committed.set(d, (committed.get(d) ?? 0) + it.units);
      }
      if (start > it.es) {
        const prev = proposedStart.get(it.taskId) ?? it.es;
        proposedStart.set(it.taskId, Math.max(prev, start));
      }
    }
  }

  const out: LevelingProposal[] = [];
  for (const [taskId, startIdx] of proposedStart) {
    const s = schedule.tasks.get(taskId);
    if (!s) continue;
    out.push({
      taskId,
      notBefore: indexToDate(calendar, projectStart, startIdx),
      delayDays: startIdx - s.es,
    });
  }
  return out.sort((a, b) => b.delayDays - a.delayDays);
}
