import type { Portfolio } from "../domain";
import { DEMAND_STAGES, GATE_CRITERIA, type DemandStage } from "../domain";
import { scheduleOf } from "../store";
import { INTENT_REGISTRY } from "./intents";
import { getMissingSlots } from "./registry";
import type { CopilotIntentId, CopilotQuestion, WireCopilotMemory } from "./types";
import { uid } from "./uid";

const STAGE_ALIASES: Record<string, DemandStage> = {
  idee: "idee",
  idée: "idee",
  idees: "idee",
  qualifiee: "qualifiee",
  qualifiée: "qualifiee",
  qualifiees: "qualifiee",
  approuvee: "approuvee",
  approuvée: "approuvee",
  rejetee: "rejetee",
  rejetée: "rejetee",
};

export function resolveChoices(
  slotKey: string,
  portfolio: Portfolio,
  slots: Record<string, unknown>,
): { id: string; label: string }[] {
  if (slotKey === "projectId") {
    return portfolio.projects.map((p) => ({ id: p.id, label: `${p.name} (${p.code})` }));
  }
  if (slotKey === "demandId") {
    return (portfolio.demands ?? []).map((d) => ({ id: d.id, label: d.title }));
  }
  if (slotKey === "resourceId") {
    return portfolio.resources.map((r) => ({ id: r.id, label: r.name }));
  }
  if (slotKey === "taskId" || slotKey === "predecessorId" || slotKey === "successorId") {
    const projectId = String(slots.projectId ?? "");
    const project = portfolio.projects.find((p) => p.id === projectId);
    if (!project) return [];
    const schedule = scheduleOf(project, portfolio);
    return project.tasks
      .filter((t) => {
        const s = schedule.tasks.get(t.id);
        return s && !s.isSummary;
      })
      .map((t) => {
        const s = schedule.tasks.get(t.id);
        const label = s?.wbs ? `${s.wbs} — ${t.name}` : t.name;
        return { id: t.id, label };
      });
  }
  if (slotKey === "stage") {
    return DEMAND_STAGES.map((s) => ({ id: s, label: s }));
  }
  return [];
}

export function buildQuestionsForIntent(
  intent: CopilotIntentId,
  slots: Record<string, unknown>,
  portfolio: Portfolio,
  memory?: WireCopilotMemory,
): CopilotQuestion[] {
  const missing = getMissingSlots(intent, slots);
  const questions: CopilotQuestion[] = [];

  for (const slot of missing.slice(0, 3)) {
    const statKey = `${intent}.${slot.key}`;
    const stat = memory?.questionStats[statKey];
    if (stat && stat.skipped > 10 && !slot.required) continue;

    const choices = slot.type === "choice" ? resolveChoices(slot.key, portfolio, slots) : slot.choices;
    let type = slot.type as CopilotQuestion["type"];
    if (choices?.length && slot.type !== "checklist") type = "choice";

    if (slot.key === "criteria") {
      const stage = String(slots.stage) as DemandStage;
      const items = GATE_CRITERIA[stage];
      if (items?.length) {
        questions.push({
          id: uid("q"),
          text: `Validez les critères pour l'étape « ${stage} »`,
          type: "checklist",
          slotKey: "criteria",
          checklistItems: items,
        });
        continue;
      }
    }

    questions.push({
      id: uid("q"),
      text: slot.label + (slot.required ? "" : " (optionnel)"),
      type,
      slotKey: slot.key,
      choices,
    });
  }

  const hint = String(slots.userHint ?? slots.label ?? "").toLowerCase();
  if (intent === "addRisk" && /fournisseur|prestataire|vendor/i.test(hint)) {
    questions.push({
      id: uid("q"),
      text: "Existe-t-il un plan B fournisseur ou une solution de contournement ?",
      type: "boolean",
      slotKey: "_planB",
    });
  }

  return questions.slice(0, 3);
}

export function questionStatsKey(intent: CopilotIntentId, slotKey: string): string {
  return `${intent}.${slotKey}`;
}

export function isGateStage(stage: unknown): boolean {
  return stage === "qualifiee" || stage === "approuvee";
}

export function getIntentDef(intent: CopilotIntentId) {
  return INTENT_REGISTRY[intent];
}
