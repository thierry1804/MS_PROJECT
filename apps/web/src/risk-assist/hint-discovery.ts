import type { RiskCategory, RiskStrategy } from "../domain";
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
  partial: Omit<RiskSuggestion, "id" | "source">,
): RiskSuggestion | null {
  if (isDuplicate(context, partial.label, partial.category)) return null;
  return { id: uid("sug"), source: "heuristic", ...partial };
}

function inferCategory(hint: string): RiskCategory {
  const lower = hint.toLowerCase();
  if (/fournisseur|prestataire|vendor|sous-trait|erp|intégrateur|integrateur/i.test(lower)) return "Fournisseur";
  if (/rgpd|conformité|conformite|légal|legal|audit/i.test(lower)) return "Conformité";
  if (/sécurité|securite|cyber|donnée|donnee|accès|acces/i.test(lower)) return "Sécurité";
  if (/technique|architecture|bug|intégration|integration|migration|qualité|qualite/i.test(lower)) return "Technique";
  if (/budget|coût|cout|financ|dépense|depense/i.test(lower)) return "Budget";
  if (/ressource|équipe|equipe|compétence|competence|surcharge/i.test(lower)) return "Ressources";
  if (/retard|planning|délai|delai|date|livraison|jalon/i.test(lower)) return "Planning";
  if (/organisation|gouvernance|décision|decision|sponsor/i.test(lower)) return "Organisation";
  return "Externe";
}

function shortSubject(hint: string): string {
  const trimmed = hint.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 72) return trimmed;
  return `${trimmed.slice(0, 69)}…`;
}

interface CascadeTemplate {
  label: (hint: string) => string;
  category: RiskCategory;
  probability: number;
  impact: number;
  rationale: (hint: string, context: ProjectContextSnapshot) => string;
  mitigation: string;
  actions: string[];
  triggers: string[];
  confidence: number;
  strategy: RiskStrategy;
  when?: (hint: string, context: ProjectContextSnapshot) => boolean;
}

