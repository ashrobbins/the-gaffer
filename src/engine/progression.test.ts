import { describe, expect, it } from 'vitest';
import { defaultTeamSheet } from './formations';
import { createMatch, finishMatch, playToEnd } from './match';
import {
  addGrowth,
  applyMatchProgression,
  endOfSeasonProgression,
  formTarget,
  moodTarget,
  performanceRating,
  recoverBetweenMatches,
  recoveredFatigue,
  rollAiInjuries,
} from './progression';
import { createRng } from './rng';
import { generateWorld } from './worldgen';
import type { Player, World } from './types';

const world0 = generateWorld(221);
const [homeId, awayId] = [world0.divisions[3]![0]!, world0.divisions[3]![1]!];

const play = (w: World, seed: number) => {
  const s = createMatch(w, homeId, defaultTeamSheet(w, homeId), awayId, defaultTeamSheet(w, awayId));
  const rng = createRng(seed);
  playToEnd(w, s, rng);
  finishMatch(w, s);
  applyMatchProgression(w, s, rng);
  recoverBetweenMatches(w);
  return s;
};

const striker = (): Player => ({ ...(world0.players[world0.clubs[homeId]!.playerIds[16]!] as Player) });

describe('performanceRating', () => {
  const rng = () => createRng(1);
  const base = { minutes: 90, goals: 0, yellowCards: 0, redCards: 0 };

  it('is about 6 for an ordinary draw', () => {
    const r = performanceRating(striker(), base, 1, 1, rng());
    expect(r).toBeGreaterThan(5);
    expect(r).toBeLessThan(7);
  });

  it('rises with goals and a win, and falls with cards and a defeat', () => {
    const s = striker();
    const ordinary = performanceRating(s, base, 1, 1, createRng(5));
    expect(performanceRating(s, { ...base, goals: 2 }, 3, 1, createRng(5))).toBeGreaterThan(ordinary + 1.5);
    expect(performanceRating(s, { ...base, yellowCards: 1 }, 1, 1, createRng(5))).toBeLessThan(ordinary);
    expect(performanceRating(s, { ...base, redCards: 1 }, 1, 1, createRng(5))).toBeLessThan(ordinary - 1);
    expect(performanceRating(s, base, 0, 2, createRng(5))).toBeLessThan(ordinary);
  });

  it('rewards a clean sheet for defenders and keepers but not for strikers', () => {
    const cb = { ...striker(), position: 'CB' as const };
    expect(performanceRating(cb, base, 0, 0, createRng(5))).toBeGreaterThan(performanceRating(cb, base, 3, 3, createRng(5)) + 0.5);
    expect(performanceRating(striker(), base, 0, 0, createRng(5))).toBeCloseTo(performanceRating(striker(), base, 3, 3, createRng(5)), 5);
  });

  it('counts a short appearance for less, and stays between 3 and 10', () => {
    const s = striker();
    const full = performanceRating(s, { ...base, goals: 3 }, 4, 0, createRng(5));
    const cameo = performanceRating(s, { ...base, goals: 3, minutes: 10 }, 4, 0, createRng(5));
    expect(cameo).toBeLessThan(full);
    expect(full).toBeLessThanOrEqual(10);
    expect(performanceRating(s, { ...base, redCards: 2, yellowCards: 2 }, 0, 6, createRng(5))).toBeGreaterThanOrEqual(3);
  });
});

describe('formTarget', () => {
  it('maps a rating of 6.5 to 3 out of 5, and stays within 1 to 5', () => {
    expect(formTarget(6.5)).toBeCloseTo(3, 5);
    expect(formTarget(10)).toBe(5);
    expect(formTarget(3)).toBe(1);
    expect(formTarget(7.5)).toBeGreaterThan(formTarget(6.5));
  });
});

describe('addGrowth', () => {
  const p = (): Player => ({ ...(world0.players[world0.clubs[homeId]!.playerIds[3]!] as Player), ability: 70, potential: 75, growth: 0 });

  it('banks progress until it reaches 100, then adds a rating point', () => {
    const player = p();
    expect(addGrowth(player, 60)).toBe(false);
    expect(player.growth).toBe(60);
    expect(addGrowth(player, 50)).toBe(true);
    expect(player.ability).toBe(71);
    expect(player.growth).toBe(10);
  });

  it('can add more than one point at once', () => {
    const player = p();
    addGrowth(player, 250);
    expect(player.ability).toBe(72);
    expect(player.growth).toBe(50);
  });

  it('never takes a player past his potential', () => {
    const player = { ...p(), ability: 75, potential: 75 };
    expect(addGrowth(player, 500)).toBe(false);
    expect(player.ability).toBe(75);
    expect(player.growth).toBeLessThan(100);
  });
});

