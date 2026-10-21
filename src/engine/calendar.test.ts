import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isWindowOpen, matchdayDate, seasonStart, summerWeeks, weekday, windowAt } from './calendar';

describe('dates', () => {
  it('adds days across month and year ends and back again', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-11-14', '2027-01-01')).toBe(48);
    expect(daysBetween('2027-01-01', '2026-11-14')).toBe(-48);
  });

  it('knows which day of the week it is', () => {
    expect(weekday('2026-08-22')).toBe(6);
    expect(weekday('2026-11-14')).toBe(6);
  });
});

describe('the season calendar', () => {
  it('starts on the first Saturday on or after 20 August', () => {
    expect(seasonStart(2026)).toBe('2026-08-22');
    for (let y = 2026; y < 2040; y++) {
      const s = seasonStart(y);
      expect(weekday(s)).toBe(6);
      expect(s >= `${y}-08-20` && s <= `${y}-08-26`).toBe(true);
    }
  });

  it('puts a league matchday on a Saturday every week, so matchday 12 is 14 November as in the design', () => {
    expect(matchdayDate(2026, 0)).toBe('2026-08-22');
    expect(matchdayDate(2026, 12)).toBe('2026-11-14');
    for (let r = 0; r < 38; r++) expect(weekday(matchdayDate(2026, r))).toBe(6);
  });

  it('finishes the league season in early May, before the summer window opens', () => {
    for (let y = 2026; y < 2036; y++) {
      const last = matchdayDate(y, 37);
      expect(last.slice(5)).toMatch(/^05-/);
      expect(last < `${y + 1}-05-24`).toBe(true);
    }
  });
});

describe('transfer windows', () => {
  it('is open for the whole of January and shut on 31 December and 1 February', () => {
    expect(isWindowOpen('2027-01-01')).toBe(true);
    expect(isWindowOpen('2027-01-15')).toBe(true);
    expect(isWindowOpen('2027-01-31')).toBe(true);
    expect(isWindowOpen('2026-12-31')).toBe(false);
    expect(isWindowOpen('2027-02-01')).toBe(false);
  });

  it('is open for the whole close season, from 24 May to 16 August', () => {
    expect(isWindowOpen('2027-05-23')).toBe(false);
    expect(isWindowOpen('2027-05-24')).toBe(true);
    expect(isWindowOpen('2027-07-04')).toBe(true);
    expect(isWindowOpen('2027-08-16')).toBe(true);
    expect(isWindowOpen('2027-08-17')).toBe(false);
  });

  it('is shut for most of the season', () => {
    for (const d of ['2026-09-12', '2026-11-14', '2027-03-06', '2027-04-24']) expect(isWindowOpen(d)).toBe(false);
  });

  it('counts the days to the winter window from mid November as in the design', () => {
    expect(windowAt('2026-11-14')).toEqual({
      kind: 'winter',
      open: false,
      opens: '2027-01-01',
      closes: '2027-01-31',
      daysToOpen: 48,
      daysToClose: 78,
    });
  });

  it('says how long an open window has left', () => {
    const w = windowAt('2027-01-19');
    expect(w).toMatchObject({ kind: 'winter', open: true, daysToClose: 12, daysToOpen: 0 });
  });

  it('looks ahead to the summer window after January, and the next winter after the summer', () => {
    expect(windowAt('2027-02-20')).toMatchObject({ kind: 'summer', open: false, opens: '2027-05-24' });
    expect(windowAt('2027-08-20')).toMatchObject({ kind: 'winter', open: false, opens: '2028-01-01' });
  });
});

describe('summerWeeks', () => {
  it('steps a week at a time from 24 May to the last week of the window', () => {
    const weeks = summerWeeks(2027);
    expect(weeks[0]).toBe('2027-05-24');
    expect(weeks.at(-1)! <= '2027-08-16').toBe(true);
    expect(weeks.length).toBeGreaterThanOrEqual(12);
    for (let i = 1; i < weeks.length; i++) expect(daysBetween(weeks[i - 1]!, weeks[i]!)).toBe(7);
    for (const w of weeks) expect(isWindowOpen(w)).toBe(true);
  });
});
