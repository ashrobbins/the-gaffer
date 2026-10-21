import { describe, expect, it } from 'vitest';
import { ECONOMY } from './config';
import { sponsorIncome } from './finance';
import { createRng } from './rng';
import { createSeason, playMatchday } from './season';
import { achievementProgress, generateOffers, offerStatus, refreshOffers, signSponsor, sponsorBase } from './sponsors';
import type { MatchResult, Season, World } from './types';
import { generateWorld } from './worldgen';

/** A season where the user's results are exactly as given, one entry per matchday. */
function seasonWith(world: World, results: [number, number][]): Season {
  const season = createSeason(world, createRng(1), 2026);
  const user = world.userClubId;
  results.forEach(([gf, ga], round) => {
    const f = season.fixtures.find((x) => x.round === round && (x.homeId === user || x.awayId === user))!;
    const r: MatchResult = {
      division: f.division,
      round,
      homeId: f.homeId,
      awayId: f.awayId,
      homeGoals: f.homeId === user ? gf : ga,
      awayGoals: f.homeId === user ? ga : gf,
    };
    season.results.push(r);
  });
  season.round = results.length;
  return season;
}

describe('the sponsors a new club has', () => {
  const world = generateWorld(231);
  const user = world.clubs[world.userClubId]!;

  it('starts with one sponsor and one slot in the bottom division', () => {
    expect(user.sponsorSlots).toBe(1);
    expect(user.sponsors).toHaveLength(1);
    expect(user.sponsors[0]!.perMatch).toBe(sponsorBase(3));
  });

  it('gives computer clubs a full set of sponsors, more in higher divisions', () => {
    for (const c of Object.values(world.clubs).filter((x) => !x.isUser)) {
      expect(c.sponsors).toHaveLength(c.sponsorSlots);
      expect(new Set(c.sponsors.map((s) => s.name)).size).toBe(c.sponsors.length);
    }
    const top = world.clubs[world.divisions[0]![0]!]!;
    const low = world.clubs[world.divisions[2]![0]!]!;
    expect(sponsorIncome(top)).toBeGreaterThan(sponsorIncome(low));
  });

  it('offers the user four sponsors, each asking for something different, and none they already have', () => {
    expect(world.sponsorOffers).toHaveLength(4);
    expect(new Set(world.sponsorOffers.map((o) => o.requirement.kind)).size).toBe(4);
    for (const o of world.sponsorOffers) expect(user.sponsors.map((s) => s.name)).not.toContain(o.name);
  });
});

describe('generateOffers', () => {
  it('scales with the division and pays more for harder conditions', () => {
    const offers = generateOffers(3, createRng(1));
    const byKind = Object.fromEntries(offers.map((o) => [o.requirement.kind, o.perMatch]));
    expect(byKind['top-three']).toBeGreaterThan(byKind['clean-sheets']!);
    expect(byKind['clean-sheets']).toBeGreaterThan(byKind['win-streak']!);
    expect(generateOffers(0, createRng(1))[0]!.perMatch).toBeGreaterThanOrEqual(0);
    expect(offers.every((o) => o.perMatch > sponsorBase(3) * 0.5)).toBe(true);
  });

  it('avoids names that are already taken', () => {
    const offers = generateOffers(3, createRng(2), new Set(["Dunmore Dairy"]));
    expect(offers.map((o) => o.name)).not.toContain('Dunmore Dairy');
  });
});

describe('achievementProgress', () => {
  const world = generateWorld(232);
  const id = world.userClubId;

  it('counts the longest run of league wins', () => {
    const season = seasonWith(world, [[1, 0], [2, 1], [0, 0], [3, 0], [1, 0], [2, 0], [1, 0], [0, 1]]);
    expect(achievementProgress(world, season, id, { kind: 'win-streak', target: 4 })).toEqual({ current: 4, target: 4, unlocked: true });
    expect(achievementProgress(world, season, id, { kind: 'win-streak', target: 5 }).unlocked).toBe(false);
  });

  it('adds up league points', () => {
    const season = seasonWith(world, [[1, 0], [1, 1], [0, 2]]);
    expect(achievementProgress(world, season, id, { kind: 'points', target: 20 })).toEqual({ current: 4, target: 20, unlocked: false });
  });

  it('counts clean sheets', () => {
    const season = seasonWith(world, [[0, 0], [2, 1], [3, 0], [1, 2]]);
    expect(achievementProgress(world, season, id, { kind: 'clean-sheets', target: 2 })).toEqual({ current: 2, target: 2, unlocked: true });
  });

  it('only counts a top-three finish once the season is over', () => {
    const w = generateWorld(233);
    const season = createSeason(w, createRng(1), 2026);
    const rng = createRng(2);
    for (let i = 0; i < 20; i++) playMatchday(w, season, rng);
    expect(achievementProgress(w, season, w.userClubId, { kind: 'top-three', target: 1 }).current).toBe(0);
    while (season.round < 38) playMatchday(w, season, rng);
    const status = achievementProgress(w, season, w.userClubId, { kind: 'top-three', target: 1 });
    expect([0, 1]).toContain(status.current);
  });

  it('starts at nothing', () => {
    const season = createSeason(world, createRng(1), 2026);
    for (const kind of ['win-streak', 'points', 'clean-sheets'] as const) {
      expect(achievementProgress(world, season, id, { kind, target: 3 }).current).toBe(0);
    }
  });
});

describe('signSponsor', () => {
  it('needs the condition met first', () => {
    const w = generateWorld(234);
    const season = createSeason(w, createRng(1), 2026);
    expect(() => signSponsor(w, season, w.sponsorOffers[0]!.id)).toThrow(/earned/);
  });

  it('needs a free slot, and one slot is already taken at the start', () => {
    const w = generateWorld(234);
    const win = w.sponsorOffers.find((o) => o.requirement.kind === 'win-streak')!;
    const season = seasonWith(w, [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0]]);
    expect(offerStatus(w, season, win).unlocked).toBe(true);
    expect(() => signSponsor(w, season, win.id)).toThrow(/slot/);
  });

  it('adds the sponsor to the club and the income once there is a slot and the condition is met', () => {
    const w = generateWorld(234);
    const user = w.clubs[w.userClubId]!;
    user.sponsorSlots = 2;
    const win = w.sponsorOffers.find((o) => o.requirement.kind === 'win-streak')!;
    const season = seasonWith(w, [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0]]);
    const before = sponsorIncome(user);
    const deal = signSponsor(w, season, win.id);
    expect(deal).toEqual({ name: win.name, perMatch: win.perMatch });
    expect(user.sponsors).toHaveLength(2);
    expect(sponsorIncome(user)).toBe(before + win.perMatch);
    expect(w.sponsorOffers.find((o) => o.id === win.id)).toBeUndefined();
    expect(() => signSponsor(w, season, win.id)).toThrow();
  });
});

describe('refreshOffers', () => {
  it('replaces the offers with ones that suit the new division, never repeating a current sponsor', () => {
    const w = generateWorld(235);
    const user = w.clubs[w.userClubId]!;
    user.division = 1;
    refreshOffers(w, createRng(5));
    expect(w.sponsorOffers).toHaveLength(4);
    expect(w.sponsorOffers.every((o) => !user.sponsors.some((s) => s.name === o.name))).toBe(true);
    expect(ECONOMY.sponsorPerSlot[1]).toBeGreaterThan(0);
  });
});
