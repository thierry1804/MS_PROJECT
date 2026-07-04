import type { Portfolio } from "./domain";

/** Null means the database is empty (first ever run): caller should seed it. */
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
