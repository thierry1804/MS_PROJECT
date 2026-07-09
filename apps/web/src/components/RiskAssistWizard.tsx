import { useCallback, useMemo, useState } from "react";
import type { Action, Portfolio, Project, Risk, RiskAssessmentEntry } from "../domain";
import { todayISO } from "../domain";
import { HealthBadge } from "./badges";
import { buildProjectContext } from "../risk-assist/context";
import { runHeuristics } from "../risk-assist/heuristics";
import { applyFollowUpAnswers, buildFollowUpQuestions, buildHintFollowUpQuestions } from "../risk-assist/questions";
import { riskScore, scoreZone } from "../risk-assist/scoring";
import type { FollowUpQuestion, RiskSuggestion } from "../risk-assist/types";
import { fetchRiskAssist } from "../sync";
import { useStore } from "../store";
import "../styles/modal.css";
import "../styles/risk-assist.css";

type Step = "entry" | "proposals" | "refine" | "confirm";

const STEPS: Step[] = ["entry", "proposals", "refine", "confirm"];

const STEP_LABELS: Record<Step, string> = {
  entry: "Entrée",
  proposals: "Propositions",
  refine: "Affinage",
  confirm: "Validation",
};

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function suggestionToRisk(s: RiskSuggestion, userHint?: string): Risk {
  const now = new Date().toISOString();
  const entry: RiskAssessmentEntry = {
    at: now,
    source: s.source === "llm" ? "llm" : s.source === "manual" ? "manual" : "heuristic",
    userHint,
    rationale: s.rationale,
    confidence: s.confidence,
  };
  return {
    id: uid("risk"),
    label: s.label,
    probability: s.probability,
    impact: s.impact,
    owner: s.owner?.trim() || "PMO",
    status: "ouvert",
    mitigation: s.mitigation,
    category: s.category,
    strategy: s.strategy,
    triggers: s.triggers.length ? s.triggers : undefined,
    residualProbability: s.residualProbability,
    residualImpact: s.residualImpact,
    assessment: { last: entry, history: [entry] },
  };
}

interface Props {
  portfolio: Portfolio;
  defaultProjectId?: string;
  onClose: () => void;
}

