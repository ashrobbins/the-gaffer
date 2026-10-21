import { ROUNDS_PER_SEASON } from './config';
import { generateFixtures } from './fixtures';
import { buildTable } from './league';
import type { Rng } from './rng';
import { creditGoals } from './scorers';
import { matchStrength, simulateScore, teamRating } from './sim';
import type { MatchResult, Season, StandingRow, World } from './types';

export function createSeason(world: World, rng: Rng, year: number): Season {
  return { year, round: 0, fixtures: generateFixtures(world, rng), results: [] };
}

export function tableFor(world: World, season: Season, division: number): StandingRow[] {
  const ids = world.divisions[division];
  if (!ids) throw new Error(`No division ${division}`);
  return buildTable(ids, season.results.filter((r) => r.division === division));
}

/** A club's last results as "W", "D" and "L", oldest first. Pass `limit` to cap the length. */
export function clubForm(season: Season, clubId: string, limit = 5): string {
  const mine = season.results
    .filter((r) => r.homeId === clubId || r.awayId === clubId)
    .sort((a, b) => a.round - b.round);
  return mine
    .slice(-limit)
    .map((r) => {
      const [gf, ga] = r.homeId === clubId ? [r.homeGoals, r.awayGoals] : [r.awayGoals, r.homeGoals];
      return gf > ga ? 'W' : gf === ga ? 'D' : 'L';
    })
    .join('');
}

/** The next matchday's fixtures in one division. */
export function nextFixtures(season: Season, division: number) {
  return season.fixtures.filter((f) => f.division === division && f.round === season.round);
}

export interface UserScore {
  /** Goals scored by the home side of the user's fixture. */
  homeGoals: number;
  awayGoals: number;
}

/**
 * Plays the next matchday in every division and moves the season on a round. Every match is simulated
 * from each club's rating, recent form and league position, except the user's own match if
 * `userScore` is given (it is the score the user actually played). Mutates `season` and returns the new results.
 */
export function playMatchday(world: World, season: Season, rng: Rng, userScore?: UserScore): MatchResult[] {
  if (season.round >= ROUNDS_PER_SEASON) throw new Error('The season is over');
  const played: MatchResult[] = [];

  world.divisions.forEach((clubIds, division) => {
    // Positions are taken before this round's results, so all matches in a round see the same table.
    const position = new Map(buildTable(clubIds, season.results.filter((r) => r.division === division)).map((row, i) => [row.clubId, i + 1]));
    const strength = (clubId: string): number =>
      matchStrength(teamRating(world, clubId), clubForm(season, clubId), position.get(clubId) ?? 10, clubIds.length);

    for (const f of nextFixtures(season, division)) {
      const isUserMatch = world.clubs[f.homeId]?.isUser || world.clubs[f.awayId]?.isUser;
      const score =
        isUserMatch && userScore ? userScore : simulateScore(strength(f.homeId), strength(f.awayId), rng);
      played.push({ division, round: f.round, homeId: f.homeId, awayId: f.awayId, homeGoals: score.homeGoals, awayGoals: score.awayGoals });
      // The user's goals are credited by the match itself. Everyone else's go to players here.
      if (!isUserMatch) {
        creditGoals(world, f.homeId, score.homeGoals, world.seed + f.round * 7919 + division * 104729 + 1);
        creditGoals(world, f.awayId, score.awayGoals, world.seed + f.round * 7919 + division * 104729 + 2);
      }
    }
  });

  season.results.push(...played);
  season.round++;
  return played;
}
