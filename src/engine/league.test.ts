import { describe, expect, it } from 'vitest';
import { buildTable, champion, isChampionConfirmed, zoneFor } from './league';
import type { MatchResult, StandingRow } from './types';

const result = (homeId: string, awayId: string, homeGoals: number, awayGoals: number, round = 0): MatchResult => ({
  division: 3,
  round,
  homeId,
  awayId,
  homeGoals,
  awayGoals,
});

describe('buildTable', () => {
  it('awards 3 points for a win, 1 for a draw and 0 for a defeat', () => {
    const t = buildTable(['a', 'b', 'c'], [result('a', 'b', 2, 0), result('b', 'c', 1, 1), result('c', 'a', 0, 3)]);
    const row = (id: string): StandingRow => t.find((r) => r.clubId === id)!;
    expect(row('a')).toMatchObject({ played: 2, won: 2, points: 6, goalsFor: 5, goalsAgainst: 0, goalDifference: 5 });
    expect(row('b')).toMatchObject({ played: 2, won: 0, drawn: 1, lost: 1, points: 1 });
    expect(row('c')).toMatchObject({ played: 2, drawn: 1, lost: 1, points: 1, goalDifference: -3 });
  });

  it('includes clubs that have not played yet', () => {
    const t = buildTable(['a', 'b'], []);
    expect(t).toHaveLength(2);
    expect(t.every((r) => r.played === 0 && r.points === 0)).toBe(true);
  });

  it('sorts by points, then goal difference, then goals scored, then club id', () => {
    const t = buildTable(
      ['a', 'b', 'c', 'd', 'x'],
      [
        result('a', 'x', 1, 0), // a: 3 pts, +1, 1 for
        result('b', 'x', 3, 2), // b: 3 pts, +1, 3 for
        result('c', 'x', 5, 0), // c: 3 pts, +5
        result('d', 'x', 1, 0), // d: 3 pts, +1, 1 for (ties with a, so id decides)
      ],
    );
    expect(t.map((r) => r.clubId)).toEqual(['c', 'b', 'a', 'd', 'x']);
  });

  it('ignores results involving clubs outside the division', () => {
    const t = buildTable(['a', 'b'], [result('a', 'zzz', 4, 0)]);
    expect(t.find((r) => r.clubId === 'a')!.played).toBe(0);
  });

  it('adds up so that goals for equal goals against and points match results', () => {
    const results = [result('a', 'b', 2, 1), result('b', 'c', 0, 0), result('c', 'a', 1, 4)];
    const t = buildTable(['a', 'b', 'c'], results);
    expect(t.reduce((s, r) => s + r.goalsFor, 0)).toBe(t.reduce((s, r) => s + r.goalsAgainst, 0));
    // two decisive games (3 points each) and one draw (2 points)
    expect(t.reduce((s, r) => s + r.points, 0)).toBe(8);
  });
});

describe('zoneFor', () => {
  it('has nothing to promote to in Division One, and relegates the bottom three', () => {
    expect(zoneFor(0, 1)).toBe('none');
    expect(zoneFor(0, 2)).toBe('none');
    expect(zoneFor(0, 3)).toBe('none');
    expect(zoneFor(0, 17)).toBe('none');
    expect(zoneFor(0, 18)).toBe('relegation');
    expect(zoneFor(0, 20)).toBe('relegation');
  });

  it('promotes 1st and 2nd and sends 3rd and 4th to the play-off in Divisions Two and Three', () => {
    for (const d of [1, 2]) {
      expect([1, 2, 3, 4, 5].map((p) => zoneFor(d, p))).toEqual(['promotion', 'promotion', 'playoff', 'playoff', 'none']);
      expect(zoneFor(d, 17)).toBe('none');
      expect(zoneFor(d, 18)).toBe('relegation');
    }
  });

  it('has promotion and play-offs but no relegation in the bottom division', () => {
    expect([1, 2, 3, 4, 5].map((p) => zoneFor(3, p))).toEqual(['promotion', 'promotion', 'playoff', 'playoff', 'none']);
    for (let p = 5; p <= 20; p++) expect(zoneFor(3, p)).toBe('none');
  });
});

describe('champions', () => {
  const row = (clubId: string, played: number, points: number): StandingRow => ({
    clubId,
    played,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points,
  });

  it('are confirmed once second place cannot catch the leader', () => {
    // second has 30 left = 10 matches, so 30 points still to win at most
    expect(isChampionConfirmed([row('a', 28, 80), row('b', 28, 49)])).toBe(true);
    expect(isChampionConfirmed([row('a', 28, 80), row('b', 28, 50)])).toBe(false);
  });

  it('are not confirmed on equal points even if no matches remain for second place', () => {
    expect(isChampionConfirmed([row('a', 38, 90), row('b', 38, 90)])).toBe(false);
  });

  it('are never confirmed at the start of the season', () => {
    expect(isChampionConfirmed([row('a', 0, 0), row('b', 0, 0)])).toBe(false);
  });

  it('are named at the end of the season, or as soon as the title is safe, and not before', () => {
    expect(champion([row('a', 38, 90), row('b', 38, 90)])).toBe('a');
    expect(champion([row('a', 28, 80), row('b', 28, 40)])).toBe('a');
    expect(champion([row('a', 20, 50), row('b', 20, 45)])).toBeNull();
    expect(champion([])).toBeNull();
  });
});
