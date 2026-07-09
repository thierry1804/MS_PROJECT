import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { EvmSCurve } from "../components/EvmSCurve";
import { HealthBadge, StatusBadge } from "../components/badges";
import {
  EUR,
  fmtDate,
  todayISO,
  HEALTH_LABELS,
  type Project,
} from "../domain";
import { evmSeriesOf, metricsOf, scheduleOf, useStore } from "../store";
import "../styles/project.css";
import "../styles/report.css";

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86_400_000);
}

/** Plain-French reading of schedule/cost indices. */
function evmVerdict(spi: number, cpi: number): { tone: "ok" | "warn" | "bad"; text: string } {
  const behind = spi < 0.95;
  const over = cpi < 0.95;
  if (behind && over)
    return { tone: "bad", text: "Projet en retard sur le planning et en dépassement de coût. Arbitrage requis." };
  if (behind)
    return { tone: "warn", text: "Avancement plus lent que prévu ; les coûts restent maîtrisés." };
  if (over)
    return { tone: "warn", text: "Planning tenu mais coûts supérieurs au budget consommé." };
  if (spi > 1.05 || cpi > 1.05)
    return { tone: "ok", text: "Projet en avance ou en sous-consommation par rapport au plan." };
  return { tone: "ok", text: "Projet conforme au plan, planning et coûts sous contrôle." };
}

