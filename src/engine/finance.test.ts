import { describe, expect, it } from 'vitest';
import { ECONOMY } from './config';
import {
  adjustFanBase,
  attendance,
  buildCost,
  demandFactor,
  extraGatePerHomeMatch,
  fanBaseAfterSeason,
  processCupFinances,
  processMatchdayFinances,
  progressBuild,
  runningCosts,
  sponsorIncome,
  startStadiumBuild,
  wageBill,
  weeklyProjection,
} from './finance';
import { createRng } from './rng';
import { createSeason, playMatchday } from './season';
import { generateWorld } from './worldgen';

const fresh = () => {
  const world = generateWorld(201);
  return { world, user: world.clubs[world.userClubId]!, season: createSeason(world, createRng(1), 2026) };
};

describe('wages, sponsors and running costs', () => {
  const { world, user } = fresh();

  it('adds up every player wage into the weekly bill', () => {
    const expected = user.playerIds.reduce((s, id) => s + world.players[id]!.wage, 0);
    expect(wageBill(world, user.id)).toBe(expected);
    expect(expected).toBeGreaterThan(10000);
  });

  it('pays sponsors for every match, adding the deals together', () => {
    expect(sponsorIncome(user)).toBe(4000);
    expect(sponsorIncome({ ...user, sponsors: [...user.sponsors, { name: 'X', perMatch: 1500 }] })).toBe(5500);
  });

  it('charges upkeep in proportion to the size of the ground', () => {
    expect(runningCosts(user)).toBe(Math.round(4200 * ECONOMY.runningCostPerSeat));
    expect(runningCosts({ ...user, stadium: { ...user.stadium, capacity: 8400 } })).toBe(runningCosts(user) * 2);
  });
});

describe('attendance', () => {
  const { user } = fresh();

  it('is the fan base on an ordinary day', () => {
    expect(attendance(user, '', 10.5, 20)).toBe(user.fanBase);
  });

  it('rises with good form and a high league position, and falls with poor form and a low one', () => {
    const base = demandFactor('DDDDD', 10.5, 20);
    expect(demandFactor('WWWWW', 10.5, 20)).toBeGreaterThan(base);
    expect(demandFactor('LLLLL', 10.5, 20)).toBeLessThan(base);
    expect(demandFactor('DDDDD', 1, 20)).toBeGreaterThan(base);
    expect(demandFactor('DDDDD', 20, 20)).toBeLessThan(base);
  });

  it('can never be more than the ground holds, however popular the club is', () => {
    const popular = { ...user, fanBase: 99999 };
    expect(attendance(popular, 'WWWWW', 1, 20)).toBe(user.stadium.capacity);
  });

  it('never drops far below the fan base', () => {
    expect(attendance(user, 'LLLLL', 20, 20)).toBeGreaterThan(user.fanBase * 0.7);
  });

  it('varies a little from match to match when chance is on', () => {
    const rng = createRng(1);
    const crowds = new Set(Array.from({ length: 20 }, () => attendance(user, 'DDDDD', 10, 20, rng)));
    expect(crowds.size).toBeGreaterThan(5);
  });
});

describe('processMatchdayFinances', () => {
  it('gives a home club the gate and sponsors, an away club sponsors only, and both pay wages and running costs', () => {
    const { world, season } = fresh();
    const rng = createRng(2);
    const results = playMatchday(world, season, rng);
    const cashBefore = new Map(Object.values(world.clubs).map((c) => [c.id, c.cash]));
    const lines = processMatchdayFinances(world, season, results, createRng(3));
    expect(lines).toHaveLength(80);
    const home = lines.find((l) => l.attendance !== null)!;
    const away = lines.find((l) => l.attendance === null)!;
    expect(home.gate).toBe(home.attendance! * world.clubs[home.clubId]!.ticketPrice);
    expect(away.gate).toBe(0);
    for (const l of [home, away]) {
      expect(l.sponsors).toBe(sponsorIncome(world.clubs[l.clubId]!));
      expect(l.wages).toBe(wageBill(world, l.clubId));
      expect(l.net).toBe(l.gate + l.sponsors - l.wages - l.running);
      expect(world.clubs[l.clubId]!.cash).toBe(cashBefore.get(l.clubId)! + l.net);
      expect(l.cashAfter).toBe(world.clubs[l.clubId]!.cash);
    }
  });

  it('makes the user lose money on an away match and make it on a home match', () => {
    const { world, user, season } = fresh();
    const results = playMatchday(world, season, createRng(2));
    const lines = processMatchdayFinances(world, season, results, createRng(3));
    const mine = lines.find((l) => l.clubId === user.id)!;
    if (mine.attendance === null) expect(mine.net).toBeLessThan(0);
    else expect(mine.net).toBeGreaterThan(0);
  });

  it('balances over a season for a typical club in every division: a small surplus, not a fortune or a collapse', () => {
    const world = generateWorld(202);
    const season = createSeason(world, createRng(1), 2026);
    const rng = createRng(2);
    const start = new Map(Object.values(world.clubs).map((c) => [c.id, c.cash]));
    while (season.round < 38) processMatchdayFinances(world, season, playMatchday(world, season, rng), rng);
    world.divisions.forEach((ids) => {
      const avgChange = ids.reduce((s, id) => s + world.clubs[id]!.cash - start.get(id)!, 0) / ids.length;
      const avgWages = ids.reduce((s, id) => s + wageBill(world, id), 0) / ids.length;
      expect(avgChange).toBeGreaterThan(-avgWages * 38 * 0.05);
      expect(avgChange).toBeLessThan(avgWages * 38 * 0.25);
    });
  });
});