const CASCADE_BY_CATEGORY: Partial<Record<RiskCategory, CascadeTemplate[]>> = {
  Fournisseur: [
    {
      label: (h) => `Retard ou défaillance fournisseur : ${shortSubject(h)}`,
      category: "Fournisseur",
      probability: 3,
      impact: 4,
      rationale: (h) => `Inquiétude exprimée : « ${h} ». Dépendance externe identifiée comme point de fragilité.`,
      mitigation: "Clause contractuelle, plan B fournisseur, revue hebdomadaire des jalons de livraison.",
      actions: ["Demander un plan de reprise fournisseur", "Identifier un fournisseur alternatif"],
      triggers: ["Jalon fournisseur non tenu", "SLA dégradé"],
      confidence: 0.62,
      strategy: "réduire",
    },
    {
      label: () => "Glissement planning lié à la dépendance fournisseur",
      category: "Planning",
      probability: 3,
      impact: 4,
      rationale: (h, ctx) =>
        `Conséquence probable du retard fournisseur mentionné (« ${shortSubject(h)} »).${
          ctx.lateTasks.length ? ` Déjà ${ctx.lateTasks.length} tâche(s) en retard.` : ""
        }`,
      mitigation: "Replanifier le chemin critique, paralléliser les activités non dépendantes.",
      actions: ["Mettre à jour le planning critique", "Arbitrer les jalons avec le sponsor"],
      triggers: ["Retard livraison fournisseur > 5 jours"],
      confidence: 0.58,
      strategy: "réduire",
    },
    {
      label: () => "Coût additionnel lié au contournement ou à l'équipe en attente",
      category: "Budget",
      probability: 3,
      impact: 3,
      rationale: (h, ctx) =>
        `Coûts indirects possibles (équipe mobilisée sans livrable, solution de contournement).${
          ctx.cpi < 0.9 ? ` CPI déjà à ${ctx.cpi.toFixed(2)}.` : ""
        }`,
      mitigation: "Chiffrer le coût d'attente, négocier pénalités ou renégocier le périmètre.",
      actions: ["Estimer le coût d'un retard de 2 semaines", "Présenter l'impact financier au sponsor"],
      triggers: ["Coût réel > prévision sur période d'attente"],
      confidence: 0.52,
      strategy: "réduire",
      when: (_h, ctx) => ctx.budget > 0 || ctx.cpi < 1,
    },
    {
      label: () => "Qualité insuffisante des livrables externes",
      category: "Qualité",
      probability: 2,
      impact: 4,
      rationale: (h) => `Risque de livrable non conforme en cas de pression sur le fournisseur lié à : « ${shortSubject(h)} ».`,
      mitigation: "Renforcer les critères d'acceptation, tests de recette formalisés, revue indépendante.",
      actions: ["Définir les critères d'acceptation fournisseur", "Planifier une recette intermédiaire"],
      triggers: ["Non-conformité en recette", "Taux de défauts > seuil"],
      confidence: 0.5,
      strategy: "réduire",
    },
  ],
  Planning: [
    {
      label: (h) => `Risque planning : ${shortSubject(h)}`,
      category: "Planning",
      probability: 3,
      impact: 4,
      rationale: (h) => `Inquiétude planning exprimée : « ${h} ».`,
      mitigation: "Replanification, arbitrage ressources, négociation de périmètre ou de date.",
      actions: ["Analyser l'impact sur le chemin critique", "Proposer un scénario de rattrapage"],
      triggers: ["Écart planning > 5 jours sur jalon clé"],
      confidence: 0.6,
      strategy: "réduire",
    },
    {
      label: () => "Effet domino sur les jalons dépendants",
      category: "Planning",
      probability: 3,
      impact: 3,
      rationale: (h, ctx) =>
        `Retard initial pouvant décaler les phases suivantes.${ctx.lateTasks.length ? ` ${ctx.lateTasks.length} tâche(s) déjà en retard.` : ""}`,
      mitigation: "Identifier les tâches en parallèle possibles, compresser les phases non critiques.",
      actions: ["Cartographier les dépendances impactées"],
      triggers: ["Retard sur prédécesseur critique"],
      confidence: 0.55,
      strategy: "réduire",
    },
    {
      label: () => "Surcharge des ressources lors du rattrapage planning",
      category: "Ressources",
      probability: 3,
      impact: 3,
      rationale: (_h, ctx) =>
        `Tentative de rattrapage pouvant surcharger l'équipe.${
          ctx.overallocatedResources.length ? ` Ressources déjà surchargées : ${ctx.overallocatedResources.join(", ")}.` : ""
        }`,
      mitigation: "Nivellement, renfort temporaire, réduction du périmètre de rattrapage.",
      actions: ["Évaluer la capacité disponible pour le rattrapage"],
      triggers: ["Charge > 110 % capacité sur 2 semaines"],
      confidence: 0.5,
      strategy: "réduire",
    },
  ],
  Conformité: [
    {
      label: (h) => `Non-conformité réglementaire : ${shortSubject(h)}`,
      category: "Conformité",
      probability: 3,
      impact: 5,
      rationale: (h) => `Inquiétude conformité : « ${h} ».`,
      mitigation: "Impliquer DPO/juridique, registre des traitements, analyse d'impact.",
      actions: ["Consulter le référent conformité", "Documenter l'analyse d'impact"],
      triggers: ["Écart identifié en audit", "Réclamation ou signalement"],
      confidence: 0.58,
      strategy: "éviter",
    },
    {
      label: () => "Sanction ou obligation corrective imposée par l'autorité",
      category: "Conformité",
      probability: 2,
      impact: 5,
      rationale: (h) => `Conséquence réglementaire possible si l'inquiétude se confirme : « ${shortSubject(h)} ».`,
      mitigation: "Plan de mise en conformité priorisé, communication transparente aux parties prenantes.",
      actions: ["Évaluer l'exposition réglementaire", "Préparer un plan de remédiation"],
      triggers: ["Notification autorité", "Mise en demeure"],
      confidence: 0.48,
      strategy: "éviter",
    },
    {
      label: () => "Atteinte à la réputation et perte de confiance client",
      category: "Externe",
      probability: 2,
      impact: 4,
      rationale: (h) => `Impact réputationnel en cas de matérialisation : « ${shortSubject(h)} ».`,
      mitigation: "Communication de crise préparée, transparence proactive.",
      actions: ["Préparer une FAQ interne/externe"],
      triggers: ["Couverture médiatique négative", "Plainte client formelle"],
      confidence: 0.45,
      strategy: "réduire",
    },
  ],
  Sécurité: [
    {
      label: (h) => `Incident sécurité ou fuite de données : ${shortSubject(h)}`,
      category: "Sécurité",
      probability: 2,
      impact: 5,
      rationale: (h) => `Inquiétude sécurité : « ${h} ».`,
      mitigation: "Revue RSSI, durcissement, tests d'intrusion, plan de réponse incident.",
      actions: ["Lancer une revue sécurité ciblée", "Vérifier les droits d'accès"],
      triggers: ["Tentative d'intrusion détectée", "Anomalie d'accès"],
      confidence: 0.55,
      strategy: "éviter",
    },
    {
      label: () => "Interruption de service liée à un incident cyber",
      category: "Technique",
      probability: 2,
      impact: 4,
      rationale: (h) => `Conséquence opérationnelle possible liée à : « ${shortSubject(h)} ».`,
      mitigation: "PCA/PRA testé, sauvegardes vérifiées, astreinte définie.",
      actions: ["Tester la procédure de restauration"],
      triggers: ["Indisponibilité > 4 h", "Ransomware détecté"],
      confidence: 0.48,
      strategy: "réduire",
    },
  ],
  Technique: [
    {
      label: (h) => `Risque technique : ${shortSubject(h)}`,
      category: "Technique",
      probability: 3,
      impact: 4,
      rationale: (h) => `Inquiétude technique exprimée : « ${h} ».`,
      mitigation: "Proof of concept, revue d'architecture, tests de non-régression renforcés.",
      actions: ["Organiser une revue technique", "Définir un plan de tests ciblé"],
      triggers: ["Échec de tests critiques", "Dette technique bloquante"],
      confidence: 0.58,
      strategy: "réduire",
    },
    {
      label: () => "Blocage des tests d'intégration ou de recette",
      category: "Qualité",
      probability: 3,
      impact: 4,
      rationale: (h) => `Risque de blocage en aval lié à : « ${shortSubject(h)} ».`,
      mitigation: "Environnement de test stable, données de test représentatives, critères d'entrée recette.",
      actions: ["Sécuriser l'environnement de recette", "Préparer les jeux de données de test"],
      triggers: ["Taux d'échec tests > 20 %", "Recette non démarrée à la date prévue"],
      confidence: 0.52,
      strategy: "réduire",
      when: (h) => /intégration|integration|test|recette|erp|migration/i.test(h),
    },
    {
      label: () => "Retard de mise en production",
      category: "Planning",
      probability: 3,
      impact: 4,
      rationale: (h, ctx) =>
        `Go-live potentiellement décalé.${ctx.percentComplete < 80 ? ` Avancement actuel : ${Math.round(ctx.percentComplete)} %.` : ""}`,
      mitigation: "Plan de déploiement par phases, critères de go/no-go formalisés.",
      actions: ["Revoir la date de go-live avec le comité"],
      triggers: ["Critère go/no-go non satisfait"],
      confidence: 0.5,
      strategy: "réduire",
    },
  ],
  Ressources: [
    {
      label: (h) => `Risque ressources : ${shortSubject(h)}`,
      category: "Ressources",
      probability: 3,
      impact: 3,
      rationale: (h) => `Inquiétude sur les ressources : « ${h} ».`,
      mitigation: "Nivellement, renfort, transfert de compétences, arbitrage inter-projets.",
      actions: ["Cartographier les compétences critiques", "Identifier des renforts possibles"],
      triggers: ["Absence prolongée ressource clé", "Turn-over sur poste critique"],
      confidence: 0.58,
      strategy: "réduire",
    },
    {
      label: () => "Perte de connaissance et dépendance à une personne clé",
      category: "Organisation",
      probability: 2,
      impact: 4,
      rationale: (h) => `Risque organisationnel lié à : « ${shortSubject(h)} ».`,
      mitigation: "Documentation, binômage, transfert de compétences planifié.",
      actions: ["Identifier les single points of failure", "Mettre en place du binômage"],
      triggers: ["Départ annoncé ressource clé"],
      confidence: 0.5,
      strategy: "réduire",
    },
  ],
  Budget: [
    {
      label: (h) => `Dépassement budgétaire : ${shortSubject(h)}`,
      category: "Budget",
      probability: 3,
      impact: 4,
      rationale: (h, ctx) =>
        `Inquiétude financière : « ${h} ».${ctx.cpi < 0.9 ? ` CPI à ${ctx.cpi.toFixed(2)}.` : ""}`,
      mitigation: "Revue EVM, gel des changements non financés, arbitrage sponsor.",
      actions: ["Produire une projection EAC actualisée", "Identifier les postes de variance"],
      triggers: ["EAC > BAC", "CPI < 0,90"],
      confidence: 0.6,
      strategy: "réduire",
    },
    {
      label: () => "Réduction du périmètre pour respecter l'enveloppe",
      category: "Organisation",
      probability: 2,
      impact: 3,
      rationale: (h) => `Arbitrage périmètre possible si l'inquiétude budgétaire se confirme : « ${shortSubject(h)} ».`,
      mitigation: "Priorisation MoSCoW, décision formelle du sponsor sur le périmètre minimum viable.",
      actions: ["Préparer un scénario de déscope"],
      triggers: ["Demande de déscope par le sponsor"],
      confidence: 0.48,
      strategy: "accepter",
    },
  ],
};

