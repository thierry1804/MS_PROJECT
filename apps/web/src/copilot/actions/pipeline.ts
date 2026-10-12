import type { Demand, DemandStage } from "../../domain";
import { DEMAND_STAGES, todayISO } from "../../domain";
import type { CopilotStore } from "../store-bridge";
import { uid } from "../uid";

export function mapSlotsToDemand(slots: Record<string, unknown>): Demand {
  return {
    id: uid("demand"),
    title: String(slots.title ?? "").trim(),
    sponsor: String(slots.sponsor ?? "").trim(),
    description: String(slots.description ?? "").trim(),
    estBudget: Math.max(0, Number(slots.estBudget) || 0),
    value: Math.min(5, Math.max(1, Number(slots.value) || 3)),
    effort: Math.min(5, Math.max(1, Number(slots.effort) || 3)),
    stage: "idee",
    createdAt: todayISO(),
  };
}

export function parseDemandStage(raw: unknown): DemandStage {
  const s = String(raw ?? "").toLowerCase();
  if (DEMAND_STAGES.includes(s as DemandStage)) return s as DemandStage;
  if (/qualifi/i.test(s)) return "qualifiee";
  if (/approuv/i.test(s)) return "approuvee";
  if (/rejet/i.test(s)) return "rejetee";
  return "idee";
}

export function executeAddDemand(store: CopilotStore, slots: Record<string, unknown>): void {
  store.addDemand(mapSlotsToDemand(slots));
}

export function executeMoveDemand(store: CopilotStore, slots: Record<string, unknown>): void {
  const demandId = String(slots.demandId);
  const stage = parseDemandStage(slots.stage);
  const needsGate = stage === "qualifiee" || stage === "approuvee";
  const gate =
    needsGate && slots.approver
      ? {
          approver: String(slots.approver),
          comment: slots.comment ? String(slots.comment) : undefined,
          criteria: Array.isArray(slots.criteria) ? (slots.criteria as string[]) : [],
        }
      : undefined;
  store.moveDemand(demandId, stage, gate);
}

export function executeConvertDemand(store: CopilotStore, slots: Record<string, unknown>): string | null {
  return store.convertDemand(String(slots.demandId));
}

export function executeDeleteDemand(store: CopilotStore, slots: Record<string, unknown>): void {
  store.deleteDemand(String(slots.demandId));
}
