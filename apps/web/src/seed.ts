import type { Assignment, Dependency, DependencyType, Resource, Task } from "@atelier/scheduling-engine";
import type {
  Action,
  Decision,
  Demand,
  GovernanceEvent,
  Issue,
  Portfolio,
  Project,
  Risk,
  SurveyResponse,
} from "./domain";

function t(
  id: string,
  name: string,
  parentId: string | null,
  order: number,
  duration: number,
  percentComplete = 0,
  assignments: Assignment[] = [],
  fixedCost?: number,
): Task {
  return { id, name, parentId, order, duration, percentComplete, assignments, fixedCost };
}

const d = (predecessorId: string, successorId: string, type: DependencyType = "FS", lag = 0): Dependency => ({
  predecessorId,
  successorId,
  type,
  lag,
});

const a = (resourceId: string, units = 1): Assignment => ({ resourceId, units });

const risk = (id: string, label: string, probability: number, impact: number, owner: string, status: Risk["status"] = "ouvert", mitigation?: string): Risk => ({
  id,
  label,
  probability,
  impact,
  owner,
  status,
  mitigation,
});

const act = (id: string, label: string, owner: string, dueDate: string, status: Action["status"] = "a-faire"): Action => ({
  id,
  label,
  owner,
  dueDate,
  status,
});

const iss = (
  id: string,
  label: string,
  owner: string,
  severity: number,
  createdAt: string,
  status: Issue["status"] = "ouvert",
  resolvedAt?: string,
): Issue => ({
  id,
  label,
  owner,
  severity,
  status,
  createdAt,
  resolvedAt,
});

const gov = (
  id: string,
  type: GovernanceEvent["type"],
  label: string,
  date: string,
  expected: number,
  attendees: number,
): GovernanceEvent => ({ id, type, label, date, expected, attendees });

const survey = (id: string, date: string, role: SurveyResponse["role"], score: number, comment?: string): SurveyResponse => ({
  id,
  date,
  role,
  score,
  comment,
});

const dec = (id: string, label: string, decidedBy: string, date: string, rationale?: string): Decision => ({
  id,
  label,
  decidedBy,
  date,
  rationale,
});

const resources: Resource[] = [
  { id: "r-sm", name: "S. Martin", kind: "work", capacity: 1, costPerDay: 650, role: "Cheffe de projet" },
  { id: "r-ld", name: "L. Dubois", kind: "work", capacity: 1, costPerDay: 720, role: "Architecte" },
  { id: "r-ar", name: "A. Rakoto", kind: "work", capacity: 1, costPerDay: 520, role: "Dev senior" },
  { id: "r-jp", name: "J. Peron", kind: "work", capacity: 1, costPerDay: 480, role: "Dev back" },
  { id: "r-mn", name: "M. N'Diaye", kind: "work", capacity: 1, costPerDay: 480, role: "Dev front" },
  { id: "r-cl", name: "C. Lefèvre", kind: "work", capacity: 1, costPerDay: 430, role: "QA" },
  { id: "r-th", name: "T. Hoarau", kind: "work", capacity: 1, costPerDay: 560, role: "Ingénieur infra" },
  { id: "r-eb", name: "E. Bardin", kind: "work", capacity: 0.5, costPerDay: 610, role: "Experte métier RH" },
];

/* ------------------------------------------------------------------ */
/* CRM — Refonte CRM                                                   */
/* ------------------------------------------------------------------ */

