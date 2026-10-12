import type { DemandStage } from "../domain";
import type { WireCopilotMemory } from "./types";

export function applyPreferences(
  intent: string,
  slots: Record<string, unknown>,
  memory: WireCopilotMemory,
): Record<string, unknown> {
  const out = { ...slots };
  const prefs = memory.preferences;

  if (intent === "createProject" && !out.manager && prefs.defaultProjectManager) {
    out.manager = prefs.defaultProjectManager;
  }

  if (intent === "moveDemand" && out.stage && !out.approver) {
    const stage = String(out.stage) as DemandStage;
    const approver = prefs.defaultGateApprovers?.[stage];
    if (approver) out.approver = approver;
  }

  return out;
}

export function learnFromExecution(
  memory: WireCopilotMemory,
  intent: string,
  slots: Record<string, unknown>,
): WireCopilotMemory {
  const preferences = { ...memory.preferences, managerCounts: { ...memory.preferences.managerCounts } };

  if (intent === "createProject" && slots.manager) {
    const manager = String(slots.manager);
    const counts = preferences.managerCounts ?? {};
    counts[manager] = (counts[manager] ?? 0) + 1;
    preferences.managerCounts = counts;
    let top = manager;
    let topN = 0;
    for (const [name, n] of Object.entries(counts)) {
      if (n > topN) {
        top = name;
        topN = n;
      }
    }
    if (topN >= 3) preferences.defaultProjectManager = top;
  }

  if (intent === "moveDemand" && slots.stage && slots.approver) {
    const stage = String(slots.stage) as DemandStage;
    preferences.defaultGateApprovers = {
      ...preferences.defaultGateApprovers,
      [stage]: String(slots.approver),
    };
  }

  return { ...memory, preferences };
}
