import { dateToIndex, isWorkingDay, parseISO, toISO } from "./calendar";
import type { CalendarDef, Resource, ScheduleResult, Task } from "./types";

const DAY_MS = 86_400_000;

/** Planned cost of a leaf task: assignments × rate × duration + fixed. */
export function taskPlannedCost(task: Task, duration: number, resources: Map<string, Resource>): number {
  let cost = task.fixedCost ?? 0;
  for (const a of task.assignments) {
    const r = resources.get(a.resourceId);
    if (r && r.kind === "work") cost += a.units * r.costPerDay * duration;
    if (r && r.kind === "cost") cost += r.costPerDay;
  }
  return cost;
}

export interface EvmOptions {
  calendar: CalendarDef;
  projectStart: string;
  /** ISO status date; PV is measured as of this date. */
  statusDate: string;
}

/** Minimal timesheet row for phased AC on S-curves. */
export interface EvmTimeEntry {
  taskId: string;
  resourceId: string;
  /** Monday of the week, ISO. */
  weekStart: string;
  days: number;
}

export interface EvmSeriesPoint {
  date: string;
  pv: number;
  ev: number;
  ac: number;
}

export interface EvmSeriesOptions extends EvmOptions {
  /** Inclusive end of series; defaults to project finish. */
  to?: string;
  timesheets?: EvmTimeEntry[];
}

export interface ProjectMetrics {
  plannedCost: number;
  /** Earned value: Σ leaf plannedCost × %complete. */
  earnedValue: number;
  /** Planned value at status date: Σ leaf plannedCost × scheduled %. Equals BAC when no status date supplied. */
  pv: number;
  /** Weighted %complete of the whole project, 0..100. */
  percentComplete: number;
  taskCount: number;
  milestoneCount: number;
  criticalCount: number;
  /** Budget at completion (= total planned cost of all leaf tasks). */
  bac: number;
  /** Actual cost: Σ task.actualCost; defaults to EV per task if actualCost absent. */
  ac: number;
  /** Schedule performance index: EV / PV (PV > 0 else 1). */
  spi: number;
  /** Cost performance index: EV / AC (AC > 0 else 1). */
  cpi: number;
  /** Estimate at completion: BAC / CPI. */
  eac: number;
  /** Estimate to complete: EAC − AC. */
  etc: number;
  /** Schedule variance: EV − PV (negative = behind schedule). */
  sv: number;
  /** Cost variance: EV − AC. */
  cv: number;
}

/** Fraction of a leaf task scheduled to be done by the status date, 0..1. */
export function scheduledFraction(es: number, ef: number, statusIdx: number): number {
  if (statusIdx <= es) return 0;
  if (statusIdx >= ef) return 1;
  const span = ef - es;
  return span > 0 ? (statusIdx - es) / span : 1;
}

export function computeMetrics(
  tasks: Task[],
  schedule: ScheduleResult,
  resources: Resource[],
  evm?: EvmOptions,
): ProjectMetrics {
  const rmap = new Map(resources.map((r) => [r.id, r]));
  const statusIdx = evm ? dateToIndex(evm.calendar, evm.projectStart, evm.statusDate) : Infinity;
  let plannedCost = 0;
  let earnedValue = 0;
  let plannedValue = 0;
  let totalAc = 0;
  let weightedPct = 0;
  let weight = 0;
  let milestoneCount = 0;
  let criticalCount = 0;
  let leafCount = 0;

  for (const t of tasks) {
    const s = schedule.tasks.get(t.id);
    if (!s || s.isSummary) continue;
    leafCount++;
    if (s.isMilestone) milestoneCount++;
    if (s.critical) criticalCount++;
    const cost = taskPlannedCost(t, s.duration, rmap);
    const earnedCost = (cost * t.percentComplete) / 100;
    plannedCost += cost;
    earnedValue += earnedCost;
    // No status date → PV = BAC (whole plan considered scheduled).
    plannedValue += evm ? cost * scheduledFraction(s.es, s.ef, statusIdx) : cost;
    totalAc += t.actualCost ?? earnedCost;
    const w = Math.max(s.duration, 0.25);
    weightedPct += t.percentComplete * w;
    weight += w;
  }

  const bac = plannedCost;
  const ac = totalAc;
  const pv = plannedValue;
  const spi = pv > 0 ? earnedValue / pv : 1;
  const cpi = ac > 0 ? earnedValue / ac : 1;
  const eac = cpi > 0 ? bac / cpi : bac;
  const etc = eac - ac;
  const sv = earnedValue - pv;
  const cv = earnedValue - ac;

  return {
    plannedCost,
    earnedValue,
    pv,
    percentComplete: weight > 0 ? weightedPct / weight : 0,
    taskCount: leafCount,
    milestoneCount,
    criticalCount,
    bac,
    ac,
    spi,
    cpi,
    eac,
    etc,
    sv,
    cv,
  };
}

