/** Seeded random numbers. The whole engine draws from this so a seed always rebuilds the same world. */
export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max], both included. */
  int(min: number, max: number): number;
  /** True with the given probability. */
  chance(p: number): boolean;
  /** One item of a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** A new array in random order. */
  shuffle<T>(items: readonly T[]): T[];
  /** Normally distributed number. */
  normal(mean: number, sd: number): number;
  /** The current internal state. `createRng(state)` carries on from exactly here, which saves rely on. */
  state(): number;
}

/** mulberry32: small, fast and good enough for a game. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));

  return {
    next,
    int,
    state: () => a,
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick() needs at least one item');
      return items[int(0, items.length - 1)] as T;
    },
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    },
    normal: (mean, sd) => {
      // Box-Muller
      const u = 1 - next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}
