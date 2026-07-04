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
    projects: portfolio.projects.map((p) => ({ ...p, timesheets: p.timesheets ?? [] })),
  };
  const res = await fetch("/api/portfolio", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(wire),
  });
  if (!res.ok) throw new Error(`PUT /api/portfolio → ${res.status}`);
}