/**
 * Weekly (working-week) S-curve series for PV / EV / AC.
 * - PV(t): phased planned value via scheduledFraction.
 * - EV(t): current earned value when t ≥ statusDate, else 0 (no progress history).
 * - AC(t): cumulative timesheet cost through week ending at t when timesheets exist;
 *   otherwise actual cost steps in at statusDate.
 */
export function computeEvmSeries(
  tasks: Task[],
  schedule: ScheduleResult,
  resources: Resource[],
  options: EvmSeriesOptions,
): EvmSeriesPoint[] {
  const rmap = new Map(resources.map((r) => [r.id, r]));
  const { calendar, projectStart, statusDate } = options;
  const endISO = options.to ?? schedule.projectFinishDate;
  const statusIdx = dateToIndex(calendar, projectStart, statusDate);

  const leaves: { cost: number; es: number; ef: number; earned: number; actual: number }[] = [];
  let totalEv = 0;
  let totalAc = 0;
  for (const t of tasks) {
    const s = schedule.tasks.get(t.id);
    if (!s || s.isSummary) continue;
    const cost = taskPlannedCost(t, s.duration, rmap);
    const earned = (cost * t.percentComplete) / 100;
    const actual = t.actualCost ?? earned;
    leaves.push({ cost, es: s.es, ef: s.ef, earned, actual });
    totalEv += earned;
    totalAc += actual;
  }

  const sampleDates = collectWeeklySampleDates(calendar, projectStart, endISO, statusDate);
  const useTimesheets = Boolean(options.timesheets && options.timesheets.length > 0);
  const endIdx = dateToIndex(calendar, projectStart, endISO);
  // Inclusive finish dates map one working day short of exclusive EF; force full BAC at series end.
  const lastIdx = Math.max(endIdx, schedule.projectDuration);

  return sampleDates.map((date, i) => {
    const isLast = i === sampleDates.length - 1;
    const idx = isLast ? lastIdx : dateToIndex(calendar, projectStart, date);
    let pv = 0;
    for (const leaf of leaves) pv += leaf.cost * scheduledFraction(leaf.es, leaf.ef, idx);
    const ev = idx >= statusIdx ? totalEv : 0;
    let ac = 0;
    if (useTimesheets) {
      ac = cumulativeTimesheetCost(options.timesheets!, rmap, date);
    } else {
      ac = idx >= statusIdx ? totalAc : 0;
    }
    return { date, pv, ev, ac };
  });
}

/** Mondays (or first working day of each week) from project start through end, plus statusDate. */
function collectWeeklySampleDates(
  calendar: CalendarDef,
  projectStart: string,
  endISO: string,
  statusDate: string,
): string[] {
  const startUtc = parseISO(projectStart);
  const endUtc = parseISO(endISO);
  const dates = new Set<string>();
  dates.add(projectStart);
  dates.add(statusDate);
  dates.add(endISO);

  // Align to Monday of the week containing projectStart, then step 7 calendar days.
  const startDow = new Date(startUtc).getUTCDay(); // 0=Sun
  const mondayOffset = startDow === 0 ? -6 : 1 - startDow;
  let week = startUtc + mondayOffset * DAY_MS;
  if (week < startUtc) week += 7 * DAY_MS;

  while (week <= endUtc + DAY_MS) {
    // Prefer the Monday if working, else next working day in that week.
    let t = week;
    for (let i = 0; i < 7; i++) {
      if (isWorkingDay(calendar, t) && t >= startUtc && t <= endUtc) {
        dates.add(toISO(t));
        break;
      }
      t += DAY_MS;
    }
    week += 7 * DAY_MS;
  }

  return [...dates].sort((a, b) => a.localeCompare(b));
}

function cumulativeTimesheetCost(
  entries: EvmTimeEntry[],
  resources: Map<string, Resource>,
  asOf: string,
): number {
  let total = 0;
  for (const e of entries) {
    // Attribute the week's cost at weekStart (Monday); include if weekStart ≤ asOf.
    if (e.weekStart > asOf) continue;
    const r = resources.get(e.resourceId);
    const rate = r && r.kind === "work" ? r.costPerDay : 0;
    total += e.days * rate;
  }
  return total;
}

/**
 * Per-resource daily load in units, over working-day indexes [0, horizon).
 * Cell > capacity means overallocation.
 */
export function computeWorkload(
  tasks: Task[],
  schedule: ScheduleResult,
  horizon: number,
): Map<string, number[]> {
  const load = new Map<string, number[]>();
  for (const t of tasks) {
    const s = schedule.tasks.get(t.id);
    if (!s || s.isSummary || s.isMilestone) continue;
    for (const a of t.assignments) {
      let row = load.get(a.resourceId);
      if (!row) {
        row = new Array(horizon).fill(0);
        load.set(a.resourceId, row);
      }
      for (let d = s.es; d < Math.min(s.ef, horizon); d++) row[d]! += a.units;
    }
  }
  return load;
}
