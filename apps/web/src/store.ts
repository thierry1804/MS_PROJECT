import { create } from "zustand";
import {
  computeMetrics,
  computeSchedule,
  levelResources,
  taskPlannedCost,
  type Dependency,
  type ProjectMetrics,
  type Resource,
  type ScheduleResult,
  type Task,
} from "@atelier/scheduling-engine";
import type {
  CustomFieldDef,
  Demand,
  DemandStage,
  GateRecord,
  GovernanceEvent,
  Portfolio,
  Project,
  ProjectDraft,
  RaidItem,
  RaidKind,
  SurveyResponse,
} from "./domain";
import { DEMAND_STAGE_LABELS, todayISO } from "./domain";
import { seedPortfolio } from "./seed";
import { fetchPortfolio, logAudit, savePortfolio } from "./sync";

const RAID_LABELS: Record<RaidKind, string> = {
  risks: "Risque",
  actions: "Action",
  issues: "Problème",
  decisions: "Décision",
};

const TASK_FIELD_LABELS: Partial<Record<keyof Task, string>> = {
  name: "nom",
  duration: "durée (j)",
  percentComplete: "avancement (%)",
  notes: "notes",
};

/** One-line diff of the fields the grid/inspector actually let users edit. Returns null if nothing tracked changed. */
function summarizeTaskPatch(before: Task, patch: Partial<Task>): string | null {
  const parts: string[] = [];
  for (const key of Object.keys(TASK_FIELD_LABELS) as (keyof typeof TASK_FIELD_LABELS)[]) {
    if (!(key in patch)) continue;
    const oldV = before[key];
    const newV = (patch as Record<string, unknown>)[key];
    if (oldV === newV) continue;
    parts.push(`${TASK_FIELD_LABELS[key]} : ${oldV ?? "—"} → ${newV ?? "—"}`);
  }
  if ("constraint" in patch) {
    const fmt = (c?: Task["constraint"]) => (c ? `${c.type}${c.date ? " " + c.date : ""}` : "ASAP");
    const before_ = fmt(before.constraint);
    const after_ = fmt(patch.constraint);
    if (before_ !== after_) parts.push(`contrainte : ${before_} → ${after_}`);
  }
  return parts.length ? parts.join(", ") : null;
}

/** Autosave status, surfaced so the shell can show a small "syncing…" hint. */
export type SyncStatus = "loading" | "saved" | "saving" | "error" | "offline";