export function RiskAssistWizard({ portfolio, defaultProjectId, onClose }: Props) {
  const addRaidItem = useStore((s) => s.addRaidItem);
  const [step, setStep] = useState<Step>("entry");
  const [projectId, setProjectId] = useState(defaultProjectId ?? portfolio.projects[0]?.id ?? "");
  const [userHint, setUserHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistSource, setAssistSource] = useState<"heuristic" | "llm" | "mixed">("heuristic");
  const [suggestions, setSuggestions] = useState<RiskSuggestion[]>([]);
  const [questions, setQuestions] = useState<FollowUpQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [createActions, setCreateActions] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const project = portfolio.projects.find((p) => p.id === projectId);
  const projectContext = useMemo(
    () => (project ? buildProjectContext(project, portfolio) : null),
    [project, portfolio],
  );
  const analyzeMode = userHint.trim() ? "hint" : "auto";
  const analyzeLabel = loading
    ? "Analyse…"
    : analyzeMode === "hint"
      ? "Analyser ma description"
      : "Analyser le projet";

  const analyze = useCallback(
    async (mode: "auto" | "hint") => {
      if (!project) return;
      setLoading(true);
      setError(null);
      const context = buildProjectContext(project, portfolio);
      const heuristicSuggestions = runHeuristics(context, mode === "hint" ? userHint : undefined);
      try {
        const res = await fetchRiskAssist({
          projectId,
          userHint: mode === "hint" ? userHint : undefined,
          context,
          heuristicSuggestions,
          mode: "suggest",
        });
        const mapped = res.suggestions.map((s) => ({
          ...s,
          category: s.category as RiskSuggestion["category"],
          strategy: s.strategy as RiskSuggestion["strategy"],
          accepted: undefined,
          ignored: false,
        }));
        setSuggestions(mapped);
        setQuestions(
          res.followUpQuestions.length
            ? res.followUpQuestions
            : mode === "hint" && userHint.trim()
              ? buildHintFollowUpQuestions(userHint, mapped)
              : buildFollowUpQuestions(mapped),
        );
        setAssistSource(res.source);
        setStep("proposals");
      } catch {
        const fallback = heuristicSuggestions;
        setSuggestions(fallback);
        setQuestions(
          mode === "hint" && userHint.trim()
            ? buildHintFollowUpQuestions(userHint, fallback)
            : buildFollowUpQuestions(fallback),
        );
        setAssistSource("heuristic");
        setStep("proposals");
      } finally {
        setLoading(false);
      }
    },
    [project, portfolio, projectId, userHint],
  );

  const acceptedSuggestions = suggestions.filter((s) => s.accepted && !s.ignored);

  function toggleAccept(id: string) {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, accepted: !s.accepted, ignored: false } : s)),
    );
  }

  function toggleIgnore(id: string) {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ignored: !s.ignored, accepted: false } : s)),
    );
  }

  function patchSuggestion(id: string, patch: Partial<RiskSuggestion>) {
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, source: "manual" as const } : s)));
  }

  function goRefine() {
    const refined = applyFollowUpAnswers(suggestions, answers, questions);
    setSuggestions(refined);
    setStep("refine");
  }

  function goConfirm() {
    const refined = applyFollowUpAnswers(suggestions, answers, questions);
    setSuggestions(refined);
    setStep("confirm");
  }

  function submit() {
    if (!projectId) return;
    const due = addDays(todayISO(), 14);
    for (const s of acceptedSuggestions) {
      const risk = suggestionToRisk(s, userHint || undefined);
      addRaidItem(projectId, "risks", risk);
      if (createActions) {
        for (const label of s.actions) {
          const action: Action = {
            id: uid("act"),
            label,
            owner: s.owner?.trim() || project?.manager || "PMO",
            dueDate: due,
            status: "a-faire",
          };
          addRaidItem(projectId, "actions", action);
        }
      }
    }
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal risk-assist-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Assistant d'évaluation des risques"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head ra-head">
          <div>
            <h2>Assistant risque</h2>
            <nav className="ra-step-rail" aria-label="Étapes">
              {STEPS.map((s, i) => {
                const active = step === s;
                const done = STEPS.indexOf(step) > i;
                return (
                  <span
                    key={s}
                    className={`ra-step-item${active ? " active" : ""}${done ? " done" : ""}`}
                    aria-current={active ? "step" : undefined}
                  >
                    <span className="ra-step-num">{i + 1}</span>
                    <span className="ra-step-name">{STEP_LABELS[s]}</span>
                  </span>
                );
              })}
            </nav>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className="modal-body ra-body">
          {step === "entry" && (
            <div className="ra-entry">
              <p className="ra-intro">
                Décrivez votre inquiétude en une phrase : l'assistant la décompose en risques corrélés
                (causes, conséquences, impacts planning/budget) en s'appuyant sur le contexte du projet.
              </p>

              <label className="ra-field">
                <span>Projet</span>
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  {portfolio.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
                </select>
              </label>

              {project && projectContext && (
                <ProjectContextSummary project={project} context={projectContext} />
              )}

              <label className="ra-field">
                <span>Votre inquiétude</span>
                <textarea
                  value={userHint}
                  onChange={(e) => setUserHint(e.target.value)}
                  rows={4}
                  placeholder="Ex. Le fournisseur ERP pourrait livrer en retard et bloquer les tests d'intégration…"
                />
              </label>
              <p className="ra-field-hint">
                {userHint.trim()
                  ? "L'analyse croisera votre description avec le contexte du projet."
                  : "Laissez vide pour une analyse automatique à partir des données du projet."}
              </p>
              {error && <p className="ra-error">{error}</p>}
            </div>
          )}

          {step === "proposals" && (
            <>
              <p className="ra-meta">
                Source : {assistSource === "llm" ? "IA" : assistSource === "mixed" ? "Heuristiques + IA" : "Heuristiques"}
                {" · "}
                {suggestions.filter((s) => !s.ignored).length} proposition(s)
                {userHint.trim() && " · analyse approfondie de votre inquiétude"}
              </p>
              {suggestions.length === 0 && (
                <p className="ra-empty">Aucun risque identifié pour ce projet. Ajoutez une description ou vérifiez le contexte.</p>
              )}
              <div className="ra-cards">
                {suggestions.map((s) =>
                  s.ignored ? null : (
                    <SuggestionCard
                      key={s.id}
                      suggestion={s}
                      onAccept={() => toggleAccept(s.id)}
                      onIgnore={() => toggleIgnore(s.id)}
                      onEdit={() => setEditingId(s.id)}
                      editing={editingId === s.id}
                      onPatch={(patch) => patchSuggestion(s.id, patch)}
                      onCloseEdit={() => setEditingId(null)}
                    />
                  ),
                )}
              </div>
            </>
          )}

          {step === "refine" && (
            <>
              {questions.length > 0 && (
                <div className="ra-questions">
                  <h3>Questions complémentaires</h3>
                  {questions.map((q) => (
                    <FollowUpField
                      key={q.id}
                      question={q}
                      value={answers[q.id]}
                      onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                    />
                  ))}
                </div>
              )}
              <div className="ra-cards compact">
                {acceptedSuggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={applyFollowUpAnswers([s], answers, questions)[0]!}
                    compact
                    onAccept={() => {}}
                    onIgnore={() => {}}
                    onEdit={() => setEditingId(s.id)}
                    editing={editingId === s.id}
                    onPatch={(patch) => patchSuggestion(s.id, patch)}
                    onCloseEdit={() => setEditingId(null)}
                  />
                ))}
              </div>
              {acceptedSuggestions.length === 0 && (
                <p className="ra-empty">Aucun risque accepté. Revenez aux propositions pour en sélectionner.</p>
              )}
            </>
          )}

          {step === "confirm" && (
            <>
              <label className="ra-check">
                <input type="checkbox" checked={createActions} onChange={(e) => setCreateActions(e.target.checked)} />
                Créer les actions associées ({acceptedSuggestions.reduce((n, s) => n + s.actions.length, 0)})
              </label>
              <ul className="ra-recap">
                {acceptedSuggestions.map((s) => (
                  <li key={s.id}>
                    <strong>{s.label}</strong>
                    <span className={`raid-score ${scoreZone(riskScore(s.probability, s.impact))} tnum`}>
                      {s.probability}×{s.impact}={riskScore(s.probability, s.impact)}
                    </span>
                    <span className="ra-recap-cat">{s.category}</span>
                    {s.mitigation && <p className="muted">{s.mitigation}</p>}
                  </li>
                ))}
              </ul>
              {acceptedSuggestions.length === 0 && (
                <p className="ra-empty">Aucun risque à enregistrer.</p>
              )}
            </>
          )}
        </div>

        <footer className="modal-foot ra-foot">
          <span className="modal-hint">
            {step === "entry" && "Les propositions restent modifiables avant enregistrement."}
            {step === "proposals" && `${acceptedSuggestions.length} risque(s) sélectionné(s)`}
            {step === "refine" && "Affinez les scores à partir de vos réponses."}
            {step === "confirm" && "Vérifiez le récapitulatif avant enregistrement."}
          </span>
          <div className="modal-actions">
            {step !== "entry" && (
              <button
                className="modal-btn ghost"
                onClick={() =>
                  setStep(step === "confirm" ? "refine" : step === "refine" ? "proposals" : "entry")
                }
              >
                Retour
              </button>
            )}
            {step === "entry" && (
              <>
                <button className="modal-btn ghost" onClick={onClose}>
                  Annuler
                </button>
                <button
                  className="modal-btn primary"
                  disabled={!project || loading}
                  onClick={() => analyze(analyzeMode)}
                >
                  {analyzeLabel}
                </button>
              </>
            )}
            {step === "proposals" && (
              <button
                className="modal-btn primary"
                disabled={acceptedSuggestions.length === 0}
                onClick={() => (questions.length ? goRefine() : goConfirm())}
              >
                Continuer
              </button>
            )}
            {step === "refine" && (
              <button className="modal-btn primary" disabled={acceptedSuggestions.length === 0} onClick={goConfirm}>
                Valider l'affinage
              </button>
            )}
            {step === "confirm" && (
              <button className="modal-btn primary" disabled={acceptedSuggestions.length === 0} onClick={submit}>
                Enregistrer {acceptedSuggestions.length} risque(s)
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function ProjectContextSummary({
  project,
  context,
}: {
  project: Project;
  context: ReturnType<typeof buildProjectContext>;
}) {
  const signals = [
    context.openRisks.length > 0 && `${context.openRisks.length} risque${context.openRisks.length > 1 ? "s" : ""} ouvert${context.openRisks.length > 1 ? "s" : ""}`,
    context.openIssues.length > 0 && `${context.openIssues.length} problème${context.openIssues.length > 1 ? "s" : ""}`,
    context.lateTasks.length > 0 && `${context.lateTasks.length} tâche${context.lateTasks.length > 1 ? "s" : ""} en retard`,
    context.overallocatedResources.length > 0 && `${context.overallocatedResources.length} surcharge${context.overallocatedResources.length > 1 ? "s" : ""}`,
    context.overdueActions.length > 0 && `${context.overdueActions.length} action${context.overdueActions.length > 1 ? "s" : ""} en retard`,
  ].filter((s): s is string => Boolean(s));

  return (
    <div className="ra-ctx">
      <HealthBadge health={project.health} />
      {project.manager && <span className="ra-ctx-chip">{project.manager}</span>}
      {signals.slice(0, 3).map((signal) => (
        <span key={signal} className="ra-ctx-chip">
          {signal}
        </span>
      ))}
      {signals.length === 0 && <span className="ra-ctx-chip muted">Aucun signal critique détecté</span>}
    </div>
  );
}

function SuggestionCard({
  suggestion: s,
  compact,
  editing,
  onAccept,
  onIgnore,
  onEdit,
  onPatch,
  onCloseEdit,
}: {
  suggestion: RiskSuggestion;
  compact?: boolean;
  editing: boolean;
  onAccept: () => void;
  onIgnore: () => void;
  onEdit: () => void;
  onPatch: (patch: Partial<RiskSuggestion>) => void;
  onCloseEdit: () => void;
}) {
  const score = riskScore(s.probability, s.impact);
  const zone = scoreZone(score);

  if (editing) {
    return (
      <div className="ra-card editing">
        <label className="modal-field">
          <span>Libellé</span>
          <input value={s.label} onChange={(e) => onPatch({ label: e.target.value })} />
        </label>
        <div className="ra-edit-row">
          <label>
            P
            <select value={s.probability} onChange={(e) => onPatch({ probability: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            I
            <select value={s.impact} onChange={(e) => onPatch({ impact: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="grow">
            Porteur
            <input value={s.owner ?? ""} onChange={(e) => onPatch({ owner: e.target.value })} />
          </label>
        </div>
        <label className="modal-field">
          <span>Mitigation</span>
          <textarea value={s.mitigation} onChange={(e) => onPatch({ mitigation: e.target.value })} rows={2} />
        </label>
        <button className="modal-btn ghost" onClick={onCloseEdit}>
          OK
        </button>
      </div>
    );
  }

  return (
    <div className={`ra-card${s.accepted ? " accepted" : ""}${compact ? " compact" : ""}`}>
      <div className="ra-card-top">
        <span className={`raid-score ${zone} tnum`}>{score}</span>
        <div className="ra-card-title">
          <strong>{s.label}</strong>
          <span className="ra-badges">
            <span className="ra-badge">{s.category}</span>
            <span className="ra-badge muted">{s.source === "llm" ? "IA" : "Heuristique"}</span>
            {s.confidence < 0.75 && <span className="ra-badge warn">À confirmer</span>}
          </span>
        </div>
      </div>
      <p className="ra-rationale">{s.rationale}</p>
      {!compact && (
        <div className="ra-card-actions">
          <button className={`ra-btn${s.accepted ? " on" : ""}`} onClick={onAccept}>
            {s.accepted ? "Accepté" : "Accepter"}
          </button>
          <button className="ra-btn ghost" onClick={onEdit}>
            Modifier
          </button>
          <button className="ra-btn ghost" onClick={onIgnore}>
            Ignorer
          </button>
        </div>
      )}
    </div>
  );
}

function FollowUpField({
  question,
  value,
  onChange,
}: {
  question: FollowUpQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (question.type === "boolean") {
    return (
      <label className="ra-q">
        <span>{question.text}</span>
        <select
          value={value === true ? "oui" : value === false ? "non" : ""}
          onChange={(e) => onChange(e.target.value === "oui" ? true : e.target.value === "non" ? false : undefined)}
        >
          <option value="">—</option>
          <option value="oui">Oui</option>
          <option value="non">Non</option>
        </select>
      </label>
    );
  }
  if (question.type === "scale") {
    return (
      <label className="ra-q">
        <span>{question.text}</span>
        <input
          type="number"
          min={0}
          max={60}
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        />
      </label>
    );
  }
  return (
    <label className="ra-q">
      <span>{question.text}</span>
      <input type="text" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
