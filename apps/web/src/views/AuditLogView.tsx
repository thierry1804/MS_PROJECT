import { useEffect, useState } from "react";
import { fetchAuditLog, type AuditEntry } from "../sync";
import "../styles/audit.css";

const ENTITY_LABELS: Record<string, string> = {
  project: "Projet",
  task: "Tâche",
  demand: "Demande",
  risks: "Risque",
  actions: "Action",
  issues: "Problème",
  decisions: "Décision",
  portfolio: "Portefeuille",
};

const AUDIT_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function fmtAudit(iso: string): string {
  return AUDIT_FMT.format(new Date(iso));
}

export function AuditLogView() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetchAuditLog(300)
      .then(setEntries)
      .catch(() => setError(true));
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (entries ?? []).filter((e) => !q || e.summary.toLowerCase().includes(q));

  return (
    <>
      <div className="view-header">
        <div>
          <h1>Journal d'activité</h1>
          <span className="sub">Historique des actions significatives sur le portefeuille.</span>
        </div>
      </div>

      <div className="view-body audit-body">
        <input
          className="audit-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer le journal…"
          aria-label="Filtrer le journal"
        />

        {error && <p className="audit-empty">Journal indisponible (API hors ligne).</p>}
        {!error && entries === null && <p className="audit-empty">Chargement…</p>}
        {entries !== null && filtered.length === 0 && !error && <p className="audit-empty">Aucune entrée.</p>}

        <ul className="audit-list">
          {filtered.map((e) => (
            <li key={e.id} className="audit-row">
              <span className="audit-date tnum">{fmtAudit(e.at)}</span>
              <span className={`audit-entity audit-${e.entityType}`}>{ENTITY_LABELS[e.entityType] ?? e.entityType}</span>
              <span className="audit-summary grow">{e.summary}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
