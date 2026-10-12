import type { Portfolio, Project } from "../domain";
import { scheduleOf } from "../store";

export function resolveProjectFromMessage(
  portfolio: Portfolio,
  message: string,
  hintProjectId?: string,
): Project | undefined {
  if (hintProjectId) {
    const hinted = portfolio.projects.find((p) => p.id === hintProjectId);
    if (hinted) return hinted;
  }

  const lower = message.toLowerCase();
  const scored = portfolio.projects
    .map((p) => {
      const code = p.code.toLowerCase();
      const name = p.name.toLowerCase();
      let score = 0;
      if (lower.includes(code)) score += 10;
      if (code.length >= 3 && new RegExp(`\\b${escapeRe(code)}\\b`, "i").test(message)) score += 8;
      if (name.length >= 3 && lower.includes(name)) score += 6;
      for (const token of name.split(/\s+/).filter((w) => w.length >= 4)) {
        if (lower.includes(token.toLowerCase())) score += 2;
      }
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.p;
}

export function resolveTasksByWbs(
  project: Project,
  portfolio: Portfolio,
  wbsCodes: string[],
): { id: string; wbs: string; name: string }[] {
  const schedule = scheduleOf(project, portfolio);
  const normalized = wbsCodes.map((w) => w.trim());
  const found: { id: string; wbs: string; name: string }[] = [];

  for (const code of normalized) {
    for (const task of project.tasks) {
      const s = schedule.tasks.get(task.id);
      if (!s || s.isSummary) continue;
      if (s.wbs === code) {
        if (!found.some((f) => f.id === task.id)) {
          found.push({ id: task.id, wbs: s.wbs, name: task.name });
        }
      }
    }
  }
  return found;
}

export function extractWbsCodes(message: string): string[] {
  const matches = message.match(/\b\d+(?:\.\d+)+\b/g);
  return matches ? [...new Set(matches)] : [];
}

export function extractPercentComplete(message: string): number | undefined {
  const m = message.match(/(\d+)\s*%/);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (Number.isNaN(n)) return undefined;
  return Math.min(100, Math.max(0, n));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