const crm: Project = {
  id: "crm",
  code: "CRM",
  name: "Refonte CRM",
  description: "Remplacement du CRM historique par une plateforme unifiée ventes / support.",
  manager: "S. Martin",
  status: "en-cours",
  health: "green",
  strategicAxis: "Expérience client",
  budget: 420_000,
  projectStart: "2026-04-01",
  tasks: [
    t("crm-cad", "Cadrage", null, 0, 0),
    { ...t("crm-cad-1", "Ateliers besoins métier", "crm-cad", 0, 8, 100, [a("r-sm"), a("r-eb", 0.5)]), actualCost: 6_800 },
    { ...t("crm-cad-2", "Étude de l'existant", "crm-cad", 1, 6, 100, [a("r-ld")]), actualCost: 4_100 },
    t("crm-cad-3", "Note de cadrage validée", "crm-cad", 2, 0, 100),
    t("crm-con", "Conception", null, 1, 0),
    t("crm-con-1", "Architecture cible", "crm-con", 0, 10, 100, [a("r-ld")]),
    t("crm-con-2", "Modèle de données", "crm-con", 1, 8, 100, [a("r-ar", 0.6)]),
    t("crm-con-3", "Maquettes UX", "crm-con", 2, 12, 100, [a("r-mn", 0.8)]),
    t("crm-dev", "Développement", null, 2, 0),
    t("crm-dev-1", "Socle technique & CI", "crm-dev", 0, 8, 100, [a("r-ar"), a("r-th", 0.4)]),
    { ...t("crm-dev-2", "Module comptes & contacts", "crm-dev", 1, 15, 90, [a("r-jp")]), actualCost: 7_500 },
    { ...t("crm-dev-3", "Module opportunités", "crm-dev", 2, 18, 60, [a("r-ar")]), actualCost: 6_200 },
    t("crm-dev-4", "Interface web", "crm-dev", 3, 25, 55, [a("r-mn")]),
    t("crm-dev-5", "Reprise de données", "crm-dev", 4, 12, 30, [a("r-jp", 0.5)]),
    t("crm-rec", "Recette", null, 3, 0),
    t("crm-rec-1", "Plan de tests", "crm-rec", 0, 5, 80, [a("r-cl")]),
    t("crm-rec-2", "Recette fonctionnelle", "crm-rec", 1, 15, 0, [a("r-cl"), a("r-eb", 0.3)]),
    t("crm-rec-3", "Corrections lot 1", "crm-rec", 2, 8, 0, [a("r-jp", 0.5), a("r-mn", 0.5)]),
    t("crm-dep", "Déploiement", null, 4, 0),
    t("crm-dep-1", "Formation utilisateurs", "crm-dep", 0, 5, 0, [a("r-sm", 0.5)], 8_000),
    t("crm-dep-2", "Bascule production", "crm-dep", 1, 3, 0, [a("r-th")]),
    t("crm-dep-3", "Mise en service", "crm-dep", 2, 0, 0),
  ],
  dependencies: [
    d("crm-cad-1", "crm-cad-3"),
    d("crm-cad-2", "crm-cad-3"),
    d("crm-cad-3", "crm-con-1"),
    d("crm-con-1", "crm-con-2", "SS", 4),
    d("crm-cad-3", "crm-con-3"),
    d("crm-con-1", "crm-dev-1"),
    d("crm-con-2", "crm-dev-2"),
    d("crm-dev-1", "crm-dev-2"),
    d("crm-dev-2", "crm-dev-3", "SS", 5),
    d("crm-con-3", "crm-dev-4"),
    d("crm-dev-1", "crm-dev-4"),
    d("crm-dev-2", "crm-dev-5"),
    d("crm-rec-1", "crm-rec-2"),
    d("crm-dev-3", "crm-rec-2"),
    d("crm-dev-4", "crm-rec-2", "FF", 5),
    d("crm-dev-5", "crm-rec-2", "SS"),
    d("crm-rec-2", "crm-rec-3", "SS", 5),
    d("crm-rec-3", "crm-dep-1"),
    d("crm-rec-3", "crm-dep-2"),
    d("crm-dep-1", "crm-dep-3"),
    d("crm-dep-2", "crm-dep-3"),
  ],
  risks: [
    risk("crm-r1", "Qualité des données legacy insuffisante pour la reprise", 4, 4, "S. Martin", "ouvert", "Audit qualité + règles de nettoyage avant reprise"),
    risk("crm-r2", "Disponibilité de l'experte métier en période de recette", 3, 3, "S. Martin", "ouvert", "Planifier ses créneaux dès maintenant"),
  ],
  actions: [
    act("crm-a1", "Cadrer les règles de reprise de données avec la DSI", "L. Dubois", "2026-06-15", "en-cours"),
    act("crm-a2", "Réserver les créneaux de l'experte métier pour la recette", "S. Martin", "2026-06-30"),
    act("crm-a3", "Valider les maquettes UX avec les key users", "M. N'Diaye", "2026-05-20", "fait"),
  ],
  issues: [
    iss("crm-i1", "Environnement de recette indisponible depuis 3 jours", "T. Hoarau", 3, "2026-07-01"),
  ],
  decisions: [
    dec("crm-d1", "Retenir la plateforme unifiée plutôt que deux outils séparés", "Comité DSI", "2026-04-10", "Réduction des coûts de licence et d'intégration"),
  ],
};

/* ------------------------------------------------------------------ */
/* CLD — Migration Cloud                                               */
/* ------------------------------------------------------------------ */