const GENERIC_CASCADES: CascadeTemplate[] = [
  {
    label: (h) => `Matérialisation du risque : ${shortSubject(h)}`,
    category: "Externe",
    probability: 3,
    impact: 3,
    rationale: (h) => `Risque direct issu de l'inquiétude : « ${h} ».`,
    mitigation: "Analyser les causes, définir des actions préventives et des indicateurs de suivi.",
    actions: ["Documenter le plan de mitigation", "Désigner un porteur de risque"],
    triggers: ["Signal faible détecté sur le sujet"],
    confidence: 0.55,
    strategy: "réduire",
  },
  {
    label: () => "Impact sur la date de livraison ou les engagements",
    category: "Planning",
    probability: 2,
    impact: 3,
    rationale: (h, ctx) =>
      `Conséquence planning possible.${ctx.lateTasks.length ? ` Contexte : ${ctx.lateTasks.length} retard(s) existant(s).` : ""}`,
    mitigation: "Évaluer l'impact sur le chemin critique et communiquer aux parties prenantes.",
    actions: ["Estimer le délai d'impact"],
    triggers: ["Jalon à risque identifié"],
    confidence: 0.48,
    strategy: "réduire",
  },
  {
    label: () => "Escalade nécessaire auprès du sponsor ou du comité",
    category: "Organisation",
    probability: 2,
    impact: 3,
    rationale: (h) => `Si l'inquiétude « ${shortSubject(h)} » se matérialise, une décision de gouvernance sera requise.`,
    mitigation: "Préparer une note de décision avec options et recommandation.",
    actions: ["Préparer une note d'escalade pour le comité"],
    triggers: ["Risque score ≥ 12", "Aucune action efficace après 2 semaines"],
    confidence: 0.45,
    strategy: "réduire",
  },
];

/** Décompose une inquiétude utilisateur en plusieurs risques RAID corrélés. */
export function expandUserHintRisks(context: ProjectContextSnapshot, userHint: string): RiskSuggestion[] {
  const hint = userHint.trim();
  if (!hint) return [];

  const category = inferCategory(hint);
  const templates = CASCADE_BY_CATEGORY[category] ?? GENERIC_CASCADES;
  const out: RiskSuggestion[] = [];

  for (const t of templates) {
    if (t.when && !t.when(hint, context)) continue;
    const suggestion = makeSuggestion(context, {
      label: t.label(hint),
      category: t.category,
      probability: clampScore(t.probability),
      impact: clampScore(t.impact),
      rationale: t.rationale(hint, context),
      mitigation: t.mitigation,
      actions: t.actions,
      triggers: t.triggers,
      confidence: t.confidence,
      strategy: t.strategy,
      owner: context.manager,
      residualProbability: clampScore(t.probability - 1),
      residualImpact: clampScore(t.impact - 1),
    });
    if (suggestion) out.push(suggestion);
  }

  return out.sort((a, b) => b.probability * b.impact - a.probability * b.impact);
}
