import { describe, expect, it } from 'vitest';
import { shootout, shootoutKicks } from './knockout';
import { createRng } from './rng';

describe('shootoutKicks', () => {
  it('is never level, and the score matches the kicks', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { kicks, score } = shootoutKicks(createRng(seed), 70, 70);
      expect(score[0]).not.toBe(score[1]);
      expect(kicks.filter((k) => k.side === 'home' && k.scored)).toHaveLength(score[0]);
      expect(kicks.filter((k) => k.side === 'away' && k.scored)).toHaveLength(score[1]);
    }
  });

  it('alternates sides, home first', () => {
    const { kicks } = shootoutKicks(createRng(4), 70, 70);
    kicks.forEach((k, i) => expect(k.side).toBe(i % 2 === 0 ? 'home' : 'away'));
  });

  it('stops as soon as one side cannot be caught, and never before', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { kicks } = shootoutKicks(createRng(seed), 70, 70);
      if (kicks.length <= 10) {
        // The last kick is the one that settled it: before it, the match was still alive.
        const before = kicks.slice(0, -1);
        const h = before.filter((k) => k.side === 'home');
        const a = before.filter((k) => k.side === 'away');
        const hs = h.filter((k) => k.scored).length;
        const as = a.filter((k) => k.scored).length;
        const alive = !(hs > as + (5 - a.length) || as > hs + (5 - h.length));
        expect(alive || before.length >= 10).toBe(true);
      }
      expect(kicks.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('goes to sudden death in pairs after five each when level', () => {
    let found = false;
    for (let seed = 1; seed <= 2000 && !found; seed++) {
      const { kicks } = shootoutKicks(createRng(seed), 70, 70);
      if (kicks.length > 10) {
        found = true;
        expect(kicks.length % 2).toBe(0);
      }
    }
    expect(found).toBe(true);
  });

  it('gives a slightly better chance to the stronger side', () => {
    let strong = 0;
    for (let seed = 1; seed <= 4000; seed++) if (shootoutKicks(createRng(seed), 90, 50).score[0] > shootoutKicks(createRng(seed), 90, 50).score[1]) strong++;
    expect(strong / 4000).toBeGreaterThan(0.5);
  });

  it('is what the quick shootout uses', () => {
    expect(shootout(createRng(9), 70, 70)).toEqual(shootoutKicks(createRng(9), 70, 70).score);
  });
});