const cloud: Project = {
  id: "cloud",
  code: "CLD",
  name: "Migration Cloud",
  description: "Migration des 40 applications du datacenter vers le cloud public.",
  manager: "T. Hoarau",
  status: "en-cours",
  health: "amber",
  strategicAxis: "Efficience opérationnelle",
  budget: 610_000,
  projectStart: "2026-04-06",
  tasks: [
    t("cld-aud", "Audit & stratégie", null, 0, 0),
    t("cld-aud-1", "Inventaire applicatif", "cld-aud", 0, 10, 100, [a("r-th", 0.6)]),
    t("cld-aud-2", "Stratégie de migration (6R)", "cld-aud", 1, 8, 100, [a("r-ld", 0.5)]),
    t("cld-aud-3", "Décision comité d'architecture", "cld-aud", 2, 0, 100),
    t("cld-aud-4", "Cadrage budgétaire", "cld-aud", 3, 5, 100, [a("r-sm", 0.3)]),
    t("cld-fnd", "Socle cloud", null, 1, 0),
    t("cld-fnd-1", "Landing zone & réseau", "cld-fnd", 0, 15, 80, [a("r-th")]),
    t("cld-fnd-2", "Sécurité & IAM", "cld-fnd", 1, 10, 50, [a("r-ld", 0.4)]),
    t("cld-fnd-3", "FinOps & supervision", "cld-fnd", 2, 8, 20, [a("r-th", 0.5)]),
    t("cld-mig", "Vagues de migration", null, 2, 0),
    t("cld-mig-1", "Vague 1 : applications pilotes", "cld-mig", 0, 15, 40, [a("r-th", 0.8), a("r-jp", 0.3)]),
    t("cld-mig-2", "Vague 2 : applications métier", "cld-mig", 1, 30, 0, [a("r-th", 0.8)]),
    t("cld-mig-3", "Vague 3 : legacy & décommissionnement", "cld-mig", 2, 25, 0, [a("r-th", 0.6)], 25_000),
    t("cld-fin", "Datacenter éteint", null, 3, 0, 0),
  ],
  dependencies: [
    d("cld-aud-1", "cld-aud-2", "SS", 5),
    d("cld-aud-2", "cld-aud-3"),
    d("cld-aud-3", "cld-fnd-1"),
    d("cld-fnd-1", "cld-fnd-2", "SS", 5),
    d("cld-fnd-1", "cld-fnd-3", "FS", -3),
    d("cld-fnd-1", "cld-mig-1"),
    d("cld-fnd-2", "cld-mig-1", "FF", 8),
    d("cld-mig-1", "cld-mig-2"),
    d("cld-mig-2", "cld-mig-3", "SS", 10),
    d("cld-mig-3", "cld-fin"),
  ],
  risks: [
    risk("cld-r1", "Dérive des coûts cloud sans gouvernance FinOps", 4, 3, "T. Hoarau", "ouvert", "Mettre en place tagging + budgets FinOps dès le socle"),
    risk("cld-r2", "Compétences cloud internes insuffisantes", 3, 4, "T. Hoarau", "ouvert", "Plan de formation + accompagnement partenaire"),
    risk("cld-r3", "Fenêtres de bascule refusées par les métiers", 2, 4, "S. Martin", "traite", "Calendrier négocié en comité"),
  ],
  actions: [
    act("cld-a1", "Déployer le tagging FinOps sur la landing zone", "T. Hoarau", "2026-05-30", "en-cours"),
    act("cld-a2", "Lancer le plan de formation cloud de l'équipe", "T. Hoarau", "2026-06-10"),
    act("cld-a3", "Cadrer la vague 1 avec les métiers pilotes", "S. Martin", "2026-05-25", "en-cours"),
  ],
  issues: [
    iss("cld-i1", "Quota de VM insuffisant chez le fournisseur pour la vague 2", "T. Hoarau", 4, "2026-06-20"),
    iss("cld-i2", "IAM : rôles hérités incohérents entre applications", "L. Dubois", 3, "2026-05-15", "resolu", "2026-06-02"),
  ],
  decisions: [
    dec("cld-d1", "Adopter la stratégie 6R avec priorité au re-platform", "Comité d'architecture", "2026-04-24"),
    dec("cld-d2", "Décommissionner le datacenter au plus tard fin 2026", "COMEX", "2026-04-28", "Fin de bail et coûts de maintenance"),
  ],
};

/* ------------------------------------------------------------------ */
/* PRH — Portail RH                                                    */
/* ------------------------------------------------------------------ */

