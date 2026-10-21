import { describe, expect, it } from 'vitest';
import {
  CLUBS_PER_DIVISION,
  DIVISION_COUNT,
  SQUAD_SIZE,
  SQUAD_TEMPLATE,
  USER_START_DIVISION,
} from './config';
import { generateWorld, valueFor, wageForAbility } from './worldgen';
import type { Club, NewClubOptions, World } from './types';

const world = generateWorld(2026);
const clubsIn = (w: World, division: number): Club[] => (w.divisions[division] ?? []).map((id) => w.clubs[id] as Club);
const avgAbility = (w: World, division: number): number => {
  const ps = clubsIn(w, division).flatMap((c) => c.playerIds.map((id) => w.players[id]!.ability));
  return ps.reduce((a, b) => a + b, 0) / ps.length;
};

describe('generateWorld: structure', () => {
  it('builds four divisions of twenty clubs, eighty in total', () => {
    expect(world.divisions).toHaveLength(DIVISION_COUNT);
    for (const ids of world.divisions) expect(ids).toHaveLength(CLUBS_PER_DIVISION);
    expect(Object.keys(world.clubs)).toHaveLength(DIVISION_COUNT * CLUBS_PER_DIVISION);
  });

  it('gives every club a squad of eighteen with the standard positions', () => {
    const expected = SQUAD_TEMPLATE.map((s) => s.position).sort();
    for (const club of Object.values(world.clubs)) {
      expect(club.playerIds).toHaveLength(SQUAD_SIZE);
      const positions = club.playerIds.map((id) => world.players[id]!.position).sort();
      expect(positions).toEqual(expected);
    }
    expect(Object.keys(world.players)).toHaveLength(80 * SQUAD_SIZE);
  });

  it('keeps every id consistent between clubs, players and divisions', () => {
    for (const [id, club] of Object.entries(world.clubs)) {
      expect(club.id).toBe(id);
      expect(world.divisions[club.division]).toContain(id);
      for (const pid of club.playerIds) expect(world.players[pid]!.clubId).toBe(id);
    }
    for (const [id, p] of Object.entries(world.players)) expect(p.id).toBe(id);
  });
});

describe('generateWorld: the user club', () => {
  it('starts in the bottom division with the details it was given', () => {
    const options: NewClubOptions = {
      name: 'Marlowe Mariners',
      stadiumName: 'Harbour Road',
      kit: { style: 'hoops', primary: '#1f5fd8', secondary: '#f2f2f2' },
    };
    const w = generateWorld(5, options);
    const user = w.clubs[w.userClubId]!;
    expect(user.isUser).toBe(true);
    expect(user.division).toBe(USER_START_DIVISION);
    expect(user.name).toBe('Marlowe Mariners');
    expect(user.stadium.name).toBe('Harbour Road');
    expect(user.kit).toEqual(options.kit);
    expect(user.cash).toBe(86400);
    expect(user.sponsorSlots).toBe(1);
    expect(Object.values(w.clubs).filter((c) => c.isUser)).toHaveLength(1);
  });

  it('does not let another club reuse the name of the user stadium', () => {
    const w = generateWorld(8, { name: 'X FC', stadiumName: 'The Orchard', kit: world.clubs[world.userClubId]!.kit });
    const grounds = Object.values(w.clubs).filter((c) => c.stadium.name === 'The Orchard');
    expect(grounds).toHaveLength(1);
    expect(grounds[0]!.isUser).toBe(true);
  });
});