export function ReportView() {
  const { projectId } = useParams();
  const portfolio = useStore((s) => s.portfolio);
  const today = todayISO();

  const project = portfolio.projects.find((p) => p.id === projectId);
  if (!project) {
    return (
      <div className="view-header">
        <h1>Projet introuvable</h1>
        <Link to="/">← Portefeuille</Link>
      </div>
    );
  }

  const schedule = scheduleOf(project, portfolio);
  const metrics = metricsOf(project, portfolio);
  const statusDate = project.evmStatusDate ?? today;
  const evmSeries = useMemo(() => evmSeriesOf(project, portfolio), [project, portfolio]);

  const upcomingMilestones = useMemo(() => {
    const out: { name: string; date: string; baseline?: string; critical: boolean; done: boolean }[] = [];
    for (const t of project.tasks) {
      const s = schedule.tasks.get(t.id);
      if (!s?.isMilestone) continue;
      out.push({
        name: t.name,
        date: s.finishDate,
        baseline: t.baseline?.finish,
        critical: s.critical,
        done: t.percentComplete >= 100,
      });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [project.tasks, schedule]);

  // Slippage vs baseline: leaf tasks whose finish moved later than the captured baseline.
  const slippage = useMemo(() => {
    const out: { name: string; delay: number; finish: string }[] = [];
    for (const t of project.tasks) {
      const s = schedule.tasks.get(t.id);
      if (!s || s.isSummary || !t.baseline) continue;
      const delay = dayDiff(s.finishDate, t.baseline.finish);
      if (delay > 0) out.push({ name: t.name, delay, finish: s.finishDate });
    }
    return out.sort((a, b) => b.delay - a.delay).slice(0, 6);
  }, [project.tasks, schedule]);

  const topRisks = project.risks
    .filter((r) => r.status === "ouvert")
    .map((r) => ({ ...r, score: r.probability * r.impact }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const overdueActions = project.actions
    .filter((a) => a.status !== "fait" && a.dueDate < today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const openIssues = project.issues.filter((i) => i.status === "ouvert");
  const recentDecisions = [...project.decisions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);

  const verdict = evmVerdict(metrics.spi, metrics.cpi);
  const budgetDelta = metrics.eac - project.budget;

  return (
    <div className="report-scroll">
      <div className="report-toolbar no-print">
        <Link to={`/projets/${project.id}`} className="report-back">
          ← Retour au planning
        </Link>
        <button className="report-print" onClick={() => window.print()}>
          Imprimer / PDF
        </button>
      </div>

      <article className="report">
        <header className="report-head">
          <div>
            <div className="report-kicker">Rapport flash · Comité de pilotage</div>
            <h1>{project.name}</h1>
            <div className="report-sub tnum">
              {project.code} · {project.manager} · émis le {fmtDate(today, true)}
              {" · "}
              date de statut EVM {fmtDate(project.evmStatusDate ?? today, true)}
            </div>
          </div>
          <div className="report-badges">
            <StatusBadge status={project.status} />
            <HealthBadge health={project.health} />
          </div>
        </header>

        <p className="report-desc">{project.description}</p>

        {/* Synthèse chiffrée */}
        <section className="report-grid">
          <Metric label="Avancement" value={`${Math.round(metrics.percentComplete)} %`} />
          <Metric label="Échéance projetée" value={fmtDate(schedule.projectFinishDate, true)} />
          <Metric label="Budget approuvé" value={EUR.format(project.budget)} />
          <Metric
            label="Coût à terminaison (EAC)"
            value={EUR.format(metrics.eac)}
            tone={budgetDelta > project.budget * 0.05 ? "bad" : budgetDelta > 0 ? "warn" : "ok"}
            hint={budgetDelta >= 0 ? `+${EUR.format(budgetDelta)} vs budget` : `${EUR.format(budgetDelta)} vs budget`}
          />
          <Metric label="IDP · SPI" value={metrics.spi.toFixed(2)} tone={metrics.spi >= 0.95 ? "ok" : metrics.spi >= 0.8 ? "warn" : "bad"} />
          <Metric label="ICP · CPI" value={metrics.cpi.toFixed(2)} tone={metrics.cpi >= 0.95 ? "ok" : metrics.cpi >= 0.8 ? "warn" : "bad"} />
          <Metric label="SV" value={EUR.format(metrics.sv)} tone={metrics.sv >= 0 ? "ok" : "bad"} />
          <Metric label="CV" value={EUR.format(metrics.cv)} tone={metrics.cv >= 0 ? "ok" : "bad"} />
        </section>

        <div className={`report-verdict ${verdict.tone}`}>
          <strong>Lecture PMO —</strong> {verdict.text}
          {project.baselineCapturedAt
            ? ` Baseline de référence : ${fmtDate(project.baselineCapturedAt, true)}${
                (project.baselines?.length ?? 0) > 0
                  ? ` (${project.baselines!.length} archive${project.baselines!.length > 1 ? "s" : ""})`
                  : ""
              }.`
            : " Aucune baseline capturée : les écarts de planning ne sont pas mesurables."}
        </div>

        <section className="report-section">
          <h2>Courbes S</h2>
          <EvmSCurve series={evmSeries} statusDate={statusDate} collapsible={false} />
        </section>

        {/* Jalons */}
        <section className="report-section">
          <h2>Jalons clés</h2>
          {upcomingMilestones.length === 0 ? (
            <p className="report-empty">Aucun jalon défini.</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>Jalon</th>
                  <th className="c">Date projetée</th>
                  <th className="c">Baseline</th>
                  <th className="c">Écart</th>
                  <th className="c">État</th>
                </tr>
              </thead>
              <tbody>
                {upcomingMilestones.map((m, i) => {
                  const delay = m.baseline ? dayDiff(m.date, m.baseline) : null;
                  return (
                    <tr key={i}>
                      <td>
                        {m.critical && <span className="report-crit">●</span>} {m.name}
                      </td>
                      <td className="c tnum">{fmtDate(m.date, true)}</td>
                      <td className="c tnum muted">{m.baseline ? fmtDate(m.baseline, true) : "—"}</td>
                      <td className={`c tnum${delay && delay > 0 ? " late" : ""}`}>
                        {delay === null ? "—" : delay === 0 ? "±0" : delay > 0 ? `+${delay} j` : `${delay} j`}
                      </td>
                      <td className="c">
                        {m.done ? <span className="pill ok">Atteint</span> : <span className="pill">À venir</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Dérives planning */}
        {slippage.length > 0 && (
          <section className="report-section">
            <h2>Principales dérives de planning</h2>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Tâche</th>
                  <th className="c">Fin projetée</th>
                  <th className="c">Retard vs baseline</th>
                </tr>
              </thead>
              <tbody>
                {slippage.map((s, i) => (
                  <tr key={i}>
                    <td>{s.name}</td>
                    <td className="c tnum">{fmtDate(s.finish, true)}</td>
                    <td className="c tnum late">+{s.delay} j</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Risques */}
        <section className="report-section">
          <h2>Risques majeurs ouverts</h2>
          {topRisks.length === 0 ? (
            <p className="report-empty">Aucun risque ouvert.</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th className="c">Score</th>
                  <th>Risque</th>
                  <th>Porteur</th>
                  <th>Mitigation</th>
                </tr>
              </thead>
              <tbody>
                {topRisks.map((r) => (
                  <tr key={r.id}>
                    <td className="c">
                      <span className={`pill ${r.score >= 15 ? "bad" : r.score >= 7 ? "warn" : "ok"}`}>{r.score}</span>
                    </td>
                    <td>{r.label}</td>
                    <td>{r.owner}</td>
                    <td className="muted">{r.mitigation ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Actions en retard + issues */}
        <section className="report-columns">
          <div>
            <h2>Actions en retard <span className="report-n">{overdueActions.length}</span></h2>
            {overdueActions.length === 0 ? (
              <p className="report-empty">Aucune action en retard.</p>
            ) : (
              <ul className="report-list">
                {overdueActions.map((a) => (
                  <li key={a.id}>
                    <span className="report-late-date tnum">{fmtDate(a.dueDate)}</span>
                    <span className="grow">{a.label}</span>
                    <span className="muted">{a.owner}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2>Problèmes ouverts <span className="report-n">{openIssues.length}</span></h2>
            {openIssues.length === 0 ? (
              <p className="report-empty">Aucun problème ouvert.</p>
            ) : (
              <ul className="report-list">
                {openIssues.map((i) => (
                  <li key={i.id}>
                    <span className={`pill ${i.severity >= 4 ? "bad" : "warn"}`}>{i.severity}</span>
                    <span className="grow">{i.label}</span>
                    <span className="muted">{i.owner}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Décisions */}
        {recentDecisions.length > 0 && (
          <section className="report-section">
            <h2>Décisions récentes</h2>
            <ul className="report-list">
              {recentDecisions.map((d) => (
                <li key={d.id}>
                  <span className="report-late-date tnum">{fmtDate(d.date)}</span>
                  <span className="grow">{d.label}</span>
                  <span className="muted">{d.decidedBy}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="report-foot">
          {portfolio.name} · Rapport généré automatiquement le {fmtDate(today, true)} — santé projet :{" "}
          {HEALTH_LABELS[project.health]}.
        </footer>
      </article>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad";
  hint?: string;
}) {
  return (
    <div className="report-metric">
      <span className="report-metric-label">{label}</span>
      <span className={`report-metric-val${tone ? ` ${tone}` : ""}`}>{value}</span>
      {hint && <span className="report-metric-hint">{hint}</span>}
    </div>
  );
}
