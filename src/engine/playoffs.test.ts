import { describe, expect, it } from 'vitest';
import { ROUNDS_PER_SEASON } from './config';
import { createRng } from './rng';
import { createSeason, playMatchday, tableFor } from './season';
import { playoffPairing, playPlayoffs } from './playoffs';
import { generateWorld } from './worldgen';
import type { Season, World } from './types';

function finishedSeason(worldSeed: number): { world: World; season: Season } {
  const world = generateWorld(worldSeed);
  const season = createSeason(world, createRng(worldSeed), 2026);
  const rng = createRng(worldSeed + 1);
  while (season.round < ROUNDS_PER_SEASON) playMatchday(world, season, rng);
  return { world, season };
}

/** Makes `clubId` the user's club instead, so a test can put the user in a chosen match. */
function makeUser(world: World, clubId: string): void {
  for (const c of Object.values(world.clubs)) c.isUser = c.id === clubId;
  world.userClubId = clubId;
}

describe('playoffPairing', () => {
  const { world, season } = finishedSeason(51);

  it('pairs 3rd (at home) with 4th in Divisions Two, Three and Four', () => {
    for (const d of [1, 2, 3]) {
      const table = tableFor(world, season, d);
      expect(playoffPairing(world, season, d)).toEqual({ homeId: table[2]!.clubId, awayId: table[3]!.clubId });
    }
  });

  it('has no play-off in Division One', () => {
    expect(playoffPairing(world, season, 0)).toBeNull();
  });
});

describe('playPlayoffs', () => {
  const { world, season } = finishedSeason(51);

  it('refuses to run before the league season is over', () => {
    const w = generateWorld(52);
    const s = createSeason(w, createRng(1), 2026);
    expect(() => playPlayoffs(w, s, createRng(2))).toThrow();
  });

  it('plays one final in each of Divisions Two, Three and Four, between 3rd and 4th', () => {
    const finals = playPlayoffs(world, season, createRng(3));
    expect(finals.map((f) => f.division)).toEqual([1, 2, 3]);
    for (const f of finals) {
      const table = tableFor(world, season, f.division);
      expect(f.homeId).toBe(table[2]!.clubId);
      expect(f.awayId).toBe(table[3]!.clubId);
    }
  });

  it('always has a winner, with a shoot-out only after a draw', () => {
    for (let k = 0; k < 60; k++) {
      for (const f of playPlayoffs(world, season, createRng(k))) {
        expect([f.homeId, f.awayId]).toContain(f.winnerId);
        if (f.homeGoals === f.awayGoals) {
          expect(f.penalties).not.toBeNull();
          expect(f.winnerId).toBe(f.penalties![0] > f.penalties![1] ? f.homeId : f.awayId);
        } else {
          expect(f.penalties).toBeNull();
          expect(f.winnerId).toBe(f.homeGoals > f.awayGoals ? f.homeId : f.awayId);
        }
      }
    }
  });

  it('is repeatable from the same seed', () => {
    expect(playPlayoffs(world, season, createRng(9))).toEqual(playPlayoffs(world, season, createRng(9)));
  });

  it('is a close contest: neither side wins nearly all of them', () => {
    let home = 0;
    let total = 0;
    for (let k = 0; k < 150; k++) {
      for (const f of playPlayoffs(world, season, createRng(500 + k))) {
        total++;
        if (f.winnerId === f.homeId) home++;
      }
    }
    expect(home / total).toBeGreaterThan(0.4);
    expect(home / total).toBeLessThan(0.75);
  });

  it('uses the score the user played in their own final', () => {
    const w = generateWorld(51);
    const s = createSeason(w, createRng(51), 2026);
    const rng = createRng(52);
    while (s.round < ROUNDS_PER_SEASON) playMatchday(w, s, rng);
    const fourth = tableFor(w, s, 2)[3]!.clubId;
    makeUser(w, fourth);
    const finals = playPlayoffs(w, s, createRng(4), { homeGoals: 0, awayGoals: 4 });
    const mine = finals.find((f) => f.division === 2)!;
    expect(mine).toMatchObject({ homeGoals: 0, awayGoals: 4, winnerId: fourth });
    // The other divisions' finals were simulated, not given the user's score.
    expect(finals.filter((f) => f.homeGoals === 0 && f.awayGoals === 4).length).toBeLessThanOrEqual(2);
  });
});
