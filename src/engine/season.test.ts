import { describe, expect, it } from 'vitest';
import { MATCHES_PER_SEASON, ROUNDS_PER_SEASON } from './config';
import { champion } from './league';
import { createRng } from './rng';
import { clubForm, createSeason, nextFixtures, playMatchday, tableFor } from './season';
import { teamRating } from './sim';
import { generateWorld } from './worldgen';
import type { Season, World } from './types';

function playSeason(world: World, seed: number, userScore?: { homeGoals: number; awayGoals: number }): Season {
  const season = createSeason(world, createRng(seed), 2026);
  const rng = createRng(seed + 1);
  while (season.round < ROUNDS_PER_SEASON) playMatchday(world, season, rng, userScore);
  return season;
}

describe('createSeason', () => {
  it('starts at the first matchday with no results and the full calendar', () => {
    const season = createSeason(generateWorld(1), createRng(1), 2026);
    expect(season).toMatchObject({ year: 2026, round: 0, results: [] });
    expect(season.fixtures).toHaveLength(4 * 380);
  });
});

describe('playMatchday', () => {
  it('plays one match for every club in every division and moves to the next round', () => {
    const world = generateWorld(2);
    const season = createSeason(world, createRng(2), 2026);
    const results = playMatchday(world, season, createRng(3));
    expect(results).toHaveLength(40);
    expect(season.round).toBe(1);
    expect(season.results).toHaveLength(40);
    const clubs = results.flatMap((r) => [r.homeId, r.awayId]);
    expect(new Set(clubs).size).toBe(80);
  });

  it('plays the fixtures that were scheduled for that round', () => {
    const world = generateWorld(2);
    const season = createSeason(world, createRng(2), 2026);
    const scheduled = [0, 1, 2, 3].flatMap((d) => nextFixtures(season, d)).map((f) => `${f.homeId}>${f.awayId}`).sort();
    const played = playMatchday(world, season, createRng(3)).map((r) => `${r.homeId}>${r.awayId}`).sort();
    expect(played).toEqual(scheduled);
  });

  it('uses the score the user played for their own match', () => {
    const world = generateWorld(4);
    const season = createSeason(world, createRng(4), 2026);
    const results = playMatchday(world, season, createRng(5), { homeGoals: 7, awayGoals: 6 });
    const mine = results.filter((r) => r.homeId === world.userClubId || r.awayId === world.userClubId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ homeGoals: 7, awayGoals: 6 });
    expect(results.filter((r) => r.homeGoals === 7 && r.awayGoals === 6)).toHaveLength(1);
  });

  it('simulates the user match too when no score is given', () => {
    const world = generateWorld(4);
    const season = createSeason(world, createRng(4), 2026);
    const results = playMatchday(world, season, createRng(5));
    expect(results.some((r) => r.homeId === world.userClubId || r.awayId === world.userClubId)).toBe(true);
  });

  it('refuses to play past the end of the season', () => {
    const world = generateWorld(6);
    const season = playSeason(world, 6);
    expect(() => playMatchday(world, season, createRng(9))).toThrow();
  });

  it('is repeatable from the same seeds', () => {
    const a = playSeason(generateWorld(8), 8);
    const b = playSeason(generateWorld(8), 8);
    expect(a.results).toEqual(b.results);
  });
});

describe('a whole season', () => {
  const world = generateWorld(21);
  const season = playSeason(world, 21);

  it('has every club play all 38 matches', () => {
    for (let d = 0; d < 4; d++) {
      const table = tableFor(world, season, d);
      expect(table).toHaveLength(20);
      for (const row of table) expect(row.played).toBe(MATCHES_PER_SEASON);
    }
    expect(season.results).toHaveLength(4 * 380);
  });

  it('has every club play each rival home and away', () => {
    const seen = new Set(season.results.map((r) => `${r.homeId}>${r.awayId}`));
    expect(seen.size).toBe(season.results.length);
  });

  it('balances: goals for equal goals against, and each win or draw adds the right points', () => {
    for (let d = 0; d < 4; d++) {
      const table = tableFor(world, season, d);
      expect(table.reduce((s, r) => s + r.goalsFor, 0)).toBe(table.reduce((s, r) => s + r.goalsAgainst, 0));
      const draws = table.reduce((s, r) => s + r.drawn, 0) / 2;
      expect(table.reduce((s, r) => s + r.points, 0)).toBe(380 * 3 - draws);
    }
  });

  it('scores a believable number of goals', () => {
    const perGame = season.results.reduce((s, r) => s + r.homeGoals + r.awayGoals, 0) / season.results.length;
    expect(perGame).toBeGreaterThan(2.2);
    expect(perGame).toBeLessThan(3.1);
  });

  it('names a champion in every division once the season is done', () => {
    for (let d = 0; d < 4; d++) expect(champion(tableFor(world, season, d))).toBe(tableFor(world, season, d)[0]!.clubId);
  });

  it('gives the user club the right form string', () => {
    const form = clubForm(season, world.userClubId);
    expect(form).toMatch(/^[WDL]{5}$/);
    expect(clubForm(season, world.userClubId, 3)).toBe(form.slice(-3));
  });
});

describe('league quality over many seasons', () => {
  it('rewards stronger squads: final position follows rating, but far from perfectly', () => {
    let total = 0;
    let count = 0;
    for (let k = 0; k < 8; k++) {
      const world = generateWorld(300 + k);
      const season = playSeason(world, 300 + k);
      for (let d = 0; d < 4; d++) {
        const table = tableFor(world, season, d);
        const byRating = [...world.divisions[d]!].sort((a, b) => teamRating(world, b) - teamRating(world, a));
        const ratingRank = new Map(byRating.map((id, i) => [id, i]));
        const n = table.length;
        const dSquared = table.reduce((s, row, pos) => s + (pos - ratingRank.get(row.clubId)!) ** 2, 0);
        total += 1 - (6 * dSquared) / (n * (n * n - 1));
        count++;
      }
    }
    const spearman = total / count;
    expect(spearman).toBeGreaterThan(0.4);
    expect(spearman).toBeLessThan(0.85);
  });

  it('lets weaker clubs beat stronger ones sometimes, so the table is never a foregone conclusion', () => {
    const world = generateWorld(500);
    const season = playSeason(world, 500);
    const rating = (id: string): number => teamRating(world, id);
    const upsets = season.results.filter((r) => {
      const [h, a] = [rating(r.homeId), rating(r.awayId)];
      return (h < a && r.homeGoals > r.awayGoals) || (a < h && r.awayGoals > r.homeGoals);
    }).length;
    const share = upsets / season.results.length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.45);
  });
});
