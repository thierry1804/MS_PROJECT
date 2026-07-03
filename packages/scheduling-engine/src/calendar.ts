import type { CalendarDef } from "./types";

export const DEFAULT_CALENDAR: CalendarDef = {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
};

const DAY_MS = 86_400_000;

export function parseISO(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

export function toISO(utc: number): string {
  const dt = new Date(utc);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isWorkingDay(cal: CalendarDef, utc: number): boolean {
  const wd = new Date(utc).getUTCDay();
  if (!cal.workingWeekdays.includes(wd)) return false;
  return !cal.holidays.includes(toISO(utc));
}

/** First working day at or after the given date. */
export function nextWorkingDay(cal: CalendarDef, utc: number): number {
  let t = utc;
  while (!isWorkingDay(cal, t)) t += DAY_MS;
  return t;
}

/**
 * Resolve a working-day index (offset from project start) to a calendar date.
 * Index 0 = first working day at or after projectStart.
 */
export function indexToDate(cal: CalendarDef, projectStartISO: string, index: number): string {
  let t = nextWorkingDay(cal, parseISO(projectStartISO));
  let remaining = index;
  while (remaining > 0) {
    t += DAY_MS;
    t = nextWorkingDay(cal, t);
    remaining--;
  }
  return toISO(t);
}

/** Working-day index of an ISO date relative to project start (rounds forward to next working day). */
export function dateToIndex(cal: CalendarDef, projectStartISO: string, iso: string): number {
  const start = nextWorkingDay(cal, parseISO(projectStartISO));
  const target = nextWorkingDay(cal, parseISO(iso));
  if (target <= start) return 0;
  let t = start;
  let idx = 0;
  while (t < target) {
    t += DAY_MS;
    t = nextWorkingDay(cal, t);
    idx++;
  }
  return idx;
}

/** Count of working days in [fromISO, toISO) — half-open calendar interval. */
export function workingDaysBetween(cal: CalendarDef, fromISO: string, toISO_: string): number {
  let t = parseISO(fromISO);
  const end = parseISO(toISO_);
  let n = 0;
  while (t < end) {
    if (isWorkingDay(cal, t)) n++;
    t += DAY_MS;
  }
  return n;
}