interface AppState {
  portfolio: Portfolio;
  syncStatus: SyncStatus;
  /** Task selected in the project view. */
  selectedTaskId: string | null;
  /** Collapsed summary task ids. */
  collapsed: Record<string, boolean>;
  selectTask: (id: string | null) => void;
  toggleCollapse: (taskId: string) => void;
  updateTask: (projectId: string, taskId: string, patch: Partial<Task>) => void;
  /** Snapshot current schedule dates + planned costs into task.baseline fields. */
  captureBaseline: (projectId: string) => void;
  /** Set task.actualCost (from timesheets / manual entry). */
  updateActualCost: (projectId: string, taskId: string, cost: number) => void;
  /** Add a dependency; no-op if it duplicates an existing predecessor→successor link. */
  addDependency: (projectId: string, dep: Dependency) => void;
  removeDependency: (projectId: string, predecessorId: string, successorId: string) => void;
  /** Append an item to one of the project's RAID registers. */
  addRaidItem: (projectId: string, kind: RaidKind, item: RaidItem) => void;
  /** Patch a RAID item by id (e.g. toggle status). */
  updateRaidItem: (projectId: string, kind: RaidKind, id: string, patch: Partial<RaidItem>) => void;
  removeRaidItem: (projectId: string, kind: RaidKind, id: string) => void;
  /** Auto-level over-booked resources by adding SNET constraints (one heuristic pass). */
  applyLeveling: (projectId: string) => void;
  /** Upsert a weekly time entry, then recompute the task's actual cost from all its entries. */
  logTime: (projectId: string, taskId: string, resourceId: string, weekStart: string, days: number) => void;
  /** Create a project from the intake form; returns its generated id. */
  createProject: (draft: ProjectDraft) => string;
  /** Discard all local edits and restore the seed portfolio. */
  resetPortfolio: () => void;
  /** Remove a project entirely from the portfolio. */
  deleteProject: (projectId: string) => void;
  /** Add a new demand to the intake pipeline. */
  addDemand: (demand: Demand) => void;
  updateDemand: (id: string, patch: Partial<Demand>) => void;
  /** Move a demand to a pipeline stage. `gate` is set when advancing through a formal stage-gate (records approver + checklist). */
  moveDemand: (id: string, stage: DemandStage, gate?: { approver: string; comment?: string; criteria: string[] }) => void;
  /** Convert an approved demand into an active project; returns the new project id. */
  convertDemand: (id: string) => string | null;
  /** Log a governance ritual (comité, revue) for the participation KPI. */
  addGovernanceEvent: (event: GovernanceEvent) => void;
  /** Log an internal-satisfaction survey response for the NPS KPI. */
  addSurveyResponse: (response: SurveyResponse) => void;
  /** Add a resource to the portfolio pool. */
  addResource: (resource: Resource) => void;
  updateResource: (id: string, patch: Partial<Resource>) => void;
  /** Remove a resource and strip any assignment referencing it from every project's tasks. */
  removeResource: (id: string) => void;
  /** Define a new task-level custom field. */
  addCustomField: (field: CustomFieldDef) => void;
  removeCustomField: (id: string) => void;
  /** Append a new empty leaf task at root level. */
  addTask: (projectId: string) => void;
  /** Append a new leaf task as a child of parentTaskId. */
  addSubTask: (projectId: string, parentTaskId: string) => void;
  /** Indent: make the task a child of its previous sibling (that sibling becomes a summary). */
  indentTask: (projectId: string, taskId: string) => void;
  /** Outdent: promote the task to sit right after its former parent, one level up. */
  outdentTask: (projectId: string, taskId: string) => void;
  /** Delete a task and its whole subtree, plus any dependency touching them. */
  deleteTask: (projectId: string, taskId: string) => void;
  /** Retry a failed autosave with the current in-memory portfolio. */
  retrySync: () => void;
}

