import type { ProjectDraft } from "../../domain";
import { todayISO } from "../../domain";
import type { CopilotStore } from "../store-bridge";
import { deriveProjectCode } from "../uid";

export function mapSlotsToProjectDraft(slots: Record<string, unknown>): ProjectDraft {
  const name = String(slots.name ?? "").trim();
  const code = slots.code ? String(slots.code).trim() : deriveProjectCode(name);
  return {
    code,
    name,
    manager: String(slots.manager ?? "PMO").trim(),
    description: String(slots.description ?? "").trim(),
    budget: Math.max(0, Number(slots.budget) || 0),
    projectStart: slots.projectStart ? String(slots.projectStart) : todayISO(),
  };
}

export function executeCreateProject(store: CopilotStore, slots: Record<string, unknown>): string {
  const draft = mapSlotsToProjectDraft(slots);
  return store.createProject(draft);
}

export function executeUpdateProject(store: CopilotStore, slots: Record<string, unknown>): void {
  const projectId = String(slots.projectId);
  const patch: Record<string, unknown> = {};
  if (slots.name !== undefined) patch.name = String(slots.name);
  if (slots.manager !== undefined) patch.manager = String(slots.manager);
  if (slots.budget !== undefined) patch.budget = Number(slots.budget);
  if (slots.status !== undefined) patch.status = slots.status;
  if (slots.health !== undefined) patch.health = slots.health;
  if (slots.description !== undefined) patch.description = String(slots.description);
  if (Object.keys(patch).length === 0 && slots.patch && typeof slots.patch === "object") {
    Object.assign(patch, slots.patch);
  }
  store.updateProject(projectId, patch as Parameters<CopilotStore["updateProject"]>[1]);
}

export function executeDeleteProject(store: CopilotStore, slots: Record<string, unknown>): void {
  store.deleteProject(String(slots.projectId));
}
