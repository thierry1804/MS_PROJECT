import type { CalendarDef, Dependency, Resource, Task } from "@atelier/scheduling-engine";

export type Health = "green" | "amber" | "red";
export type ProjectStatus = "cadrage" | "en-cours" | "en-pause" | "termine";
export type RiskStatus = "ouvert" | "traite";

export type RiskCategory =
  | "Planning"
  | "Budget"
  | "Ressources"
  | "Technique"
  | "Fournisseur"
  | "Conformité"
  | "Sécurité"
  | "Organisation"
  | "Qualité"
  | "Externe";

export type RiskStrategy = "éviter" | "réduire" | "transférer" | "accepter";

export interface RiskAssessmentEntry {
  at: string;
  source: "heuristic" | "llm" | "manual";
  userHint?: string;
  rationale: string;
  confidence: number;
  answers?: Record<string, unknown>;
}

export interface RiskAssessment {
  last: RiskAssessmentEntry;
  history: RiskAssessmentEntry[];
}

export interface Risk {
  id: string;
  label: string;
  /** 1..5 */
  probability: number;
  /** 1..5 */
  impact: number;
  owner: string;
  status: RiskStatus;
  /** Mesure de mitigation prévue. */
  mitigation?: string;
  category?: RiskCategory;
  strategy?: RiskStrategy;
  /** KRI / signaux de déclenchement. */
  triggers?: string[];
  /** P après mitigation (1–5). */
  residualProbability?: number;
  /** I après mitigation (1–5). */
  residualImpact?: number;
  assessment?: RiskAssessment;
}

export type ActionStatus = "a-faire" | "en-cours" | "fait";

export interface Action {
  id: string;
  label: string;
  owner: string;
  /** ISO date échéance. */
  dueDate: string;
  status: ActionStatus;
}

export type IssueStatus = "ouvert" | "resolu";

export interface Issue {
  id: string;
  label: string;
  owner: string;
  /** 1..5, gravité. */
  severity: number;
  status: IssueStatus;
  /** ISO date de création, pour le time-to-resolution. */
  createdAt: string;
  /** ISO date de résolution ; absent tant que status !== "resolu". */
  resolvedAt?: string;
}

export interface Decision {
  id: string;
  label: string;
  decidedBy: string;
  /** ISO date. */
  date: string;
  rationale?: string;
}

/** The four RAID registers a project carries. */
export type RaidKind = "risks" | "actions" | "issues" | "decisions";
export type RaidItem = Risk | Action | Issue | Decision;

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  "a-faire": "À faire",
  "en-cours": "En cours",
  fait: "Fait",
};

/** One weekly time log: `days` worked by a resource on a task that week. */
export interface TimeEntry {
  id: string;
  taskId: string;
  resourceId: string;
  /** Monday of the week, ISO. */
  weekStart: string;
  days: number;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  description: string;
  manager: string;
  status: ProjectStatus;
  health: Health;
  /** Budget approuvé, €. */
  budget: number;
  projectStart: string;
  tasks: Task[];
  dependencies: Dependency[];
  risks: Risk[];
  actions: Action[];
  issues: Issue[];
  decisions: Decision[];
  /** Feuilles de temps ; alimentent le coût réel (actualCost) des tâches. */
  timesheets?: TimeEntry[];
  /** Valeurs de champs personnalisés au niveau projet, indexées par id de champ. */
  custom?: Record<string, string | number>;
  /** ISO date when the baseline was last captured. */
  baselineCapturedAt?: string;
  /** Axe stratégique groupe auquel le projet est rattaché (KPI d'alignement). */
  strategicAxis?: string;
}

export type DemandStage = "idee" | "qualifiee" | "approuvee" | "rejetee";

export const DEMAND_STAGES: DemandStage[] = ["idee", "qualifiee", "approuvee", "rejetee"];

export const DEMAND_STAGE_LABELS: Record<DemandStage, string> = {
  idee: "Idées",
  qualifiee: "Qualifiées",
  approuvee: "Approuvées",
  rejetee: "Rejetées",
};

/** A recorded stage-gate decision: who approved entering `stage`, and against which checklist. */
export interface GateRecord {
  stage: DemandStage;
  approver: string;
  comment?: string;
  criteria: string[];
  /** ISO date the gate was validated. */
  at: string;
}

/** Checklist a gate's approver must confirm before the demand can enter that stage.
 *  Only stages reached through a formal gate (not rejection/reactivation) have one. */
