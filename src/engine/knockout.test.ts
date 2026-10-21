import { describe, expect, it } from 'vitest';
import { cupStrength, playKnockout, shootout } from './knockout';
import { createRng } from './rng';
import { createSeason } from './season';
import { generateWorld } from './worldgen';

const world = generateWorld(31);
const season = createSeason(world, createRng(1), 2026);
const [home, away] = [world.divisions[0]![0]!, world.divisions[3]![0]!];

describe('shootout', () => {
  it('is never level, and scores are whole numbers from 0 to 5 or more in sudden death', () => {
    const rng = createRng(2);
    for (let i = 0; i < 500; i++) {
      const [h, a] = shootout(rng, 70, 70);
      expect(h).not.toBe(a);
      expect(Number.isInteger(h) && Number.isInteger(a)).toBe(true);
      expect(Math.min(h, a)).toBeGreaterThanOrEqual(0);
    }
  });

  it('is close to a coin flip between equal sides, and tilts only slightly towards a stronger one', () => {
    const rng = createRng(3);
    const share = (hs: number, as: number): number => {
      let wins = 0;
      for (let i = 0; i < 6000; i++) {
        const [h, a] = shootout(rng, hs, as);
        if (h > a) wins++;
      }
      return wins / 6000;
    };
    expect(share(70, 70)).toBeGreaterThan(0.46);
    expect(share(70, 70)).toBeLessThan(0.54);
    expect(share(95, 60)).toBeGreaterThan(share(70, 70));
    expect(share(95, 60)).toBeLessThan(0.62);
  });
});

describe('playKnockout', () => {
  it('always produces a winner who is one of the two clubs', () => {
    const rng = createRng(4);
    for (let i = 0; i < 300; i++) {
      const r = playKnockout(world, season, home, away, rng);
      expect([home, away]).toContain(r.winnerId);
      if (r.homeGoals !== r.awayGoals) {
        expect(r.penalties).toBeNull();
        expect(r.winnerId).toBe(r.homeGoals > r.awayGoals ? home : away);
      } else {
        expect(r.penalties).not.toBeNull();
        const [h, a] = r.penalties!;
        expect(r.winnerId).toBe(h > a ? home : away);
      }
    }
  });

  it('settles level matches by shoot-out, and only level matches', () => {
    const rng = createRng(5);
    let level = 0;
    for (let i = 0; i < 500; i++) {
      const r = playKnockout(world, season, home, home === away ? home : world.divisions[0]![1]!, rng);
      if (r.homeGoals === r.awayGoals) level++;
    }
    expect(level).toBeGreaterThan(40);
    expect(level).toBeLessThan(300);
  });

  it('uses the score the user played', () => {
    const r = playKnockout(world, season, home, away, createRng(6), { homeGoals: 0, awayGoals: 1 });
    expect(r).toMatchObject({ homeGoals: 0, awayGoals: 1, penalties: null, winnerId: away });
  });

  it('uses the user shoot-out score when the played match was level', () => {
    const r = playKnockout(world, season, home, away, createRng(6), { homeGoals: 2, awayGoals: 2, penalties: [3, 4] });
    expect(r).toMatchObject({ penalties: [3, 4], winnerId: away });
  });

  it('simulates a shoot-out if the user match was level and no shoot-out score is given', () => {
    const r = playKnockout(world, season, home, away, createRng(7), { homeGoals: 1, awayGoals: 1 });
    expect(r.penalties).not.toBeNull();
    expect(r.penalties![0]).not.toBe(r.penalties![1]);
  });

  it('rejects a level shoot-out', () => {
    expect(() => playKnockout(world, season, home, away, createRng(8), { homeGoals: 1, awayGoals: 1, penalties: [4, 4] })).toThrow();
  });

  it('makes the top-division club a heavy favourite over a bottom-division one', () => {
    const rng = createRng(9);
    let wins = 0;
    for (let i = 0; i < 1000; i++) if (playKnockout(world, season, home, away, rng).winnerId === home) wins++;
    expect(wins / 1000).toBeGreaterThan(0.8);
    expect(wins / 1000).toBeLessThan(0.999);
  });
});

describe('cupStrength', () => {
  it('is higher for a club in a better division', () => {
    expect(cupStrength(world, season, home)).toBeGreaterThan(cupStrength(world, season, away));
  });
});
