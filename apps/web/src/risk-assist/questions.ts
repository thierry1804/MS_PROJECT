import type { RiskCategory } from "../domain";
import { clampScore } from "./scoring";
import type { FollowUpQuestion, RiskSuggestion } from "./types";

function qid(): string {
  return `q-${Math.random().toString(36).slice(2, 9)}`;
}

/** Questions ciblées quand l'analyse part d'une inquiétude utilisateur. */
export function buildHintFollowUpQuestions(
  userHint: string,
  suggestions: RiskSuggestion[],
): FollowUpQuestion[] {
  const hint = userHint.trim().toLowerCase();
  const questions: FollowUpQuestion[] = [];
  const primary = suggestions.find((s) => !s.ignored) ?? suggestions[0];

  questions.push({
    id: qid(),
    suggestionId: primary?.id,
    text: "Ce risque est-il déjà partiellement matérialisé (signaux observés) ?",
    type: "boolean",
    dimension: "probability",
  });

  questions.push({
    id: qid(),
    suggestionId: primary?.id,
    text: "Quel serait l'impact business maximal si ce risque se réalise (échelle 0–5) ?",
    type: "scale",
    dimension: "impact",
  });

  if (/fournisseur|prestataire|vendor|erp/i.test(hint)) {
    questions.push({
      id: qid(),
      suggestionId: primary?.id,
      text: "Existe-t-il un plan B fournisseur ou une solution de contournement identifiée ?",
      type: "boolean",
      dimension: "probability",
      categoryHint: "Fournisseur",
    });
  }

  if (/retard|planning|délai|delai|livraison/i.test(hint)) {
    questions.push({
      id: qid(),
      suggestionId: primary?.id,
      text: "Combien de jours de retard seraient critiques pour la date de livraison ?",
      type: "scale",
      dimension: "impact",
      categoryHint: "Planning",
    });
  }

  if (/rgpd|conformité|conformite|sécurité|securite|donnée|donnee/i.test(hint)) {
    questions.push({
      id: qid(),
      suggestionId: primary?.id,
      text: "Le référent conformité / RSSI est-il informé et mobilisé ?",
      type: "boolean",
      dimension: "probability",
      categoryHint: /sécurité|securite|cyber/i.test(hint) ? "Sécurité" : "Conformité",
    });
  }

  questions.push({
    id: qid(),
    text: "Y a-t-il des mesures préventives déjà en cours sur ce sujet ?",
    type: "text",
    dimension: "general",
  });

  for (const s of suggestions) {
    if (s.ignored || s.confidence >= 0.75) continue;
    if (s.category === "Budget" && !questions.some((q) => q.text.includes("enveloppe"))) {
      questions.push({
        id: qid(),
        suggestionId: s.id,
        text: "Le sponsor a-t-il validé une enveloppe de secours ?",
        type: "boolean",
        dimension: "impact",
        categoryHint: "Budget",
      });
    }
  }

  const seen = new Set<string>();
  return questions.filter((q) => {
    const key = q.text;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Questions adaptatives pour suggestions à faible confiance ou dimensions ambiguës. */
export function buildFollowUpQuestions(suggestions: RiskSuggestion[]): FollowUpQuestion[] {
  const questions: FollowUpQuestion[] = [];

  for (const s of suggestions) {
    if (s.ignored || s.accepted === false) continue;

    if (s.confidence < 0.75) {
      if (s.category === "Planning") {
        questions.push({
          id: qid(),
          suggestionId: s.id,
          text: "Quel retard maximal (en jours) est acceptable sur la date de livraison ?",
          type: "scale",
          dimension: "impact",
          categoryHint: "Planning",
        });
      }
      if (s.category === "Fournisseur") {
        questions.push({
          id: qid(),
          suggestionId: s.id,
          text: "Un plan B fournisseur ou une solution de contournement existe-t-il ?",
          type: "boolean",
          dimension: "probability",
          categoryHint: "Fournisseur",
        });
      }
      if (s.category === "Conformité" || s.category === "Sécurité") {
        questions.push({
          id: qid(),
          suggestionId: s.id,
          text: "Le DPO / RSSI est-il impliqué et informé ?",
          type: "boolean",
          dimension: "probability",
          categoryHint: s.category,
        });
      }
      if (s.category === "Budget") {
        questions.push({
          id: qid(),
          suggestionId: s.id,
          text: "Le sponsor a-t-il validé une enveloppe de secours ?",
          type: "boolean",
          dimension: "impact",
          categoryHint: "Budget",
        });
      }
    }
  }

  const seen = new Set<string>();
  return questions.filter((q) => {
    const key = `${q.suggestionId}-${q.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Applique les réponses adaptatives aux suggestions. */
export function applyFollowUpAnswers(
  suggestions: RiskSuggestion[],
  answers: Record<string, unknown>,
  questions: FollowUpQuestion[],
): RiskSuggestion[] {
  return suggestions.map((s) => {
    let probability = s.probability;
    let impact = s.impact;
    let confidence = s.confidence;

    for (const q of questions) {
      if (q.suggestionId !== s.id) continue;
      const val = answers[q.id];
      if (val === undefined || val === "") continue;

      if (q.type === "boolean") {
        const yes = val === true || val === "oui" || val === "yes";
        if (q.dimension === "probability") {
          probability = clampScore(yes ? probability - 1 : probability + 1);
          confidence = Math.min(1, confidence + 0.1);
        }
        if (q.dimension === "impact") {
          impact = clampScore(yes ? impact - 1 : impact + 1);
          confidence = Math.min(1, confidence + 0.1);
        }
      }

      if (q.type === "scale" && q.dimension === "impact") {
        const days = Number(val);
        if (!Number.isNaN(days)) {
          impact = clampScore(days >= 15 ? 5 : days >= 8 ? 4 : days >= 3 ? 3 : 2);
          confidence = Math.min(1, confidence + 0.12);
        }
      }

      if (q.type === "text" && typeof val === "string" && val.trim()) {
        confidence = Math.min(1, confidence + 0.08);
      }
    }

    return {
      ...s,
      probability,
      impact,
      confidence,
      residualProbability: s.residualProbability ?? clampScore(probability - 1),
      residualImpact: s.residualImpact ?? clampScore(impact - 1),
    };
  });
}

export function categoryLabel(cat: RiskCategory): string {
  return cat;
}
