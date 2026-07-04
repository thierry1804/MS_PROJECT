import { computeWorkload, dateToIndex } from "@atelier/scheduling-engine";
import { GATE_CRITERIA, todayISO, type Portfolio } from "./domain";
import { metricsOf, scheduleOf } from "./store";

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86_400_000);
}

/** Percentage average, ignoring the case where there is nothing to average (returns null, not 0 or NaN). */
function pct(hit: number, total: number): number | null {
  return total > 0 ? (100 * hit) / total : null;
}

export interface PerformanceKpis {
  /** Projects with a captured baseline whose current finish is on/before that baseline. */
  onTimeRate: number | null;
  baselinedProjects: number;
  /** Projects whose CPI ≥ 0.97 (na-status projects — no spend yet — excluded). */
  costOnTargetRate: number | null;
  /** Average slippage in working days across all baselined leaf tasks running late. */
  avgScheduleVarianceDays: number;
  lateTaskCount: number;
}

export interface QualityKpis {
  /** Stage-gate checklist items actually confirmed vs required, across all recorded gates. */
  gateComplianceRate: number | null;
  openMajorIncidents: number;
  /** Past-due or completed milestones finished on/before their baseline date. */
  milestoneOnTimeRate: number | null;
  riskClosureRate: number | null;
  openRisks: number;
}

export interface PortfolioValueKpis {
  /** Average today's load / capacity across work resources with any assignment. */
  resourceUtilizationRate: number | null;
  overallocatedResources: number;
  activeProjects: number;
  totalProjects: number;
  strategicMix: { axis: string; budget: number }[];
  untaggedBudget: number;
}

export interface SatisfactionKpis {
  /** Classic NPS: %promoters(9-10) − %detractors(0-6), on responses from the last 180 days. */
  nps: number | null;
  responseCount: number;
  governanceParticipationRate: number | null;
  eventCount: number;
}

export interface OperationalKpis {
  decisionsLast90d: number;
  /** Average days between issue creation and resolution, resolved issues only. */
  avgResolutionDays: number | null;
  resolvedIssueCount: number;
  openIssuesNoOwnerOrStale: number;
}

export interface PmoKpis {
  performance: PerformanceKpis;
  quality: QualityKpis;
  value: PortfolioValueKpis;
  satisfaction: SatisfactionKpis;
  operational: OperationalKpis;
}

