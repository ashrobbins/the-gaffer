import { describe, expect, it } from 'vitest';
import {
  FORMATIONS,
  FORMATION_IDS,
  assignToFormation,
  autoPickXI,
  defaultTeamSheet,
  effectiveRating,
  validateTeamSheet,
} from './formations';
import { positionFit } from './positions';
import { generateWorld } from './worldgen';

const world = generateWorld(81);
const clubId = world.divisions[0]![0]!;
const club = world.clubs[clubId]!;

describe('FORMATIONS', () => {
  it('has five formations of eleven positions, goalkeeper first', () => {
    expect(FORMATION_IDS).toHaveLength(5);
    for (const id of FORMATION_IDS) {
      expect(FORMATIONS[id]).toHaveLength(11);
      expect(FORMATIONS[id][0]).toBe('GK');
    }
  });

  it('adds up to the numbers in their names', () => {
    const count = (id: keyof typeof FORMATIONS, set: string[]): number => FORMATIONS[id].filter((p) => set.includes(p)).length;
    expect(count('4-4-2', ['LB', 'CB', 'RB'])).toBe(4);
    expect(count('3-5-2', ['LB', 'CB', 'RB'])).toBe(3);
    expect(count('5-3-2', ['LB', 'CB', 'RB'])).toBe(5);
    expect(count('4-3-3', ['LW', 'ST', 'RW'])).toBe(3);
  });
});

describe('effectiveRating', () => {
  const striker = { ability: 80, position: 'ST' as const, form: 3 };

  it('is the rating for a fresh player in his own position', () => {
    expect(effectiveRating(striker, 'ST', 0)).toBe(80);
  });

  it('falls as a player tires', () => {
    expect(effectiveRating(striker, 'ST', 50)).toBeLessThan(80);
    expect(effectiveRating(striker, 'ST', 100)).toBeLessThan(effectiveRating(striker, 'ST', 50));
    expect(effectiveRating(striker, 'ST', 100)).toBeCloseTo(64, 5);
  });

  it('falls when he plays out of position', () => {
    expect(effectiveRating(striker, 'AM', 0)).toBeCloseTo(80 * 0.86, 5);
    expect(effectiveRating(striker, 'LB', 0)).toBeCloseTo(48, 5);
  });

  it('rises a little with good form and falls with poor form', () => {
    expect(effectiveRating({ ...striker, form: 5 }, 'ST', 0)).toBeGreaterThan(80);
    expect(effectiveRating({ ...striker, form: 1 }, 'ST', 0)).toBeLessThan(80);
  });
});

describe('assignToFormation', () => {
  it('puts the natural player in each position when there is one', () => {
    const slots = assignToFormation(world, club.playerIds, '4-4-2');
    const positions = slots.map((id) => world.players[id!]!.position);
    expect(positions[0]).toBe('GK');
    expect(positions.slice(1, 5).sort()).toEqual(['CB', 'CB', 'LB', 'RB']);
  });

  it('fills all eleven positions with different players', () => {
    for (const f of FORMATION_IDS) {
      const slots = assignToFormation(world, club.playerIds, f);
      expect(slots.every((s) => s !== null)).toBe(true);
      expect(new Set(slots).size).toBe(11);
    }
  });

  it('only puts a goalkeeper in goal while one is available', () => {
    const slots = assignToFormation(world, club.playerIds, '4-3-3');
    expect(world.players[slots[0]!]!.position).toBe('GK');
  });

  it('plays someone out of position when there is no natural player, rather than leaving a gap', () => {
    const noWingers = club.playerIds.filter((id) => !['LW', 'RW'].includes(world.players[id]!.position));
    const slots = assignToFormation(world, noWingers, '4-3-3');
    expect(slots.every((s) => s !== null)).toBe(true);
    const lw = slots[8]!;
    expect(positionFit(world.players[lw]!.position, 'LW').kind).not.toBe('natural');
  });

  it('leaves positions empty when there are too few players', () => {
    const slots = assignToFormation(world, club.playerIds.slice(0, 9), '4-4-2');
    expect(slots.filter((s) => s === null).length).toBe(2);
  });
});

describe('autoPickXI and defaultTeamSheet', () => {
  it('picks eleven players and puts everyone else on the bench', () => {
    const { xi, bench } = autoPickXI(world, clubId, '4-4-2');
    expect(xi).toHaveLength(11);
    expect(bench).toHaveLength(7);
    expect(new Set([...xi, ...bench]).size).toBe(18);
  });

  it('keeps injured players out of the squad for the match', () => {
    const w = generateWorld(81);
    const c = w.clubs[clubId]!;
    const injured = w.players[c.playerIds[5]!]!;
    injured.injury = { weeks: 3, kind: 'Ankle' };
    const { xi, bench } = autoPickXI(w, clubId, '4-4-2');
    expect([...xi, ...bench]).not.toContain(injured.id);
    expect(xi).toHaveLength(11);
  });

  it('puts a spare goalkeeper at the top of the bench', () => {
    const { bench } = autoPickXI(world, clubId, '4-4-2');
    expect(world.players[bench[0]!]!.position).toBe('GK');
  });

  it('builds a playable team sheet', () => {
    const sheet = defaultTeamSheet(world, clubId, '3-5-2', 'attacking');
    expect(sheet).toMatchObject({ formation: '3-5-2', style: 'attacking' });
    expect(() => validateTeamSheet(world, clubId, sheet)).not.toThrow();
  });

  it('refuses a club with fewer than eleven fit players', () => {
    const w = generateWorld(82);
    const c = w.clubs[w.divisions[0]![0]!]!;
    for (const id of c.playerIds.slice(0, 8)) w.players[id]!.injury = { weeks: 2, kind: 'Knee' };
    expect(() => autoPickXI(w, c.id, '4-4-2')).toThrow();
  });
});

describe('validateTeamSheet', () => {
  const sheet = defaultTeamSheet(world, clubId);

  it('accepts a good sheet', () => {
    expect(() => validateTeamSheet(world, clubId, sheet)).not.toThrow();
  });

  it('rejects the wrong number of players, duplicates, strangers and injured players', () => {
    expect(() => validateTeamSheet(world, clubId, { ...sheet, xi: sheet.xi.slice(0, 10) })).toThrow();
    expect(() => validateTeamSheet(world, clubId, { ...sheet, xi: [...sheet.xi.slice(0, 10), sheet.xi[0]!] })).toThrow();
    const other = world.clubs[world.divisions[1]![0]!]!.playerIds[0]!;
    expect(() => validateTeamSheet(world, clubId, { ...sheet, xi: [...sheet.xi.slice(0, 10), other] })).toThrow();
    const w = generateWorld(81);
    w.players[sheet.xi[3]!]!.injury = { weeks: 1, kind: 'Calf' };
    expect(() => validateTeamSheet(w, clubId, sheet)).toThrow();
  });

  it('rejects a bench of more than seven', () => {
    const extra = club.playerIds.filter((id) => !sheet.xi.includes(id) && !sheet.bench.includes(id));
    expect(() => validateTeamSheet(world, clubId, { ...sheet, bench: [...sheet.bench, ...(extra.length ? extra : [sheet.xi[0]!])] })).toThrow();
  });
});
