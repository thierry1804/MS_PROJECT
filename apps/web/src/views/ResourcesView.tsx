import { useMemo } from "react";
import {
  isWorkingDay,
  parseISO,
  toISO,
  type Resource,
} from "@atelier/scheduling-engine";
import { fmtDate, todayISO } from "../domain";
import { scheduleOf, useStore } from "../store";
import "../styles/resources.css";

const DAY_MS = 86_400_000;

/** Monday of the week containing the given UTC time. */
function mondayOf(utc: number): number {
  const day = new Date(utc).getUTCDay();
  const delta = day === 0 ? 6 : day - 1;
  return utc - delta * DAY_MS;
}

interface WeekLoad {
  /** Monday ISO. */
  week: string;
  /** Average daily units that week. */
  fte: number;
}

export function ResourcesView() {
  const portfolio = useStore((s) => s.portfolio);
  const today = todayISO();

  const { weeks, loads } = useMemo(() => {
    const cal = portfolio.calendar;
    // resource -> weekISO -> summed units over working days
    const acc = new Map<string, Map<string, number>>();
    let minW = Infinity;
    let maxW = -Infinity;

    for (const project of portfolio.projects) {
      const schedule = scheduleOf(project, portfolio);
      // Walk the calendar once per project: working-day index -> UTC date.
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

    const weeks: string[] = [];
    if (Number.isFinite(minW)) {
      for (let w = minW; w <= maxW; w += 7 * DAY_MS) weeks.push(toISO(w));
    }

    const loads = new Map<string, WeekLoad[]>();
    for (const r of portfolio.resources) {
      const byWeek = acc.get(r.id);
      loads.set(
        r.id,
        weeks.map((week) => ({ week, fte: (byWeek?.get(week) ?? 0) / 5 })),
      );
    }
    return { weeks, loads };
  }, [portfolio]);

  const currentWeek = toISO(mondayOf(parseISO(today)));

  function cellClass(fte: number, r: Resource): string {
    if (fte === 0) return "empty";
    const ratio = fte / r.capacity;
    if (ratio > 1.001) return "over";
    if (ratio > 0.75) return "full";
    return "low";
  }

  return (
    <>
      <div className="view-header">
        <h1>Charge ressources</h1>
        <span className="sub">
          Charge hebdomadaire moyenne (ETP), tous projets confondus. Rouge = surallocation.
        </span>
      </div>
      <div className="view-body">
        <div className="heatmap-scroll">
          <table className="heatmap tnum">
            <thead>
              <tr>
                <th className="res-name">Ressource</th>
                <th className="res-role">Rôle</th>
                <th className="res-cap num">Capacité</th>
                {weeks.map((w) => (
                  <th key={w} className={`wk${w === currentWeek ? " now" : ""}`}>
                    {fmtDate(w)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {portfolio.resources.map((r) => (
                <tr key={r.id}>
                  <td className="res-name">{r.name}</td>
                  <td className="res-role">{r.role}</td>
                  <td className="res-cap num">{r.capacity.toLocaleString("fr-FR")}</td>
                  {loads.get(r.id)!.map(({ week, fte }) => (
                    <td key={week} className={`cell ${cellClass(fte, r)}${week === currentWeek ? " now" : ""}`}>
                      {fte > 0 ? fte.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
