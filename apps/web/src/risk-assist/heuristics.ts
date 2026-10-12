import type { RiskCategory } from "../domain";
import { expandUserHintRisks } from "./hint-discovery";
import { clampScore } from "./scoring";
import type { ProjectContextSnapshot, RiskSuggestion } from "./types";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDuplicate(context: ProjectContextSnapshot, label: string, category: RiskCategory): boolean {
  const norm = normalizeLabel(label);
  for (const r of context.openRisks) {
    const existing = normalizeLabel(r.label);
    if (existing === norm) return true;
    if (r.category === category && (existing.includes(norm.slice(0, 20)) || norm.includes(existing.slice(0, 20)))) {
      return true;
    }
  }
  return false;
}

function makeSuggestion(
  context: ProjectContextSnapshot,
  partial: Omit<RiskSuggestion, "id" | "source"> & { source?: RiskSuggestion["source"] },
): RiskSuggestion | null {
  if (isDuplicate(context, partial.label, partial.category)) return null;
  return {
    id: uid("sug"),
    source: partial.source ?? "heuristic",
    ...partial,
  };
}

function costDriftRule(context: ProjectContextSnapshot): RiskSuggestion | null {
  if (context.cpi >= 0.9 || context.bac <= 0) return null;
  const severity = context.cpi < 0.8 ? 4 : 3;
  return makeSuggestion(context, {
    label: "Risque de dépassement budgétaire lié à la dérive des coûts",
    category: "Budget",
    probability: context.cpi < 0.85 ? 4 : 3,
    impact: severity,
    rationale: `CPI à ${context.cpi.toFixed(2)} (EAC ${Math.round(context.eac).toLocaleString("fr-FR")} € vs BAC ${Math.round(context.bac).toLocaleString("fr-FR")} €).`,
    mitigation: "Revue EVM hebdomadaire, gel des changements de périmètre non financés, replanification des postes à forte variance.",
    actions: ["Organiser une revue EVM avec le sponsor", "Identifier les 5 postes à plus forte variance"],
    triggers: [`CPI < 0,90`, `EAC > BAC`],
    confidence: context.cpi < 0.85 ? 0.88 : 0.78,
    strategy: "réduire",
    owner: context.manager,
    residualProbability: 2,
    residualImpact: 3,
  });
}

function scheduleSlipRule(context: ProjectContextSnapshot): RiskSuggestion | null {
  if (context.lateTasks.length === 0) return null;
  const maxDelay = context.lateTasks[0]!.delayDays;
  const impact = maxDelay >= 15 ? 5 : maxDelay >= 8 ? 4 : 3;
  return makeSuggestion(context, {
    label: "Risque de retard sur la date de livraison",
    category: "Planning",
    probability: maxDelay >= 8 ? 4 : 3,
    impact,
    rationale: `${context.lateTasks.length} tâche(s) en retard vs baseline (max ${maxDelay} j) : ${context.lateTasks.map((t) => t.name).join(", ")}.`,
    mitigation: "Replanifier le chemin critique, arbitrer les ressources, négocier une extension de périmètre ou de date.",
    actions: ["Mettre à jour le planning critique", "Escalader au comité si retard > 2 semaines"],
    triggers: ["Retard baseline > 5 j sur tâche critique"],
    confidence: maxDelay >= 8 ? 0.85 : 0.72,
    strategy: "réduire",
    owner: context.manager,
    residualProbability: 2,
    residualImpact: clampScore(impact - 1),
  });
}

function resourceOverloadRule(context: ProjectContextSnapshot): RiskSuggestion | null {
  if (context.overallocatedResources.length === 0) return null;
  return makeSuggestion(context, {
    label: "Risque de surcharge des ressources clés",
    category: "Ressources",
    probability: 3,
    impact: 3,
    rationale: `Surallocation détectée : ${context.overallocatedResources.join(", ")}.`,
    mitigation: "Nivellement des ressources, arbitrage inter-projets, renfort temporaire ou réduction du périmètre.",
    actions: ["Lancer un nivellement sur le projet", "Arbitrer la charge au comité ressources"],
    triggers: ["ETP > capacité sur 2 semaines consécutives"],
    confidence: 0.8,
    strategy: "réduire",
    owner: context.manager,
    residualProbability: 2,
    residualImpact: 2,
  });
}

function majorIssueRule(context: ProjectContextSnapshot): RiskSuggestion | null {
  const major = context.openIssues.filter((i) => i.severity >= 4);
  if (major.length === 0) return null;
  const top = major.sort((a, b) => b.severity - a.severity)[0]!;
  return makeSuggestion(context, {
    label: `Escalade du problème ouvert : ${top.label}`,
    category: "Qualité",
    probability: 4,
    impact: clampScore(top.severity),
    rationale: `Issue ouverte de gravité ${top.severity}/5 non résolue.`,
    mitigation: "Plan de résolution avec échéance, escalade sponsor, décision formelle si blocage persistant.",
    actions: [`Plan d'action sur : ${top.label}`, "Escalader au comité projet"],
    triggers: ["Issue ouverte > 7 jours", `Gravité ≥ ${top.severity}`],
    confidence: 0.82,
    strategy: "réduire",
    owner: context.manager,
  });
}

