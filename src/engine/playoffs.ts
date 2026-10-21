import { ROUNDS_PER_SEASON } from './config';
import { playKnockout } from './knockout';
import type { Rng } from './rng';
import { tableFor } from './season';
import type { PlayoffFinal, Season, World } from './types';

export interface UserPlayoffScore {
  homeGoals: number;
  awayGoals: number;
  penalties?: [number, number] | null;
}

/** The two clubs who would meet in a division's play-off final: 3rd (at home) and 4th. Null for Division One, which has none. */
export function playoffPairing(world: World, season: Season, division: number): { homeId: string; awayId: string } | null {
  if (division === 0) return null;
  const table = tableFor(world, season, division);
  const third = table[2];
  const fourth = table[3];
  return third && fourth ? { homeId: third.clubId, awayId: fourth.clubId } : null;
}

/**
 * Plays the one-off play-off final in Divisions Two, Three and Four once the league season is over.
 * 3rd plays 4th at 3rd place's ground, and the winner is promoted. The user's final, if they are in one,
 * uses `userScore`.
 */
export function playPlayoffs(world: World, season: Season, rng: Rng, userScore?: UserPlayoffScore): PlayoffFinal[] {
  if (season.round < ROUNDS_PER_SEASON) throw new Error('The league season is not finished');
  const finals: PlayoffFinal[] = [];
  for (let division = 1; division < world.divisions.length; division++) {
    const pairing = playoffPairing(world, season, division);
    if (!pairing) continue;
    const mine = pairing.homeId === world.userClubId || pairing.awayId === world.userClubId;
    const result = playKnockout(world, season, pairing.homeId, pairing.awayId, rng, mine ? userScore : undefined);
    finals.push({ ...result, division });
  }
  return finals;
}
