import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { createSeason, playMatchday } from './season';
import { creditGoals, topScorers } from './scorers';
import { generateWorld } from './worldgen';
import type { Player } from './types';

const setup = () => {
  const world = generateWorld(5);
  const rng = createRng(6);
  return { world, rng, season: createSeason(world, rng, 2026) };
};

describe('goalscorers', () => {
  it('gives goals to outfield players of the club, never the keeper', () => {
    const { world } = setup();
    const clubId = world.divisions[0]![0]!;
    creditGoals(world, clubId, 200, 1);
    const players = world.clubs[clubId]!.playerIds.map((id) => world.players[id] as Player);
    expect(players.reduce((s, p) => s + p.seasonStats.goals, 0)).toBe(200);
    expect(players.filter((p) => p.position === 'GK').every((p) => p.seasonStats.goals === 0)).toBe(true);
  });

  it('favours strikers over defenders', () => {
    const { world } = setup();
    const clubId = world.divisions[1]![0]!;
    creditGoals(world, clubId, 2000, 3);
    const players = world.clubs[clubId]!.playerIds.map((id) => world.players[id] as Player);
    const avg = (pos: string[]) => {
      const ps = players.filter((p) => pos.includes(p.position));
      return ps.length ? ps.reduce((s, p) => s + p.seasonStats.goals, 0) / ps.length : 0;
    };
    expect(avg(['ST', 'LW', 'RW', 'AM'])).toBeGreaterThan(avg(['CB', 'LB', 'RB']));
  });

  it('credits every computer club goal during a matchday, without changing the results', () => {
    const a = setup();
    const b = setup();
    const resultsA = playMatchday(a.world, a.season, a.rng);
    const resultsB = playMatchday(b.world, b.season, b.rng);
    expect(resultsA).toEqual(resultsB);
    const user = a.world.userClubId;
    const goals = resultsA.filter((r) => r.homeId !== user && r.awayId !== user).reduce((s, r) => s + r.homeGoals + r.awayGoals, 0);
    const credited = Object.values(a.world.players).reduce((s, p) => s + (p.clubId === user ? 0 : p.seasonStats.goals), 0);
    expect(credited).toBe(goals);
  });

  it('lists the top scorers of a division, most first', () => {
    const { world, season, rng } = setup();
    for (let i = 0; i < 10; i++) playMatchday(world, season, rng);
    const list = topScorers(world, 0, 5);
    expect(list).toHaveLength(5);
    for (let i = 1; i < list.length; i++) expect(list[i - 1]!.goals).toBeGreaterThanOrEqual(list[i]!.goals);
    expect(list.every((r) => world.divisions[0]!.includes(r.clubId))).toBe(true);
  });
});
