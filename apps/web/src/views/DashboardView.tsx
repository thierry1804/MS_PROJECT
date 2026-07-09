import { Fragment, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HealthBadge, ProgressBar, StatusSelect } from "../components/badges";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { NewProjectModal } from "../components/NewProjectModal";
import { TrashIcon } from "../components/icons";
import { EUR, fmtDate, todayISO, type Project, type Risk } from "../domain";
import { downloadJson } from "../export";
import { buildRange, dayOffset, monthBands } from "../gantt-utils";
import { metricsOf, scheduleOf, useStore } from "../store";
import "../styles/dashboard.css";

function evmCls(val: number): string {
  return val >= 1.0 ? "evm-good" : val >= 0.8 ? "evm-warn" : "evm-bad";
}

/* ---------- Financial status (drives the portfolio map + exceptions) ----------
   "na" = project hasn't started spending yet (plannedCost <= 0), so CPI is
   meaningless. Thresholds mirror the tolerance already implied by evmCls
   (>=0.97 healthy · 0.90-0.97 watch · <0.90 drifting) but collapsed to three
   bands since the map/exceptions need a single glanceable verdict. */
type FinanceStatus = "ok" | "warn" | "danger" | "na";

function financeStatus(plannedCost: number, cpi: number): FinanceStatus {
  if (plannedCost <= 0) return "na";
  if (cpi >= 0.97) return "ok";
  if (cpi >= 0.9) return "warn";
  return "danger";
}

const FINANCE_LABEL: Record<FinanceStatus, string> = {
  ok: "sain",
  warn: "à surveiller",
  danger: "en dérive",
  na: "pas encore engagé",
};

interface UpcomingMilestone {
  project: Project;
  name: string;
  date: string;
  critical: boolean;
}

