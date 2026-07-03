import { parseISO, type CalendarDef, isWorkingDay } from "@atelier/scheduling-engine";

export const DAY_MS = 86_400_000;

export interface TimeRange {
  /** Calendar start, ISO. */
  start: string;
  /** Total calendar days spanned. */
  days: number;
}

/** Calendar-day offset of an ISO date from the range start. */
export function dayOffset(range: TimeRange, iso: string): number {
  return Math.round((parseISO(iso) - parseISO(range.start)) / DAY_MS);
}

export function offsetToUTC(range: TimeRange, offset: number): number {
  return parseISO(range.start) + offset * DAY_MS;
}

/** Build the visible range: a few days before the earliest date, buffer after the latest. */
export function buildRange(minISO: string, maxISO: string): TimeRange {
  const start = parseISO(minISO) - 4 * DAY_MS;
  const end = parseISO(maxISO) + 15 * DAY_MS;
  return {
    start: new Date(start).toISOString().slice(0, 10),
    days: Math.round((end - start) / DAY_MS) + 1,
  };
}

export interface MonthBand {
  offset: number;
  days: number;
  label: string;
}

const MONTH_FMT = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const MONTH_SHORT_FMT = new Intl.DateTimeFormat("fr-FR", { month: "short" });

export function monthBands(range: TimeRange, short = false): MonthBand[] {
  const bands: MonthBand[] = [];
  let offset = 0;
  while (offset < range.days) {
    const utc = offsetToUTC(range, offset);
    const d = new Date(utc);
    const monthEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    const daysInBand = Math.min(Math.round((monthEnd - utc) / DAY_MS), range.days - offset);
    bands.push({
      offset,
      days: daysInBand,
      label: (short ? MONTH_SHORT_FMT : MONTH_FMT).format(d),
    });
    offset += daysInBand;
  }
  return bands;
}

/** Offsets of Mondays inside the range (week boundaries). */
export function weekStarts(range: TimeRange): number[] {
  const out: number[] = [];
  for (let i = 0; i < range.days; i++) {
    if (new Date(offsetToUTC(range, i)).getUTCDay() === 1) out.push(i);
  }
  return out;
}

/** Offsets of non-working calendar days (weekends + holidays). */
export function nonWorkingOffsets(range: TimeRange, cal: CalendarDef): number[] {
  const out: number[] = [];
  for (let i = 0; i < range.days; i++) {
    if (!isWorkingDay(cal, offsetToUTC(range, i))) out.push(i);
  }
  return out;
}
