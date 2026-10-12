import type { Portfolio } from "./domain";
import type { WireCopilotMemory } from "./copilot/types";
import type { RiskAssistRequest, RiskAssistResponse } from "./risk-assist/types";
import { apiUrl } from "./api-url";

/** Null means the database is empty (first ever run): caller should persist an initial portfolio. */
export async function fetchPortfolio(): Promise<Portfolio | null> {
  const res = await fetch(apiUrl("/api/portfolio"));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /api/portfolio → ${res.status}`);
  return (await res.json()) as Portfolio;
}

/**
 * Thrown when the server 403s a save because the in-memory portfolio still
 * holds a project the caller's access was revoked for mid-session (admin
 * changed their grants while they were editing). Distinct from a plain
 * network/server error so the caller can resync instead of just retrying —
 * retrying would 403 forever, since the stale project never leaves local
 * state on its own.
 */
export class AccessRevokedError extends Error {}

/** Full replace on the server. Fills in the optional arrays the wire format requires. */
export async function savePortfolio(portfolio: Portfolio): Promise<void> {
  const wire: Portfolio = {
    ...portfolio,
    demands: portfolio.demands ?? [],
    customFields: portfolio.customFields ?? [],
    governanceEvents: portfolio.governanceEvents ?? [],
    surveys: portfolio.surveys ?? [],
    projects: portfolio.projects.map((p) => ({ ...p, timesheets: p.timesheets ?? [] })),
  };
  const res = await fetch(apiUrl("/api/portfolio"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(wire),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (res.status === 403) throw new AccessRevokedError(body?.error ?? "Accès retiré.");
    throw new Error(body?.error ?? `PUT /api/portfolio → ${res.status}`);
  }
}

export interface AuditEntry {
  id: string;
  /** ISO datetime. */
  at: string;
  actor: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  detail?: unknown;
}

export async function fetchAuditLog(limit = 300): Promise<AuditEntry[]> {
  const res = await fetch(apiUrl(`/api/audit?limit=${limit}`));
  if (!res.ok) throw new Error(`GET /api/audit → ${res.status}`);
  return (await res.json()) as AuditEntry[];
}

export async function clearAuditLog(): Promise<void> {
  const res = await fetch(apiUrl("/api/audit"), { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /api/audit → ${res.status}`);
}

export interface DatabaseConfigStatus {
  source: "env" | "file" | "none" | "desktop";
  configured: boolean;
  databaseUrlMasked: string;
  directUrlMasked: string;
}

export interface CloudSyncStatus {
  desktop: boolean;
  enabled: boolean;
  online: boolean;
  pending: boolean;
  conflict: boolean;
  conflictWinner?: string | null;
  lastSyncedAt?: string | null;
  localRevision?: number;
  cloudRevision?: number;
  localDbPath?: string | null;
  cloudUrlMasked?: string;
}

export async function fetchDatabaseConfig(): Promise<DatabaseConfigStatus> {
  const res = await fetch(apiUrl("/api/config/database"));
  if (!res.ok) throw new Error(`GET /api/config/database → ${res.status}`);
  return (await res.json()) as DatabaseConfigStatus;
}

export async function saveDatabaseConfig(config: {
  databaseUrl: string;
  directUrl?: string;
}): Promise<{ reconnected: boolean }> {
  const res = await fetch(apiUrl("/api/config/database"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `PUT /api/config/database → ${res.status}`);
  }
  return (await res.json()) as { reconnected: boolean };
}

export async function fetchCloudSyncStatus(): Promise<CloudSyncStatus> {
  const res = await fetch(apiUrl("/api/sync/status"));
  if (!res.ok) throw new Error(`GET /api/sync/status → ${res.status}`);
  return (await res.json()) as CloudSyncStatus;
}

export async function saveCloudConfig(config: {
  enabled: boolean;
  databaseUrl?: string;
  directUrl?: string;
}): Promise<void> {
  const res = await fetch(apiUrl("/api/config/cloud"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `PUT /api/config/cloud → ${res.status}`);
  }
}

export async function triggerSyncNow(): Promise<void> {
  const res = await fetch(apiUrl("/api/sync/now"), { method: "POST" });
  if (!res.ok) throw new Error(`POST /api/sync/now → ${res.status}`);
}

