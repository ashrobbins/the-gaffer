import { describe, expect, it } from 'vitest';
import { CUP_ROUND_AFTER_MATCHDAY, CUP_ROUND_NAMES } from './config';
import {
  autoPlayCup,
  clubsStillIn,
  createCup,
  cupRoundDue,
  nextCupRound,
  playCupRound,
  userCupStatus,
  userTie,
} from './cup';
import { createRng } from './rng';
import { createSeason } from './season';
import { generateWorld } from './worldgen';
import type { Cup, Season, World } from './types';

const fresh = (worldSeed = 41, cupSeed = 1): { world: World; season: Season; cup: Cup; rng: ReturnType<typeof createRng> } => {
  const world = generateWorld(worldSeed);
  const season = createSeason(world, createRng(1), 2026);
  const rng = createRng(cupSeed);
  return { world, season, cup: createCup(world, rng, 2026), rng };
};

describe('createCup', () => {
  const { world, cup } = fresh();

  it('has seven rounds with the right names', () => {
    expect(cup.rounds.map((r) => r.name)).toEqual([...CUP_ROUND_NAMES]);
  });

  it('draws only the preliminary round: 16 ties between 32 different clubs', () => {
    expect(cup.rounds[0]!.ties).toHaveLength(16);
    const prelim = cup.rounds[0]!.ties.flatMap((t) => [t.homeId, t.awayId]);
    expect(new Set(prelim).size).toBe(32);
    for (let i = 1; i < 7; i++) expect(cup.rounds[i]!.ties).toHaveLength(0);
  });

  it('gives the other 48 clubs a bye, so all 80 clubs are in the cup exactly once', () => {
    const prelim = cup.rounds[0]!.ties.flatMap((t) => [t.homeId, t.awayId]);
    expect(cup.byes).toHaveLength(48);
    const everyone = new Set([...prelim, ...cup.byes]);
    expect(everyone.size).toBe(80);
    expect([...everyone].sort()).toEqual(Object.keys(world.clubs).sort());
  });

  it('is repeatable from the same seed but differs between seeds', () => {
    expect(fresh(41, 1).cup).toEqual(cup);
    expect(fresh(41, 2).cup).not.toEqual(cup);
  });

  it('includes clubs from every division', () => {
    const divisions = new Set(Object.values(world.clubs).map((c) => c.division));
    expect(divisions.size).toBe(4);
  });
});

describe('scheduling', () => {
  const { cup } = fresh();

  it('plays cup rounds midweek between league matchdays, in order, and the final late in the season', () => {
    expect(CUP_ROUND_AFTER_MATCHDAY).toHaveLength(7);
    for (let i = 1; i < 7; i++) expect(CUP_ROUND_AFTER_MATCHDAY[i]!).toBeGreaterThan(CUP_ROUND_AFTER_MATCHDAY[i - 1]!);
    expect(CUP_ROUND_AFTER_MATCHDAY[6]!).toBeLessThan(38);
  });

  it('says the preliminary round is due once enough league matchdays have been played', () => {
    expect(cupRoundDue(cup, 0)).toBeNull();
    expect(cupRoundDue(cup, 2)).toBeNull();
    expect(cupRoundDue(cup, CUP_ROUND_AFTER_MATCHDAY[0]!)).toBe(0);
    expect(nextCupRound(cup)).toBe(0);
  });
});

