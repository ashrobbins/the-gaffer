import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 10 }, () => a.next())).toEqual(Array.from({ length: 10 }, () => b.next()));
  });

  it('gives different sequences for different seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('keeps next() in [0, 1) and int() inside its bounds', () => {
    const rng = createRng(7);
    for (let i = 0; i < 2000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.int(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('shuffles without losing or adding items, and does not touch the input', () => {
    const rng = createRng(9);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = rng.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it('produces a normal distribution around the requested mean', () => {
    const rng = createRng(11);
    const n = 5000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += rng.normal(50, 5);
    expect(sum / n).toBeGreaterThan(49.5);
    expect(sum / n).toBeLessThan(50.5);
  });

  it('throws when asked to pick from nothing', () => {
    expect(() => createRng(1).pick([])).toThrow();
  });
});

describe('rng state', () => {
  it('carries on from a saved state exactly', () => {
    const a = createRng(123);
    for (let i = 0; i < 17; i++) a.next();
    const b = createRng(a.state());
    expect(Array.from({ length: 8 }, () => a.next())).toEqual(Array.from({ length: 8 }, () => b.next()));
  });
});
