import type { RiskCategory, RiskStrategy } from "../domain";

export type RiskAssistMode = "suggest" | "refine" | "followup";

export type RiskSuggestionSource = "heuristic" | "llm" | "manual";

export interface RiskSuggestion {
  id: string;
  label: string;
  category: RiskCategory;
  probability: number;
  impact: number;
  rationale: string;
  mitigation: string;
  actions: string[];
  triggers: string[];
  confidence: number;
  strategy: RiskStrategy;
  owner?: string;
  residualProbability?: number;
  residualImpact?: number;
  source: RiskSuggestionSource;
  accepted?: boolean;
  ignored?: boolean;
}

export interface LateTaskSnapshot {
  id: string;
  name: string;
  delayDays: number;
}

export interface OpenIssueSnapshot {
  id: string;
  label: string;
  severity: number;
}

export interface OverdueActionSnapshot {
  id: string;
  label: string;
  dueDate: string;
}

export interface OpenRiskSnapshot {
  id: string;
  label: string;
  category?: string;
}

export interface UnassignedCriticalTask {
  id: string;
  name: string;
}

export interface ProjectContextSnapshot {
  projectId: string;
  code: string;
  name: string;
  description: string;
  manager: string;
  status: string;
  health: string;
  budget: number;
  projectStart: string;
  hasBaseline: boolean;
  cpi: number;
  spi: number;
  bac: number;
  ac: number;
  eac: number;
  percentComplete: number;
  lateTasks: LateTaskSnapshot[];
  overdueActions: OverdueActionSnapshot[];
  openIssues: OpenIssueSnapshot[];
  openRisks: OpenRiskSnapshot[];
  overallocatedResources: string[];
  unassignedCriticalTasks: UnassignedCriticalTask[];
}

export type FollowUpQuestionType = "boolean" | "scale" | "text";

export interface FollowUpQuestion {
  id: string;
  text: string;
  type: FollowUpQuestionType;
  dimension: "probability" | "impact" | "general";
  categoryHint?: RiskCategory;
  suggestionId?: string;
}

export interface RiskAssistRequest {
  projectId: string;
  userHint?: string;
  context: ProjectContextSnapshot;
  heuristicSuggestions: RiskSuggestion[];
  mode: RiskAssistMode;
  answers?: Record<string, unknown>;
}

export interface RiskAssistResponse {
  suggestions: RiskSuggestion[];
  followUpQuestions: FollowUpQuestion[];
  source: "heuristic" | "llm" | "mixed";
}
