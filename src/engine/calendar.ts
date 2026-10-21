/**
 * Dates are ISO strings such as "2026-11-14", which save and load cleanly. All arithmetic is in UTC so time zones
 * and daylight saving never move a date.
 */
const DAY = 86_400_000;

const toMs = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
const fromMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso: string, days: number): string => fromMs(toMs(iso) + days * DAY);
export const daysBetween = (from: string, to: string): number => Math.round((toMs(to) - toMs(from)) / DAY);
/** 0 is Sunday, 6 is Saturday. */
export const weekday = (iso: string): number => new Date(toMs(iso)).getUTCDay();

/** The first Saturday on or after 20 August: the opening day of the league season. */
export function seasonStart(year: number): string {
  const aug20 = `${year}-08-20`;
  return addDays(aug20, (6 - weekday(aug20) + 7) % 7);
}

/** The date of a league matchday: round 0 is opening day and there is one a week after that. */
export const matchdayDate = (year: number, round: number): string => addDays(seasonStart(year), round * 7);

export type WindowKind = 'winter' | 'summer';

export interface WindowInfo {
  kind: WindowKind;
  open: boolean;
  /** First day of the window, which is today's window if it is open and the next one if not. */
  opens: string;
  /** Last day of the window. */
  closes: string;
  daysToOpen: number;
  daysToClose: number;
}

/** The winter window is all of January. The summer window is the close season, 24 May to 16 August. */
function windowsInYear(year: number): { kind: WindowKind; opens: string; closes: string }[] {
  return [
    { kind: 'winter', opens: `${year}-01-01`, closes: `${year}-01-31` },
    { kind: 'summer', opens: `${year}-05-24`, closes: `${year}-08-16` },
  ];
}

/** Whether the transfer window is open on a date, and when the current or next window opens and closes. */
export function windowAt(date: string): WindowInfo {
  const year = Number(date.slice(0, 4));
  const all = [year - 1, year, year + 1].flatMap(windowsInYear);
  const current = all.find((w) => w.opens <= date && date <= w.closes);
  const w = current ?? all.find((x) => x.opens > date);
  if (!w) throw new Error('No transfer window found');
  return {
    kind: w.kind,
    open: current !== undefined,
    opens: w.opens,
    closes: w.closes,
    daysToOpen: Math.max(0, daysBetween(date, w.opens)),
    daysToClose: daysBetween(date, w.closes),
  };
}

export const isWindowOpen = (date: string): boolean => windowAt(date).open;

/**
 * Between seasons time moves a week at a time through the summer window. Returns the date of each step,
 * starting on the first day of the window and stopping at its last day.
 */
export function summerWeeks(year: number): string[] {
  const dates: string[] = [];
  const end = `${year}-08-16`;
  for (let d = `${year}-05-24`; d <= end; d = addDays(d, 7)) dates.push(d);
  return dates;
}