const rh: Project = {
  id: "rh",
  code: "PRH",
  name: "Portail RH self-service",
  description: "Portail collaborateur : congés, notes de frais, entretiens annuels.",
  manager: "E. Bardin",
  status: "en-cours",
  health: "red",
  strategicAxis: "Expérience collaborateur",
  budget: 180_000,
  projectStart: "2026-04-13",
  tasks: [
    t("rh-spec", "Spécifications", null, 0, 0),
    t("rh-spec-1", "Recueil des processus RH", "rh-spec", 0, 10, 100, [a("r-eb", 0.5)]),
    t("rh-spec-2", "Spécifications fonctionnelles", "rh-spec", 1, 12, 100, [a("r-eb", 0.5), a("r-sm", 0.3)]),
    t("rh-dev", "Réalisation", null, 1, 0),
    t("rh-dev-1", "Module congés", "rh-dev", 0, 15, 70, [a("r-mn", 0.5)]),
    t("rh-dev-2", "Module notes de frais", "rh-dev", 1, 15, 20, [a("r-jp", 0.4)]),
    t("rh-dev-3", "Intégration SIRH", "rh-dev", 2, 12, 10, [a("r-ar", 0.4)]),
    t("rh-rec", "Recette & déploiement", null, 2, 0),
    t("rh-rec-1", "Recette RH", "rh-rec", 0, 12, 0, [a("r-cl", 0.5), a("r-eb", 0.4)]),
    t("rh-rec-2", "Pilote sur une direction", "rh-rec", 1, 15, 0, [a("r-eb", 0.3)]),
    t("rh-rec-3", "Ouverture à tous", "rh-rec", 2, 0, 0),
  ],
  dependencies: [
    d("rh-spec-1", "rh-spec-2", "SS", 5),
    d("rh-spec-2", "rh-dev-1"),
    d("rh-dev-1", "rh-dev-2", "SS", 8),
    d("rh-spec-2", "rh-dev-3", "FS", 5),
    d("rh-dev-1", "rh-rec-1"),
    d("rh-dev-2", "rh-rec-1", "FF", 5),
    d("rh-dev-3", "rh-rec-1", "FF"),
    d("rh-rec-1", "rh-rec-2"),
    d("rh-rec-2", "rh-rec-3"),
  ],
  risks: [
    risk("rh-r1", "Charge de l'intégration SIRH sous-estimée", 5, 4, "E. Bardin", "ouvert", "Spike technique + revue de l'API SIRH"),
    risk("rh-r2", "Conflit de priorité avec la refonte CRM sur les développeurs", 4, 3, "PMO", "ouvert", "Arbitrage capacité en comité de portefeuille"),
  ],
  actions: [
    act("rh-a1", "Réaliser un spike sur l'API du SIRH", "A. Rakoto", "2026-05-18", "en-cours"),
    act("rh-a2", "Arbitrer le partage des développeurs CRM / RH", "PMO", "2026-05-12"),
  ],
  issues: [
    iss("rh-i1", "Documentation de l'API SIRH incomplète côté éditeur", "A. Rakoto", 4, "2026-05-05"),
    iss("rh-i2", "Retard du module notes de frais faute de spécifications", "E. Bardin", 3, "2026-05-20"),
  ],
  decisions: [
    dec("rh-d1", "Lancer le pilote sur une seule direction avant généralisation", "Sponsor RH", "2026-04-30", "Limiter le risque de rejet utilisateur"),
  ],
};

/* ------------------------------------------------------------------ */
/* DOR — Conformité DORA                                               */
/* ------------------------------------------------------------------ */

const dora: Project = {
  id: "dora",
  code: "DOR",
  name: "Conformité DORA",
  description: "Mise en conformité résilience opérationnelle : cartographie, tests, contrats.",
  manager: "L. Dubois",
  status: "cadrage",
  health: "green",
  strategicAxis: "Conformité & résilience",
  budget: 240_000,
  projectStart: "2026-08-03",
  tasks: [
    t("dor-gap", "Analyse d'écart", null, 0, 0),
    t("dor-gap-1", "Cartographie des fonctions critiques", "dor-gap", 0, 12, 0, [a("r-ld", 0.5)]),
    t("dor-gap-2", "Revue des contrats prestataires", "dor-gap", 1, 10, 0, [a("r-sm", 0.3)], 15_000),
    t("dor-gap-3", "Rapport d'écart", "dor-gap", 2, 0, 0),
    t("dor-rem", "Remédiation", null, 1, 0),
    t("dor-rem-1", "Plan de continuité TIC", "dor-rem", 0, 15, 0, [a("r-th", 0.4)]),
    t("dor-rem-2", "Tests de résilience", "dor-rem", 1, 10, 0, [a("r-cl", 0.5)]),
    t("dor-rem-3", "Registre des incidents", "dor-rem", 2, 8, 0, [a("r-jp", 0.3)]),
    t("dor-fin", "Attestation de conformité", null, 2, 0, 0),
  ],
  dependencies: [
    d("dor-gap-1", "dor-gap-3"),
    d("dor-gap-2", "dor-gap-3"),
    d("dor-gap-3", "dor-rem-1"),
    d("dor-rem-1", "dor-rem-2"),
    d("dor-gap-3", "dor-rem-3"),
    d("dor-rem-2", "dor-fin"),
    d("dor-rem-3", "dor-fin"),
  ],
  risks: [
    risk("dor-r1", "Échéance réglementaire non négociable (janvier 2027)", 3, 5, "L. Dubois", "ouvert", "Jalons intermédiaires suivis en comité de conformité"),
  ],
  actions: [
    act("dor-a1", "Constituer l'inventaire des prestataires TIC critiques", "S. Martin", "2026-08-20"),
    act("dor-a2", "Planifier le premier test de résilience", "C. Lefèvre", "2026-09-15"),
  ],
  issues: [],
  decisions: [
    dec("dor-d1", "Traiter la conformité DORA en projet dédié et non dans le run", "DSI", "2026-06-20", "Visibilité et traçabilité réglementaire"),
  ],
};

