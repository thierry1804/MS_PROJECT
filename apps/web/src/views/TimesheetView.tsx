import { useMemo, useState } from "react";
import { EUR, fmtDate, todayISO } from "../domain";
import { metricsOf, scheduleOf, useStore } from "../store";
import "../styles/timesheet.css";

const DAY_MS = 86_400_000;

function mondayISO(iso: string): string {
  const t = Date.parse(iso + "T00:00:00Z");
  const day = new Date(t).getUTCDay();
  const delta = day === 0 ? 6 : day - 1;
  return new Date(t - delta * DAY_MS).toISOString().slice(0, 10);
}

function addWeeks(mondayIso: string, n: number): string {
  return new Date(Date.parse(mondayIso + "T00:00:00Z") + n * 7 * DAY_MS).toISOString().slice(0, 10);
}

export function TimesheetView() {
  const portfolio = useStore((s) => s.portfolio);
  const logTime = useStore((s) => s.logTime);

  const [projectId, setProjectId] = useState(portfolio.projects[0]?.id ?? "");
  const [week, setWeek] = useState(() => mondayISO(todayISO()));

  const project = portfolio.projects.find((p) => p.id === projectId) ?? portfolio.projects[0];
  const resById = useMemo(() => new Map(portfolio.resources.map((r) => [r.id, r])), [portfolio.resources]);

  if (!project) return <div className="view-header"><h1>Aucun projet</h1></div>;

  const schedule = scheduleOf(project, portfolio);
  const metrics = metricsOf(project, portfolio);
  const sheets = project.timesheets ?? [];

  // One row per (leaf task, assigned resource).
  const rows: { taskId: string; taskName: string; resourceId: string }[] = [];
  for (const t of project.tasks) {
    const s = schedule.tasks.get(t.id);
    if (!s || s.isSummary || s.isMilestone) continue;
    for (const a of t.assignments) rows.push({ taskId: t.id, taskName: t.name, resourceId: a.resourceId });
  }

  const entryDays = (taskId: string, resourceId: string, wk: string) =>
    sheets.find((e) => e.taskId === taskId && e.resourceId === resourceId && e.weekStart === wk)?.days ?? 0;

  const cumulDays = (taskId: string, resourceId: string) =>
    sheets.filter((e) => e.taskId === taskId && e.resourceId === resourceId).reduce((s, e) => s + e.days, 0);

  let weekDays = 0;
  let weekCost = 0;
  for (const r of rows) {
    const d = entryDays(r.taskId, r.resourceId, week);
    weekDays += d;
    weekCost += d * (resById.get(r.resourceId)?.costPerDay ?? 0);
  }

  const totalActual = project.tasks.reduce((s, t) => s + (t.actualCost ?? 0), 0);

  return (
    <>
      <div className="view-header ts-header">
        <div>
          <h1>Feuilles de temps</h1>
          <span className="sub">Saisie hebdomadaire ; le coût réel et le CPI se recalculent en direct.</span>
        </div>
        <div className="ts-controls">
          <select className="ts-select" value={project.id} onChange={(e) => setProjectId(e.target.value)}>
            {portfolio.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <div className="ts-week-nav">
            <button onClick={() => setWeek((w) => addWeeks(w, -1))} aria-label="Semaine précédente">‹</button>
            <span className="ts-week tnum">Semaine du {fmtDate(week, true)}</span>
            <button onClick={() => setWeek((w) => addWeeks(w, 1))} aria-label="Semaine suivante">›</button>
          </div>
        </div>
      </div>

      <div className="view-body ts-body">
        <div className="ts-kpis">
          <div className="ts-kpi">
            <span className="ts-kpi-val tnum">{weekDays.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} j</span>
            <span className="ts-kpi-label">Saisis cette semaine</span>
          </div>
          <div className="ts-kpi">
            <span className="ts-kpi-val tnum">{EUR.format(weekCost)}</span>
            <span className="ts-kpi-label">Coût de la semaine</span>
          </div>
          <div className="ts-kpi">
            <span className="ts-kpi-val tnum">{EUR.format(totalActual)}</span>
            <span className="ts-kpi-label">Coût réel cumulé (CR)</span>
          </div>
          <div className="ts-kpi">
            <span className={`ts-kpi-val tnum ${metrics.cpi >= 0.95 ? "ok" : metrics.cpi >= 0.8 ? "warn" : "bad"}`}>
              {metrics.cpi.toFixed(2)}
            </span>
            <span className="ts-kpi-label">ICP (CPI)</span>
          </div>
        </div>

        <table className="ts-table">
          <thead>
            <tr>
              <th>Tâche</th>
              <th>Ressource</th>
              <th className="num">Taux / j</th>
              <th className="num">Jours (semaine)</th>
              <th className="num">Coût semaine</th>
              <th className="num">Cumul jours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const res = resById.get(r.resourceId);
              const d = entryDays(r.taskId, r.resourceId, week);
              const rate = res?.costPerDay ?? 0;
              return (
                <tr key={`${r.taskId}-${r.resourceId}`}>
                  <td>{r.taskName}</td>
                  <td>
                    {res?.name ?? r.resourceId}
                    <span className="ts-role"> · {res?.role}</span>
                  </td>
                  <td className="num tnum">{EUR.format(rate)}</td>
                  <td className="num">
                    <input
                      className="ts-input tnum"
                      type="number"
                      min={0}
                      max={7}
                      step={0.5}
                      value={d || ""}
                      placeholder="0"
                      onChange={(e) =>
                        logTime(project.id, r.taskId, r.resourceId, week, Math.max(0, Number(e.target.value) || 0))
                      }
                    />
                  </td>
                  <td className="num tnum">{d > 0 ? EUR.format(d * rate) : "—"}</td>
                  <td className="num tnum muted">{cumulDays(r.taskId, r.resourceId) || "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="ts-empty">Aucune tâche avec ressource affectée sur ce projet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
