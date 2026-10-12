import { useCallback, useEffect, useMemo, useState } from "react";
import { clearAuditLog, fetchAuditLog, type AuditEntry } from "../sync";
import { ConfirmDialog } from "../components/ConfirmDialog";
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
  governance: "Gouvernance",
  survey: "Baromètre",
  resource: "Ressource",
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

const PAGE_SIZES = [10, 30, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];

export function AuditLogView() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState<PageSize>(30);
  const [page, setPage] = useState(1);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadEntries = useCallback(() => {
    setError(false);
    setEntries(null);
    fetchAuditLog(1000)
      .then(setEntries)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  async function handleClearAll() {
    setClearing(true);
    try {
      await clearAuditLog();
      setEntries([]);
      setConfirmClear(false);
      setPage(1);
    } catch {
      setError(true);
    } finally {
      setClearing(false);
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (entries ?? []).filter(
        (e) => !q || e.summary.toLowerCase().includes(q) || e.actor.toLowerCase().includes(q),
      ),
    [entries, q],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [query, pageSize]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pageStart = (page - 1) * pageSize;
  const paginated = filtered.slice(pageStart, pageStart + pageSize);
  const rangeStart = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + pageSize, filtered.length);

  return (
    <>
      <div className="view-header audit-header">
        <div>
          <h1>Journal d'activité</h1>
          <span className="sub">Historique des actions significatives sur le portefeuille.</span>
        </div>
        <button
          type="button"
          className="audit-clear-btn"
          disabled={error || entries === null || entries.length === 0 || clearing}
          onClick={() => setConfirmClear(true)}
        >
          Vider le journal
        </button>
      </div>

      <div className="view-body audit-body">
        <input
          className="audit-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer par résumé ou auteur…"
          aria-label="Filtrer le journal"
        />

        {error && <p className="audit-empty">Journal indisponible (API hors ligne).</p>}
        {!error && entries === null && <p className="audit-empty">Chargement…</p>}
        {entries !== null && filtered.length === 0 && !error && <p className="audit-empty">Aucune entrée.</p>}

        {entries !== null && filtered.length > 0 && !error && (
          <div className="audit-row audit-head" aria-hidden="true">
            <span className="audit-date">Date</span>
            <span className="audit-entity">Type</span>
            <span className="audit-summary grow">Résumé</span>
            <span className="audit-actor">Auteur</span>
          </div>
        )}

        <ul className="audit-list">
          {paginated.map((e) => (
            <li key={e.id} className="audit-row">
              <span className="audit-date tnum">{fmtAudit(e.at)}</span>
              <span className="audit-entity-badge">{ENTITY_LABELS[e.entityType] ?? e.entityType}</span>
              <span className="audit-summary grow">{e.summary}</span>
              <span className="audit-actor">{e.actor}</span>
            </li>
          ))}
        </ul>

        {entries !== null && filtered.length > 0 && !error && (
          <div className="audit-pager">
            <label className="audit-page-size">
              <span>Par page</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
                aria-label="Nombre d'entrées par page"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <span className="audit-range tnum">
              {rangeStart}–{rangeEnd} sur {filtered.length}
            </span>
            <div className="audit-page-nav">
              <button
                type="button"
                className="audit-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Précédent
              </button>
              <span className="audit-page-indicator tnum">
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                className="audit-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmClear && (
        <ConfirmDialog
          title="Vider le journal d'activité ?"
          message="Toutes les entrées seront définitivement supprimées. Cette action est irréversible."
          confirmLabel="Vider le journal"
          danger
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => void handleClearAll()}
        />
      )}
    </>
  );
}
