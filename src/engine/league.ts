import { CLUBS_PER_DIVISION, DIVISION_COUNT, MATCHES_PER_SEASON } from './config';
import type { MatchResult, StandingRow } from './types';

/** Builds a division's table from results. Points, then goal difference, then goals scored, then club id so it is always stable. */
export function buildTable(clubIds: readonly string[], results: readonly MatchResult[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    clubIds.map((clubId) => [
      clubId,
      { clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 },
    ]),
  );
  for (const r of results) {
    const home = rows.get(r.homeId);
    const away = rows.get(r.awayId);
    if (!home || !away) continue;
    for (const [row, gf, ga] of [
      [home, r.homeGoals, r.awayGoals],
      [away, r.awayGoals, r.homeGoals],
    ] as const) {
      row.played++;
      row.goalsFor += gf;
      row.goalsAgainst += ga;
      row.goalDifference = row.goalsFor - row.goalsAgainst;
      if (gf > ga) {
        row.won++;
        row.points += 3;
      } else if (gf === ga) {
        row.drawn++;
        row.points += 1;
      } else {
        row.lost++;
      }
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.clubId.localeCompare(b.clubId),
  );
}

export type Zone = 'promotion' | 'playoff' | 'relegation' | 'none';

/**
 * What a league position means, for position 1 (top) to 20.
 * Division One has nothing to be promoted to. Below that, 1st and 2nd go up automatically and 3rd and 4th
 * meet in the play-off final. The bottom three go down, except in the bottom division, which has nowhere lower.
 */
export function zoneFor(division: number, position: number): Zone {
  if (division > 0 && position <= 2) return 'promotion';
  if (division > 0 && position <= 4) return 'playoff';
  if (division < DIVISION_COUNT - 1 && position > CLUBS_PER_DIVISION - 3) return 'relegation';
  return 'none';
}

/**
 * True once the leader cannot be caught: their lead over second place is bigger than the points second
 * could still win. A tie on points is not enough, since the tie-breaks could still go either way.
 */
export function isChampionConfirmed(table: readonly StandingRow[], matchesPerSeason = MATCHES_PER_SEASON): boolean {
  const [leader, second] = table;
  if (!leader || !second) return false;
  const secondRemaining = Math.max(0, matchesPerSeason - second.played);
  return leader.points - second.points > secondRemaining * 3;
}

/** The champions once every club has played every match, or earlier if the title is already won. */
export function champion(table: readonly StandingRow[], matchesPerSeason = MATCHES_PER_SEASON): string | null {
  const leader = table[0];
  if (!leader) return null;
  const finished = table.every((r) => r.played >= matchesPerSeason);
  return finished || isChampionConfirmed(table, matchesPerSeason) ? leader.clubId : null;
}
