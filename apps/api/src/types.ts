/**
 * Wire format for GET/PUT /api/portfolio. Deliberately mirrors
 * apps/web/src/domain.ts + @atelier/scheduling-engine's Task/Dependency
 * field-for-field, so the frontend can consume/send it with zero mapping.
 */
import type { Dependency, Resource, Task } from "@atelier/scheduling-engine";

export interface WireRiskAssessmentEntry {
  at: string;
  source: "heuristic" | "llm" | "manual";
  userHint?: string;
  rationale: string;
  confidence: number;
  answers?: Record<string, unknown>;
}

export interface WireRiskAssessment {
  last: WireRiskAssessmentEntry;
  history: WireRiskAssessmentEntry[];
}

export interface WireRisk {
  id: string;
  label: string;
  probability: number;
  impact: number;
  owner: string;
  status: string;
  mitigation?: string;
  category?: string;
  strategy?: string;
  triggers?: string[];
  residualProbability?: number;
  residualImpact?: number;
  assessment?: WireRiskAssessment;
}

export interface WireAction {
  id: string;
  label: string;
  owner: string;
  dueDate: string;
  status: string;
}

export interface WireIssue {
  id: string;
  label: string;
  owner: string;
  severity: number;
  status: string;
}

export interface WireDecision {
  id: string;
  label: string;
  decidedBy: string;
  date: string;
  rationale?: string;
}

export interface WireTimeEntry {
  id: string;
  taskId: string;
  resourceId: string;
  weekStart: string;
  days: number;
}

export interface WireGateRecord {
  stage: string;
  approver: string;
  comment?: string;
  criteria: string[];
  at: string;
}

export interface WireDemand {
  id: string;
  title: string;
  sponsor: string;
  description: string;
  estBudget: number;
  value: number;
  effort: number;
  stage: string;
  createdAt: string;
  convertedProjectId?: string;
  gateHistory?: WireGateRecord[];
}

export interface WireAuditEntry {
  id: string;
  at: string;
  actor: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  detail?: unknown;
}

export interface WireCustomFieldDef {
  id: string;
  name: string;
  type: string;
  options?: string[];
}

export interface WireProject {
  id: string;
  code: string;
  name: string;
  description: string;
  manager: string;
  status: string;
  health: string;
  budget: number;
  projectStart: string;
  tasks: Task[];
  dependencies: Dependency[];
  risks: WireRisk[];
  actions: WireAction[];
  issues: WireIssue[];
  decisions: WireDecision[];
  timesheets: WireTimeEntry[];
  custom?: Record<string, string | number>;
  baselineCapturedAt?: string;
}

export interface WireGovernanceEvent {
  id: string;
  date: string;
  type: string;
  projectId?: string;
  notes?: string;
}

export interface WireSurveyResponse {
  id: string;
  date: string;
  role: string;
  score: number;
  comment?: string;
}

export interface WirePortfolio {
  name: string;
  appName?: string;
  fiscalYear?: number;
  calendar: { workingWeekdays: number[]; holidays: string[] };
  resources: Resource[];
  projects: WireProject[];
  demands: WireDemand[];
  customFields: WireCustomFieldDef[];
  governanceEvents?: WireGovernanceEvent[];
  surveys?: WireSurveyResponse[];
  /** Monotonic counter for sync; set by the API on save. */
  revision?: number;
  /** ISO datetime of last portfolio mutation. */
  updatedAt?: string;
}

export interface PortfolioMeta {
  revision: number;
  updatedAt: Date;
}
