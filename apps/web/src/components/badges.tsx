import { HEALTH_LABELS, STATUS_LABELS, type Health, type ProjectStatus } from "../domain";

const HEALTH_CLASS: Record<Health, string> = { green: "ok", amber: "warn", red: "danger" };

export function HealthBadge({ health }: { health: Health }) {
  return (
    <span className={`badge ${HEALTH_CLASS[health]}`}>
      <span className="dot" />
      {HEALTH_LABELS[health]}
    </span>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const cls = status === "en-cours" ? "ok" : status === "en-pause" ? "warn" : "neutral";
  return (
    <span className={`badge ${cls}`}>
      <span className="dot" />
      {STATUS_LABELS[status]}
    </span>
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
