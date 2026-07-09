import {
  dateToIndex,
  scheduledFraction,
  type CalendarDef,
  type ScheduleResult,
  type Task,
} from "@atelier/scheduling-engine";
import { todayISO, type Portfolio, type ProgressMode, type Project, type TimeEntry } from "./domain";

function statusDateOf(project: Project): string {
  return project.evmStatusDate ?? todayISO();
}

const DIVERGENCE_THRESHOLD = 15;

/** Planned % complete for a leaf at the project's EVM status date. */
export function scheduledPercentOf(
  task: Task,
  schedule: ScheduleResult,
  calendar: CalendarDef,
  projectStart: string,
  statusDate: string,
): number | null {
  const s = schedule.tasks.get(task.id);
  if (!s || s.isSummary) return null;
  if (s.isMilestone) return statusDate >= s.finishDate ? 100 : 0;
  const idx = dateToIndex(calendar, projectStart, statusDate);
  return Math.round(scheduledFraction(s.es, s.ef, idx) * 100);
}

export function progressDiverges(
  task: Task,
  schedule: ScheduleResult,
  calendar: CalendarDef,
  projectStart: string,
  statusDate: string,
  threshold = DIVERGENCE_THRESHOLD,
): boolean {
  const planned = scheduledPercentOf(task, schedule, calendar, projectStart, statusDate);
  if (planned == null) return false;
  return Math.abs(task.percentComplete - planned) > threshold;
}

/** Milestone-driven % for a non-milestone leaf: share of sibling/subtree milestones done. */
function milestoneDrivenPercent(
  task: Task,
  tasks: Task[],
  schedule: ScheduleResult,
): number {
  const s = schedule.tasks.get(task.id);
  if (!s || s.isSummary) return task.percentComplete;
  if (s.isMilestone) return task.percentComplete >= 100 ? 100 : 0;

  // Prefer milestones under the same parent; else any milestone descendants of nearest summary ancestor.
  const parentId = task.parentId;
  let milestones = tasks.filter((t) => {
    if (t.id === task.id) return false;
    const st = schedule.tasks.get(t.id);
    return Boolean(st?.isMilestone && t.parentId === parentId);
  });

  if (milestones.length === 0 && parentId) {
    const underParent = new Set<string>();
    const stack = [parentId];
    while (stack.length) {
      const id = stack.pop()!;
      for (const t of tasks) {
        if (t.parentId === id) {
          underParent.add(t.id);
          stack.push(t.id);
        }
      }
    }
    milestones = tasks.filter((t) => underParent.has(t.id) && schedule.tasks.get(t.id)?.isMilestone);
  }

  if (milestones.length === 0) {
    // Project-level: all milestones
    milestones = tasks.filter((t) => schedule.tasks.get(t.id)?.isMilestone);
  }
  if (milestones.length === 0) return task.percentComplete;

  const done = milestones.filter((m) => m.percentComplete >= 100).length;
  return Math.round((done / milestones.length) * 100);
}

function effortDrivenPercent(task: Task, schedule: ScheduleResult, timesheets: TimeEntry[]): number {
  const s = schedule.tasks.get(task.id);
  if (!s || s.isSummary || s.isMilestone) return task.percentComplete;
  const duration = Math.max(s.duration, 0.25);
  const logged = timesheets.filter((e) => e.taskId === task.id).reduce((sum, e) => sum + e.days, 0);
  return Math.max(0, Math.min(100, Math.round((logged / duration) * 100)));
}

/** Recompute leaf percentComplete according to project progressMode. */
export function applyProgressMode(
  project: Project,
  schedule: ScheduleResult,
  mode: ProgressMode,
): Task[] {
  if (mode === "manual") return project.tasks;
  const sheets = project.timesheets ?? [];
  return project.tasks.map((t) => {
    const s = schedule.tasks.get(t.id);
    if (!s || s.isSummary) return t;
    if (s.isMilestone) {
      // Milestones stay binary; effort mode does not rewrite them.
      return t;
    }
    const pct =
      mode === "milestones"
        ? milestoneDrivenPercent(t, project.tasks, schedule)
        : effortDrivenPercent(t, schedule, sheets);
    return pct === t.percentComplete ? t : { ...t, percentComplete: pct };
  });
}

export function progressModeOf(project: Project): ProgressMode {
  return project.progressMode ?? "manual";
}

export function canEditPercent(project: Project): boolean {
  return progressModeOf(project) === "manual";
}

/** Whether this task's % can be edited under the project's progress mode. */
export function canEditTaskPercent(
  project: Project,
  schedule: ScheduleResult,
  taskId: string,
): boolean {
  const mode = progressModeOf(project);
  if (mode === "manual") return true;
  if (mode === "effort") return false;
  // milestones mode: only milestones are editable (they drive the rest)
  return Boolean(schedule.tasks.get(taskId)?.isMilestone);
}

export function divergenceHint(
  task: Task,
  project: Project,
  portfolio: Portfolio,
  schedule: ScheduleResult,
): string | null {
  if (progressModeOf(project) !== "manual") return null;
  const statusDate = statusDateOf(project);
  const planned = scheduledPercentOf(
    task,
    schedule,
    portfolio.calendar,
    project.projectStart,
    statusDate,
  );
  if (planned == null) return null;
  if (Math.abs(task.percentComplete - planned) <= DIVERGENCE_THRESHOLD) return null;
  return `Planifié ${planned} % à la date de statut`;
}