describe('playCupRound', () => {
  it('plays the preliminary round and draws Round 1 with 64 clubs: 48 byes and 16 winners', () => {
    const { world, season, cup, rng } = fresh();
    const played = playCupRound(world, season, cup, rng);
    expect(played).toHaveLength(16);
    expect(played.every((t) => t.played && [t.homeId, t.awayId].includes(t.winnerId))).toBe(true);
    expect(cup.rounds[0]!.played).toBe(true);
    const r1 = cup.rounds[1]!.ties.flatMap((t) => [t.homeId, t.awayId]);
    expect(cup.rounds[1]!.ties).toHaveLength(32);
    expect(new Set(r1).size).toBe(64);
    expect(r1.filter((id) => cup.byes.includes(id))).toHaveLength(48);
    expect(r1.filter((id) => played.some((t) => t.winnerId === id))).toHaveLength(16);
  });

  it('halves the field every round until one club wins the final', () => {
    const { world, season, cup, rng } = fresh();
    const tieCounts: number[] = [];
    while (nextCupRound(cup) !== null) tieCounts.push(playCupRound(world, season, cup, rng).length);
    expect(tieCounts).toEqual([16, 32, 16, 8, 4, 2, 1]);
    expect(cup.winnerId).toBe(cup.rounds[6]!.ties[0]!.winnerId);
    expect(cup.rounds.every((r) => r.played)).toBe(true);
  });

  it('only lets winners through to the next round', () => {
    const { world, season, cup, rng } = fresh();
    while (nextCupRound(cup) !== null) playCupRound(world, season, cup, rng);
    for (let i = 1; i < 7; i++) {
      const winners = new Set(cup.rounds[i - 1]!.ties.map((t) => t.winnerId));
      const entrants = cup.rounds[i]!.ties.flatMap((t) => [t.homeId, t.awayId]);
      const expected = i === 1 ? [...winners, ...cup.byes] : [...winners];
      expect([...entrants].sort()).toEqual(expected.sort());
    }
  });

  it('keeps track of who is still in the cup', () => {
    const { world, season, cup, rng } = fresh();
    const counts = [clubsStillIn(cup).length];
    while (nextCupRound(cup) !== null) {
      playCupRound(world, season, cup, rng);
      counts.push(clubsStillIn(cup).length);
    }
    expect(counts).toEqual([80, 64, 32, 16, 8, 4, 2, 1]);
  });

  it('throws once the cup is over', () => {
    const { world, season, cup, rng } = fresh();
    while (nextCupRound(cup) !== null) playCupRound(world, season, cup, rng);
    expect(() => playCupRound(world, season, cup, rng)).toThrow();
    expect(nextCupRound(cup)).toBeNull();
  });
});

describe('the user in the cup', () => {
  /** Finds a seed where the user plays in the preliminary round, so the user's tie can be forced. */
  function withUserInPrelim(): ReturnType<typeof fresh> {
    for (let s = 1; s < 200; s++) {
      const f = fresh(41, s);
      if (userTie(f.world, f.cup.rounds[0]!)) return f;
    }
    throw new Error('no seed found');
  }

  it('is still in the cup before anything is played', () => {
    const { world, cup } = fresh();
    expect(userCupStatus(world, cup)).toEqual({ status: 'in' });
  });

  it('uses the score the user played and goes out after a defeat', () => {
    const { world, season, cup, rng } = withUserInPrelim();
    const tie = userTie(world, cup.rounds[0]!)!;
    const userHome = tie.homeId === world.userClubId;
    playCupRound(world, season, cup, rng, userHome ? { homeGoals: 0, awayGoals: 3 } : { homeGoals: 3, awayGoals: 0 });
    const status = userCupStatus(world, cup);
    expect(status.status).toBe('out');
    expect(status).toMatchObject({ round: 0, by: userHome ? tie.awayId : tie.homeId });
  });

  it('goes through after a win, to a Round 1 tie of their own', () => {
    const { world, season, cup, rng } = withUserInPrelim();
    const tie = userTie(world, cup.rounds[0]!)!;
    const userHome = tie.homeId === world.userClubId;
    playCupRound(world, season, cup, rng, userHome ? { homeGoals: 2, awayGoals: 0 } : { homeGoals: 0, awayGoals: 2 });
    expect(userCupStatus(world, cup)).toEqual({ status: 'in' });
    expect(userTie(world, cup.rounds[1]!)).not.toBeNull();
  });

  it('has no tie in the preliminary round when given a bye, but is still in the cup', () => {
    const f = fresh();
    if (userTie(f.world, f.cup.rounds[0]!)) return;
    expect(f.cup.byes).toContain(f.world.userClubId);
    expect(userCupStatus(f.world, f.cup)).toEqual({ status: 'in' });
  });

  it('can win the cup', () => {
    const { world, season, cup, rng } = fresh();
    while (nextCupRound(cup) !== null) {
      const tie = userTie(world, cup.rounds[nextCupRound(cup)!]!);
      const userHome = tie?.homeId === world.userClubId;
      playCupRound(world, season, cup, rng, tie ? (userHome ? { homeGoals: 5, awayGoals: 0 } : { homeGoals: 0, awayGoals: 5 }) : undefined);
    }
    expect(cup.winnerId).toBe(world.userClubId);
    expect(userCupStatus(world, cup)).toEqual({ status: 'won' });
  });
});

