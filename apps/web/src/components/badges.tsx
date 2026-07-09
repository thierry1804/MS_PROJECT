import { useEffect, useId, useRef, useState } from "react";
import { HEALTH_LABELS, STATUS_LABELS, type Health, type ProjectStatus } from "../domain";

const HEALTH_CLASS: Record<Health, string> = { green: "ok", amber: "warn", red: "danger" };

const STATUS_CLASS: Record<ProjectStatus, string> = {
  cadrage: "neutral",
  "en-cours": "ok",
  "en-pause": "warn",
  termine: "neutral",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABELS) as ProjectStatus[];

export function HealthBadge({ health }: { health: Health }) {
  return (
    <span className={`badge ${HEALTH_CLASS[health]}`}>
      <span className="dot" />
      {HEALTH_LABELS[health]}
    </span>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`badge ${STATUS_CLASS[status]}`}>
      <span className="dot" />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Editable status control that keeps the badge look. */
export function StatusSelect({
  status,
  onChange,
}: {
  status: ProjectStatus;
  onChange: (status: ProjectStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`status-select${open ? " open" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`badge status-select-trigger ${STATUS_CLASS[status]}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Statut du projet"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="dot" />
        <span className="status-select-label">{STATUS_LABELS[status]}</span>
        <span className="status-select-caret" aria-hidden />
      </button>
      {open && (
        <ul id={listId} className="status-select-menu" role="listbox" aria-label="Statut du projet">
          {STATUS_OPTIONS.map((s) => {
            const selected = s === status;
            return (
              <li key={s} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={`status-select-option${selected ? " selected" : ""}`}
                  onClick={() => {
                    onChange(s);
                    setOpen(false);
                  }}
                >
                  <span className={`dot ${STATUS_CLASS[s]}`} />
                  <span>{STATUS_LABELS[s]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className="progress" style={{ width: 64 }}>
        <div style={{ width: `${Math.round(value)}%` }} />
      </span>
      <span className="num" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)", minWidth: 32 }}>
        {Math.round(value)} %
      </span>
    </span>
  );
}
