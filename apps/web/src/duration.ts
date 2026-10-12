import type { Task } from "@atelier/scheduling-engine";

/** Heures productives par jour ouvré (conversion import Excel). */
export const HOURS_PER_WORKDAY = 8;

export const DURATION_HOURS_KEY = "durationHours";

/** Parse une durée en jours ouvrés (décimaux acceptés, virgule ou point). */
export function parseDurationDays(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;

  let n: number;
  if (typeof raw === "number") {
    n = raw;
  } else {
    const s = String(raw).trim().replace(",", ".");
    if (!s) return null;
    n = Number(s);
  }

  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Jours ouvrés → heures (1 j = 8 h). */
export function daysToHours(days: number): number {
  return Math.round(days * HOURS_PER_WORKDAY * 10) / 10;
}

export function taskDurationHours(task: Task): number {
  const stored = task.custom?.[DURATION_HOURS_KEY];
  if (typeof stored === "number") return stored;
  return daysToHours(task.duration);
}

/** Affiche la durée : jours entiers en « j », sinon heures. */
export function formatTaskDuration(task: Task): string {
  const isWholeDays =
    task.duration >= 1 && Math.abs(task.duration - Math.round(task.duration)) < 1e-9;
  if (isWholeDays) return `${Math.round(task.duration)} j`;

  const hours = taskDurationHours(task);
  const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(".", ",");
  return `${text} h`;
}

export function durationCustomFields(days: number): Record<string, number> {
  return { [DURATION_HOURS_KEY]: daysToHours(days) };
}