export async function dismissSyncConflict(): Promise<void> {
  const res = await fetch(apiUrl("/api/sync/dismiss-conflict"), { method: "POST" });
  if (!res.ok) throw new Error(`POST /api/sync/dismiss-conflict → ${res.status}`);
}

export type AiPreset = "openrouter" | "openai" | "custom";

export interface AiConfigStatus {
  configured: boolean;
  preset: AiPreset;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
  source: "file" | "env" | "none";
}

export async function fetchAiConfig(): Promise<AiConfigStatus> {
  const res = await fetch(apiUrl("/api/config/ai"));
  if (!res.ok) throw new Error(`GET /api/config/ai → ${res.status}`);
  return (await res.json()) as AiConfigStatus;
}

export async function saveAiConfig(config: {
  preset?: AiPreset;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): Promise<AiConfigStatus> {
  const res = await fetch(apiUrl("/api/config/ai"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `PUT /api/config/ai → ${res.status}`);
  }
  return (await res.json()) as AiConfigStatus;
}

export async function testAiConfig(): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(apiUrl("/api/config/ai/test"), { method: "POST" });
  if (!res.ok) throw new Error(`POST /api/config/ai/test → ${res.status}`);
  return (await res.json()) as { ok: boolean; error?: string };
}

export async function fetchRiskAssist(payload: RiskAssistRequest): Promise<RiskAssistResponse> {
  const res = await fetch(apiUrl("/api/risk-assist"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `POST /api/risk-assist → ${res.status}`);
  }
  return (await res.json()) as RiskAssistResponse;
}

export type { WireCopilotMemory } from "./copilot/types";

export async function fetchCopilotMemory(): Promise<WireCopilotMemory> {
  const res = await fetch(apiUrl("/api/copilot/memory"));
  if (!res.ok) throw new Error(`GET /api/copilot/memory → ${res.status}`);
  return (await res.json()) as WireCopilotMemory;
}

export async function saveCopilotMemory(memory: WireCopilotMemory): Promise<WireCopilotMemory> {
  const res = await fetch(apiUrl("/api/copilot/memory"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(memory),
  });
  if (res.status === 409) {
    const body = (await res.json()) as { currentRevision?: number };
    throw new Error(`Révision obsolète (${body.currentRevision ?? "?"})`);
  }
  if (!res.ok) throw new Error(`PUT /api/copilot/memory → ${res.status}`);
  return (await res.json()) as WireCopilotMemory;
}

export async function resetCopilotMemoryApi(): Promise<WireCopilotMemory> {
  const res = await fetch(apiUrl("/api/copilot/memory"), { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /api/copilot/memory → ${res.status}`);
  return (await res.json()) as WireCopilotMemory;
}

export interface CopilotChatRequest {
  message: string;
  session: { intent?: string; slots: Record<string, unknown>; phase: string };
  portfolioContext: unknown;
  memory?: { episodes: unknown[] };
  intentCatalog: { id: string; label: string; description: string; requiredSlots: string[] }[];
}

export interface CopilotChatResponseWire {
  intent?: string;
  extractedSlots: Record<string, unknown>;
  suggestedQuestions: {
    id: string;
    text: string;
    type: string;
    slotKey: string;
    choices?: { id: string; label: string }[];
  }[];
  assistantMessage: string;
  confidence: number;
}

export async function fetchCopilotChat(body: CopilotChatRequest): Promise<CopilotChatResponseWire> {
  const res = await fetch(apiUrl("/api/copilot/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? `POST /api/copilot/chat → ${res.status}`);
  }
  return (await res.json()) as CopilotChatResponseWire;
}

/** Best-effort: an audit entry that fails to save must never block the actual edit. */
let auditActor = "—";

export function setAuditActor(actor: string): void {
  auditActor = actor;
}

export function resetAuditActor(): void {
  auditActor = "—";
}

export async function logAudit(entry: {
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  detail?: unknown;
  actor?: string;
}): Promise<void> {
  try {
    await fetch(apiUrl("/api/audit"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...entry, actor: entry.actor ?? auditActor }),
    });
  } catch {
    // ignore — audit logging is not allowed to break the user's edit
  }
}