function slugId(code: string): string {
  const base = code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "projet";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export const useStore = create<AppState>()((set, get) => ({
      portfolio: seedPortfolio,
      syncStatus: "loading",
      selectedTaskId: null,
      collapsed: {},

  selectTask: (id) => set({ selectedTaskId: id }),

  toggleCollapse: (taskId) =>
    set((s) => ({ collapsed: { ...s.collapsed, [taskId]: !s.collapsed[taskId] } })),

  updateTask: (projectId, taskId, patch) => {
    const before = get().portfolio.projects.find((p) => p.id === projectId)?.tasks.find((t) => t.id === taskId);
    set((s) => ({
      portfolio: {
        ...s.portfolio,
        projects: s.portfolio.projects.map((p) =>
          p.id !== projectId
            ? p
            : { ...p, tasks: p.tasks.map((t) => (t.id !== taskId ? t : { ...t, ...patch })) },
        ),
      },
    }));
    if (before) {
      const summary = summarizeTaskPatch(before, patch);
      if (summary) {
        void logAudit({ entityType: "task", entityId: taskId, action: "update", summary: `Tâche « ${before.name} » : ${summary}` });
      }
    }
  },

  captureBaseline: (projectId) => {
    set((s) => {
      const project = s.portfolio.projects.find((p) => p.id === projectId);
      if (!project) return s;
      const sched = scheduleOf(project, s.portfolio);
      const rmap = new Map(s.portfolio.resources.map((r) => [r.id, r]));
      const d = new Date();
      const capturedAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const tasks = project.tasks.map((t) => {
        const st = sched.tasks.get(t.id);
        if (!st || st.isSummary) return t;
        return {
          ...t,
          baseline: { start: st.startDate, finish: st.finishDate, cost: taskPlannedCost(t, st.duration, rmap) },
        };
      });
      return {
        portfolio: {
          ...s.portfolio,
          projects: s.portfolio.projects.map((p) =>
            p.id !== projectId ? p : { ...p, tasks, baselineCapturedAt: capturedAt },
          ),
        },
      };
    });
    const project = get().portfolio.projects.find((p) => p.id === projectId);
    if (project) {
      void logAudit({ entityType: "project", entityId: projectId, action: "baseline", summary: `Baseline capturée : ${project.name}` });
    }
  },

  updateActualCost: (projectId, taskId, cost) => {
    const before = get().portfolio.projects.find((p) => p.id === projectId)?.tasks.find((t) => t.id === taskId);
    set((s) => ({
      portfolio: {
        ...s.portfolio,
        projects: s.portfolio.projects.map((p) =>
          p.id !== projectId
            ? p
            : { ...p, tasks: p.tasks.map((t) => (t.id !== taskId ? t : { ...t, actualCost: cost })) },
        ),
      },
    }));
    if (before && (before.actualCost ?? 0) !== cost) {
      void logAudit({
        entityType: "task",
        entityId: taskId,
        action: "update",
        summary: `Tâche « ${before.name} » : coût réel ${before.actualCost ?? 0} € → ${cost} €`,
      });
    }
  },

  addDependency: (projectId, dep) =>
    set((s) => ({
      portfolio: {
        ...s.portfolio,
        projects: s.portfolio.projects.map((p) => {
          if (p.id !== projectId) return p;
          const exists = p.dependencies.some(
            (d) => d.predecessorId === dep.predecessorId && d.successorId === dep.successorId,
          );
          if (exists || dep.predecessorId === dep.successorId) return p;
          if (wouldCycle(p.dependencies, dep.predecessorId, dep.successorId)) return p;
          return { ...p, dependencies: [...p.dependencies, dep] };
        }),
      },
    })),

  removeDependency: (projectId, predecessorId, successorId) =>
    set((s) => ({
      portfolio: {
        ...s.portfolio,
        projects: s.portfolio.projects.map((p) =>
          p.id !== projectId
            ? p
            : {
                ...p,
                dependencies: p.dependencies.filter(
                  (d) => !(d.predecessorId === predecessorId && d.successorId === successorId),
                ),
              },
        ),
      },
    })),

  addRaidItem: (projectId, kind, item) => {
    set((s) => ({
      portfolio: {
        ...s.portfolio,
        projects: s.portfolio.projects.map((p) =>
          p.id !== projectId ? p : { ...p, [kind]: [...(p[kind] as RaidItem[]), item] },
        ),
      },
    }));
    void logAudit({
      entityType: kind,
      entityId: item.id,
      action: "create",
      summary: `${RAID_LABELS[kind]} ajouté(e) : ${(item as { label: string }).label}`,
    });
  },

  updateRaidItem: (projectId, kind, id, patch) => {
    const beforeProject = get().portfolio.projects.find((p) => p.id === projectId);
    const before = beforeProject ? (beforeProject[kind] as RaidItem[]).find((it) => it.id === id) : undefined;
    set((s) => ({
      portfolio: {
        ...s.portfolio,
        projects: s.portfolio.projects.map((p) =>
          p.id !== projectId
            ? p
            : {
                ...p,
                [kind]: (p[kind] as RaidItem[]).map((it) => (it.id !== id ? it : { ...it, ...patch })),
              },
        ),
      },
    }));
    if (before) {
      const patchRec = patch as Record<string, unknown>;
      const beforeRec = before as unknown as Record<string, unknown>;
      const statusNote =
        "status" in patchRec && patchRec.status !== beforeRec.status
          ? ` (statut : ${beforeRec.status} → ${patchRec.status})`
          : "";
      void logAudit({
        entityType: kind,
        entityId: id,
        action: "update",
        summary: `${RAID_LABELS[kind]} modifié(e) : ${before.label}${statusNote}`,
      });
    }
  },

  removeRaidItem: (projectId, kind, id) => {
    const beforeProject = get().portfolio.projects.find((p) => p.id === projectId);
    const before = beforeProject ? (beforeProject[kind] as RaidItem[]).find((it) => it.id === id) : undefined;
    set((s) => ({
      portfolio: {
        ...s.portfolio,
        projects: s.portfolio.projects.map((p) =>
          p.id !== projectId
            ? p
            : { ...p, [kind]: (p[kind] as RaidItem[]).filter((it) => it.id !== id) },
        ),
      },
    }));
    if (before) {
      void logAudit({
        entityType: kind,
        entityId: id,
        action: "delete",
        summary: `${RAID_LABELS[kind]} supprimé(e) : ${before.label}`,
      });
    }
  },

  logTime: (projectId, taskId, resourceId, weekStart, days) =>
    set((s) => {
      const project = s.portfolio.projects.find((p) => p.id === projectId);
      if (!project) return s;
      const sheets = (project.timesheets ?? []).filter(
        (e) => !(e.taskId === taskId && e.resourceId === resourceId && e.weekStart === weekStart),
      );
      if (days > 0) {
        sheets.push({ id: `ts-${taskId}-${resourceId}-${weekStart}`, taskId, resourceId, weekStart, days });
      }
      // Actual cost of the task = Σ all its logged days × each resource's daily rate.
      const rateOf = (rid: string) => s.portfolio.resources.find((r) => r.id === rid)?.costPerDay ?? 0;
      const taskCost = sheets
        .filter((e) => e.taskId === taskId)
        .reduce((sum, e) => sum + e.days * rateOf(e.resourceId), 0);
      return {
        portfolio: {
          ...s.portfolio,
          projects: s.portfolio.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  timesheets: sheets,
                  tasks: p.tasks.map((t) => (t.id !== taskId ? t : { ...t, actualCost: taskCost })),
                },
          ),
        },
      };
    }),

  applyLeveling: (projectId) => {
    const project = get().portfolio.projects.find((p) => p.id === projectId);
    if (!project) return;
    const sched = scheduleOf(project, get().portfolio);
    const proposals = levelResources(project.tasks, sched, get().portfolio.resources, get().portfolio.calendar, project.projectStart);
    if (proposals.length === 0) return;
    const byId = new Map(proposals.map((p) => [p.taskId, p]));
    set((s) => ({
      portfolio: {
        ...s.portfolio,
        projects: s.portfolio.projects.map((pp) =>
          pp.id !== projectId
            ? pp
            : {
                ...pp,
                tasks: pp.tasks.map((t) => {
                  const p = byId.get(t.id);
                  return p ? { ...t, constraint: { type: "SNET" as const, date: p.notBefore } } : t;
                }),
              },
        ),
      },
    }));
    void logAudit({
      entityType: "project",
      entityId: projectId,
      action: "level",
      summary: `Nivellement appliqué : ${project.name} (${proposals.length} tâche${proposals.length > 1 ? "s" : ""})`,
    });
  },

  createProject: (draft) => {
    const id = slugId(draft.code);
    const project: Project = {
      id,
      code: draft.code.trim().toUpperCase() || "NEW",
      name: draft.name.trim() || "Nouveau projet",
      description: draft.description.trim(),
      manager: draft.manager.trim() || "PMO",
      status: "cadrage",
      health: "green",
      budget: draft.budget,
      projectStart: draft.projectStart,
      tasks: [],
      dependencies: [],
      risks: [],
      actions: [],
      issues: [],
      decisions: [],
    };
    set((s) => ({ portfolio: { ...s.portfolio, projects: [...s.portfolio.projects, project] } }));
    void logAudit({ entityType: "project", entityId: id, action: "create", summary: `Projet créé : ${project.name} (${project.code})` });
    return id;
  },

  resetPortfolio: () => {
    set({ portfolio: structuredClone(seedPortfolio), selectedTaskId: null, collapsed: {} });
    void logAudit({ entityType: "portfolio", entityId: "default", action: "reset", summary: "Portefeuille réinitialisé aux données de démonstration" });
  },

  deleteProject: (projectId) => {
    const project = get().portfolio.projects.find((p) => p.id === projectId);
    set((s) => ({
      portfolio: {
        ...s.portfolio,
        projects: s.portfolio.projects.filter((p) => p.id !== projectId),
      },
    }));
    if (project) {
      void logAudit({ entityType: "project", entityId: projectId, action: "delete", summary: `Projet supprimé : ${project.name} (${project.code})` });
    }
  },

  addDemand: (demand) =>
    set((s) => ({ portfolio: { ...s.portfolio, demands: [...(s.portfolio.demands ?? []), demand] } })),

  updateDemand: (id, patch) =>
    set((s) => ({
      portfolio: {
        ...s.portfolio,
        demands: (s.portfolio.demands ?? []).map((d) => (d.id !== id ? d : { ...d, ...patch })),
      },
    })),

  addGovernanceEvent: (event) => {
    set((s) => ({
      portfolio: { ...s.portfolio, governanceEvents: [...(s.portfolio.governanceEvents ?? []), event] },
    }));
    void logAudit({
      entityType: "governance",
      entityId: event.id,
      action: "create",
      summary: `Rituel enregistré : ${event.label} (${event.attendees}/${event.expected} présents)`,
    });
  },

  addSurveyResponse: (response) => {
    set((s) => ({ portfolio: { ...s.portfolio, surveys: [...(s.portfolio.surveys ?? []), response] } }));
    void logAudit({
      entityType: "survey",
      entityId: response.id,
      action: "create",
      summary: `Réponse baromètre PMO enregistrée (score ${response.score}/10)`,
    });
  },

  addResource: (resource) => {
    set((s) => ({ portfolio: { ...s.portfolio, resources: [...s.portfolio.resources, resource] } }));
    void logAudit({
      entityType: "resource",
      entityId: resource.id,
      action: "create",
      summary: `Ressource ajoutée : ${resource.name}`,
    });
  },

  updateResource: (id, patch) =>
    set((s) => ({
      portfolio: {
        ...s.portfolio,
        resources: s.portfolio.resources.map((r) => (r.id !== id ? r : { ...r, ...patch })),
      },
    })),

  removeResource: (id) => {
    const before = get().portfolio.resources.find((r) => r.id === id);
    set((s) => ({
      portfolio: {
        ...s.portfolio,
        resources: s.portfolio.resources.filter((r) => r.id !== id),
        projects: s.portfolio.projects.map((p) => ({
          ...p,
          tasks: p.tasks.map((t) =>
            t.assignments.some((a) => a.resourceId === id)
              ? { ...t, assignments: t.assignments.filter((a) => a.resourceId !== id) }
              : t,
          ),
        })),
      },
    }));
    if (before) {
      void logAudit({
        entityType: "resource",
        entityId: id,
        action: "delete",
        summary: `Ressource supprimée : ${before.name}`,
      });
    }
  },

  moveDemand: (id, stage, gate) => {
    const before = get().portfolio.demands?.find((d) => d.id === id);
    const gateRecord: GateRecord | undefined = gate
      ? { stage, approver: gate.approver, comment: gate.comment, criteria: gate.criteria, at: todayISO() }
      : undefined;
    set((s) => ({
      portfolio: {
        ...s.portfolio,
        demands: (s.portfolio.demands ?? []).map((d) =>
          d.id !== id
            ? d
            : { ...d, stage, gateHistory: gateRecord ? [...(d.gateHistory ?? []), gateRecord] : d.gateHistory },
        ),
      },
    }));
    if (before) {
      const approverNote = gate ? ` (approuvé par ${gate.approver})` : "";
      void logAudit({
        entityType: "demand",
        entityId: id,
        action: "stage",
        summary: `Demande « ${before.title} » : ${DEMAND_STAGE_LABELS[before.stage]} → ${DEMAND_STAGE_LABELS[stage]}${approverNote}`,
      });
    }
  },

  convertDemand: (id) => {
    const demand = get().portfolio.demands?.find((d) => d.id === id);
    if (!demand || demand.convertedProjectId) return demand?.convertedProjectId ?? null;
    const projectId = slugId(demand.title.slice(0, 8));
    const project: Project = {
      id: projectId,
      code: demand.title.slice(0, 3).toUpperCase(),
      name: demand.title,
      description: demand.description,
      manager: demand.sponsor,
      status: "cadrage",
      health: "green",
      budget: demand.estBudget,
      projectStart: todayISO(),
      tasks: [],
      dependencies: [],
      risks: [],
      actions: [],
      issues: [],
      decisions: [],
    };
    set((s) => ({
      portfolio: {
        ...s.portfolio,
        projects: [...s.portfolio.projects, project],
        demands: (s.portfolio.demands ?? []).map((d) =>
          d.id !== id ? d : { ...d, stage: "approuvee", convertedProjectId: projectId },
        ),
      },
    }));
    void logAudit({
      entityType: "demand",
      entityId: id,
      action: "convert",
      summary: `Demande « ${demand.title} » convertie en projet ${project.code}`,
    });
    return projectId;
  },

  addCustomField: (field) =>
    set((s) => ({ portfolio: { ...s.portfolio, customFields: [...(s.portfolio.customFields ?? []), field] } })),

  removeCustomField: (id) =>
    set((s) => ({
      portfolio: {
        ...s.portfolio,
        customFields: (s.portfolio.customFields ?? []).filter((f) => f.id !== id),
        // Strip the field's values from every task.
        projects: s.portfolio.projects.map((p) => ({
          ...p,
          tasks: p.tasks.map((t) => {
            if (!t.custom || !(id in t.custom)) return t;
            const { [id]: _drop, ...rest } = t.custom;
            return { ...t, custom: rest };
          }),
        })),
      },
    })),

  addTask: (projectId) =>
    set((s) => {
      const project = s.portfolio.projects.find((p) => p.id === projectId);
      if (!project) return s;
      const maxOrder = project.tasks.reduce((m, t) => Math.max(m, t.order), -1);
      const newTask: Task = {
        id: `${projectId}-t-${Math.random().toString(36).slice(2, 6)}`,
        name: "Nouvelle tâche",
        parentId: null,
        order: maxOrder + 1,
        duration: 1,
        percentComplete: 0,
        assignments: [],
      };
      return {
        portfolio: {
          ...s.portfolio,
          projects: s.portfolio.projects.map((p) =>
            p.id !== projectId ? p : { ...p, tasks: [...p.tasks, newTask] },
          ),
        },
      };
    }),

  addSubTask: (projectId, parentTaskId) =>
    set((s) => {
      const project = s.portfolio.projects.find((p) => p.id === projectId);
      if (!project) return s;
      const siblings = project.tasks.filter((t) => t.parentId === parentTaskId);
      const maxOrder = siblings.reduce((m, t) => Math.max(m, t.order), -1);
      const newTask: Task = {
        id: `${projectId}-t-${Math.random().toString(36).slice(2, 6)}`,
        name: "Nouvelle sous-tâche",
        parentId: parentTaskId,
        order: maxOrder + 1,
        duration: 1,
        percentComplete: 0,
        assignments: [],
      };
      return {
        portfolio: {
          ...s.portfolio,
          projects: s.portfolio.projects.map((p) =>
            p.id !== projectId ? p : { ...p, tasks: [...p.tasks, newTask] },
          ),
        },
      };
    }),

  indentTask: (projectId, taskId) =>
    set((s) => {
      const project = s.portfolio.projects.find((p) => p.id === projectId);
      if (!project) return s;
      const task = project.tasks.find((t) => t.id === taskId);
      if (!task) return s;
      // Previous sibling = the task just above it at the same level.
      const siblings = project.tasks
        .filter((t) => t.parentId === task.parentId)
        .sort((a, b) => a.order - b.order);
      const idx = siblings.findIndex((t) => t.id === taskId);
      if (idx <= 0) return s; // no previous sibling → cannot indent
      const prev = siblings[idx - 1]!;
      const newParentId = prev.id;
      const maxChildOrder = project.tasks
        .filter((t) => t.parentId === newParentId)
        .reduce((m, t) => Math.max(m, t.order), -1);
      return {
        portfolio: {
          ...s.portfolio,
          projects: s.portfolio.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  tasks: p.tasks.map((t) =>
                    t.id !== taskId ? t : { ...t, parentId: newParentId, order: maxChildOrder + 1 },
                  ),
                },
          ),
        },
      };
    }),

  outdentTask: (projectId, taskId) =>
    set((s) => {
      const project = s.portfolio.projects.find((p) => p.id === projectId);
      if (!project) return s;
      const task = project.tasks.find((t) => t.id === taskId);
      if (!task || task.parentId == null) return s; // already at root
      const parent = project.tasks.find((t) => t.id === task.parentId);
      if (!parent) return s;
      const newParentId = parent.parentId;
      // Insert right after the former parent: bump later siblings at the target level.
      const tasks = project.tasks.map((t) => {
        if (t.id === taskId) return { ...t, parentId: newParentId, order: parent.order + 1 };
        if (t.parentId === newParentId && t.order > parent.order) return { ...t, order: t.order + 1 };
        return t;
      });
      return {
        portfolio: {
          ...s.portfolio,
          projects: s.portfolio.projects.map((p) => (p.id !== projectId ? p : { ...p, tasks })),
        },
      };
    }),

  deleteTask: (projectId, taskId) => {
    const project = get().portfolio.projects.find((p) => p.id === projectId);
    if (!project) return;
    const task = project.tasks.find((t) => t.id === taskId);
    // Collect the task and all its descendants.
    const doomed = new Set<string>([taskId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of project.tasks) {
        if (t.parentId && doomed.has(t.parentId) && !doomed.has(t.id)) {
          doomed.add(t.id);
          grew = true;
        }
      }
    }
    set((s) => ({
      selectedTaskId: doomed.has(s.selectedTaskId ?? "") ? null : s.selectedTaskId,
      portfolio: {
        ...s.portfolio,
        projects: s.portfolio.projects.map((p) =>
          p.id !== projectId
            ? p
            : {
                ...p,
                tasks: p.tasks.filter((t) => !doomed.has(t.id)),
                dependencies: p.dependencies.filter(
                  (d) => !doomed.has(d.predecessorId) && !doomed.has(d.successorId),
                ),
              },
        ),
      },
    }));
    if (task) {
      const extra = doomed.size - 1;
      void logAudit({
        entityType: "task",
        entityId: taskId,
        action: "delete",
        summary: `Tâche supprimée : « ${task.name} »${extra > 0 ? ` (+${extra} sous-tâche${extra > 1 ? "s" : ""})` : ""}`,
      });
    }
  },

  retrySync: () => {
    void persistNow(get().portfolio);
  },
}));