describe('moodTarget', () => {
  const player = (): Player => ({ ...(world0.players[world0.clubs[homeId]!.playerIds[16]!] as Player) });

  it('is high for a player in form who gets the football he expects', () => {
    const p = { ...player(), formRating: 4.5, playShare: 1 };
    expect(moodTarget(p, 1)).toBeGreaterThan(4);
  });

  it('is low for a player who expects to start and sits on the bench, however well he trains', () => {
    const p = { ...player(), formRating: 3.5, playShare: 0 };
    expect(moodTarget(p, 1)).toBeLessThan(moodTarget({ ...p, playShare: 1 }, 1) - 1.5);
  });

  it('does not mind much if a fringe player is not used', () => {
    const p = { ...player(), formRating: 3, playShare: 0.1 };
    expect(moodTarget(p, 0.2)).toBeGreaterThan(moodTarget(p, 1));
  });

  it('stays between 1 and 5', () => {
    expect(moodTarget({ ...player(), formRating: 1, playShare: 0 }, 1)).toBeGreaterThanOrEqual(1);
    expect(moodTarget({ ...player(), formRating: 5, playShare: 1 }, 0.2)).toBeLessThanOrEqual(5);
  });
});

describe('applyMatchProgression', () => {
  it('moves the form of players who played, keeps form and mood in range, and rounds the figures players show', () => {
    const w = generateWorld(221);
    play(w, 1);
    for (const p of Object.values(w.players)) {
      expect(p.formRating).toBeGreaterThanOrEqual(1);
      expect(p.formRating).toBeLessThanOrEqual(5);
      expect(p.mood).toBeGreaterThanOrEqual(1);
      expect(p.mood).toBeLessThanOrEqual(5);
      expect(p.form).toBe(Math.round(p.formRating));
      expect(p.happiness).toBe(Math.round(p.mood));
      expect(p.playShare).toBeGreaterThanOrEqual(0);
      expect(p.playShare).toBeLessThanOrEqual(1);
    }
    const starters = w.clubs[homeId]!.playerIds.filter((id) => w.players[id]!.seasonStats.starts === 1);
    expect(starters.length).toBe(11);
    expect(starters.some((id) => w.players[id]!.formRating !== 3)).toBe(true);
  });

  it('raises the playing time of those who played and lowers it for those who did not', () => {
    const w = generateWorld(221);
    play(w, 2);
    const club = w.clubs[homeId]!;
    for (const id of club.playerIds) {
      const p = w.players[id]!;
      if (p.seasonStats.starts === 1) expect(p.playShare).toBeGreaterThan(0.6);
      if (p.seasonStats.starts + p.seasonStats.subAppearances === 0) expect(p.playShare).toBeLessThan(0.6);
    }
  });

  it('makes a player who is left out for many matches unhappy, and one who plays and does well happy', () => {
    const w = generateWorld(221);
    const club = w.clubs[homeId]!;
    const best = [...club.playerIds].sort((a, b) => w.players[b]!.ability - w.players[a]!.ability)[0]!;
    const star = w.players[best]!;
    star.mood = 4;
    star.injury = { weeks: 999, kind: 'Knee' }; // never selected
    for (let i = 0; i < 25; i++) play(w, 100 + i);
    expect(star.playShare).toBeLessThan(0.05);
    expect(star.mood).toBeLessThan(3);
  });

  it('lets good performances turn into rating points over time, mostly for the young', () => {
    const w = generateWorld(221);
    const before = new Map(Object.values(w.players).map((p) => [p.id, p.ability]));
    for (let i = 0; i < 38; i++) play(w, 300 + i);
    const gains = w.clubs[homeId]!.playerIds.map((id) => w.players[id]!.ability - before.get(id)!);
    expect(gains.some((g) => g > 0)).toBe(true);
    expect(gains.every((g) => g >= 0)).toBe(true);
    expect(Math.max(...gains)).toBeLessThanOrEqual(6);
  });
});

