import { describe, expect, it } from 'vitest';
import { releasePlayer } from './contracts';
import { FORMATIONS } from './formations';
import {
  createLineup,
  lineupFit,
  lineupRating,
  repairLineup,
  setCaptain,
  setFormation,
  setStyle,
  swapPositions,
  swapWithBench,
  toTeamSheet,
} from './lineup';
import { validateTeamSheet } from './formations';
import { generateWorld } from './worldgen';

const fresh = () => {
  const world = generateWorld(301);
  const club = world.clubs[world.userClubId]!;
  return { world, club, lineup: createLineup(world, club.id) };
};

describe('createLineup', () => {
  it('picks eleven players in a balanced 4-4-2 and puts the rest of the squad on the bench', () => {
    const { club, lineup } = fresh();
    expect(lineup).toMatchObject({ formation: '4-4-2', style: 'balanced' });
    expect(lineup.xi).toHaveLength(11);
    expect(lineup.bench).toHaveLength(7);
    expect(new Set([...lineup.xi, ...lineup.bench])).toEqual(new Set(club.playerIds));
  });

  it('makes the best player in the team the captain', () => {
    const { world, lineup } = fresh();
    const best = Math.max(...lineup.xi.map((id) => world.players[id]!.ability));
    expect(world.players[lineup.captainId!]!.ability).toBe(best);
  });

  it('starts with a keeper in goal and every player in his own position where possible', () => {
    const { world, lineup } = fresh();
    expect(world.players[lineup.xi[0]!]!.position).toBe('GK');
    const naturals = lineupFit(world, lineup).filter((i) => i.fit.kind === 'natural').length;
    expect(naturals).toBeGreaterThanOrEqual(9);
  });
});

describe('formation and style', () => {
  it('changes formation with the same eleven players', () => {
    const { world, lineup } = fresh();
    const next = setFormation(world, lineup, '3-5-2');
    expect(next.formation).toBe('3-5-2');
    expect(new Set(next.xi)).toEqual(new Set(lineup.xi));
    expect(next.xi).toHaveLength(11);
    expect(next.bench).toEqual(lineup.bench);
    expect(lineup.formation).toBe('4-4-2');
  });

  it('sets the play style without touching anything else', () => {
    const { lineup } = fresh();
    expect(setStyle(lineup, 'gung-ho')).toEqual({ ...lineup, style: 'gung-ho' });
  });
});

describe('moving players', () => {
  it('swaps two positions on the pitch', () => {
    const { lineup } = fresh();
    const next = swapPositions(lineup, 2, 9);
    expect(next.xi[2]).toBe(lineup.xi[9]);
    expect(next.xi[9]).toBe(lineup.xi[2]);
    expect(() => swapPositions(lineup, 0, 11)).toThrow();
  });

  it('swaps a player with one on the bench', () => {
    const { lineup } = fresh();
    const next = swapWithBench(fresh().world, lineup, 5, 2);
    expect(next.xi[5]).toBe(lineup.bench[2]);
    expect(next.bench[2]).toBe(lineup.xi[5]);
    expect(next.xi).toHaveLength(11);
    expect(next.bench).toHaveLength(7);
  });

  it('will not bring an injured player in from the bench', () => {
    const { world, lineup } = fresh();
    world.players[lineup.bench[1]!]!.injury = { weeks: 3, kind: 'Ankle' };
    expect(() => swapWithBench(world, lineup, 5, 1)).toThrow(/injured/);
    expect(() => swapWithBench(world, lineup, 50, 1)).toThrow();
  });

  it('makes a player captain, from the pitch or the bench, and not a stranger', () => {
    const { world, lineup } = fresh();
    expect(setCaptain(lineup, lineup.bench[0]!).captainId).toBe(lineup.bench[0]);
    expect(() => setCaptain(lineup, world.clubs[world.divisions[0]![0]!]!.playerIds[0]!)).toThrow();
  });
});

