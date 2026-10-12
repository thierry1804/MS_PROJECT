import type { Portfolio } from "../domain";

/** Subset of Zustand store methods invoked by the copilot registry. */
export interface CopilotStore {
  portfolio: Portfolio;
  createProject: (draft: import("../domain").ProjectDraft) => string;
  updateProject: (
    projectId: string,
    patch: Partial<
      Pick<
        import("../domain").Project,
        "status" | "health" | "manager" | "name" | "description" | "budget" | "projectStart" | "strategicAxis" | "evmStatusDate" | "progressMode"
      >
    >,
  ) => void;
  deleteProject: (projectId: string) => void;
  addRaidItem: (
    projectId: string,
    kind: import("../domain").RaidKind,
    item: import("../domain").RaidItem,
  ) => void;
  updateRaidItem: (
    projectId: string,
    kind: import("../domain").RaidKind,
    id: string,
    patch: Partial<import("../domain").RaidItem>,
  ) => void;
  removeRaidItem: (projectId: string, kind: import("../domain").RaidKind, id: string) => void;
  addDemand: (demand: import("../domain").Demand) => void;
  moveDemand: (
    id: string,
    stage: import("../domain").DemandStage,
    gate?: { approver: string; comment?: string; criteria: string[] },
  ) => void;
  convertDemand: (id: string) => string | null;
  deleteDemand: (id: string) => void;
  addTask: (projectId: string) => void;
  addSubTask: (projectId: string, parentTaskId: string) => void;
  updateTask: (projectId: string, taskId: string, patch: Partial<import("@atelier/scheduling-engine").Task>) => void;
  addDependency: (projectId: string, dep: import("@atelier/scheduling-engine").Dependency) => void;
  captureBaseline: (projectId: string, name?: string) => void;
  logTime: (projectId: string, taskId: string, resourceId: string, weekStart: string, days: number) => void;
  addResource: (resource: import("@atelier/scheduling-engine").Resource) => void;
  updateResource: (id: string, patch: Partial<import("@atelier/scheduling-engine").Resource>) => void;
}

export type CopilotStoreGetter = () => CopilotStore;
