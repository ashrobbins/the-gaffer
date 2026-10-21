import { describe, expect, it } from 'vitest';
import { ROUNDS_PER_SEASON } from './config';
import { createCup, nextCupRound, playCupRound } from './cup';
import { applyMovements, computeMovements, recordHonours, seasonHonours } from './movements';
import { playPlayoffs } from './playoffs';
import { createRng } from './rng';
import { createSeason, playMatchday, tableFor } from './season';
import { generateWorld } from './worldgen';
import type { PlayoffFinal, Season, World } from './types';

function endOfSeason(worldSeed: number): { world: World; season: Season; finals: PlayoffFinal[] } {
  const world = generateWorld(worldSeed);
  const season = createSeason(world, createRng(worldSeed), 2026);
  const rng = createRng(worldSeed + 1);
  while (season.round < ROUNDS_PER_SEASON) playMatchday(world, season, rng);
  return { world, season, finals: playPlayoffs(world, season, createRng(worldSeed + 2)) };
}

function makeUser(world: World, clubId: string): void {
  for (const c of Object.values(world.clubs)) c.isUser = c.id === clubId;
  world.userClubId = clubId;
}

describe('computeMovements', () => {
  const { world, season, finals } = endOfSeason(61);
  const m = computeMovements(world, season, finals);

  it('names the champion of each division', () => {
    expect(m.champions).toEqual([0, 1, 2, 3].map((d) => tableFor(world, season, d)[0]!.clubId));
  });

  it('sends up three from each division below the top, and nobody from the top', () => {
    expect(m.promoted.map((p) => p.length)).toEqual([0, 3, 3, 3]);
  });

  it('promotes 1st, 2nd and the play-off winner', () => {
    for (const d of [1, 2, 3]) {
      const table = tableFor(world, season, d);
      const final = finals.find((f) => f.division === d)!;
      expect(m.promoted[d]).toEqual([table[0]!.clubId, table[1]!.clubId, final.winnerId]);
    }
  });

  it('relegates the bottom three from the top three divisions, and nobody from the bottom one', () => {
    expect(m.relegated.map((p) => p.length)).toEqual([3, 3, 3, 0]);
    for (const d of [0, 1, 2]) {
      const table = tableFor(world, season, d);
      expect(m.relegated[d]).toEqual(table.slice(17).map((r) => r.clubId));
    }
  });

  it('does not promote the loser of the play-off', () => {
    for (const f of finals) {
      const loser = f.winnerId === f.homeId ? f.awayId : f.homeId;
      expect(m.promoted[f.division]).not.toContain(loser);
    }
  });

  it('needs a finished season and every play-off final', () => {
    const w = generateWorld(62);
    const s = createSeason(w, createRng(1), 2026);
    expect(() => computeMovements(w, s, [])).toThrow();
    expect(() => computeMovements(world, season, finals.slice(0, 2))).toThrow();
  });
});

