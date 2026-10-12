import { isWorkingDay, parseISO, toISO } from "@atelier/scheduling-engine";
import type { Health, Portfolio, Project } from "../../domain";
import { DEMAND_STAGE_LABELS, HEALTH_LABELS, todayISO } from "../../domain";
import { metricsOf, scheduleOf } from "../../store";
import type { CopilotIntentId } from "../types";

const DAY_MS = 86_400_000;

function mondayOf(utc: number): number {
  const day = new Date(utc).getUTCDay();
  const delta = day === 0 ? 6 : day - 1;
  return utc - delta * DAY_MS;
}

export function queryPortfolioHealth(portfolio: Portfolio): string {
  const lines = ["## Santé du portefeuille", ""];
  const sorted = [...portfolio.projects].sort((a, b) => {
    const rank: Record<Health, number> = { red: 0, amber: 1, green: 2 };
    return rank[a.health] - rank[b.health] || a.name.localeCompare(b.name);
  });
  const counts = { red: 0, amber: 0, green: 0 };
  for (const p of sorted) counts[p.health]++;
  lines.push(`**${counts.red}** en dérive · **${counts.amber}** sous surveillance · **${counts.green}** sains`, "");
  if (sorted.length === 0) return lines.join("\n") + "\nAucun projet.";
  lines.push("| Projet | Santé | SPI | CPI |");
  lines.push("|--------|-------|-----|-----|");
  for (const p of sorted) {
    const m = metricsOf(p, portfolio);
    lines.push(
      `| ${p.name} (${p.code}) | ${HEALTH_LABELS[p.health]} | ${m.spi.toFixed(2)} | ${m.cpi.toFixed(2)} |`,
    );
  }
  return lines.join("\n");
}

export function queryOpenRisks(portfolio: Portfolio, projectId?: string): string {
  const rows: { score: number; line: string }[] = [];
  for (const p of portfolio.projects) {
    if (projectId && p.id !== projectId) continue;
    for (const r of p.risks) {
      if (r.status !== "ouvert") continue;
      const score = r.probability * r.impact;
      rows.push({
        score,
        line: `| ${r.label} | ${p.code} | ${score} | ${r.owner} | ${r.category ?? "—"} |`,
      });
    }
  }
  rows.sort((a, b) => b.score - a.score);
  const top = rows.slice(0, 10);
  if (top.length === 0) return "Aucun risque ouvert.";
  return [
    "## Risques ouverts (top 10)",
    "",
    "| Risque | Projet | Score | Porteur | Catégorie |",
    "|--------|--------|-------|---------|-----------|",
    ...top.map((r) => r.line),
  ].join("\n");
}

export function queryOverdueActions(portfolio: Portfolio): string {
  const today = todayISO();
  const lines: string[] = [];
  for (const p of portfolio.projects) {
    for (const a of p.actions) {
      if (a.status === "fait" || a.dueDate >= today) continue;
      const overdue = Math.ceil(
        (new Date(today).getTime() - new Date(a.dueDate).getTime()) / DAY_MS,
      );
      lines.push(`- **${a.label}** (${p.code}) — ${a.owner}, ${overdue} j de retard`);
    }
  }
  if (lines.length === 0) return "Aucune action en retard.";
  return ["## Actions en retard", "", ...lines].join("\n");
}

export function queryPipelineSummary(portfolio: Portfolio): string {
  const demands = portfolio.demands ?? [];
  const byStage = Object.keys(DEMAND_STAGE_LABELS) as (keyof typeof DEMAND_STAGE_LABELS)[];
  const lines = ["## Pipeline demandes", ""];
  for (const stage of byStage) {
    const n = demands.filter((d) => d.stage === stage).length;
    lines.push(`- **${DEMAND_STAGE_LABELS[stage]}** : ${n}`);
  }
  const ready = demands.filter((d) => d.stage === "approuvee" && !d.convertedProjectId);
  if (ready.length) {
    lines.push("", "**Prêtes à convertir :**");
    for (const d of ready) lines.push(`- ${d.title} (sponsor : ${d.sponsor})`);
  }
  return lines.join("\n");
}

export function queryResourceOverload(portfolio: Portfolio): string {
  const acc = new Map<string, Map<string, number>>();
  let minW = Infinity;
  let maxW = -Infinity;

  for (const project of portfolio.projects) {
    const schedule = scheduleOf(project, portfolio);
    const cal = portfolio.calendar;
    const horizon = schedule.projectDuration;
    const dates: number[] = [];
    let t = parseISO(project.projectStart);
    while (dates.length < horizon) {
      if (isWorkingDay(cal, t)) dates.push(t);
      t += DAY_MS;
    }
    for (const task of project.tasks) {
      const s = schedule.tasks.get(task.id);
      if (!s || s.isSummary || s.isMilestone || task.assignments.length === 0) continue;
      for (const asg of task.assignments) {
        let byWeek = acc.get(asg.resourceId);
        if (!byWeek) {
          byWeek = new Map();
          acc.set(asg.resourceId, byWeek);
        }
        for (let d = s.es; d < s.ef && d < dates.length; d++) {
          const wk = mondayOf(dates[d]!);
          minW = Math.min(minW, wk);
          maxW = Math.max(maxW, wk);
          const key = toISO(wk);
          byWeek.set(key, (byWeek.get(key) ?? 0) + asg.units);
        }
      }
    }
  }

  const lines: string[] = ["## Surcharge ressources", ""];
  let found = false;
  for (const res of portfolio.resources) {
    const byWeek = acc.get(res.id);
    if (!byWeek) continue;
    let peak = 0;
    let peakWeek = "";
    for (const [wk, units] of byWeek) {
      const fte = units / 5;
      if (fte > peak) {
        peak = fte;
        peakWeek = wk;
      }
    }
    if (peak > res.capacity * 1.05) {
      found = true;
      lines.push(`- **${res.name}** : pic ${peak.toFixed(1)} ETP (sem. ${peakWeek}), capacité ${res.capacity}`);
    }
  }
  if (!found) lines.push("Aucune surcharge détectée sur l'horizon planifié.");
  return lines.join("\n");
}

export function executeQuery(intent: CopilotIntentId, portfolio: Portfolio, slots: Record<string, unknown>): string {
  switch (intent) {
    case "queryPortfolioHealth":
      return queryPortfolioHealth(portfolio);
    case "queryOpenRisks":
      return queryOpenRisks(portfolio, slots.projectId as string | undefined);
    case "queryOverdueActions":
      return queryOverdueActions(portfolio);
    case "queryPipelineSummary":
      return queryPipelineSummary(portfolio);
    case "queryResourceOverload":
      return queryResourceOverload(portfolio);
    default:
      return "Requête non reconnue.";
  }
}

export function findProject(portfolio: Portfolio, ref: string): Project | undefined {
  const q = ref.trim().toLowerCase();
  return portfolio.projects.find(
    (p) => p.id === ref || p.code.toLowerCase() === q || p.name.toLowerCase().includes(q),
  );
}
