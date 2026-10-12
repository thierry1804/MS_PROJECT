import type { Portfolio } from "../domain";
import { DEMAND_STAGE_LABELS } from "../domain";
import type { CopilotIntentId, WireCopilotMemory } from "./types";
import {
  extractPercentComplete,
  extractWbsCodes,
  resolveProjectFromMessage,
  resolveTasksByWbs,
} from "./entity-resolver";

const STAGE_WORDS: [RegExp, string][] = [
  [/qualifi/i, "qualifiee"],
  [/approuv/i, "approuvee"],
  [/rejet/i, "rejetee"],
  [/idée|idee/i, "idee"],
];

const PLACEHOLDER = /^(à\s+définir|a\s+definir|unknown|—|-|\?|n\/a|pmo)$/i;

export function isSlotEmpty(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === "string") {
    const t = val.trim();
    return t === "" || PLACEHOLDER.test(t);
  }
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

export function extractSlotsFromText(
  intent: CopilotIntentId,
  message: string,
): Partial<Record<string, unknown>> {
  const slots: Record<string, unknown> = {};
  const text = message.trim();

  const budgetMatch = text.match(/(\d[\d\s]*)\s*(?:€|eur|euros|k€)/i);
  if (budgetMatch) {
    let n = Number(budgetMatch[1]!.replace(/\s/g, ""));
    if (/k/i.test(text)) n *= 1000;
    slots.budget = n;
    slots.estBudget = n;
  }

  const daysMatch = text.match(/(\d+)\s*j(?:ours?)?/i);
  if (daysMatch) slots.shiftDays = Number(daysMatch[1]);

  const pct = extractPercentComplete(text);
  if (pct !== undefined) slots.percentComplete = pct;

  const wbsCodes = extractWbsCodes(text);
  if (wbsCodes.length > 0) slots._wbsHints = wbsCodes;

  const createMatch = text.match(/(?:crée|créer|nouveau|lance)\s+(?:un\s+)?projet\s+(.+)/i);
  if (createMatch && intent === "createProject") {
    slots.name = createMatch[1]!.replace(/,.*$/, "").trim();
  }

  if (intent === "addDemand") {
    const forProject = text.match(/(?:pour\s+(?:le\s+)?projet|projet)\s+(.+?)(?:\.|$)/i);
    if (forProject) slots.title = forProject[1]!.trim();
    else {
      const demandMatch = text.match(/demande\s+(?:pour\s+)?(.+?)(?:\.|$)/i);
      if (demandMatch) slots.title = demandMatch[1]!.replace(/^le\s+projet\s+/i, "").trim();
    }
  }

  const riskMatch = text.match(/risque\s+(.+)/i);
  if (riskMatch && intent === "addRisk") slots.label = riskMatch[1]!.trim();

  for (const [re, stage] of STAGE_WORDS) {
    if (re.test(text)) {
      slots.stage = stage;
      break;
    }
  }

  const managerMatch = text.match(/chef\s+(.+?)(?:,|$)/i);
  if (managerMatch) slots.manager = managerMatch[1]!.trim();

  return slots;
}

export function inferFromPortfolio(
  intent: CopilotIntentId,
  slots: Record<string, unknown>,
  portfolio: Portfolio,
  memory?: WireCopilotMemory,
  message?: string,
  hintProjectId?: string,
): Partial<Record<string, unknown>> {
  const inferred: Record<string, unknown> = {};

  if (message) {
    const project = resolveProjectFromMessage(portfolio, message, hintProjectId);
    if (project && !slots.projectId) inferred.projectId = project.id;
  } else if (hintProjectId && !slots.projectId) {
    inferred.projectId = hintProjectId;
  }

  if (!slots.projectId && portfolio.projects.length === 1) {
    inferred.projectId = portfolio.projects[0]!.id;
  }

  const projectId = String(slots.projectId ?? inferred.projectId ?? "");
  const project = portfolio.projects.find((p) => p.id === projectId);

  if (project && message && (intent === "updateTask" || intent === "shiftTasks" || intent === "assignResource")) {
    const wbsCodes = extractWbsCodes(message);
    if (wbsCodes.length > 0) {
      const resolved = resolveTasksByWbs(project, portfolio, wbsCodes);
      if (resolved.length === 1) inferred.taskId = resolved[0]!.id;
      if (resolved.length > 0) inferred.taskIds = resolved.map((t) => t.id);
    }
  }

  if (intent === "convertDemand") {
    const approved = (portfolio.demands ?? []).filter((d) => d.stage === "approuvee" && !d.convertedProjectId);
    if (approved.length === 1) inferred.demandId = approved[0]!.id;
  }

  if (memory?.disambiguations && message) {
    const lower = message.toLowerCase();
    for (const d of memory.disambiguations) {
      if (lower.includes(d.phrase.toLowerCase())) {
        if (d.entityType === "project") inferred.projectId = d.entityId;
        if (d.entityType === "demand") inferred.demandId = d.entityId;
      }
    }
  }

  if (intent === "createProject" && memory?.preferences.defaultProjectManager && isSlotEmpty(slots.manager)) {
    inferred.manager = memory.preferences.defaultProjectManager;
  }

  if (intent === "moveDemand" && slots.stage) {
    const stage = String(slots.stage);
    const approver = memory?.preferences.defaultGateApprovers?.[stage as keyof typeof DEMAND_STAGE_LABELS];
    if (approver && isSlotEmpty(slots.approver)) inferred.approver = approver;
  }

  return inferred;
}

export function detectIntentFromMessage(message: string): CopilotIntentId | undefined {
  const t = message.toLowerCase();
  if (
    /projets?\b.*\b(rouge|dérive|derive)\b/.test(t) ||
    /\b(rouge|dérive|derive)\b.*\bprojets?\b/.test(t) ||
    /santé\s+portefeuille/.test(t)
  )
    return "queryPortfolioHealth";
  if (/risques?\s+ouverts?/.test(t)) return "queryOpenRisks";
  if (/actions?\s+en\s+retard/.test(t)) return "queryOverdueActions";
  if (/pipeline|demandes?/.test(t) && /combien|liste|synthèse|synthese/.test(t)) return "queryPipelineSummary";
  if (/surcharge|surchargé|overload/.test(t)) return "queryResourceOverload";
  if (/crée|créer|nouveau\s+projet|lance\s+le\s+projet/.test(t)) return "createProject";
  if (
    /mets?\s+à\s+jour|met\s+a\s+jour|modifier|avancement|passer?\s+.*à\s+\d+\s*%/.test(t) &&
    (/tâche|task|\d+\.\d+|\d+\s*%/.test(t))
  )
    return "updateTask";
  if (/risque/.test(t) && !/mets?\s+à\s+jour|met\s+a\s+jour/.test(t)) return "addRisk";
  if (/convertir/.test(t) && /demande/.test(t)) return "convertDemand";
  if (/baseline/.test(t)) return "captureBaseline";
  if (/décale|retarde|retarder/.test(t)) return "shiftTasks";
  if (/ajoute.*tâche|nouvelle tâche/.test(t)) return "addTask";
  if (/demande|idée|pipeline/.test(t) && /crée|créer|ajoute|nouveau/.test(t)) return "addDemand";
  return undefined;
}