const demand = (
  id: string,
  title: string,
  sponsor: string,
  estBudget: number,
  value: number,
  effort: number,
  stage: Demand["stage"],
  description: string,
): Demand => ({ id, title, sponsor, description, estBudget, value, effort, stage, createdAt: "2026-06-01" });

const demands: Demand[] = [
  demand("dm1", "Chatbot support client IA", "Direction Client", 150_000, 4, 3, "idee", "Assistant conversationnel pour désengorger le support N1."),
  demand("dm2", "Dématérialisation des factures fournisseurs", "DAF", 90_000, 3, 2, "idee", "OCR + workflow de validation des factures entrantes."),
  demand("dm3", "Portail partenaires B2B", "Direction Commerciale", 220_000, 5, 4, "qualifiee", "Espace extranet pour les revendeurs et distributeurs."),
  demand("dm4", "Refonte du site institutionnel", "Communication", 60_000, 2, 2, "qualifiee", "Nouveau site vitrine responsive et accessible."),
  demand("dm5", "Socle Data & IA", "DSI", 300_000, 5, 4, "approuvee", "Lakehouse et plateforme d'entraînement de modèles."),
  demand("dm6", "Application mobile terrain", "Opérations", 130_000, 3, 5, "rejetee", "Reportée : dépendance à la migration cloud non terminée."),
];

const governanceEvents: GovernanceEvent[] = [
  gov("gv1", "comite-portefeuille", "Comité de portefeuille mensuel — mai", "2026-05-06", 8, 7),
  gov("gv2", "revue-projet", "Revue de projet CRM", "2026-05-14", 5, 5),
  gov("gv3", "comite-architecture", "Comité d'architecture — stratégie cloud", "2026-04-24", 6, 6),
  gov("gv4", "comite-portefeuille", "Comité de portefeuille mensuel — juin", "2026-06-03", 8, 6),
  gov("gv5", "revue-projet", "Revue de projet Portail RH", "2026-06-11", 5, 3),
  gov("gv6", "comite-conformite", "Comité de conformité DORA", "2026-06-20", 4, 4),
  gov("gv7", "comite-portefeuille", "Comité de portefeuille mensuel — juillet", "2026-07-01", 8, 8),
];

const surveys: SurveyResponse[] = [
  survey("sv1", "2026-05-10", "chef-projet", 9),
  survey("sv2", "2026-05-10", "sponsor", 8),
  survey("sv3", "2026-05-12", "equipe", 7),
  survey("sv4", "2026-06-05", "chef-projet", 6, "Reporting encore trop manuel"),
  survey("sv5", "2026-06-05", "sponsor", 9),
  survey("sv6", "2026-06-08", "equipe", 5),
  survey("sv7", "2026-06-15", "chef-projet", 10),
  survey("sv8", "2026-06-20", "sponsor", 7),
  survey("sv9", "2026-07-01", "chef-projet", 8),
  survey("sv10", "2026-07-01", "equipe", 4, "Charge RAID chronophage"),
];

export const seedPortfolio: Portfolio = {
  name: "Portefeuille DSI 2026",
  demands,
  governanceEvents,
  surveys,
  calendar: {
    workingWeekdays: [1, 2, 3, 4, 5],
    holidays: [
      "2026-01-01",
      "2026-04-06",
      "2026-05-01",
      "2026-05-08",
      "2026-05-14",
      "2026-05-25",
      "2026-07-14",
      "2026-11-11",
      "2026-12-25",
    ],
  },
  resources,
  projects: [crm, cloud, rh, dora],
};
