import type { Prisma, PrismaClient } from "@prisma/client";
import type { ConstraintType, DependencyType, ResourceKind, Task } from "@atelier/scheduling-engine";
import type {
  PortfolioMeta,
  WireGateRecord,
  WireGovernanceEvent,
  WirePortfolio,
  WireProject,
  WireRiskAssessment,
  WireSurveyResponse,
} from "./types.js";

const PORTFOLIO_ID = "default";

function readIntArray(value: unknown): number[] {
  return Array.isArray(value) ? (value as number[]) : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

const HOURS_PER_WORKDAY = 8;

/** Restaure les durées décimales tronquées quand la colonne était Int (custom.durationHours conservé). */
function readTaskDuration(duration: number, custom: unknown): number {
  if (duration > 0) return duration;
  const hours = (custom as Record<string, unknown> | null)?.durationHours;
  if (typeof hours === "number" && hours > 0) return hours / HOURS_PER_WORKDAY;
  return duration;
}

export interface ReplacePortfolioOptions {
  /** Preserve explicit revision/updatedAt (sync pull/push). */
  revision?: number;
  updatedAt?: Date;
  /** When true, do not increment revision (internal sync writes). */
  preserveRevision?: boolean;
}

/** Lightweight metadata for sync comparisons. */
export async function getPortfolioMeta(prisma: PrismaClient): Promise<PortfolioMeta | null> {
  const row = await prisma.portfolio.findUnique({
    where: { id: PORTFOLIO_ID },
    select: { revision: true, updatedAt: true },
  });
  if (!row) return null;
  return { revision: row.revision, updatedAt: row.updatedAt };
}

/** Reconstruct the nested Portfolio JSON the frontend expects, from the relational tables. */
export async function getPortfolio(prisma: PrismaClient): Promise<WirePortfolio | null> {
  const [row, resources, demands, customFields] = await Promise.all([
    prisma.portfolio.findUnique({ where: { id: PORTFOLIO_ID } }),
    prisma.resource.findMany({ where: { portfolioId: PORTFOLIO_ID } }),
    prisma.demand.findMany({ where: { portfolioId: PORTFOLIO_ID } }),
    prisma.customFieldDef.findMany({ where: { portfolioId: PORTFOLIO_ID } }),
  ]);
  if (!row) return null;

  const projectRows = await prisma.project.findMany({
    where: { portfolioId: PORTFOLIO_ID },
    include: {
      tasks: { include: { assignments: true }, orderBy: { order: "asc" } },
      dependencies: true,
      risks: true,
      actions: true,
      issues: true,
      decisions: true,
      timeEntries: true,
    },
  });

  const projects: WireProject[] = projectRows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    manager: p.manager,
    status: p.status,
    health: p.health,
    budget: p.budget,
    projectStart: p.projectStart,
    baselineCapturedAt: p.baselineCapturedAt ?? undefined,
    baselines: (p.baselines as WireProject["baselines"] | null) ?? undefined,
    evmStatusDate: p.evmStatusDate ?? undefined,
    progressMode: (p.progressMode as WireProject["progressMode"] | null) ?? undefined,
    strategicAxis: p.strategicAxis ?? undefined,
    sourceDemandId: p.sourceDemandId ?? undefined,
    custom: (p.custom as Record<string, string | number> | null) ?? undefined,
    tasks: p.tasks.map(
      (t): Task => ({
        id: t.id,
        name: t.name,
        parentId: t.parentId,
        order: t.order,
        duration: readTaskDuration(t.duration, t.custom),
        percentComplete: t.percentComplete,
        constraint: t.constraintType
          ? { type: t.constraintType as ConstraintType, date: t.constraintDate ?? undefined }
          : undefined,
        assignments: t.assignments.map((a) => ({ resourceId: a.resourceId, units: a.units })),
        fixedCost: t.fixedCost ?? undefined,
        notes: t.notes ?? undefined,
        baseline:
          t.baselineStart && t.baselineFinish != null && t.baselineCost != null
            ? { start: t.baselineStart, finish: t.baselineFinish, cost: t.baselineCost }
            : undefined,
        actualCost: t.actualCost ?? undefined,
        custom: (t.custom as Record<string, string | number> | null) ?? undefined,
      }),
    ),
    dependencies: p.dependencies.map((d) => ({
      predecessorId: d.predecessorId,
      successorId: d.successorId,
      type: d.type as DependencyType,
      lag: d.lag,
    })),
    risks: p.risks.map((r) => {
      const row = r as typeof r & {
        category?: string | null;
        strategy?: string | null;
        triggers?: unknown;
        residualProbability?: number | null;
        residualImpact?: number | null;
        assessment?: unknown;
      };
      return {
      id: row.id,
      label: row.label,
      probability: row.probability,
      impact: row.impact,
      owner: row.owner,
      status: row.status,
      mitigation: row.mitigation ?? undefined,
      category: row.category ?? undefined,
      strategy: row.strategy ?? undefined,
      triggers: readStringArray(row.triggers),
      residualProbability: row.residualProbability ?? undefined,
      residualImpact: row.residualImpact ?? undefined,
      assessment: (row.assessment as WireRiskAssessment | null) ?? undefined,
    };
    }),
    actions: p.actions.map((a) => ({ id: a.id, label: a.label, owner: a.owner, dueDate: a.dueDate, status: a.status })),
    issues: p.issues.map((i) => ({ id: i.id, label: i.label, owner: i.owner, severity: i.severity, status: i.status })),
    decisions: p.decisions.map((d) => ({
      id: d.id,
      label: d.label,
      decidedBy: d.decidedBy,
      date: d.date,
      rationale: d.rationale ?? undefined,
    })),
    timesheets: p.timeEntries.map((te) => ({
      id: te.id,
      taskId: te.taskId,
      resourceId: te.resourceId,
      weekStart: te.weekStart,
      days: te.days,
    })),
  }));

  return {
    name: row.name,
    appName: row.appName,
    fiscalYear: row.fiscalYear,
    calendar: { workingWeekdays: readIntArray(row.calendarWorkdays), holidays: readStringArray(row.calendarHolidays) },
    resources: resources.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind as ResourceKind,
      capacity: r.capacity,
      costPerDay: r.costPerDay,
      role: r.role ?? undefined,
    })),
    projects,
    demands: demands.map((d) => ({
      id: d.id,
      title: d.title,
      sponsor: d.sponsor,
      description: d.description,
      estBudget: d.estBudget,
      value: d.value,
      effort: d.effort,
      stage: d.stage,
      createdAt: d.createdAt,
      convertedProjectId: d.convertedProjectId ?? undefined,
      gateHistory: (d.gateHistory as WireGateRecord[] | null) ?? undefined,
      budgetSponsor: d.budgetSponsor ?? undefined,
      desiredDate: d.desiredDate ?? undefined,
      dependsOnProjectId: d.dependsOnProjectId ?? undefined,
      strategicAxis: d.strategicAxis ?? undefined,
    })),
    customFields: customFields.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      options: readStringArray(f.options),
    })),
    governanceEvents: (row.governanceEvents as WireGovernanceEvent[] | null) ?? undefined,
    surveys: (row.surveys as WireSurveyResponse[] | null) ?? undefined,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Full replace inside one transaction: delete everything under the singleton
 * portfolio, then recreate it from the payload. Simple and correct for a
 * single user on a low-frequency autosave; not built for concurrent writers.
 */