describe('generateWorld: fictional names', () => {
  it('gives every club a different name and ground', () => {
    const clubs = Object.values(world.clubs);
    expect(new Set(clubs.map((c) => c.name)).size).toBe(clubs.length);
    expect(new Set(clubs.map((c) => c.stadium.name)).size).toBe(clubs.length);
  });

  it('gives every player a different full name', () => {
    const names = Object.values(world.players).map((p) => `${p.firstName} ${p.lastName}`);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('generateWorld: player quality', () => {
  it('has better players in higher divisions', () => {
    const avgs = [0, 1, 2, 3].map((d) => avgAbility(world, d));
    for (let d = 0; d < 3; d++) expect(avgs[d]!).toBeGreaterThan(avgs[d + 1]! + 2);
  });

  it('keeps ratings, ages and contracts in range', () => {
    for (const p of Object.values(world.players)) {
      expect(p.ability).toBeGreaterThanOrEqual(38);
      expect(p.ability).toBeLessThanOrEqual(95);
      expect(p.potential).toBeGreaterThanOrEqual(p.ability);
      expect(p.potential).toBeLessThanOrEqual(99);
      expect(p.age).toBeGreaterThanOrEqual(17);
      expect(p.age).toBeLessThanOrEqual(36);
      expect(p.contractGames).toBeGreaterThanOrEqual(8);
      expect(p.happiness).toBeGreaterThanOrEqual(1);
      expect(p.happiness).toBeLessThanOrEqual(5);
      expect(p.fatigue).toBe(0);
      expect(p.injury).toBeNull();
      expect(p.wage).toBeGreaterThan(0);
      expect(p.value).toBeGreaterThan(0);
    }
  });

  it('starts everyone with no appearances, goals or cards', () => {
    for (const p of Object.values(world.players)) {
      const zero = { starts: 0, subAppearances: 0, goals: 0, yellowCards: 0, redCards: 0 };
      expect(p.seasonStats).toEqual(zero);
      expect(p.careerStats).toEqual(zero);
    }
  });
});

describe('generateWorld: clubs', () => {
  it('gives bigger stadiums and dearer tickets to higher divisions', () => {
    const avgCap = (d: number): number => clubsIn(world, d).reduce((a, c) => a + c.stadium.capacity, 0) / CLUBS_PER_DIVISION;
    for (let d = 0; d < 3; d++) expect(avgCap(d)).toBeGreaterThan(avgCap(d + 1));
    expect(clubsIn(world, 0)[0]!.ticketPrice).toBeGreaterThan(clubsIn(world, 3)[0]!.ticketPrice);
  });

  it('gives each division one fewer sponsor slot than the one above', () => {
    for (const club of Object.values(world.clubs).filter((c) => !c.isUser)) {
      expect(club.sponsorSlots).toBe(DIVISION_COUNT - club.division);
    }
  });

  it('gives every kit two different colours', () => {
    for (const club of Object.values(world.clubs)) expect(club.kit.primary).not.toBe(club.kit.secondary);
  });
});

describe('generateWorld: repeatability', () => {
  it('builds exactly the same world from the same seed', () => {
    expect(generateWorld(77)).toEqual(generateWorld(77));
  });

  it('builds a different world from a different seed', () => {
    expect(generateWorld(77).clubs).not.toEqual(generateWorld(78).clubs);
  });

  it('survives a trip through JSON, which is how saves will work', () => {
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
  });

  it('builds many different worlds without running out of names', () => {
    for (let seed = 100; seed < 130; seed++) expect(() => generateWorld(seed)).not.toThrow();
  });
});

describe('pay and value', () => {
  it('matches the figures from the design mock-up', () => {
    expect(wageForAbility(70)).toBe(1300);
    expect(wageForAbility(61)).toBeGreaterThanOrEqual(650);
    expect(wageForAbility(61)).toBeLessThanOrEqual(750);
    expect(wageForAbility(78)).toBeGreaterThanOrEqual(2200);
    expect(wageForAbility(78)).toBeLessThanOrEqual(2500);
  });

  it('values young players above old ones on the same wage', () => {
    expect(valueFor(1500, 21)).toBeGreaterThan(valueFor(1500, 27));
    expect(valueFor(1500, 27)).toBeGreaterThan(valueFor(1500, 34));
  });
});
