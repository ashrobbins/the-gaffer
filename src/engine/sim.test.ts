import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { expectedGoals, formScore, matchStrength, poisson, simulateScore, teamRating } from './sim';
import { generateWorld } from './worldgen';

/** Plays one fixture many times and reports how often each result happens. */
function odds(homeStrength: number, awayStrength: number, n = 20000, seed = 5) {
  const rng = createRng(seed);
  let home = 0;
  let draw = 0;
  let away = 0;
  let goals = 0;
  for (let i = 0; i < n; i++) {
    const s = simulateScore(homeStrength, awayStrength, rng);
    goals += s.homeGoals + s.awayGoals;
    if (s.homeGoals > s.awayGoals) home++;
    else if (s.homeGoals < s.awayGoals) away++;
    else draw++;
  }
  return { home: home / n, draw: draw / n, away: away / n, goals: goals / n };
}

describe('poisson', () => {
  it('averages the requested number of goals', () => {
    const rng = createRng(3);
    const n = 20000;
    let total = 0;
    for (let i = 0; i < n; i++) total += poisson(rng, 1.4);
    expect(total / n).toBeGreaterThan(1.35);
    expect(total / n).toBeLessThan(1.45);
  });

  it('never returns a negative or fractional number', () => {
    const rng = createRng(4);
    for (let i = 0; i < 1000; i++) {
      const g = poisson(rng, 2);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(g)).toBe(true);
    }
  });
});

describe('formScore', () => {
  it('runs from -3.5 for five defeats to +3.5 for five wins', () => {
    expect(formScore('LLLLL')).toBe(-2.5);
    expect(formScore('WWWWW')).toBe(2.5);
    expect(formScore('DDDDD')).toBe(0);
  });

  it('only looks at the last five results and treats no results as neutral', () => {
    expect(formScore('LLLLLWWWWW')).toBe(formScore('WWWWW'));
    expect(formScore('')).toBe(0);
  });

  it('scales a short run so one win is not treated as a poor start', () => {
    expect(formScore('W')).toBeGreaterThan(0);
    expect(formScore('L')).toBeLessThan(0);
  });
});

describe('matchStrength', () => {
  it('rises with rating, form and a higher league position', () => {
    const base = matchStrength(70, 'DDDDD', 10, 20);
    expect(matchStrength(75, 'DDDDD', 10, 20)).toBeGreaterThan(base);
    expect(matchStrength(70, 'WWWWW', 10, 20)).toBeGreaterThan(base);
    expect(matchStrength(70, 'DDDDD', 1, 20)).toBeGreaterThan(base);
    expect(matchStrength(70, 'LLLLL', 20, 20)).toBeLessThan(base);
  });
});

describe('expectedGoals', () => {
  it('favours the home side when strengths are equal', () => {
    const xg = expectedGoals(70, 70);
    expect(xg.home).toBeGreaterThan(xg.away);
  });

  it('gives the stronger side more goals and the weaker side fewer', () => {
    const even = expectedGoals(70, 70);
    const lopsided = expectedGoals(80, 65);
    expect(lopsided.home).toBeGreaterThan(even.home);
    expect(lopsided.away).toBeLessThan(even.away);
  });

  it('stays finite however big the gap', () => {
    const xg = expectedGoals(1000, 0);
    expect(Number.isFinite(xg.home)).toBe(true);
    expect(xg.away).toBeGreaterThan(0);
  });
});

describe('simulateScore: results look like football', () => {
  it('gives the home side an edge between equal teams, with plenty of draws and about 2.5 goals a game', () => {
    const o = odds(70, 70);
    expect(o.home).toBeGreaterThan(o.away);
    expect(o.home).toBeGreaterThan(0.45);
    expect(o.home).toBeLessThan(0.6);
    expect(o.draw).toBeGreaterThan(0.2);
    expect(o.draw).toBeLessThan(0.32);
    expect(o.goals).toBeGreaterThan(2.2);
    expect(o.goals).toBeLessThan(2.8);
  });

  it('makes the top club a big favourite at home to the bottom club, but not a certainty', () => {
    const top = matchStrength(78, 'WWWWW', 1, 20);
    const bottom = matchStrength(66, 'LLLLL', 20, 20);
    const o = odds(top, bottom);
    expect(o.home).toBeGreaterThan(0.85);
    expect(o.away).toBeGreaterThan(0.002);
    expect(o.away).toBeLessThan(0.05);
  });

  it('lets the bottom club beat the top club at home now and then (roughly 4% to 12%)', () => {
    const top = matchStrength(78, 'WWWWW', 1, 20);
    const bottom = matchStrength(66, 'LLLLL', 20, 20);
    const o = odds(bottom, top);
    expect(o.home).toBeGreaterThan(0.03);
    expect(o.home).toBeLessThan(0.12);
    expect(o.away).toBeGreaterThan(o.home);
  });

  it('keeps results close for neighbours in the table', () => {
    const o = odds(matchStrength(70, 'WDLWD', 9, 20), matchStrength(70, 'WDLWD', 10, 20));
    expect(o.home).toBeLessThan(0.58);
    expect(o.away).toBeGreaterThan(0.18);
  });
});

describe('teamRating', () => {
  const world = generateWorld(11);

  it('is the mean of the best goalkeeper and the best ten outfield players', () => {
    const id = world.divisions[0]![0]!;
    const players = world.clubs[id]!.playerIds.map((p) => world.players[p]!);
    const gk = Math.max(...players.filter((p) => p.position === 'GK').map((p) => p.ability));
    const out = players
      .filter((p) => p.position !== 'GK')
      .map((p) => p.ability)
      .sort((a, b) => b - a)
      .slice(0, 10);
    expect(teamRating(world, id)).toBeCloseTo((gk + out.reduce((a, b) => a + b, 0)) / 11, 10);
  });

  it('drops when the best player is injured', () => {
    const id = world.divisions[1]![0]!;
    const before = teamRating(world, id);
    const best = world.clubs[id]!.playerIds
      .map((p) => world.players[p]!)
      .filter((p) => p.position !== 'GK')
      .sort((a, b) => b.ability - a.ability)[0]!;
    best.injury = { weeks: 4, kind: 'Hamstring' };
    expect(teamRating(world, id)).toBeLessThan(before);
    best.injury = null;
    expect(teamRating(world, id)).toBeCloseTo(before, 10);
  });

  it('throws for a club that does not exist', () => {
    expect(() => teamRating(world, 'nope')).toThrow();
  });
});