export function DashboardView() {
  const portfolio = useStore((s) => s.portfolio);
  const createProject = useStore((s) => s.createProject);
  const updateProject = useStore((s) => s.updateProject);
  const resetPortfolio = useStore((s) => s.resetPortfolio);
  const deleteProject = useStore((s) => s.deleteProject);
  const navigate = useNavigate();
  const today = todayISO();
  const [showNew, setShowNew] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const rows = portfolio.projects.map((p) => ({
    project: p,
    schedule: scheduleOf(p, portfolio),
    metrics: metricsOf(p, portfolio),
  }));

  const totalBudget = rows.reduce((s, r) => s + r.project.budget, 0);
  const totalPlanned = rows.reduce((s, r) => s + r.metrics.plannedCost, 0);
  const atRisk = rows.filter((r) => r.project.health !== "green").length;

  /* Portfolio map: one rectangle per project, width proportional to its
     approved budget, tinted by cost performance rather than the RAG health
     flag — health mixes several risk dimensions, this cell is deliberately
     about money only. */
  const financeRows = useMemo(
    () => rows.map((r) => ({ ...r, status: financeStatus(r.metrics.plannedCost, r.metrics.cpi) })),
    [rows],
  );

  /* Exceptions: only projects whose cost performance has drifted past
     tolerance get a card; everything else is folded into a single
     "dans les clous" line so the panel stays short even as the portfolio
     grows. Sorted worst cost variance first. */
  const exceptions = useMemo(
    () =>
      financeRows
        .filter((r) => r.status === "warn" || r.status === "danger")
        .map((r) => {
          const cv = r.metrics.earnedValue - r.metrics.ac;
          const topRisk = [...r.project.risks]
            .filter((x) => x.status === "ouvert")
            .sort((a, b) => b.probability * b.impact - a.probability * a.impact)[0];
          return { ...r, cv, topRisk };
        })
        .sort((a, b) => a.cv - b.cv),
    [financeRows],
  );

  const onTrackCodes = financeRows
    .filter((r) => r.status === "ok" || r.status === "na")
    .map((r) => r.project.code);

  function exportPortfolio() {
    downloadJson(`portefeuille-${today}.json`, {
      portfolio: portfolio.name,
      exportedAt: today,
      totals: { budget: totalBudget, planned: totalPlanned, projects: rows.length, atRisk },
      projects: rows.map(({ project, schedule, metrics }) => ({
        code: project.code,
        name: project.name,
        manager: project.manager,
        status: project.status,
        health: project.health,
        budget: project.budget,
        start: project.projectStart,
        finish: schedule.projectFinishDate,
        statusDate: project.evmStatusDate ?? today,
        percentComplete: Math.round(metrics.percentComplete),
        bac: Math.round(metrics.bac),
        pv: Math.round(metrics.pv),
        ev: Math.round(metrics.earnedValue),
        ac: Math.round(metrics.ac),
        spi: Number(metrics.spi.toFixed(3)),
        cpi: Number(metrics.cpi.toFixed(3)),
        sv: Math.round(metrics.sv),
        cv: Math.round(metrics.cv),
        eac: Math.round(metrics.eac),
        criticalTasks: metrics.criticalCount,
        openRisks: project.risks.filter((r) => r.status === "ouvert").length,
      })),
    });
  }

  const milestones: UpcomingMilestone[] = useMemo(() => {
    const out: UpcomingMilestone[] = [];
    for (const { project, schedule } of rows) {
      for (const t of project.tasks) {
        const s = schedule.tasks.get(t.id);
        if (s?.isMilestone && t.percentComplete < 100 && s.finishDate >= today) {
          out.push({ project, name: t.name, date: s.finishDate, critical: s.critical });
        }
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }, [rows, today]);

  const risks = useMemo(() => {
    const out: { project: Project; risk: Risk; score: number }[] = [];
    for (const p of portfolio.projects) {
      for (const r of p.risks) {
        if (r.status === "ouvert") out.push({ project: p, risk: r, score: r.probability * r.impact });
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  }, [portfolio]);

  /* Roadmap */
  const minStart =
    rows.length > 0
      ? rows.reduce((m, r) => (r.project.projectStart < m ? r.project.projectStart : m), rows[0]!.project.projectStart)
      : today;
  const maxFinish =
    rows.length > 0
      ? rows.reduce((m, r) => (r.schedule.projectFinishDate > m ? r.schedule.projectFinishDate : m), rows[0]!.schedule.projectFinishDate)
      : today;
  const range = buildRange(minStart, maxFinish);
  const RM_DW = 2.6;
  const rmWidth = range.days * RM_DW;
  const RM_ROW = 40;

  return (
    <>
      <div className="view-header dash-header">
        <div>
          <h1>Vue portefeuille</h1>
          <span className="sub tnum">
            {rows.length} projets · {EUR.format(totalBudget)} de budget approuvé ·{" "}
            {EUR.format(totalPlanned)} planifiés · {atRisk} sous surveillance ou en dérive
          </span>
        </div>
        <div className="dash-actions">
          <button
            className="toolbar-btn"
            onClick={() => setConfirmReset(true)}
            title="Vider le portefeuille"
          >
            Réinitialiser
          </button>
          <button className="toolbar-btn" onClick={exportPortfolio} title="Exporter le portefeuille en JSON">
            Export JSON
          </button>
          <button className="toolbar-btn primary" onClick={() => setShowNew(true)}>
            + Nouveau projet
          </button>
        </div>
      </div>

      {showNew && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreate={(draft) => {
            const id = createProject(draft);
            setShowNew(false);
            navigate(`/projets/${id}`);
          }}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          title="Réinitialiser le portefeuille ?"
          message="Toutes les données du portefeuille seront supprimées (projets, demandes, ressources, etc.)."
          confirmLabel="Réinitialiser"
          danger
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            resetPortfolio();
            setConfirmReset(false);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Supprimer ce projet ?"
          message={`« ${deleteTarget.name} » (${deleteTarget.code}) sera définitivement supprimé, avec toutes ses tâches, dépendances et registres RAID.`}
          confirmLabel="Supprimer"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            deleteProject(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />
      )}

      <div className="view-body dashboard">
        <section className="dash-map">
          <h2>Poids budgétaire &amp; santé</h2>
          <div className="map-row">
            {financeRows.map(({ project, metrics, status }) => (
              <div
                key={project.id}
                className={`map-cell ${status}`}
                style={{ flexGrow: project.budget, flexBasis: 0 }}
                onClick={() => navigate(`/projets/${project.id}`)}
                title={`${project.name} · ${EUR.format(project.budget)}`}
              >
                <span className="map-code">{project.code}</span>
                <span className="map-budget tnum">{EUR.format(project.budget)}</span>
                <span className="map-status">
                  {status === "na" ? FINANCE_LABEL.na : `ICP ${metrics.cpi.toFixed(2)} · ${FINANCE_LABEL[status]}`}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="dash-exceptions">
          <h2>À traiter</h2>
          {exceptions.map(({ project, metrics, cv, topRisk, status }) => (
            <div key={project.id} className={`exception-card ${status}`}>
              <div className="exception-head">
                <span className="exception-title">
                  <span className={`health-dot health-${project.health}`} />
                  {project.name} <span className="code-cell">{project.code}</span>
                </span>
                <span className="exception-metric tnum">
                  ICP {metrics.cpi.toFixed(2)} · CV {cv >= 0 ? "+" : "−"}
                  {EUR.format(Math.abs(cv))}
                </span>
              </div>
              <div className="exception-body">
                {topRisk ? `Risque probable : ${topRisk.label}. ` : "Coût planifié au-delà du seuil de tolérance. "}
                <Link to={`/projets/${project.id}`}>Voir le projet →</Link>
              </div>
            </div>
          ))}
          {exceptions.length === 0 && <p className="exception-empty">Aucun projet hors seuil.</p>}
          {onTrackCodes.length > 0 && (
            <div className="exception-ok-line">
              <span className="exception-ok-mark">✓</span>
              {onTrackCodes.join(", ")} dans les clous
            </div>
          )}
        </section>

        <section className="dash-projects">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Projet</th>
                <th>Chef de projet</th>
                <th>Statut</th>
                <th>Santé</th>
                <th>Avancement</th>
                <th className="num">Échéance</th>
                <th className="num">Budget</th>
                <th className="num">Coût plan</th>
                <th className="num">IDP</th>
                <th className="num">ICP</th>
                <th className="num">Critiques</th>
                <th className="num">Risques</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ project, schedule, metrics }) => {
                const overBudget = metrics.plannedCost > project.budget;
                const openRisks = project.risks.filter((r) => r.status === "ouvert").length;
                return (
                  <tr
                    key={project.id}
                    className="clickable"
                    onClick={() => navigate(`/projets/${project.id}`)}
                  >
                    <td className="tnum code-cell">{project.code}</td>
                    <td className="strong">{project.name}</td>
                    <td>{project.manager}</td>
                    <td>
                      <StatusSelect
                        status={project.status}
                        onChange={(status) => updateProject(project.id, { status })}
                      />
                    </td>
                    <td>
                      <HealthBadge health={project.health} />
                    </td>
                    <td>
                      <ProgressBar value={metrics.percentComplete} />
                    </td>
                    <td className="num">{fmtDate(schedule.projectFinishDate, true)}</td>
                    <td className="num">{EUR.format(project.budget)}</td>
                    <td className={`num${overBudget ? " over" : ""}`}>
                      {EUR.format(metrics.plannedCost)}
                    </td>
                    <td className={`num ${evmCls(metrics.spi)}`}>{metrics.spi.toFixed(2)}</td>
                    <td className={`num ${evmCls(metrics.cpi)}`}>{metrics.cpi.toFixed(2)}</td>
                    <td className="num">{metrics.criticalCount}</td>
                    <td className="num">{openRisks}</td>
                    <td>
                      <button
                        className="row-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(project);
                        }}
                        title="Supprimer le projet"
                        aria-label={`Supprimer le projet ${project.name}`}
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="dash-roadmap">
          <h2>Feuille de route</h2>
          <div className="roadmap-scroll">
            <svg width={rmWidth} height={rows.length * RM_ROW + 28}>
              {monthBands(range, true).map((m) => (
                <Fragment key={m.offset}>
                  <line
                    x1={m.offset * RM_DW}
                    y1={0}
                    x2={m.offset * RM_DW}
                    y2={rows.length * RM_ROW + 28}
                    stroke="var(--paper-2)"
                  />
                  {m.days * RM_DW >= 44 && (
                    <text x={m.offset * RM_DW + 6} y={16} className="rm-month">
                      {m.label}
                    </text>
                  )}
                </Fragment>
              ))}
              {rows.map(({ project, schedule, metrics }, i) => {
                const y = 28 + i * RM_ROW;
                const x = dayOffset(range, project.projectStart) * RM_DW;
                const xe = (dayOffset(range, schedule.projectFinishDate) + 1) * RM_DW;
                const w = xe - x;
                const progW = (w * metrics.percentComplete) / 100;
                return (
                  <g key={project.id}>
                    <rect x={x} y={y + 10} width={w} height={14} rx={3} fill="var(--bar-fill)" opacity={0.35} />
                    {progW > 0 && (
                      <rect x={x} y={y + 10} width={progW} height={14} rx={3} fill="var(--bar-progress)" />
                    )}
                    <text x={x + 6} y={y + 5} className="rm-label">
                      {project.code} · {project.name}
                    </text>
                    {project.tasks.map((t) => {
                      const s = schedule.tasks.get(t.id);
                      if (!s?.isMilestone) return null;
                      const mx = dayOffset(range, s.finishDate) * RM_DW;
                      const done = t.percentComplete >= 100;
                      return (
                        <path
                          key={t.id}
                          d={`M ${mx} ${y + 11} L ${mx + 5} ${y + 17} L ${mx} ${y + 23} L ${mx - 5} ${y + 17} Z`}
                          fill="var(--paper-0)"
                          stroke={done ? "var(--ok)" : "var(--milestone)"}
                          strokeWidth={done ? 1.8 : 1.2}
                        >
                          <title>{`${t.name} · ${fmtDate(s.finishDate, true)}`}</title>
                        </path>
                      );
                    })}
                  </g>
                );
              })}
              <line
                x1={dayOffset(range, today) * RM_DW}
                y1={0}
                x2={dayOffset(range, today) * RM_DW}
                y2={rows.length * RM_ROW + 28}
                stroke="var(--accent)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
            </svg>
          </div>
        </section>

        <div className="dash-columns">
          <section>
            <h2>Jalons à venir</h2>
            <ul className="plain-list">
              {milestones.map((m, i) => (
                <li key={i}>
                  <span className="date tnum">{fmtDate(m.date, true)}</span>
                  <Link to={`/projets/${m.project.id}`} className="code-cell tnum">
                    {m.project.code}
                  </Link>
                  <span className="grow">{m.name}</span>
                  {m.critical && <span className="badge danger"><span className="dot" />critique</span>}
                </li>
              ))}
              {milestones.length === 0 && <li className="empty">Aucun jalon à venir.</li>}
            </ul>
          </section>

          <section>
            <h2>Risques majeurs ouverts</h2>
            <ul className="plain-list">
              {risks.map(({ project, risk, score }) => (
                <li key={risk.id}>
                  <span
                    className={`risk-score tnum ${score >= 16 ? "danger" : score >= 9 ? "warn" : "neutral"}`}
                    title={`Probabilité ${risk.probability} × impact ${risk.impact}`}
                  >
                    {score}
                  </span>
                  <Link to={`/projets/${project.id}`} className="code-cell tnum">
                    {project.code}
                  </Link>
                  <span className="grow">{risk.label}</span>
                  <span className="owner">{risk.owner}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