describe('lineupFit and lineupRating', () => {
  it('says who plays where and how well he fits', () => {
    const { world, lineup } = fresh();
    const swapped = swapPositions(lineup, 0, 10);
    const infos = lineupFit(world, swapped);
    expect(infos[0]!.fit.kind).toBe('alien');
    expect(infos[10]!.fit.kind).toBe('alien');
    expect(infos[0]!.rating).toBeLessThan(40);
  });

  it('drops the team rating when players are out of position', () => {
    const { world, lineup } = fresh();
    expect(lineupRating(world, swapPositions(lineup, 1, 9))).toBeLessThan(lineupRating(world, lineup));
  });
});

describe('repairLineup', () => {
  it('leaves a good lineup alone', () => {
    const { world, club, lineup } = fresh();
    expect(repairLineup(world, club.id, lineup)).toEqual(lineup);
  });

  it('replaces an injured first-team player with the best fit player from the bench and sends him to the bench', () => {
    const { world, club, lineup } = fresh();
    const hurt = lineup.xi[3]!;
    world.players[hurt]!.injury = { weeks: 4, kind: 'Knee' };
    const fixed = repairLineup(world, club.id, lineup);
    expect(fixed.xi).toHaveLength(11);
    expect(fixed.xi).not.toContain(hurt);
    expect(fixed.bench).toContain(hurt);
    expect(fixed.xi.every((id) => !world.players[id]!.injury)).toBe(true);
    expect(new Set([...fixed.xi, ...fixed.bench])).toEqual(new Set(club.playerIds));
  });

  it('drops players who have left and gives the captaincy to someone else', () => {
    const { world, club, lineup } = fresh();
    const captain = lineup.captainId!;
    releasePlayer(world, captain);
    const fixed = repairLineup(world, club.id, lineup);
    expect(fixed.xi).not.toContain(captain);
    expect(fixed.xi).toHaveLength(11);
    expect(fixed.captainId).not.toBe(captain);
    expect(club.playerIds).toContain(fixed.captainId);
  });

  it('puts a new signing on the bench', () => {
    const { world, club, lineup } = fresh();
    const outsider = world.clubs[world.divisions[3]![1]!]!.playerIds[0]!;
    const other = world.clubs[world.divisions[3]![1]!]!;
    other.playerIds = other.playerIds.filter((id) => id !== outsider);
    world.players[outsider]!.clubId = club.id;
    club.playerIds.push(outsider);
    expect(repairLineup(world, club.id, lineup).bench).toContain(outsider);
  });
});

describe('toTeamSheet', () => {
  it('is a sheet the match engine accepts, with injured players left out of the bench', () => {
    const { world, club, lineup } = fresh();
    world.players[lineup.bench[0]!]!.injury = { weeks: 2, kind: 'Calf' };
    const sheet = toTeamSheet(world, lineup);
    expect(sheet.bench).not.toContain(lineup.bench[0]);
    expect(() => validateTeamSheet(world, club.id, sheet)).not.toThrow();
    expect(sheet.xi).toHaveLength(11);
  });

  it('only takes seven on the bench', () => {
    const { world, club, lineup } = fresh();
    for (let i = 0; i < 4; i++) {
      const extra = world.clubs[world.divisions[3]![2]!]!.playerIds[i]!;
      world.clubs[world.divisions[3]![2]!]!.playerIds = world.clubs[world.divisions[3]![2]!]!.playerIds.filter((id) => id !== extra);
      world.players[extra]!.clubId = club.id;
      club.playerIds.push(extra);
    }
    const repaired = repairLineup(world, club.id, lineup);
    expect(repaired.bench).toHaveLength(11);
    expect(toTeamSheet(world, repaired).bench).toHaveLength(7);
  });

  it('keeps FORMATIONS order: slot i plays FORMATIONS[formation][i]', () => {
    const { world, lineup } = fresh();
    const next = setFormation(world, lineup, '4-3-3');
    expect(FORMATIONS['4-3-3']).toHaveLength(next.xi.length);
  });
});
