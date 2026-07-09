import { computeMetrics, computeSchedule, computeWorkload } from "@atelier/scheduling-engine";
import type { Portfolio, Project } from "../domain";
import { todayISO } from "../domain";
import type { ProjectContextSnapshot } from "./types";

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86_400_000);
}

/** Construit un snapshot compact du projet pour heuristiques et LLM. */
export function buildProjectContext(project: Project, portfolio: Portfolio): ProjectContextSnapshot {
  const schedule = computeSchedule({
    tasks: project.tasks,
    dependencies: project.dependencies,
    calendar: portfolio.calendar,
    projectStart: project.projectStart,
  });
  const statusDate = project.evmStatusDate ?? todayISO();
  const metrics = computeMetrics(project.tasks, schedule, portfolio.resources, {
    calendar: portfolio.calendar,
    projectStart: project.projectStart,
    statusDate,
  });
  const today = todayISO();

  const lateTasks = project.tasks
    .map((t) => {
      const s = schedule.tasks.get(t.id);
      if (!s || s.isSummary || !t.baseline) return null;
      const delay = dayDiff(s.finishDate, t.baseline.finish);
      if (delay <= 0) return null;
      return { id: t.id, name: t.name, delayDays: delay };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.delayDays - a.delayDays)
    .slice(0, 5);

  const overdueActions = project.actions
    .filter((a) => a.status !== "fait" && a.dueDate < today)
    .map((a) => ({ id: a.id, label: a.label, dueDate: a.dueDate }));

  const openIssues = project.issues
    .filter((i) => i.status === "ouvert")
    .map((i) => ({ id: i.id, label: i.label, severity: i.severity }));

  const openRisks = project.risks
    .filter((r) => r.status === "ouvert")
    .map((r) => ({ id: r.id, label: r.label, category: r.category }));

  const workload = computeWorkload(project.tasks, schedule, schedule.projectDuration);
  const overallocatedResources: string[] = [];
  for (const [resourceId, days] of workload) {
    const resource = portfolio.resources.find((r) => r.id === resourceId);
    if (!resource || resource.kind !== "work") continue;
    const capacity = resource.capacity ?? 1;
    const maxLoad = days.reduce((m, w) => Math.max(m, w), 0);
    if (maxLoad > capacity * 1.05) {
      overallocatedResources.push(resource.name);
    }
  }

  const unassignedCriticalTasks = project.tasks
    .filter((t) => {
      const s = schedule.tasks.get(t.id);
      if (!s || s.isSummary || !s.critical) return false;
      return t.assignments.length === 0;
    })
    .map((t) => ({ id: t.id, name: t.name }))
    .slice(0, 5);

  return {
    projectId: project.id,
    code: project.code,
    name: project.name,
    description: project.description,
    manager: project.manager,
    status: project.status,
    health: project.health,
    budget: project.budget,
    projectStart: project.projectStart,
    hasBaseline: Boolean(project.baselineCapturedAt),
    cpi: metrics.cpi,
    spi: metrics.spi,
    bac: metrics.bac,
    ac: metrics.ac,
    eac: metrics.eac,
    percentComplete: metrics.percentComplete,
    lateTasks,
    overdueActions,
    openIssues,
    openRisks,
    overallocatedResources,
    unassignedCriticalTasks,
  };
}