describe('autoPlayCup', () => {
  it('plays nothing until a round is due', () => {
    const { world, season, cup, rng } = fresh();
    expect(autoPlayCup(world, season, cup, rng)).toEqual([]);
  });

  it('stops when the user has a tie to play', () => {
    const { world, season, cup, rng } = fresh(41, 1);
    season.round = 38;
    const played = autoPlayCup(world, season, cup, rng);
    const stoppedAt = nextCupRound(cup);
    if (stoppedAt !== null) expect(userTie(world, cup.rounds[stoppedAt]!)).not.toBeNull();
    expect(played.length + (stoppedAt === null ? 0 : 1)).toBeGreaterThan(0);
  });

  it('plays the rest of the cup on its dates once the user is out', () => {
    let found = false;
    for (let s = 1; s < 100 && !found; s++) {
      const f = fresh(41, s);
      const tie = userTie(f.world, f.cup.rounds[0]!);
      if (!tie) continue;
      found = true;
      const userHome = tie.homeId === f.world.userClubId;
      playCupRound(f.world, f.season, f.cup, f.rng, userHome ? { homeGoals: 0, awayGoals: 1 } : { homeGoals: 1, awayGoals: 0 });
      expect(userCupStatus(f.world, f.cup).status).toBe('out');

      // Part way through the season only the rounds that are due get played.
      f.season.round = CUP_ROUND_AFTER_MATCHDAY[2]!;
      expect(autoPlayCup(f.world, f.season, f.cup, f.rng)).toEqual([1, 2]);
      expect(f.cup.winnerId).toBeNull();

      f.season.round = 38;
      expect(autoPlayCup(f.world, f.season, f.cup, f.rng)).toEqual([3, 4, 5, 6]);
      expect(f.cup.winnerId).not.toBeNull();
      expect(f.cup.winnerId).not.toBe(f.world.userClubId);
    }
    expect(found).toBe(true);
  });
});

describe('cup results across many cups', () => {
  it('favours higher divisions but lets lower-division clubs reach the late rounds', () => {
    const world = generateWorld(41);
    const season = createSeason(world, createRng(1), 2026);
    const wins = [0, 0, 0, 0];
    let lowQuarterFinalists = 0;
    for (let k = 0; k < 120; k++) {
      const rng = createRng(1000 + k);
      const cup = createCup(world, rng, 2026);
      while (nextCupRound(cup) !== null) playCupRound(world, season, cup, rng);
      wins[world.clubs[cup.winnerId!]!.division]!++;
      for (const t of cup.rounds[4]!.ties) {
        for (const id of [t.homeId, t.awayId]) if (world.clubs[id]!.division === 3) lowQuarterFinalists++;
      }
    }
    expect(wins[0]!).toBeGreaterThan(wins[1]!);
    expect(wins[1]!).toBeGreaterThan(wins[3]!);
    expect(wins[0]!).toBeLessThan(120);
    expect(lowQuarterFinalists).toBeGreaterThan(0);
  });
});
