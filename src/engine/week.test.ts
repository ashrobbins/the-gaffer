import { describe, expect, it } from 'vitest';
import { startStadiumBuild, wageBill } from './finance';
import { createRng } from './rng';
import { createSeason, playMatchday } from './season';
import { processWeek } from './week';
import { generateWorld } from './worldgen';

const setup = () => {
  const world = generateWorld(241);
  const season = createSeason(world, createRng(1), 2026);
  const rng = createRng(2);
  return { world, season, rng, user: world.clubs[world.userClubId]! };
};

describe('processWeek', () => {
  it('moves money, runs contracts down, rests players and reports the user line', () => {
    const { world, season, rng, user } = setup();
    const p = world.players[user.playerIds[0]!]!;
    p.fatigue = 60;
    const contract = p.contractGames;
    const cash = user.cash;
    const results = playMatchday(world, season, rng);
    const report = processWeek(world, season, results, rng);
    expect(report.finances).toHaveLength(80);
    expect(report.userFinance!.clubId).toBe(user.id);
    expect(user.cash).toBe(cash + report.userFinance!.net);
    expect(p.contractGames).toBe(contract - 1);
    expect(p.fatigue).toBeLessThan(60);
  });

  it('opens a stand after six weeks', () => {
    const { world, season, rng, user } = setup();
    user.cash = 1e6;
    startStadiumBuild(world, user.id, 500);
    const opened: string[][] = [];
    for (let i = 0; i < 6; i++) opened.push(processWeek(world, season, playMatchday(world, season, rng), rng).standsOpened);
    expect(opened.slice(0, 5).every((o) => o.length === 0)).toBe(true);
    expect(opened[5]).toEqual([user.id]);
    expect(user.stadium.capacity).toBe(4700);
  });

  it('heals injuries and returns the players who are fit again', () => {
    const { world, season, rng, user } = setup();
    const p = world.players[user.playerIds[4]!]!;
    p.injury = { weeks: 1, kind: 'Calf' };
    const report = processWeek(world, season, playMatchday(world, season, rng), rng);
    expect(report.healed).toContain(p.id);
    expect(p.injury).toBeNull();
  });

  it('lets the user lose a player whose contract has run out', () => {
    const { world, season, rng, user } = setup();
    const p = world.players[user.playerIds[5]!]!;
    p.contractGames = 1;
    const report = processWeek(world, season, playMatchday(world, season, rng), rng);
    expect(report.contracts.released).toContain(p.id);
    expect(user.playerIds).not.toContain(p.id);
  });

  it('runs a whole season without any club ending up with a broken squad or a negative wage bill', () => {
    const { world, season, rng } = setup();
    while (season.round < 38) processWeek(world, season, playMatchday(world, season, rng), rng);
    for (const club of Object.values(world.clubs)) {
      expect(wageBill(world, club.id)).toBeGreaterThan(0);
      if (!club.isUser) expect(club.playerIds).toHaveLength(18);
    }
    for (const p of Object.values(world.players)) {
      expect(p.fatigue).toBeGreaterThanOrEqual(0);
      expect(p.fatigue).toBeLessThanOrEqual(100);
    }
  });

  it('is repeatable from the same seeds', () => {
    const run = () => {
      const { world, season, rng } = setup();
      for (let i = 0; i < 10; i++) processWeek(world, season, playMatchday(world, season, rng), rng);
      return Object.values(world.clubs).map((c) => c.cash);
    };
    expect(run()).toEqual(run());
  });
});
