import { useMemo, useState } from "react";
import {
  EUR,
  GOVERNANCE_TYPE_LABELS,
  SURVEY_ROLE_LABELS,
  fmtDate,
  todayISO,
  type GovernanceEvent,
  type GovernanceEventType,
  type SurveyResponse,
  type SurveyRole,
} from "../domain";
import { computePmoKpis } from "../kpi";
import { useStore } from "../store";
import "../styles/raid.css";
import "../styles/kpi.css";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function fmtPct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${v.toFixed(digits)} %`;
}

function tone(v: number | null, good: number, warn: number): "ok" | "warn" | "bad" | undefined {
  if (v === null) return undefined;
  if (v >= good) return "ok";
  if (v >= warn) return "warn";
  return "bad";
}

function Metric({
  label,
  value,
  hint,
  toneName,
}: {
  label: string;
  value: string;
  hint?: string;
  toneName?: "ok" | "warn" | "bad";
}) {
  return (
    <div className={`raid-kpi${toneName ? ` ${toneName}` : ""}`}>
      <span className="raid-kpi-val tnum">{value}</span>
      <span className="raid-kpi-label">{label}</span>
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  );
}

const GOV_TYPES = Object.keys(GOVERNANCE_TYPE_LABELS) as GovernanceEventType[];
const SURVEY_ROLES = Object.keys(SURVEY_ROLE_LABELS) as SurveyRole[];

export function KpiView() {
  const portfolio = useStore((s) => s.portfolio);
  const addGovernanceEvent = useStore((s) => s.addGovernanceEvent);
  const addSurveyResponse = useStore((s) => s.addSurveyResponse);
  const today = todayISO();

  const kpis = useMemo(() => computePmoKpis(portfolio), [portfolio]);

  const recentGovernance = useMemo(
    () => [...(portfolio.governanceEvents ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
    [portfolio.governanceEvents],
  );
  const recentSurveys = useMemo(
    () => [...(portfolio.surveys ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
    [portfolio.surveys],
  );

  return (
    <>
      <div className="view-header">
        <h1>Pilotage PMO</h1>
        <span className="sub">
          Indicateurs consolidés du portefeuille — exercice {portfolio.fiscalYear ?? new Date().getFullYear()} ·{" "}
          {portfolio.projects.length} projets, calculés au {fmtDate(today, true)}.
        </span>
      </div>

      <div className="view-body kpi-body">
        <section className="kpi-section">
          <h2>Performance des projets</h2>
          <div className="raid-kpis">
            <Metric
              label="Respect des délais"
              value={fmtPct(kpis.performance.onTimeRate)}
              hint={`${kpis.performance.baselinedProjects} projet(s) avec baseline`}
              toneName={tone(kpis.performance.onTimeRate, 90, 70)}
            />
            <Metric
              label="Respect du budget"
              value={fmtPct(kpis.performance.costOnTargetRate)}
              hint="ICP ≥ 0,97, projets engagés"
              toneName={tone(kpis.performance.costOnTargetRate, 80, 50)}
            />
            <Metric
              label="Écart moyen planning"
              value={kpis.performance.lateTaskCount > 0 ? `+${kpis.performance.avgScheduleVarianceDays.toFixed(1)} j` : "0 j"}
              hint={`${kpis.performance.lateTaskCount} tâche(s) en retard vs baseline`}
              toneName={kpis.performance.lateTaskCount === 0 ? "ok" : kpis.performance.avgScheduleVarianceDays > 5 ? "bad" : "warn"}
            />
          </div>
        </section>

        <section className="kpi-section">
          <h2>Qualité &amp; gouvernance</h2>
          <div className="raid-kpis">
            <Metric
              label="Conformité aux gates"
              value={fmtPct(kpis.quality.gateComplianceRate)}
              hint="critères confirmés / requis"
              toneName={tone(kpis.quality.gateComplianceRate, 95, 80)}
            />
            <Metric
              label="Incidents majeurs ouverts"
              value={String(kpis.quality.openMajorIncidents)}
              hint="issues gravité ≥ 4"
              toneName={kpis.quality.openMajorIncidents === 0 ? "ok" : kpis.quality.openMajorIncidents <= 2 ? "warn" : "bad"}
            />
            <Metric
              label="Jalons tenus"
              value={fmtPct(kpis.quality.milestoneOnTimeRate)}
              hint="échus, vs baseline"
              toneName={tone(kpis.quality.milestoneOnTimeRate, 90, 70)}
            />
            <Metric
              label="Risques traités"
              value={fmtPct(kpis.quality.riskClosureRate)}
              hint={`${kpis.quality.openRisks} risque(s) encore ouvert(s)`}
              toneName={tone(kpis.quality.riskClosureRate, 50, 25)}
            />
          </div>
        </section>

        <section className="kpi-section">
          <h2>Portefeuille &amp; valeur</h2>
          <div className="raid-kpis">
            <Metric
              label="Utilisation ressources"
              value={fmtPct(kpis.value.resourceUtilizationRate)}
              hint={kpis.value.overallocatedResources > 0 ? `${kpis.value.overallocatedResources} en surallocation` : "aucune surallocation"}
              toneName={kpis.value.overallocatedResources > 0 ? "warn" : "ok"}
            />
            <Metric
              label="Projets actifs"
              value={`${kpis.value.activeProjects} / ${kpis.value.totalProjects}`}
              hint="en cours vs portefeuille total"
            />
          </div>
          <div className="kpi-mix">
            {kpis.value.strategicMix.map((m) => (
              <div key={m.axis} className="kpi-mix-row">
                <span className="kpi-mix-axis">{m.axis}</span>
                <span className="kpi-mix-budget tnum">{EUR.format(m.budget)}</span>
              </div>
            ))}
            {kpis.value.untaggedBudget > 0 && (
              <div className="kpi-mix-row muted">
                <span className="kpi-mix-axis">Sans axe stratégique</span>
                <span className="kpi-mix-budget tnum">{EUR.format(kpis.value.untaggedBudget)}</span>
              </div>
            )}
          </div>
        </section>

        <section className="kpi-section">
          <h2>Satisfaction &amp; adoption</h2>
          <div className="raid-kpis">
            <Metric
              label="NPS interne PMO"
              value={kpis.satisfaction.nps === null ? "—" : kpis.satisfaction.nps.toFixed(0)}
              hint={`${kpis.satisfaction.responseCount} réponse(s), 180 derniers jours`}
              toneName={tone(kpis.satisfaction.nps, 20, 0)}
            />
            <Metric
              label="Participation gouvernance"
              value={fmtPct(kpis.satisfaction.governanceParticipationRate)}
              hint={`${kpis.satisfaction.eventCount} rituel(s) suivi(s)`}
              toneName={tone(kpis.satisfaction.governanceParticipationRate, 80, 60)}
            />
          </div>

          <div className="kpi-columns">
            <div>
              <h3>Derniers rituels</h3>
              <ul className="plain-list kpi-plain-list">
                {recentGovernance.map((g) => (
                  <li key={g.id}>
                    <span className="date tnum">{fmtDate(g.date, true)}</span>
                    <span className="grow">{g.label}</span>
                    <span className="kpi-attendance tnum">
                      {g.attendees}/{g.expected}
                    </span>
                  </li>
                ))}
                {recentGovernance.length === 0 && <li className="empty">Aucun rituel enregistré.</li>}
              </ul>
              <AddGovernance onAdd={(e) => addGovernanceEvent(e)} today={today} />
            </div>

            <div>
              <h3>Derniers retours du baromètre</h3>
              <ul className="plain-list kpi-plain-list">
                {recentSurveys.map((s) => (
                  <li key={s.id}>
                    <span className="date tnum">{fmtDate(s.date, true)}</span>
                    <span className="grow">
                      {SURVEY_ROLE_LABELS[s.role]}
                      {s.comment ? ` — ${s.comment}` : ""}
                    </span>
                    <span className={`kpi-score tnum ${s.score >= 9 ? "ok" : s.score <= 6 ? "bad" : "warn"}`}>
                      {s.score}/10
                    </span>
                  </li>
                ))}
                {recentSurveys.length === 0 && <li className="empty">Aucune réponse enregistrée.</li>}
              </ul>
              <AddSurvey onAdd={(s) => addSurveyResponse(s)} today={today} />
            </div>
          </div>
        </section>

        <section className="kpi-section">
          <h2>Opérationnel &amp; reporting</h2>
          <div className="raid-kpis">
            <Metric label="Décisions (90 j)" value={String(kpis.operational.decisionsLast90d)} hint="tous projets" />
            <Metric
              label="Délai moyen de résolution"
              value={kpis.operational.avgResolutionDays === null ? "—" : `${kpis.operational.avgResolutionDays.toFixed(1)} j`}
              hint={`${kpis.operational.resolvedIssueCount} issue(s) résolue(s)`}
            />
            <Metric
              label="Issues ouvertes > 30 j"
              value={String(kpis.operational.openIssuesNoOwnerOrStale)}
              hint="sans résolution depuis plus d'un mois"
              toneName={kpis.operational.openIssuesNoOwnerOrStale === 0 ? "ok" : "warn"}
            />
          </div>
          <p className="kpi-note">
            Précision des forecasts (EAC prévu vs coût réel final) non calculable : nécessite un historique des EAC
            successifs, pas seulement la dernière valeur. À ajouter si le suivi budgétaire doit remonter plus loin.
          </p>
        </section>
      </div>
    </>
  );
}

function AddGovernance({ onAdd, today }: { onAdd: (e: GovernanceEvent) => void; today: string }) {
  const [type, setType] = useState<GovernanceEventType>(GOV_TYPES[0]!);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(today);
  const [expected, setExpected] = useState(6);
  const [attendees, setAttendees] = useState(6);

  function submit() {
    if (!label.trim()) return;
    onAdd({ id: uid("gv"), type, label: label.trim(), date, expected, attendees });
    setLabel("");
    setDate(today);
    setExpected(6);
    setAttendees(6);
  }

  return (
    <div className="raid-add kpi-add">
      <select className="raid-in" value={type} onChange={(e) => setType(e.target.value as GovernanceEventType)}>
        {GOV_TYPES.map((t) => (
          <option key={t} value={t}>
            {GOVERNANCE_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <input
        className="raid-in grow"
        placeholder="Intitulé…"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <input className="raid-in tnum" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <label className="raid-lbl">
        Présents
        <input
          className="raid-in mini tnum"
          type="number"
          min={0}
          value={attendees}
          onChange={(e) => setAttendees(Number(e.target.value))}
        />
      </label>
      <label className="raid-lbl">
        Attendus
        <input
          className="raid-in mini tnum"
          type="number"
          min={0}
          value={expected}
          onChange={(e) => setExpected(Number(e.target.value))}
        />
      </label>
      <button className="raid-add-btn" onClick={submit} disabled={!label.trim()}>
        Ajouter
      </button>
    </div>
  );
}

function AddSurvey({ onAdd, today }: { onAdd: (s: SurveyResponse) => void; today: string }) {
  const [role, setRole] = useState<SurveyRole>(SURVEY_ROLES[0]!);
  const [date, setDate] = useState(today);
  const [score, setScore] = useState(8);
  const [comment, setComment] = useState("");

  function submit() {
    onAdd({ id: uid("sv"), date, role, score, comment: comment.trim() || undefined });
    setDate(today);
    setScore(8);
    setComment("");
  }

  return (
    <div className="raid-add kpi-add">
      <select className="raid-in" value={role} onChange={(e) => setRole(e.target.value as SurveyRole)}>
        {SURVEY_ROLES.map((r) => (
          <option key={r} value={r}>
            {SURVEY_ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <input className="raid-in tnum" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <label className="raid-lbl">
        Score
        <input
          className="raid-in mini tnum"
          type="number"
          min={0}
          max={10}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
        />
      </label>
      <input
        className="raid-in grow"
        placeholder="Commentaire (optionnel)…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <button className="raid-add-btn" onClick={submit}>
        Ajouter
      </button>
    </div>
  );
}