describe('recovery', () => {
  it('brings fatigue down each week, faster for the more tired', () => {
    expect(recoveredFatigue(0)).toBe(0);
    expect(recoveredFatigue(40)).toBeLessThan(40);
    expect(40 - recoveredFatigue(40)).toBeLessThan(80 - recoveredFatigue(80));
    expect(recoveredFatigue(100)).toBeGreaterThan(40);
  });

  it('settles a regular starter at a moderate level rather than letting him collapse', () => {
    let f = 0;
    for (let i = 0; i < 30; i++) f = recoveredFatigue(Math.min(100, f + 38));
    expect(f).toBeGreaterThan(15);
    expect(f).toBeLessThan(45);
  });

  it('heals injuries by a week and clears them at the end', () => {
    const w = generateWorld(221);
    const p = w.players[w.clubs[homeId]!.playerIds[2]!]!;
    p.injury = { weeks: 2, kind: 'Ankle' };
    expect(recoverBetweenMatches(w)).not.toContain(p.id);
    expect(p.injury).toEqual({ weeks: 1, kind: 'Ankle' });
    expect(recoverBetweenMatches(w)).toContain(p.id);
    expect(p.injury).toBeNull();
  });
});

describe('rollAiInjuries', () => {
  it('hurts a few computer-club players each week, never the user players, and never twice', () => {
    const w = generateWorld(221);
    const rng = createRng(1);
    let total = 0;
    for (let week = 0; week < 20; week++) total += rollAiInjuries(w, rng).length;
    expect(total).toBeGreaterThan(40);
    expect(total).toBeLessThan(400);
    for (const id of w.clubs[w.userClubId]!.playerIds) expect(w.players[id]!.injury).toBeNull();
    for (const p of Object.values(w.players)) if (p.injury) expect(p.injury.weeks).toBeGreaterThan(0);
  });

  it('is more likely for tired players', () => {
    const count = (fatigue: number): number => {
      const w = generateWorld(221);
      for (const p of Object.values(w.players)) p.fatigue = fatigue;
      let n = 0;
      const rng = createRng(2);
      for (let i = 0; i < 5; i++) {
        n += rollAiInjuries(w, rng).length;
        for (const p of Object.values(w.players)) p.injury = null;
      }
      return n;
    };
    expect(count(95)).toBeGreaterThan(count(5) * 3);
  });
});

describe('endOfSeasonProgression', () => {
  it('makes everyone a year older and clears the season figures but not the career figures', () => {
    const w = generateWorld(222);
    play(w, 1);
    const p = w.players[w.clubs[homeId]!.playerIds[0]!]!;
    const age = p.age;
    const career = { ...p.careerStats };
    endOfSeasonProgression(w, createRng(1));
    expect(p.age).toBe(age + 1);
    expect(p.seasonStats).toEqual({ starts: 0, subAppearances: 0, goals: 0, yellowCards: 0, redCards: 0 });
    expect(p.careerStats).toEqual(career);
    expect(p.growth).toBe(0);
  });

  it('improves the young, holds the prime, and weakens the old, on average', () => {
    const w = generateWorld(222);
    const before = new Map(Object.values(w.players).map((p) => [p.id, { ability: p.ability, age: p.age }]));
    endOfSeasonProgression(w, createRng(3));
    const avgChange = (lo: number, hi: number): number => {
      const ps = Object.values(w.players).filter((p) => before.get(p.id)!.age >= lo && before.get(p.id)!.age <= hi);
      return ps.reduce((s, p) => s + (p.ability - before.get(p.id)!.ability), 0) / ps.length;
    };
    expect(avgChange(17, 21)).toBeGreaterThan(0.8);
    expect(Math.abs(avgChange(24, 28))).toBeLessThan(0.8);
    expect(avgChange(33, 36)).toBeLessThan(-0.5);
  });

  it('never takes a young player past his potential or anyone outside 38 to 95', () => {
    const w = generateWorld(222);
    for (let i = 0; i < 6; i++) endOfSeasonProgression(w, createRng(10 + i));
    for (const p of Object.values(w.players)) {
      expect(p.ability).toBeGreaterThanOrEqual(38);
      expect(p.ability).toBeLessThanOrEqual(95);
      expect(p.potential).toBeGreaterThanOrEqual(p.ability);
    }
  });

  it('updates market values to match the new ratings and ages', () => {
    const w = generateWorld(222);
    endOfSeasonProgression(w, createRng(4));
    for (const p of Object.values(w.players)) expect(p.value).toBeGreaterThan(0);
  });
});
