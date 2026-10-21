import { CLUBS_PER_DIVISION } from './config';
import type { Rng } from './rng';
import type { Fixture, World } from './types';

type Pairing = readonly [home: string, away: string];

/**
 * One leg of a round robin, using the circle method: with n clubs there are n-1 rounds and every
 * club meets every other club once. Who plays at home is then chosen round by round to keep every club
 * alternating, so nobody gets a long run of home or away matches.
 */
export function singleRoundRobin(ids: readonly string[]): Pairing[][] {
  const n = ids.length;
  if (n < 2 || n % 2 !== 0) throw new Error('A round robin needs an even number of clubs');
  const ring = ids.slice();
  const lastSide = new Map<string, 'H' | 'A'>();
  const run = new Map<string, number>();
  const homes = new Map<string, number>();
  const rounds: Pairing[][] = [];

  const played = new Map<string, number>();
  /**
   * How bad it is for a club to play on this side: the longer its current run, and the further it
   * already leans that way over the leg, the worse.
   */
  const streakCost = (club: string, side: 'H' | 'A'): number => {
    const h = homes.get(club) ?? 0;
    const lean = side === 'H' ? 2 * h - (played.get(club) ?? 0) : (played.get(club) ?? 0) - 2 * h;
    return (lastSide.get(club) === side ? (run.get(club) ?? 0) : 0) + Math.max(0, lean);
  };
  const record = (club: string, side: 'H' | 'A'): void => {
    run.set(club, lastSide.get(club) === side ? (run.get(club) ?? 0) + 1 : 1);
    lastSide.set(club, side);
    played.set(club, (played.get(club) ?? 0) + 1);
    if (side === 'H') homes.set(club, (homes.get(club) ?? 0) + 1);
  };

  for (let r = 0; r < n - 1; r++) {
    const pairs: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i] as string;
      const b = ring[n - 1 - i] as string;
      const aHome = streakCost(a, 'H') + streakCost(b, 'A');
      const bHome = streakCost(b, 'H') + streakCost(a, 'A');
      const balance = (homes.get(a) ?? 0) - (homes.get(b) ?? 0);
      const aAtHome = aHome !== bHome ? aHome < bHome : balance !== 0 ? balance < 0 : a < b;
      const [home, away] = aAtHome ? [a, b] : [b, a];
      record(home, 'H');
      record(away, 'A');
      pairs.push([home, away]);
    }
    rounds.push(pairs);
    ring.splice(1, 0, ring.pop() as string);
  }
  return rounds;
}

/**
 * Home and away: the second half of the season replays the first with the venues swapped. The rounds
 * come back in reverse order, so a club's last match before the break and its first after it are on
 * opposite sides and no long run of home or away matches can form across the middle of the season.
 */
export function doubleRoundRobin(ids: readonly string[]): Pairing[][] {
  const first = singleRoundRobin(ids);
  const second = first
    .map((round) => round.map(([home, away]): Pairing => [away, home]))
    .reverse();
  return [...first, ...second];
}

/** The full league calendar for every division. Club order within a division is shuffled, so each season differs. */
export function generateFixtures(world: World, rng: Rng): Fixture[] {
  const fixtures: Fixture[] = [];
  world.divisions.forEach((clubIds, division) => {
    if (clubIds.length !== CLUBS_PER_DIVISION) throw new Error(`Division ${division} does not have ${CLUBS_PER_DIVISION} clubs`);
    doubleRoundRobin(rng.shuffle(clubIds)).forEach((pairs, round) => {
      for (const [homeId, awayId] of pairs) fixtures.push({ division, round, homeId, awayId });
    });
  });
  return fixtures;
}
