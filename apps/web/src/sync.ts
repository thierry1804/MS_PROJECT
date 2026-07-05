import type { Portfolio } from "./domain";

/** Null means the database is empty (first ever run): caller should persist an initial portfolio. */
export async function fetchPortfolio(): Promise<Portfolio | null> {
  const res = await fetch("/api/portfolio");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /api/portfolio → ${res.status}`);
  return (await res.json()) as Portfolio;
}

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
  const res = await fetch("/api/portfolio", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(wire),
  });
  if (!res.ok) throw new Error(`PUT /api/portfolio → ${res.status}`);
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
  const res = await fetch(`/api/audit?limit=${limit}`);
  if (!res.ok) throw new Error(`GET /api/audit → ${res.status}`);
  return (await res.json()) as AuditEntry[];
}

export async function clearAuditLog(): Promise<void> {
  const res = await fetch("/api/audit", { method: "DELETE" });
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
  const res = await fetch("/api/config/database");
  if (!res.ok) throw new Error(`GET /api/config/database → ${res.status}`);
  return (await res.json()) as DatabaseConfigStatus;
}

export async function saveDatabaseConfig(config: {
  databaseUrl: string;
  directUrl?: string;
}): Promise<{ reconnected: boolean }> {
  const res = await fetch("/api/config/database", {
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
  const res = await fetch("/api/sync/status");
  if (!res.ok) throw new Error(`GET /api/sync/status → ${res.status}`);
  return (await res.json()) as CloudSyncStatus;
}

export async function saveCloudConfig(config: {
  enabled: boolean;
  databaseUrl?: string;
  directUrl?: string;
}): Promise<void> {
  const res = await fetch("/api/config/cloud", {
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
  const res = await fetch("/api/sync/now", { method: "POST" });
  if (!res.ok) throw new Error(`POST /api/sync/now → ${res.status}`);
}

export async function dismissSyncConflict(): Promise<void> {
  const res = await fetch("/api/sync/dismiss-conflict", { method: "POST" });
  if (!res.ok) throw new Error(`POST /api/sync/dismiss-conflict → ${res.status}`);
}

/** Best-effort: an audit entry that fails to save must never block the actual edit. */
export async function logAudit(entry: {
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  detail?: unknown;
}): Promise<void> {
  try {
    await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  } catch {
    // ignore — audit logging is not allowed to break the user's edit
  }
}