export const GATE_CRITERIA: Partial<Record<DemandStage, string[]>> = {
  qualifiee: [
    "Sponsor identifié et disponible",
    "Périmètre et objectif décrits",
    "Budget estimé renseigné",
  ],
  approuvee: [
    "Valeur et effort évalués et cohérents",
    "Budget validé par le sponsor",
    "Aucun risque bloquant identifié à ce stade",
  ],
};

/** A project idea flowing through the intake / stage-gate pipeline. */
export interface Demand {
  id: string;
  title: string;
  sponsor: string;
  description: string;
  estBudget: number;
  /** 1..5 valeur métier. */
  value: number;
  /** 1..5 effort estimé. */
  effort: number;
  stage: DemandStage;
  createdAt: string;
  /** Set once converted into an active project. */
  convertedProjectId?: string;
  /** Gate decisions recorded as the demand advanced through the pipeline. */
  gateHistory?: GateRecord[];
}

/** Priority score: high value, low effort ranks first (0..25). */
export function demandPriority(d: Demand): number {
  return d.value * (6 - d.effort);
}

export type CustomFieldType = "text" | "number" | "select";

/** A user-defined field attached to tasks (custom columns, MS Project style). */
export interface CustomFieldDef {
  id: string;
  name: string;
  type: CustomFieldType;
  /** Choices for `select` type. */
  options?: string[];
}

/** Type de rituel de gouvernance PMO suivi (comités, revues). */
export type GovernanceEventType = "comite-portefeuille" | "revue-projet" | "comite-architecture" | "comite-conformite";

export const GOVERNANCE_TYPE_LABELS: Record<GovernanceEventType, string> = {
  "comite-portefeuille": "Comité de portefeuille",
  "revue-projet": "Revue de projet",
  "comite-architecture": "Comité d'architecture",
  "comite-conformite": "Comité de conformité",
};

/** One governance ritual instance, used to measure participation to comités/revues. */
export interface GovernanceEvent {
  id: string;
  type: GovernanceEventType;
  label: string;
  /** ISO date. */
  date: string;
  /** Participants attendus. */
  expected: number;
  /** Participants effectivement présents. */
  attendees: number;
}

export type SurveyRole = "chef-projet" | "sponsor" | "equipe";

export const SURVEY_ROLE_LABELS: Record<SurveyRole, string> = {
  "chef-projet": "Chef de projet",
  sponsor: "Sponsor",
  equipe: "Équipe projet",
};

/** One internal-NPS style satisfaction response about the PMO. */
export interface SurveyResponse {
  id: string;
  /** ISO date. */
  date: string;
  role: SurveyRole;
  /** 0..10, "recommanderiez-vous le PMO à un pair ?" */
  score: number;
  comment?: string;
}

export interface Portfolio {
  name: string;
  /** Nom affiché de l'application (sidebar, titre navigateur). */
  appName?: string;
  /** Année d'exercice comptable / budgétaire du portefeuille. */
  fiscalYear?: number;
  calendar: CalendarDef;
  resources: Resource[];
  projects: Project[];
  /** Pipeline de demandes (stage-gate). */
  demands?: Demand[];
  /** Définitions de champs personnalisés au niveau tâche. */
  customFields?: CustomFieldDef[];
  /** Journal des rituels de gouvernance (comités, revues) — KPI de participation. */
  governanceEvents?: GovernanceEvent[];
  /** Réponses au baromètre de satisfaction interne — KPI NPS. */
  surveys?: SurveyResponse[];
}

/** Fields captured when a new project is created from the intake form. */
export interface ProjectDraft {
  code: string;
  name: string;
  manager: string;
  description: string;
  budget: number;
  projectStart: string;
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  cadrage: "Cadrage",
  "en-cours": "En cours",
  "en-pause": "En pause",
  termine: "Terminé",
};

export const HEALTH_LABELS: Record<Health, string> = {
  green: "Saine",
  amber: "Sous surveillance",
  red: "En dérive",
};

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Objet sidebar : libellé portefeuille + année d'exercice. */
export function portfolioSidebarLabel(name: string, fiscalYear?: number): string {
  const year = fiscalYear ?? new Date().getFullYear();
  const base = name.trim() || "Portefeuille";
  if (/\d{4}\s*$/.test(base)) {
    return base.replace(/\s*\d{4}\s*$/, ` ${year}`).trim();
  }
  return `${base} ${year}`;
}

export const EUR = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
});

export const DATE_FMT_FULL = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function fmtDate(iso: string, full = false): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return (full ? DATE_FMT_FULL : DATE_FMT).format(date);
}