describe('processCupFinances', () => {
  it('gives the home club a gate and both clubs their sponsors, with no wages', () => {
    const { world, season } = fresh();
    const [h, a] = [world.divisions[1]![0]!, world.divisions[2]![0]!];
    const before = [world.clubs[h]!.cash, world.clubs[a]!.cash];
    const [home, away] = processCupFinances(world, season, [{ homeId: h, awayId: a }], createRng(1));
    expect(home!.gate).toBeGreaterThan(0);
    expect(away!.gate).toBe(0);
    expect(home!.wages + away!.wages).toBe(0);
    expect(world.clubs[h]!.cash).toBe(before[0]! + home!.net);
    expect(world.clubs[a]!.cash).toBe(before[1]! + sponsorIncome(world.clubs[a]!));
  });
});

describe('weeklyProjection', () => {
  const { world, user } = fresh();

  it('compares average income with wages and running costs, so the user can see whether the books balance', () => {
    const p = weeklyProjection(world, user.id);
    expect(p.outgoings).toBe(wageBill(world, user.id) + runningCosts(user));
    expect(p.surplus).toBeCloseTo(p.averageIncome - p.outgoings, 5);
    expect(p.homeNet).toBeGreaterThan(p.awayNet);
    expect(p.awayNet).toBeCloseTo(sponsorIncome(user) - p.outgoings, 5);
  });

  it('shows the effect of an extra wage', () => {
    const base = weeklyProjection(world, user.id);
    expect(weeklyProjection(world, user.id, 1000).surplus).toBeCloseTo(base.surplus - 1000, 5);
  });
});

describe('stadium', () => {
  it('costs money now and opens the seats six matchdays later, keeping the old capacity until then', () => {
    const { world, user } = fresh();
    user.cash = 100000;
    const cost = startStadiumBuild(world, user.id, 500);
    expect(cost).toBe(buildCost(500));
    expect(user.cash).toBe(100000 - cost);
    expect(user.building).toEqual({ seats: 500, matchdaysLeft: 6 });
    for (let i = 0; i < 5; i++) expect(progressBuild(user)).toBe(false);
    expect(user.stadium.capacity).toBe(4200);
    expect(progressBuild(user)).toBe(true);
    expect(user.stadium.capacity).toBe(4700);
    expect(user.building).toBeNull();
  });

  it('refuses when the club cannot afford it, when a stand is already being built, or for a silly size', () => {
    const { world, user } = fresh();
    user.cash = 10;
    expect(() => startStadiumBuild(world, user.id, 500)).toThrow();
    user.cash = 1e7;
    expect(() => startStadiumBuild(world, user.id, 50)).toThrow();
    expect(() => startStadiumBuild(world, user.id, 99999)).toThrow();
    expect(() => startStadiumBuild(world, user.id, 250.5)).toThrow();
    startStadiumBuild(world, user.id, 500);
    expect(() => startStadiumBuild(world, user.id, 500)).toThrow();
  });

  it('earns nothing extra from seats the fans do not fill, and more once the fan base grows to fill them', () => {
    const { user } = fresh();
    expect(user.fanBase).toBeLessThan(user.stadium.capacity);
    expect(extraGatePerHomeMatch(user, 500)).toBe(0);
    user.fanBase = user.stadium.capacity + 300;
    expect(extraGatePerHomeMatch(user, 500)).toBe(300 * user.ticketPrice);
    user.fanBase = user.stadium.capacity + 900;
    expect(extraGatePerHomeMatch(user, 500)).toBe(500 * user.ticketPrice);
  });
});

describe('fan base', () => {
  it('grows for a top-three finish, shrinks for a bottom-three finish, and is unchanged mid-table', () => {
    const world = generateWorld(203);
    const season = createSeason(world, createRng(1), 2026);
    const rng = createRng(2);
    while (season.round < 38) playMatchday(world, season, rng);
    const before = new Map(Object.values(world.clubs).map((c) => [c.id, c.fanBase]));
    fanBaseAfterSeason(world, season);
    let up = 0;
    let down = 0;
    let same = 0;
    for (const c of Object.values(world.clubs)) {
      if (c.fanBase > before.get(c.id)!) up++;
      else if (c.fanBase < before.get(c.id)!) down++;
      else same++;
    }
    expect(up).toBe(12);
    expect(down).toBe(12);
    expect(same).toBe(56);
  });

  it('is never allowed to vanish', () => {
    const { user } = fresh();
    for (let i = 0; i < 40; i++) adjustFanBase(user, -0.5);
    expect(user.fanBase).toBeGreaterThanOrEqual(500);
  });
});
