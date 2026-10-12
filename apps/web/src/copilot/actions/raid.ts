import type { Action, Decision, Issue, RaidKind, Risk, RiskCategory } from "../../domain";
import { todayISO } from "../../domain";
import type { CopilotStore } from "../store-bridge";
import { uid } from "../uid";

function clampScore(n: number): number {
  return Math.min(5, Math.max(1, Math.round(n)));
}

export function buildRisk(slots: Record<string, unknown>): Risk {
  return {
    id: uid("risk"),
    label: String(slots.label ?? "").trim(),
    probability: clampScore(Number(slots.probability) || 3),
    impact: clampScore(Number(slots.impact) || 3),
    owner: String(slots.owner ?? "PMO").trim(),
    status: "ouvert",
    mitigation: slots.mitigation ? String(slots.mitigation) : undefined,
    category: slots.category ? (String(slots.category) as RiskCategory) : undefined,
  };
}

export function buildAction(slots: Record<string, unknown>): Action {
  return {
    id: uid("action"),
    label: String(slots.label ?? "").trim(),
    owner: String(slots.owner ?? "PMO").trim(),
    dueDate: slots.dueDate ? String(slots.dueDate) : todayISO(),
    status: "a-faire",
  };
}

export function buildIssue(slots: Record<string, unknown>): Issue {
  return {
    id: uid("issue"),
    label: String(slots.label ?? "").trim(),
    owner: String(slots.owner ?? "PMO").trim(),
    severity: clampScore(Number(slots.severity) || 3),
    status: "ouvert",
    createdAt: todayISO(),
  };
}

export function buildDecision(slots: Record<string, unknown>): Decision {
  return {
    id: uid("decision"),
    label: String(slots.label ?? "").trim(),
    decidedBy: String(slots.decidedBy ?? "PMO").trim(),
    date: slots.date ? String(slots.date) : todayISO(),
    rationale: slots.rationale ? String(slots.rationale) : undefined,
  };
}

export function parseRaidKind(raw: unknown): RaidKind {
  const s = String(raw ?? "risks");
  if (s === "actions" || s === "issues" || s === "decisions" || s === "risks") return s;
  if (/action/i.test(s)) return "actions";
  if (/probl/i.test(s) || /issue/i.test(s)) return "issues";
  if (/décision/i.test(s) || /decision/i.test(s)) return "decisions";
  return "risks";
}

export function executeAddRaid(
  store: CopilotStore,
  kind: RaidKind,
  slots: Record<string, unknown>,
): void {
  const projectId = String(slots.projectId);
  const item =
    kind === "risks"
      ? buildRisk(slots)
      : kind === "actions"
        ? buildAction(slots)
        : kind === "issues"
          ? buildIssue(slots)
          : buildDecision(slots);
  store.addRaidItem(projectId, kind, item);
}

export function executeRemoveRaid(store: CopilotStore, slots: Record<string, unknown>): void {
  store.removeRaidItem(String(slots.projectId), parseRaidKind(slots.kind), String(slots.itemId));
}
