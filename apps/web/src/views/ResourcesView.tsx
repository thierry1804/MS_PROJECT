import { useMemo, useState } from "react";
import {
  isWorkingDay,
  parseISO,
  toISO,
  type Resource,
  type ResourceKind,
} from "@atelier/scheduling-engine";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { TrashIcon } from "../components/icons";
import { fmtDate, todayISO } from "../domain";
import { scheduleOf, useStore } from "../store";
import "../styles/raid.css";
import "../styles/resources.css";

const DAY_MS = 86_400_000;

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

const KIND_LABELS: Record<ResourceKind, string> = {
  work: "Personne",
  material: "Matériel",
  cost: "Coût forfaitaire",
};
const KINDS = Object.keys(KIND_LABELS) as ResourceKind[];

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
  const addResource = useStore((s) => s.addResource);
  const updateResource = useStore((s) => s.updateResource);
  const removeResource = useStore((s) => s.removeResource);
  const today = todayISO();
  const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null);

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
        <section className="res-manage">
          <h2>Gérer les ressources</h2>
          <table className="raid-table res-manage-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Rôle</th>
                <th>Type</th>
                <th className="c">Capacité</th>
                <th className="c">Coût / jour</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {portfolio.resources.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      className="raid-in"
                      value={r.name}
                      onChange={(e) => updateResource(r.id, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="raid-in"
                      value={r.role ?? ""}
                      onChange={(e) => updateResource(r.id, { role: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="raid-in"
                      value={r.kind}
                      onChange={(e) => updateResource(r.id, { kind: e.target.value as ResourceKind })}
                    >
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="c">
                    <input
                      className="raid-in mini tnum"
                      type="number"
                      min={0}
                      step={0.1}
                      value={r.capacity}
                      onChange={(e) => updateResource(r.id, { capacity: Number(e.target.value) })}
                    />
                  </td>
                  <td className="c">
                    <input
                      className="raid-in mini tnum"
                      type="number"
                      min={0}
                      value={r.costPerDay}
                      onChange={(e) => updateResource(r.id, { costPerDay: Number(e.target.value) })}
                    />
                  </td>
                  <td className="c">
                    <button
                      className="raid-del"
                      onClick={() => setDeleteTarget(r)}
                      title="Supprimer la ressource"
                      aria-label={`Supprimer ${r.name}`}
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
              {portfolio.resources.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Aucune ressource.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <AddResource onAdd={(r) => addResource(r)} />
        </section>

        {deleteTarget && (
          <ConfirmDialog
            title="Supprimer cette ressource ?"
            message={`« ${deleteTarget.name} » sera retirée du portefeuille, ainsi que ses affectations sur toutes les tâches.`}
            confirmLabel="Supprimer"
            danger
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => {
              removeResource(deleteTarget.id);
              setDeleteTarget(null);
            }}
          />
        )}

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

function AddResource({ onAdd }: { onAdd: (r: Resource) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [kind, setKind] = useState<ResourceKind>("work");
  const [capacity, setCapacity] = useState(1);
  const [costPerDay, setCostPerDay] = useState(500);

  function submit() {
    if (!name.trim()) return;
    onAdd({ id: uid("res"), name: name.trim(), role: role.trim() || undefined, kind, capacity, costPerDay });
    setName("");
    setRole("");
    setKind("work");
    setCapacity(1);
    setCostPerDay(500);
  }

  return (
    <div className="raid-add">
      <input
        className="raid-in grow"
        placeholder="Nom…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <input className="raid-in" placeholder="Rôle" value={role} onChange={(e) => setRole(e.target.value)} />
      <select className="raid-in" value={kind} onChange={(e) => setKind(e.target.value as ResourceKind)}>
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_LABELS[k]}
          </option>
        ))}
      </select>
      <label className="raid-lbl">
        Capacité
        <input
          className="raid-in mini tnum"
          type="number"
          min={0}
          step={0.1}
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
        />
      </label>
      <label className="raid-lbl">
        Coût / j
        <input
          className="raid-in mini tnum"
          type="number"
          min={0}
          value={costPerDay}
          onChange={(e) => setCostPerDay(Number(e.target.value))}
        />
      </label>
      <button className="raid-add-btn" onClick={submit} disabled={!name.trim()}>
        Ajouter
      </button>
    </div>
  );
}
