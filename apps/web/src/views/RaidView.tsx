import { useMemo, useState } from "react";
import { RiskAssistWizard } from "../components/RiskAssistWizard";
import {
  ACTION_STATUS_LABELS,
  fmtDate,
  todayISO,
  type Action,
  type ActionStatus,
  type Decision,
  type Issue,
  type Project,
  type Risk,
} from "../domain";
import { useStore } from "../store";
import "../styles/raid.css";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function scoreZone(score: number): "low" | "mid" | "high" {
  if (score >= 15) return "high";
  if (score >= 7) return "mid";
  return "low";
}

const ACTION_CYCLE: ActionStatus[] = ["a-faire", "en-cours", "fait"];

export function RaidView() {
  const portfolio = useStore((s) => s.portfolio);
  const addRaidItem = useStore((s) => s.addRaidItem);
  const updateRaidItem = useStore((s) => s.updateRaidItem);
  const removeRaidItem = useStore((s) => s.removeRaidItem);
  const today = todayISO();

  const [filter, setFilter] = useState<string>("all");
  const [showAssist, setShowAssist] = useState(false);
  const projects = useMemo(
    () => (filter === "all" ? portfolio.projects : portfolio.projects.filter((p) => p.id === filter)),
    [portfolio.projects, filter],
  );

  type Row<T> = { project: Project; item: T };
  const risks: Row<Risk>[] = [];
  const actions: Row<Action>[] = [];
  const issues: Row<Issue>[] = [];
  const decisions: Row<Decision>[] = [];
  for (const p of projects) {
    for (const r of p.risks) risks.push({ project: p, item: r });
    for (const a of p.actions) actions.push({ project: p, item: a });
    for (const i of p.issues) issues.push({ project: p, item: i });
    for (const dcn of p.decisions) decisions.push({ project: p, item: dcn });
  }

  const openRisks = risks.filter((r) => r.item.status === "ouvert");
  const highRisks = openRisks.filter((r) => r.item.probability * r.item.impact >= 15);
  const openActions = actions.filter((a) => a.item.status !== "fait");
  const overdueActions = openActions.filter((a) => a.item.dueDate < today);
  const openIssues = issues.filter((i) => i.item.status === "ouvert");

  // Default project for new items = filtered one, else first.
  const targetProjectId = filter === "all" ? portfolio.projects[0]?.id : filter;

  /* ---- Matrix cells: probability (rows, 5 top) × impact (cols, 1→5) ---- */
  const cellRisks = new Map<string, Row<Risk>[]>();
  for (const r of openRisks) {
    const key = `${r.item.probability}-${r.item.impact}`;
    const arr = cellRisks.get(key) ?? [];
    arr.push(r);
    cellRisks.set(key, arr);
  }

  return (
    <>
      <div className="view-header raid-header">
        <div>
          <h1>Registre RAID</h1>
          <span className="sub">Risques · Actions · Issues · Décisions — consolidé portefeuille</span>
        </div>
        <select className="raid-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Tous les projets</option>
          {portfolio.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="view-body raid-body">
        <div className="raid-kpis">
          <Kpi label="Risques ouverts" value={openRisks.length} />
          <Kpi label="Risques majeurs" value={highRisks.length} tone={highRisks.length ? "bad" : "ok"} />
          <Kpi label="Actions en cours" value={openActions.length} />
          <Kpi label="Actions en retard" value={overdueActions.length} tone={overdueActions.length ? "bad" : "ok"} />
          <Kpi label="Issues ouvertes" value={openIssues.length} tone={openIssues.length ? "warn" : "ok"} />
        </div>

        <section className="raid-matrix-section">
          <h2>Matrice des risques ouverts</h2>
          <div className="raid-matrix-wrap">
            <div className="raid-axis-y">Probabilité</div>
            <table className="raid-matrix">
              <tbody>
                {[5, 4, 3, 2, 1].map((prob) => (
                  <tr key={prob}>
                    <th className="raid-mh">{prob}</th>
                    {[1, 2, 3, 4, 5].map((imp) => {
                      const here = cellRisks.get(`${prob}-${imp}`) ?? [];
                      return (
                        <td key={imp} className={`raid-cell ${scoreZone(prob * imp)}`}>
                          {here.map((r) => (
                            <span
                              key={r.item.id}
                              className="raid-dot"
                              title={`${r.project.code} — ${r.item.label} (${prob * imp})`}
                            >
                              {r.project.code}
                            </span>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <th className="raid-mh" />
                  {[1, 2, 3, 4, 5].map((imp) => (
                    <th key={imp} className="raid-mh">
                      {imp}
                    </th>
                  ))}
                </tr>
              </tbody>
            </table>
            <div className="raid-axis-x">Impact →</div>
          </div>
        </section>

        {/* ---------------- Risques ---------------- */}
        <RegisterSection
          title="Risques"
          count={risks.length}
          action={
            <button type="button" className="raid-assist-btn" onClick={() => setShowAssist(true)}>
              Assistant risque
            </button>
          }
        >
          <table className="raid-table">
            <thead>
              <tr>
                <th>Risque</th>
                <th className="c">Catégorie</th>
                <th className="c">Projet</th>
                <th className="c">P</th>
                <th className="c">I</th>
                <th className="c">Score</th>
                <th>Porteur</th>
                <th>Mitigation</th>
                <th className="c">Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {risks.map(({ project, item }) => {
                const score = item.probability * item.impact;
                const rationale = item.assessment?.last.rationale;
                return (
                  <tr key={item.id} className={item.status === "traite" ? "done" : ""}>
                    <td title={rationale}>{item.label}</td>
                    <td className="c muted">{item.category ?? "—"}</td>
                    <td className="c code-cell tnum">{project.code}</td>
                    <td className="c tnum">{item.probability}</td>
                    <td className="c tnum">{item.impact}</td>
                    <td className="c">
                      <span className={`raid-score ${scoreZone(score)}`}>{score}</span>
                    </td>
                    <td>{item.owner}</td>
                    <td className="muted">{item.mitigation ?? "—"}</td>
                    <td className="c">
                      <button
                        className={`raid-status ${item.status === "ouvert" ? "open" : "closed"}`}
                        onClick={() =>
                          updateRaidItem(project.id, "risks", item.id, {
                            status: item.status === "ouvert" ? "traite" : "ouvert",
                          })
                        }
                      >
                        {item.status === "ouvert" ? "Ouvert" : "Traité"}
                      </button>
                    </td>
                    <td className="c">
                      <DeleteBtn onClick={() => removeRaidItem(project.id, "risks", item.id)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <AddRisk projectId={targetProjectId} onAdd={(r) => targetProjectId && addRaidItem(targetProjectId, "risks", r)} />
        </RegisterSection>

        {showAssist && (
          <RiskAssistWizard
            portfolio={portfolio}
            defaultProjectId={targetProjectId}
            onClose={() => setShowAssist(false)}
          />
        )}

        {/* ---------------- Actions ---------------- */}
        <RegisterSection title="Actions" count={actions.length}>
          <table className="raid-table">
            <thead>
              <tr>
                <th>Action</th>
                <th className="c">Projet</th>
                <th>Porteur</th>
                <th className="c">Échéance</th>
                <th className="c">Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {actions.map(({ project, item }) => {
                const overdue = item.status !== "fait" && item.dueDate < today;
                return (
                  <tr key={item.id} className={item.status === "fait" ? "done" : ""}>
                    <td>{item.label}</td>
                    <td className="c code-cell tnum">{project.code}</td>
                    <td>{item.owner}</td>
                    <td className={`c tnum${overdue ? " overdue" : ""}`}>{fmtDate(item.dueDate, true)}</td>
                    <td className="c">
                      <button
                        className={`raid-status act ${item.status}`}
                        onClick={() => {
                          const next = ACTION_CYCLE[(ACTION_CYCLE.indexOf(item.status) + 1) % 3]!;
                          updateRaidItem(project.id, "actions", item.id, { status: next });
                        }}
                      >
                        {ACTION_STATUS_LABELS[item.status]}
                      </button>
                    </td>
                    <td className="c">
                      <DeleteBtn onClick={() => removeRaidItem(project.id, "actions", item.id)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <AddAction
            defaultDue={today}
            onAdd={(a) => targetProjectId && addRaidItem(targetProjectId, "actions", a)}
          />
        </RegisterSection>

        {/* ---------------- Issues ---------------- */}
        <RegisterSection title="Issues (problèmes ouverts)" count={issues.length}>
          <table className="raid-table">
            <thead>
              <tr>
                <th>Problème</th>
                <th className="c">Projet</th>
                <th>Porteur</th>
                <th className="c">Gravité</th>
                <th className="c">Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {issues.map(({ project, item }) => (
                <tr key={item.id} className={item.status === "resolu" ? "done" : ""}>
                  <td>{item.label}</td>
                  <td className="c code-cell tnum">{project.code}</td>
                  <td>{item.owner}</td>
                  <td className="c">
                    <span className={`raid-score ${scoreZone(item.severity * 5)}`}>{item.severity}</span>
                  </td>
                  <td className="c">
                    <button
                      className={`raid-status ${item.status === "ouvert" ? "open" : "closed"}`}
                      onClick={() =>
                        updateRaidItem(project.id, "issues", item.id,
                          item.status === "ouvert"
                            ? { status: "resolu", resolvedAt: today }
                            : { status: "ouvert", resolvedAt: undefined },
                        )
                      }
                    >
                      {item.status === "ouvert" ? "Ouvert" : "Résolu"}
                    </button>
                  </td>
                  <td className="c">
                    <DeleteBtn onClick={() => removeRaidItem(project.id, "issues", item.id)} />
                  </td>
                </tr>
              ))}
              {issues.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Aucune issue ouverte.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <AddIssue onAdd={(i) => targetProjectId && addRaidItem(targetProjectId, "issues", i)} />
        </RegisterSection>

        {/* ---------------- Décisions ---------------- */}
        <RegisterSection title="Décisions" count={decisions.length}>
          <table className="raid-table">
            <thead>
              <tr>
                <th>Décision</th>
                <th className="c">Projet</th>
                <th>Décidé par</th>
                <th className="c">Date</th>
                <th>Motif</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {decisions.map(({ project, item }) => (
                <tr key={item.id}>
                  <td>{item.label}</td>
                  <td className="c code-cell tnum">{project.code}</td>
                  <td>{item.decidedBy}</td>
                  <td className="c tnum">{fmtDate(item.date, true)}</td>
                  <td className="muted">{item.rationale ?? "—"}</td>
                  <td className="c">
                    <DeleteBtn onClick={() => removeRaidItem(project.id, "decisions", item.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <AddDecision
            defaultDate={today}
            onAdd={(dcn) => targetProjectId && addRaidItem(targetProjectId, "decisions", dcn)}
          />
        </RegisterSection>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                              */
/* ------------------------------------------------------------------ */

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className={`raid-kpi${tone ? ` ${tone}` : ""}`}>
      <span className="raid-kpi-val tnum">{value}</span>
      <span className="raid-kpi-label">{label}</span>
    </div>
  );
}

function RegisterSection({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="raid-register">
      <div className="raid-section-head">
        <h2>
          {title} <span className="raid-count tnum">{count}</span>
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button className="raid-del" onClick={onClick} aria-label="Supprimer" title="Supprimer">
      ✕
    </button>
  );
}

function ScoreSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <select className="raid-in mini" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {[1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

function AddRisk({ projectId, onAdd }: { projectId?: string; onAdd: (r: Risk) => void }) {
  const [label, setLabel] = useState("");
  const [owner, setOwner] = useState("");
  const [p, setP] = useState(3);
  const [i, setI] = useState(3);
  function submit() {
    if (!label.trim() || !projectId) return;
    onAdd({ id: uid("risk"), label: label.trim(), probability: p, impact: i, owner: owner.trim() || "PMO", status: "ouvert" });
    setLabel("");
    setOwner("");
    setP(3);
    setI(3);
  }
  return (
    <div className="raid-add">
      <input className="raid-in grow" placeholder="Nouveau risque…" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <input className="raid-in" placeholder="Porteur" value={owner} onChange={(e) => setOwner(e.target.value)} />
      <label className="raid-lbl">P<ScoreSelect value={p} onChange={setP} /></label>
      <label className="raid-lbl">I<ScoreSelect value={i} onChange={setI} /></label>
      <button className="raid-add-btn" onClick={submit} disabled={!label.trim()}>
        Ajouter
      </button>
    </div>
  );
}

function AddAction({ defaultDue, onAdd }: { defaultDue: string; onAdd: (a: Action) => void }) {
  const [label, setLabel] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState(defaultDue);
  function submit() {
    if (!label.trim()) return;
    onAdd({ id: uid("act"), label: label.trim(), owner: owner.trim() || "PMO", dueDate: due, status: "a-faire" });
    setLabel("");
    setOwner("");
    setDue(defaultDue);
  }
  return (
    <div className="raid-add">
      <input className="raid-in grow" placeholder="Nouvelle action…" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <input className="raid-in" placeholder="Porteur" value={owner} onChange={(e) => setOwner(e.target.value)} />
      <input className="raid-in tnum" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      <button className="raid-add-btn" onClick={submit} disabled={!label.trim()}>
        Ajouter
      </button>
    </div>
  );
}

function AddIssue({ onAdd }: { onAdd: (i: Issue) => void }) {
  const [label, setLabel] = useState("");
  const [owner, setOwner] = useState("");
  const [sev, setSev] = useState(3);
  function submit() {
    if (!label.trim()) return;
    onAdd({
      id: uid("iss"),
      label: label.trim(),
      owner: owner.trim() || "PMO",
      severity: sev,
      status: "ouvert",
      createdAt: todayISO(),
    });
    setLabel("");
    setOwner("");
    setSev(3);
  }
  return (
    <div className="raid-add">
      <input className="raid-in grow" placeholder="Nouveau problème…" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <input className="raid-in" placeholder="Porteur" value={owner} onChange={(e) => setOwner(e.target.value)} />
      <label className="raid-lbl">Gravité<ScoreSelect value={sev} onChange={setSev} /></label>
      <button className="raid-add-btn" onClick={submit} disabled={!label.trim()}>
        Ajouter
      </button>
    </div>
  );
}

function AddDecision({ defaultDate, onAdd }: { defaultDate: string; onAdd: (d: Decision) => void }) {
  const [label, setLabel] = useState("");
  const [by, setBy] = useState("");
  const [date, setDate] = useState(defaultDate);
  function submit() {
    if (!label.trim()) return;
    onAdd({ id: uid("dec"), label: label.trim(), decidedBy: by.trim() || "Comité DSI", date });
    setLabel("");
    setBy("");
    setDate(defaultDate);
  }
  return (
    <div className="raid-add">
      <input className="raid-in grow" placeholder="Nouvelle décision…" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <input className="raid-in" placeholder="Décidé par" value={by} onChange={(e) => setBy(e.target.value)} />
      <input className="raid-in tnum" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <button className="raid-add-btn" onClick={submit} disabled={!label.trim()}>
        Ajouter
      </button>
    </div>
  );
}
