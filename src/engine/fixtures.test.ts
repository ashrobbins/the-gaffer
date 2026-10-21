import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { doubleRoundRobin, generateFixtures, singleRoundRobin } from './fixtures';
import { ROUNDS_PER_SEASON } from './config';
import { generateWorld } from './worldgen';

const ids = Array.from({ length: 20 }, (_, i) => `c${i}`);

describe('singleRoundRobin', () => {
  const rounds = singleRoundRobin(ids);

  it('has 19 rounds of 10 matches', () => {
    expect(rounds).toHaveLength(19);
    for (const r of rounds) expect(r).toHaveLength(10);
  });

  it('has every club play exactly once in every round', () => {
    for (const r of rounds) {
      const seen = r.flat();
      expect(new Set(seen).size).toBe(20);
    }
  });

  it('has every pair of clubs meet exactly once', () => {
    const pairs = rounds.flat().map(([h, a]) => [h, a].sort().join('|'));
    expect(new Set(pairs).size).toBe(190);
    expect(pairs).toHaveLength(190);
  });

  it('keeps home games close to half for every club', () => {
    for (const id of ids) {
      const homes = rounds.filter((r) => r.some(([h]) => h === id)).length;
      expect(homes).toBeGreaterThanOrEqual(9);
      expect(homes).toBeLessThanOrEqual(10);
    }
  });

  it('rejects an odd number of clubs', () => {
    expect(() => singleRoundRobin(['a', 'b', 'c'])).toThrow();
  });
});

describe('doubleRoundRobin', () => {
  const rounds = doubleRoundRobin(ids);

  it('has 38 rounds', () => {
    expect(rounds).toHaveLength(38);
  });

  it('has every club play each rival once at home and once away', () => {
    const seen = new Set(rounds.flat().map(([h, a]) => `${h}>${a}`));
    expect(seen.size).toBe(380);
    for (const h of ids) for (const a of ids) if (h !== a) expect(seen.has(`${h}>${a}`)).toBe(true);
  });

  it('gives every club exactly 19 home and 19 away matches', () => {
    for (const id of ids) {
      const home = rounds.flat().filter(([h]) => h === id).length;
      const away = rounds.flat().filter(([, a]) => a === id).length;
      expect([home, away]).toEqual([19, 19]);
    }
  });

  it('replays the first half with venues swapped, in reverse order', () => {
    for (let r = 0; r < 19; r++) {
      expect(rounds[37 - r]).toEqual(rounds[r]!.map(([h, a]) => [a, h]));
    }
  });

  it('never gives a club more than three home or three away matches in a row, including across the middle of the season', () => {
    for (const id of ids) {
      let run = 0;
      let last = '';
      for (const round of rounds) {
        const f = round.find((p) => p.includes(id))!;
        const side = f[0] === id ? 'H' : 'A';
        run = side === last ? run + 1 : 1;
        last = side;
        expect(run).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('generateFixtures', () => {
  const world = generateWorld(3);
  const fixtures = generateFixtures(world, createRng(1));

  it('covers every division for every round', () => {
    expect(fixtures).toHaveLength(4 * 380);
    for (let d = 0; d < 4; d++) {
      for (let r = 0; r < ROUNDS_PER_SEASON; r++) {
        expect(fixtures.filter((f) => f.division === d && f.round === r)).toHaveLength(10);
      }
    }
  });

  it('only pairs clubs from the same division', () => {
    for (const f of fixtures) {
      expect(world.clubs[f.homeId]!.division).toBe(f.division);
      expect(world.clubs[f.awayId]!.division).toBe(f.division);
    }
  });

  it('is repeatable but differs from season to season', () => {
    expect(generateFixtures(world, createRng(1))).toEqual(fixtures);
    expect(generateFixtures(world, createRng(2))).not.toEqual(fixtures);
  });
});