export function computePmoKpis(portfolio: Portfolio): PmoKpis {
  const today = todayISO();
  const rows = portfolio.projects.map((project) => ({
    project,
    schedule: scheduleOf(project, portfolio),
    metrics: metricsOf(project, portfolio),
  }));

  /* ---------------- Performance ---------------- */
  let onTimeHit = 0;
  let baselinedProjects = 0;
  let lateTaskCount = 0;
  let lateDaysSum = 0;
  let costHit = 0;
  let costTotal = 0;

  for (const { project, schedule, metrics } of rows) {
    if (project.baselineCapturedAt) {
      baselinedProjects++;
      const baselineFinish = project.tasks
        .filter((t) => t.baseline)
        .reduce((max, t) => (t.baseline!.finish > max ? t.baseline!.finish : max), "");
      if (baselineFinish && schedule.projectFinishDate <= baselineFinish) onTimeHit++;
    }
    for (const t of project.tasks) {
      const s = schedule.tasks.get(t.id);
      if (!s || s.isSummary || !t.baseline) continue;
      const delay = dayDiff(s.finishDate, t.baseline.finish);
      if (delay > 0) {
        lateTaskCount++;
        lateDaysSum += delay;
      }
    }
    if (metrics.plannedCost > 0) {
      costTotal++;
      if (metrics.cpi >= 0.97) costHit++;
    }
  }

  const performance: PerformanceKpis = {
    onTimeRate: pct(onTimeHit, baselinedProjects),
    baselinedProjects,
    costOnTargetRate: pct(costHit, costTotal),
    avgScheduleVarianceDays: lateTaskCount > 0 ? lateDaysSum / lateTaskCount : 0,
    lateTaskCount,
  };

  /* ---------------- Quality & gouvernance ---------------- */
  let gateHit = 0;
  let gateTotal = 0;
  for (const demand of portfolio.demands ?? []) {
    for (const gr of demand.gateHistory ?? []) {
      const required = GATE_CRITERIA[gr.stage];
      if (!required) continue;
      gateTotal += required.length;
      gateHit += gr.criteria.length;
    }
  }

  let openMajorIncidents = 0;
  let milestoneHit = 0;
  let milestoneTotal = 0;
  let riskOpen = 0;
  let riskClosed = 0;

  for (const { project, schedule } of rows) {
    for (const i of project.issues) {
      if (i.status === "ouvert" && i.severity >= 4) openMajorIncidents++;
    }
    for (const r of project.risks) {
      if (r.status === "ouvert") riskOpen++;
      else riskClosed++;
    }
    for (const t of project.tasks) {
      const s = schedule.tasks.get(t.id);
      if (!s?.isMilestone) continue;
      const isPastOrDone = s.finishDate <= today || t.percentComplete >= 100;
      if (!isPastOrDone) continue;
      milestoneTotal++;
      if (!t.baseline || s.finishDate <= t.baseline.finish) milestoneHit++;
    }
  }

  const quality: QualityKpis = {
    gateComplianceRate: pct(gateHit, gateTotal),
    openMajorIncidents,
    milestoneOnTimeRate: pct(milestoneHit, milestoneTotal),
    riskClosureRate: pct(riskClosed, riskOpen + riskClosed),
    openRisks: riskOpen,
  };

  /* ---------------- Portfolio & valeur ---------------- */
  const todayLoadByResource = new Map<string, number>();
  for (const { project, schedule } of rows) {
    const horizon = schedule.projectDuration;
    const workload = computeWorkload(project.tasks, schedule, horizon);
    const todayIdx = dateToIndex(portfolio.calendar, project.projectStart, today);
    if (todayIdx < 0 || todayIdx >= horizon) continue;
    for (const [resourceId, row] of workload) {
      todayLoadByResource.set(resourceId, (todayLoadByResource.get(resourceId) ?? 0) + (row[todayIdx] ?? 0));
    }
  }
  let utilSum = 0;
  let utilCount = 0;
  let overallocated = 0;
  for (const r of portfolio.resources) {
    if (r.kind !== "work") continue;
    const load = todayLoadByResource.get(r.id) ?? 0;
    if (load <= 0) continue;
    utilCount++;
    utilSum += load / r.capacity;
    if (load / r.capacity > 1.001) overallocated++;
  }

  const strategicMix = new Map<string, number>();
  let untaggedBudget = 0;
  for (const { project } of rows) {
    if (project.status === "termine") continue;
    if (project.strategicAxis) {
      strategicMix.set(project.strategicAxis, (strategicMix.get(project.strategicAxis) ?? 0) + project.budget);
    } else {
      untaggedBudget += project.budget;
    }
  }

  const value: PortfolioValueKpis = {
    resourceUtilizationRate: utilCount > 0 ? (100 * utilSum) / utilCount : null,
    overallocatedResources: overallocated,
    activeProjects: rows.filter((r) => r.project.status === "en-cours").length,
    totalProjects: rows.length,
    strategicMix: [...strategicMix.entries()]
      .map(([axis, budget]) => ({ axis, budget }))
      .sort((a, b) => b.budget - a.budget),
    untaggedBudget,
  };

  /* ---------------- Satisfaction & adoption ---------------- */
  const recentSurveys = (portfolio.surveys ?? []).filter((s) => dayDiff(today, s.date) <= 180);
  let promoters = 0;
  let detractors = 0;
  for (const s of recentSurveys) {
    if (s.score >= 9) promoters++;
    else if (s.score <= 6) detractors++;
  }

  let attendeesSum = 0;
  let expectedSum = 0;
  for (const e of portfolio.governanceEvents ?? []) {
    attendeesSum += e.attendees;
    expectedSum += e.expected;
  }

  const satisfaction: SatisfactionKpis = {
    nps: recentSurveys.length > 0 ? (100 * (promoters - detractors)) / recentSurveys.length : null,
    responseCount: recentSurveys.length,
    governanceParticipationRate: pct(attendeesSum, expectedSum),
    eventCount: (portfolio.governanceEvents ?? []).length,
  };

  /* ---------------- Opérationnel ---------------- */
  let decisionsLast90d = 0;
  let resolvedIssueCount = 0;
  let resolutionDaysSum = 0;
  let staleOpenIssues = 0;
  for (const { project } of rows) {
    for (const d of project.decisions) {
      if (dayDiff(today, d.date) <= 90) decisionsLast90d++;
    }
    for (const i of project.issues) {
      if (i.status === "resolu" && i.resolvedAt) {
        resolvedIssueCount++;
        resolutionDaysSum += dayDiff(i.resolvedAt, i.createdAt);
      }
      if (i.status === "ouvert" && dayDiff(today, i.createdAt) > 30) staleOpenIssues++;
    }
  }

  const operational: OperationalKpis = {
    decisionsLast90d,
    avgResolutionDays: resolvedIssueCount > 0 ? resolutionDaysSum / resolvedIssueCount : null,
    resolvedIssueCount,
    openIssuesNoOwnerOrStale: staleOpenIssues,
  };

  return { performance, quality, value, satisfaction, operational };
}