describe('applyMovements', () => {
  it('keeps every division at twenty clubs and every club in exactly one division', () => {
    const { world, season, finals } = endOfSeason(63);
    applyMovements(world, computeMovements(world, season, finals));
    for (const ids of world.divisions) expect(ids).toHaveLength(20);
    const all = world.divisions.flat();
    expect(new Set(all).size).toBe(80);
    world.divisions.forEach((ids, d) => {
      for (const id of ids) expect(world.clubs[id]!.division).toBe(d);
    });
  });

  it('puts promoted clubs one division up and relegated clubs one division down', () => {
    const { world, season, finals } = endOfSeason(64);
    const m = computeMovements(world, season, finals);
    const before = new Map(Object.values(world.clubs).map((c) => [c.id, c.division]));
    applyMovements(world, m);
    for (const d of [1, 2, 3]) for (const id of m.promoted[d]!) expect(world.clubs[id]!.division).toBe(d - 1);
    for (const d of [0, 1, 2]) for (const id of m.relegated[d]!) expect(world.clubs[id]!.division).toBe(d + 1);
    const moved = new Set([...m.promoted.flat(), ...m.relegated.flat()]);
    for (const c of Object.values(world.clubs)) if (!moved.has(c.id)) expect(world.clubs[c.id]!.division).toBe(before.get(c.id));
  });

  it('gives the user club a sponsor slot when it is promoted', () => {
    const { world, season, finals } = endOfSeason(65);
    const champion = tableFor(world, season, 3)[0]!.clubId;
    makeUser(world, champion);
    expect(world.clubs[champion]!.sponsorSlots).toBeGreaterThanOrEqual(1);
    world.clubs[champion]!.sponsorSlots = 1;
    applyMovements(world, computeMovements(world, season, finals));
    expect(world.clubs[champion]!.division).toBe(2);
    expect(world.clubs[champion]!.sponsorSlots).toBe(2);
  });

  it('never gives the user more than four sponsor slots', () => {
    const { world, season, finals } = endOfSeason(66);
    const champion = tableFor(world, season, 1)[0]!.clubId;
    makeUser(world, champion);
    world.clubs[champion]!.sponsorSlots = 4;
    applyMovements(world, computeMovements(world, season, finals));
    expect(world.clubs[champion]!.sponsorSlots).toBe(4);
  });

  it('keeps the user sponsors if the club is relegated', () => {
    const { world, season, finals } = endOfSeason(67);
    const bottom = tableFor(world, season, 1)[19]!.clubId;
    makeUser(world, bottom);
    world.clubs[bottom]!.sponsorSlots = 3;
    applyMovements(world, computeMovements(world, season, finals));
    expect(world.clubs[bottom]!.division).toBe(2);
    expect(world.clubs[bottom]!.sponsorSlots).toBe(3);
  });

  it('can run for several seasons in a row without losing clubs', () => {
    const world = generateWorld(68);
    for (let year = 0; year < 3; year++) {
      const season = createSeason(world, createRng(year), 2026 + year);
      const rng = createRng(year + 10);
      while (season.round < ROUNDS_PER_SEASON) playMatchday(world, season, rng);
      applyMovements(world, computeMovements(world, season, playPlayoffs(world, season, rng)));
      for (const ids of world.divisions) expect(ids).toHaveLength(20);
      expect(new Set(world.divisions.flat()).size).toBe(80);
    }
  });
});

describe('honours', () => {
  it('records a league title when the user finishes first', () => {
    const { world, season } = endOfSeason(71);
    const champion = tableFor(world, season, 3)[0]!.clubId;
    makeUser(world, champion);
    expect(seasonHonours(world, season, null)).toEqual([{ kind: 'league', name: 'Division Four champions', year: 2026 }]);
  });

  it('records nothing for a club that did not win', () => {
    const { world, season } = endOfSeason(72);
    const second = tableFor(world, season, 3)[1]!.clubId;
    makeUser(world, second);
    expect(seasonHonours(world, season, null)).toEqual([]);
  });

  it('records a cup win, and a league title, as separate honours', () => {
    const { world, season } = endOfSeason(73);
    const champion = tableFor(world, season, 3)[0]!.clubId;
    makeUser(world, champion);
    const cup = createCup(world, createRng(1), 2026);
    const rng = createRng(2);
    while (nextCupRound(cup) !== null) {
      const round = cup.rounds[nextCupRound(cup)!]!;
      const tie = round.ties.find((t) => t.homeId === champion || t.awayId === champion);
      const home = tie?.homeId === champion;
      playCupRound(world, season, cup, rng, tie ? (home ? { homeGoals: 3, awayGoals: 0 } : { homeGoals: 0, awayGoals: 3 }) : undefined);
    }
    expect(seasonHonours(world, season, cup).map((h) => h.kind).sort()).toEqual(['cup', 'league']);
  });

  it('does not record a cup that has not been won', () => {
    const { world, season } = endOfSeason(74);
    const cup = createCup(world, createRng(1), 2026);
    expect(seasonHonours(world, season, cup).some((h) => h.kind === 'cup')).toBe(false);
  });

  it('adds honours to the trophy cabinet once, however often they are recorded', () => {
    const world = generateWorld(75);
    const h = { kind: 'league' as const, name: 'Division Four champions', year: 2026 };
    expect(recordHonours(world, [h])).toEqual([h]);
    expect(recordHonours(world, [h])).toEqual([]);
    expect(world.honours).toEqual([h]);
    recordHonours(world, [{ kind: 'cup', name: 'Challenge Cup winners', year: 2027 }]);
    expect(world.honours).toHaveLength(2);
  });
});