function overdueActionsRule(context: ProjectContextSnapshot): RiskSuggestion | null {
  if (context.overdueActions.length === 0) return null;
  return makeSuggestion(context, {
    label: "Risque d'inaction sur les mesures RAID en retard",
    category: "Organisation",
    probability: 3,
    impact: 3,
    rationale: `${context.overdueActions.length} action(s) RAID en retard : ${context.overdueActions.map((a) => a.label).join(", ")}.`,
    mitigation: "Revue des actions en retard, réassignation ou replanification des échéances.",
    actions: ["Revue des actions RAID en retard", "Réassigner les porteurs"],
    triggers: ["Action RAID en retard > 3 jours"],
    confidence: 0.76,
    strategy: "réduire",
    owner: context.manager,
  });
}

function noBaselineRule(context: ProjectContextSnapshot): RiskSuggestion | null {
  if (context.hasBaseline || context.status !== "en-cours") return null;
  return makeSuggestion(context, {
    label: "Risque de pilotage sans référence baseline",
    category: "Organisation",
    probability: 2,
    impact: 3,
    rationale: "Projet en cours sans baseline capturée : impossible de mesurer les écarts planning/coût de façon fiable.",
    mitigation: "Capturer une baseline officielle et la valider en comité.",
    actions: ["Capturer la baseline projet", "Valider en revue de lancement"],
    triggers: ["Absence de baseline > 30 jours après démarrage"],
    confidence: 0.7,
    strategy: "éviter",
    owner: context.manager,
  });
}

function unassignedCriticalRule(context: ProjectContextSnapshot): RiskSuggestion | null {
  if (context.unassignedCriticalTasks.length === 0) return null;
  return makeSuggestion(context, {
    label: "Risque de non-affectation sur le chemin critique",
    category: "Ressources",
    probability: 3,
    impact: 4,
    rationale: `Tâches critiques sans ressource : ${context.unassignedCriticalTasks.map((t) => t.name).join(", ")}.`,
    mitigation: "Affecter immédiatement les ressources compétentes ou externaliser.",
    actions: ["Affecter les ressources sur le chemin critique"],
    triggers: ["Tâche critique sans assignation > 5 jours"],
    confidence: 0.79,
    strategy: "éviter",
    owner: context.manager,
  });
}

function spiLowRule(context: ProjectContextSnapshot): RiskSuggestion | null {
  if (context.spi >= 0.9 || context.lateTasks.length > 0) return null;
  return makeSuggestion(context, {
    label: "Risque de dérive planning (SPI faible)",
    category: "Planning",
    probability: 3,
    impact: 3,
    rationale: `SPI à ${context.spi.toFixed(2)} : avancement inférieur au planning prévu.`,
    mitigation: "Analyser les tâches à faible avancement, accélérer ou replanifier.",
    actions: ["Revue des tâches en retard d'avancement"],
    triggers: ["SPI < 0,90 pendant 2 périodes"],
    confidence: 0.68,
    strategy: "réduire",
    owner: context.manager,
  });
}

function healthRedRule(context: ProjectContextSnapshot): RiskSuggestion | null {
  if (context.health !== "red") return null;
  return makeSuggestion(context, {
    label: "Risque de dérive globale du projet (santé rouge)",
    category: "Organisation",
    probability: 4,
    impact: 4,
    rationale: "Projet classé en santé rouge : dérive confirmée sur planning, coût ou périmètre.",
    mitigation: "Plan de redressement formalisé, revue hebdomadaire sponsor, arbitrages prioritaires.",
    actions: ["Élaborer un plan de redressement", "Convoquer une revue sponsor"],
    triggers: ["Santé projet = rouge"],
    confidence: 0.9,
    strategy: "réduire",
    owner: context.manager,
  });
}

function userHintRules(context: ProjectContextSnapshot, userHint: string): RiskSuggestion[] {
  return expandUserHintRisks(context, userHint);
}

const RULES: Array<(ctx: ProjectContextSnapshot, hint?: string) => RiskSuggestion | RiskSuggestion[] | null> = [
  healthRedRule,
  costDriftRule,
  scheduleSlipRule,
  resourceOverloadRule,
  majorIssueRule,
  overdueActionsRule,
  noBaselineRule,
  unassignedCriticalRule,
  spiLowRule,
  (ctx, hint) => (hint ? userHintRules(ctx, hint) : null),
];

/** Exécute les règles heuristiques et retourne les suggestions triées par score décroissant. */
export function runHeuristics(context: ProjectContextSnapshot, userHint?: string): RiskSuggestion[] {
  const out: RiskSuggestion[] = [];
  for (const rule of RULES) {
    const s = rule(context, userHint);
    if (!s) continue;
    if (Array.isArray(s)) out.push(...s);
    else out.push(s);
  }
  return out.sort((a, b) => b.probability * b.impact - a.probability * a.impact);
}

/** Fusionne suggestions heuristiques et LLM en évitant les doublons. */
export function mergeSuggestions(primary: RiskSuggestion[], secondary: RiskSuggestion[]): RiskSuggestion[] {
  const seen = new Set(primary.map((s) => normalizeLabel(s.label)));
  const merged = [...primary];
  for (const s of secondary) {
    const norm = normalizeLabel(s.label);
    if (seen.has(norm)) continue;
    seen.add(norm);
    merged.push(s);
  }
  return merged.sort((a, b) => b.probability * b.impact - a.probability * a.impact);
}

export { normalizeLabel };
