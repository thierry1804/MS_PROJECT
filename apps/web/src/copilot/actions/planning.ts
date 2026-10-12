import { computeSchedule, type Dependency } from "@atelier/scheduling-engine";
import type { Portfolio, Project } from "../../domain";
import { scheduleOf } from "../../store";
import type { CopilotStore } from "../store-bridge";
import { uid } from "../uid";

function isLeafTask(project: Project, portfolio: Portfolio, taskId: string): boolean {
  const s = scheduleOf(project, portfolio).tasks.get(taskId);
  return Boolean(s && !s.isSummary);
}

export function resolveTaskByName(project: Project, portfolio: Portfolio, fragment: string) {
  const q = fragment.trim().toLowerCase();
  return project.tasks.filter(
    (t) =>
      isLeafTask(project, portfolio, t.id) &&
      (t.id === fragment || t.name.toLowerCase().includes(q)),
  );
}

export function resolveProjectByRef(portfolio: Portfolio, ref: string): Project | undefined {
  const q = ref.trim().toLowerCase();
  return portfolio.projects.find(
    (p) => p.id === ref || p.code.toLowerCase() === q || p.name.toLowerCase().includes(q),
  );
}

export function buildPlanningImpactPreview(
  project: Project,
  portfolio: Portfolio,
  taskId: string,
  shiftDays: number,
): { affectedTaskCount: number; affectedTasks: { name: string; oldFinish: string; newFinish: string }[] } {
  const before = scheduleOf(project, portfolio);
  const shifted: Project = structuredClone(project);
  const task = shifted.tasks.find((t) => t.id === taskId);
  if (!task) return { affectedTaskCount: 0, affectedTasks: [] };

  task.duration = Math.max(1, task.duration + shiftDays);
  const after = computeSchedule({
    tasks: shifted.tasks,
    dependencies: shifted.dependencies,
    calendar: portfolio.calendar,
    projectStart: shifted.projectStart,
  });

  const affected: { name: string; oldFinish: string; newFinish: string }[] = [];
  for (const t of project.tasks) {
    if (!isLeafTask(project, portfolio, t.id)) continue;
    const b = before.tasks.get(t.id);
    const a = after.tasks.get(t.id);
    if (!b || !a || b.ef === a.ef) continue;
    affected.push({
      name: t.name,
      oldFinish: `J+${b.ef}`,
      newFinish: `J+${a.ef}`,
    });
  }

  return { affectedTaskCount: affected.length, affectedTasks: affected.slice(0, 5) };
}

export function executeAddTask(store: CopilotStore, portfolio: Portfolio, slots: Record<string, unknown>): void {
  const projectId = String(slots.projectId);
  const parentTaskId = slots.parentTaskId ? String(slots.parentTaskId) : undefined;
  if (parentTaskId) store.addSubTask(projectId, parentTaskId);
  else store.addTask(projectId);

  const project = store.portfolio.projects.find((p) => p.id === projectId);
  if (!project) return;
  const tasks = project.tasks.filter((t) => isLeafTask(project, portfolio, t.id));
  const last = tasks[tasks.length - 1];
  if (!last) return;

  store.updateTask(projectId, last.id, {
    name: String(slots.name ?? "Nouvelle tâche"),
    duration: Math.max(1, Number(slots.duration) || 1),
  });
}

export function executeUpdateTask(store: CopilotStore, slots: Record<string, unknown>): number {
  const patch: Record<string, unknown> = {};
  if (slots.name !== undefined) patch.name = String(slots.name);
  if (slots.duration !== undefined) patch.duration = Number(slots.duration);
  if (slots.percentComplete !== undefined) patch.percentComplete = Number(slots.percentComplete);

  const projectId = String(slots.projectId);
  const ids: string[] = Array.isArray(slots.taskIds)
    ? (slots.taskIds as string[])
    : slots.taskId
      ? [String(slots.taskId)]
      : [];

  for (const taskId of ids) {
    store.updateTask(projectId, taskId, patch);
  }
  return ids.length;
}

export function executeAddDependency(store: CopilotStore, slots: Record<string, unknown>): void {
  const dep: Dependency = {
    predecessorId: String(slots.predecessorId),
    successorId: String(slots.successorId),
    type: (slots.type as Dependency["type"]) || "FS",
    lag: Number(slots.lag) || 0,
  };
  store.addDependency(String(slots.projectId), dep);
}

export function executeAssignResource(store: CopilotStore, slots: Record<string, unknown>): void {
  const projectId = String(slots.projectId);
  const taskId = String(slots.taskId);
  const project = store.portfolio.projects.find((p) => p.id === projectId);
  const task = project?.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const units = Number(slots.units) || 1;
  const resourceId = String(slots.resourceId);
  const assignments = [...task.assignments.filter((a) => a.resourceId !== resourceId), { resourceId, units }];
  store.updateTask(projectId, taskId, { assignments });
}

export function executeCaptureBaseline(store: CopilotStore, slots: Record<string, unknown>): void {
  const name = slots.name ? String(slots.name) : undefined;
  store.captureBaseline(String(slots.projectId), name);
}

export function executeShiftTasks(store: CopilotStore, slots: Record<string, unknown>): void {
  const projectId = String(slots.projectId);
  const taskId = String(slots.taskId);
  const shiftDays = Number(slots.shiftDays) || 0;
  const project = store.portfolio.projects.find((p) => p.id === projectId);
  const task = project?.tasks.find((t) => t.id === taskId);
  if (!task) return;
  store.updateTask(projectId, taskId, { duration: Math.max(1, task.duration + shiftDays) });
}

export function executeLogTime(store: CopilotStore, slots: Record<string, unknown>): void {
  store.logTime(
    String(slots.projectId),
    String(slots.taskId),
    String(slots.resourceId),
    String(slots.weekStart),
    Number(slots.days) || 0,
  );
}

export function executeAddResource(store: CopilotStore, slots: Record<string, unknown>): void {
  store.addResource({
    id: uid("res"),
    name: String(slots.name ?? "").trim(),
    kind: (slots.kind as "work") || "work",
    capacity: 1,
    costPerDay: Math.max(0, Number(slots.costPerDay) || 0),
  });
}

export function executeUpdateResource(store: CopilotStore, slots: Record<string, unknown>): void {
  const patch: Record<string, unknown> = {};
  if (slots.name !== undefined) patch.name = String(slots.name);
  if (slots.costPerDay !== undefined) patch.costPerDay = Number(slots.costPerDay);
  store.updateResource(String(slots.resourceId), patch);
}
