import type { DemandStage, RaidKind } from "../domain";

export type CopilotIntentId =
  | "queryPortfolioHealth"
  | "queryOpenRisks"
  | "queryOverdueActions"
  | "queryPipelineSummary"
  | "queryResourceOverload"
  | "createProject"
  | "updateProject"
  | "deleteProject"
  | "addRisk"
  | "addAction"
  | "addIssue"
  | "addDecision"
  | "updateRaidItem"
  | "removeRaidItem"
  | "addDemand"
  | "moveDemand"
  | "convertDemand"
  | "deleteDemand"
  | "addTask"
  | "updateTask"
  | "addDependency"
  | "assignResource"
  | "captureBaseline"
  | "shiftTasks"
  | "logTime"
  | "addResource"
  | "updateResource";

export type IntentCategory = "query" | "mutation" | "planning" | "pipeline" | "raid" | "project";

export type SlotType = "string" | "number" | "boolean" | "date" | "choice" | "checklist";

export interface SlotDef {
  key: string;
  label: string;
  type: SlotType;
  required: boolean;
  /** Recommended but not blocking. */
  recommended?: boolean;
  choices?: { id: string; label: string }[];
}

export interface IntentDefinition {
  id: CopilotIntentId;
  label: string;
  description: string;
  category: IntentCategory;
  slots: SlotDef[];
  destructive?: boolean;
}

export type CopilotQuestionType = "boolean" | "scale" | "text" | "choice" | "checklist";

export interface CopilotQuestion {
  id: string;
  text: string;
  type: CopilotQuestionType;
  slotKey: string;
  choices?: { id: string; label: string }[];
  checklistItems?: string[];
}

export type CopilotSessionPhase = "gathering" | "preview" | "executed" | "cancelled";

export interface CopilotMessage {
  role: "user" | "assistant" | "system";
  content: string;
  at: string;
}

export interface ActionPreview {
  intent: CopilotIntentId;
  summary: string;
  details: string[];
  requiresConfirmation: boolean;
  destructive?: boolean;
}

export interface CopilotSession {
  id: string;
  phase: CopilotSessionPhase;
  intent?: CopilotIntentId;
  slots: Record<string, unknown>;
  pendingQuestions: CopilotQuestion[];
  messages: CopilotMessage[];
  preview?: ActionPreview;
}

export type ExecuteResult =
  | { type: "query"; markdown: string }
  | { type: "mutation"; entityId?: string; message: string }
  | { type: "error"; message: string };

export interface WireDisambiguation {
  phrase: string;
  entityId: string;
  entityType: "project" | "demand" | "task";
  count: number;
}

export interface WireEpisode {
  id: string;
  intent: string;
  userMessages: string[];
  finalSlots: Record<string, unknown>;
  outcome: "executed" | "cancelled" | "corrected";
  at: string;
  corrections?: { slot: string; from: unknown; to: unknown }[];
}

export interface WireCopilotPreferences {
  defaultProjectManager?: string;
  defaultGateApprovers?: Partial<Record<DemandStage, string>>;
  managerCounts?: Record<string, number>;
}

export interface WireQuestionStat {
  asked: number;
  answered: number;
  skipped: number;
}

export interface WireCopilotMemory {
  preferences: WireCopilotPreferences;
  disambiguations: WireDisambiguation[];
  episodes: WireEpisode[];
  questionStats: Record<string, WireQuestionStat>;
  revision: number;
  updatedAt?: string;
}

export interface CopilotChatResponse {
  intent?: CopilotIntentId;
  extractedSlots: Record<string, unknown>;
  suggestedQuestions: CopilotQuestion[];
  assistantMessage: string;
  confidence: number;
}

export const EMPTY_MEMORY: WireCopilotMemory = {
  preferences: {},
  disambiguations: [],
  episodes: [],
  questionStats: {},
  revision: 0,
};

export type RaidKindSlot = RaidKind;