export async function replacePortfolio(
  prisma: PrismaClient,
  payload: WirePortfolio,
  opts: ReplacePortfolioOptions = {},
): Promise<PortfolioMeta> {
  const existing = await prisma.portfolio.findUnique({
    where: { id: PORTFOLIO_ID },
    select: { revision: true },
  });
  const nextRevision = opts.preserveRevision
    ? (opts.revision ?? existing?.revision ?? 0)
    : (opts.revision ?? (existing?.revision ?? 0) + 1);
  const nextUpdatedAt = opts.updatedAt ?? new Date();

  await prisma.$transaction(
    async (tx) => {
    await tx.project.deleteMany({ where: { portfolioId: PORTFOLIO_ID } });
    await tx.resource.deleteMany({ where: { portfolioId: PORTFOLIO_ID } });
    await tx.demand.deleteMany({ where: { portfolioId: PORTFOLIO_ID } });
    await tx.customFieldDef.deleteMany({ where: { portfolioId: PORTFOLIO_ID } });

    await tx.portfolio.upsert({
      where: { id: PORTFOLIO_ID },
      create: {
        id: PORTFOLIO_ID,
        name: payload.name,
        appName: payload.appName ?? "Atelier",
        fiscalYear: payload.fiscalYear ?? new Date().getFullYear(),
        calendarWorkdays: payload.calendar.workingWeekdays,
        calendarHolidays: payload.calendar.holidays,
        revision: nextRevision,
        updatedAt: nextUpdatedAt,
        governanceEvents: (payload.governanceEvents ?? []) as unknown as Prisma.InputJsonValue,
        surveys: (payload.surveys ?? []) as unknown as Prisma.InputJsonValue,
      },
      update: {
        name: payload.name,
        appName: payload.appName ?? "Atelier",
        fiscalYear: payload.fiscalYear ?? new Date().getFullYear(),
        calendarWorkdays: payload.calendar.workingWeekdays,
        calendarHolidays: payload.calendar.holidays,
        revision: nextRevision,
        updatedAt: nextUpdatedAt,
        governanceEvents: (payload.governanceEvents ?? []) as unknown as Prisma.InputJsonValue,
        surveys: (payload.surveys ?? []) as unknown as Prisma.InputJsonValue,
      },
    });

    if (payload.resources.length > 0) {
      await tx.resource.createMany({
        data: payload.resources.map((r) => ({
          id: r.id,
          portfolioId: PORTFOLIO_ID,
          name: r.name,
          kind: r.kind,
          capacity: r.capacity,
          costPerDay: r.costPerDay,
          role: r.role ?? null,
        })),
      });
    }

    if (payload.projects.length > 0) {
      await tx.project.createMany({
        data: payload.projects.map((p) => ({
          id: p.id,
          portfolioId: PORTFOLIO_ID,
          code: p.code,
          name: p.name,
          description: p.description,
          manager: p.manager,
          status: p.status,
          health: p.health,
          budget: p.budget,
          projectStart: p.projectStart,
          baselineCapturedAt: p.baselineCapturedAt ?? null,
          baselines: (p.baselines as Prisma.InputJsonValue | undefined) ?? undefined,
          evmStatusDate: p.evmStatusDate ?? null,
          progressMode: p.progressMode ?? null,
          strategicAxis: p.strategicAxis ?? null,
          sourceDemandId: p.sourceDemandId ?? null,
          custom: p.custom ?? undefined,
        })),
      });
    }

    const allTasks = payload.projects.flatMap((p) => p.tasks.map((t) => ({ projectId: p.id, task: t })));
    if (allTasks.length > 0) {
      await tx.task.createMany({
        data: allTasks.map(({ projectId, task: t }) => ({
          id: t.id,
          projectId,
          name: t.name,
          parentId: t.parentId,
          order: t.order,
          duration: t.duration,
          percentComplete: t.percentComplete,
          constraintType: t.constraint?.type ?? null,
          constraintDate: t.constraint?.date ?? null,
          fixedCost: t.fixedCost ?? null,
          notes: t.notes ?? null,
          baselineStart: t.baseline?.start ?? null,
          baselineFinish: t.baseline?.finish ?? null,
          baselineCost: t.baseline?.cost ?? null,
          actualCost: t.actualCost ?? null,
          custom: t.custom ?? undefined,
        })),
      });
    }

    const allAssignments = allTasks.flatMap(({ task: t }) =>
      t.assignments.map((a) => ({ taskId: t.id, resourceId: a.resourceId, units: a.units })),
    );
    if (allAssignments.length > 0) await tx.assignment.createMany({ data: allAssignments });

    const allDeps = payload.projects.flatMap((p) =>
      p.dependencies.map((d) => ({
        projectId: p.id,
        predecessorId: d.predecessorId,
        successorId: d.successorId,
        type: d.type,
        lag: d.lag,
      })),
    );
    if (allDeps.length > 0) await tx.dependency.createMany({ data: allDeps });

    const allRisks = payload.projects.flatMap((p) =>
      p.risks.map((r) => ({
        id: r.id,
        projectId: p.id,
        label: r.label,
        probability: r.probability,
        impact: r.impact,
        owner: r.owner,
        status: r.status,
        mitigation: r.mitigation ?? null,
        category: r.category ?? null,
        strategy: r.strategy ?? null,
        triggers: r.triggers?.length ? r.triggers : undefined,
        residualProbability: r.residualProbability ?? null,
        residualImpact: r.residualImpact ?? null,
        assessment: (r.assessment ?? undefined) as Prisma.InputJsonValue | undefined,
      })),
    );
    if (allRisks.length > 0) await tx.risk.createMany({ data: allRisks });

    const allActions = payload.projects.flatMap((p) => p.actions.map((a) => ({ ...a, projectId: p.id })));
    if (allActions.length > 0) await tx.action.createMany({ data: allActions });

    const allIssues = payload.projects.flatMap((p) => p.issues.map((i) => ({ ...i, projectId: p.id })));
    if (allIssues.length > 0) await tx.issue.createMany({ data: allIssues });

    const allDecisions = payload.projects.flatMap((p) =>
      p.decisions.map((d) => ({ ...d, projectId: p.id, rationale: d.rationale ?? null })),
    );
    if (allDecisions.length > 0) await tx.decision.createMany({ data: allDecisions });

    const allTimeEntries = payload.projects.flatMap((p) => p.timesheets.map((te) => ({ ...te, projectId: p.id })));
    if (allTimeEntries.length > 0) await tx.timeEntry.createMany({ data: allTimeEntries });

    if (payload.demands.length > 0) {
      await tx.demand.createMany({
        data: payload.demands.map((d) => ({
          id: d.id,
          portfolioId: PORTFOLIO_ID,
          title: d.title,
          sponsor: d.sponsor,
          description: d.description,
          estBudget: d.estBudget,
          value: d.value,
          effort: d.effort,
          stage: d.stage,
          createdAt: d.createdAt,
          convertedProjectId: d.convertedProjectId ?? null,
          gateHistory: (d.gateHistory as Prisma.InputJsonValue[] | undefined) ?? undefined,
          budgetSponsor: d.budgetSponsor ?? null,
          desiredDate: d.desiredDate ?? null,
          dependsOnProjectId: d.dependsOnProjectId ?? null,
          strategicAxis: d.strategicAxis ?? null,
        })),
      });
    }

    if (payload.customFields.length > 0) {
      await tx.customFieldDef.createMany({
        data: payload.customFields.map((f) => ({ ...f, portfolioId: PORTFOLIO_ID, options: f.options ?? [] })),
      });
    }
    },
    { timeout: 20_000 },
  );

  return { revision: nextRevision, updatedAt: nextUpdatedAt };
}