/* ------------------------------------------------------------------ */
/* Neon sync: load on startup, autosave (debounced) on every change.  */
/* ------------------------------------------------------------------ */

let hydrated = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function persistNow(portfolio: Portfolio) {
  useStore.setState({ syncStatus: "saving" });
  try {
    await savePortfolio(portfolio);
    useStore.setState({ syncStatus: "saved" });
  } catch {
    useStore.setState({ syncStatus: "error" });
  }
}

function scheduleSave(portfolio: Portfolio) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persistNow(portfolio), 800);
}

useStore.subscribe((state, prev) => {
  if (!hydrated || state.portfolio === prev.portfolio) return;
  scheduleSave(state.portfolio);
});

(async () => {
  try {
    const remote = await fetchPortfolio();
    if (remote) {
      useStore.setState({ portfolio: remote, syncStatus: "saved" });
    } else {
      // Empty database (first run ever): seed it from the local constant.
      await persistNow(useStore.getState().portfolio);
    }
  } catch {
    useStore.setState({ syncStatus: "offline" });
  } finally {
    hydrated = true;
  }
})();

/** True if adding predecessor→successor would create a cycle in the dependency graph. */
function wouldCycle(deps: Dependency[], predecessorId: string, successorId: string): boolean {
  // A cycle appears iff the new predecessor is already reachable from the successor.
  const adj = new Map<string, string[]>();
  for (const d of deps) {
    const arr = adj.get(d.predecessorId) ?? [];
    arr.push(d.successorId);
    adj.set(d.predecessorId, arr);
  }
  const stack = [successorId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === predecessorId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }
  return false;
}

/* Schedule + metrics caches, keyed on project object identity:
   any store update replaces the project object, invalidating its entry. */
const scheduleCache = new WeakMap<Project, ScheduleResult>();
const metricsCache = new WeakMap<Project, ProjectMetrics>();

export function scheduleOf(project: Project, portfolio: Portfolio): ScheduleResult {
  let r = scheduleCache.get(project);
  if (!r) {
    r = computeSchedule({
      tasks: project.tasks,
      dependencies: project.dependencies,
      calendar: portfolio.calendar,
      projectStart: project.projectStart,
    });
    scheduleCache.set(project, r);
  }
  return r;
}

export function metricsOf(project: Project, portfolio: Portfolio): ProjectMetrics {
  let m = metricsCache.get(project);
  if (!m) {
    m = computeMetrics(project.tasks, scheduleOf(project, portfolio), portfolio.resources, {
      calendar: portfolio.calendar,
      projectStart: project.projectStart,
      statusDate: todayISO(),
    });
    metricsCache.set(project, m);
  }
  return m;
}
