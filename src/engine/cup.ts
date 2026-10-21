import { CUP_PRELIM_CLUBS, CUP_ROUND_AFTER_MATCHDAY, CUP_ROUND_NAMES } from './config';
import { playKnockout } from './knockout';
import type { Rng } from './rng';
import type { Cup, CupRound, CupTie, Season, World } from './types';

export interface UserCupScore {
  homeGoals: number;
  awayGoals: number;
  penalties?: [number, number] | null;
}

const blankTie = (round: number, homeId: string, awayId: string): CupTie => ({
  round,
  homeId,
  awayId,
  homeGoals: 0,
  awayGoals: 0,
  penalties: null,
  winnerId: '',
  played: false,
});

/** Pairs clubs in the order given, the first of each pair at home. */
function drawRound(round: number, clubIds: readonly string[]): CupTie[] {
  const ties: CupTie[] = [];
  for (let i = 0; i < clubIds.length; i += 2) ties.push(blankTie(round, clubIds[i] as string, clubIds[i + 1] as string));
  return ties;
}

/**
 * A new cup for every club in every division. 32 clubs are drawn into the preliminary round and the other
 * 48 are given a bye into Round 1, which then has 64 clubs. After that it is straight knockout to the final.
 */
export function createCup(world: World, rng: Rng, year: number): Cup {
  const everyone = rng.shuffle(Object.keys(world.clubs));
  const prelim = everyone.slice(0, CUP_PRELIM_CLUBS);
  const rounds: CupRound[] = CUP_ROUND_NAMES.map((name) => ({ name, ties: [], played: false }));
  (rounds[0] as CupRound).ties = drawRound(0, prelim);
  return { year, rounds, byes: everyone.slice(CUP_PRELIM_CLUBS), winnerId: null };
}

/** The next round that has been drawn but not played, or null if the cup is over. */
export function nextCupRound(cup: Cup): number | null {
  const i = cup.rounds.findIndex((r) => !r.played);
  return i === -1 || (cup.rounds[i] as CupRound).ties.length === 0 ? null : i;
}

/** The round due now, given how many league matchdays have been played, or null. */
export function cupRoundDue(cup: Cup, matchdaysPlayed: number): number | null {
  const i = nextCupRound(cup);
  if (i === null) return null;
  return matchdaysPlayed >= (CUP_ROUND_AFTER_MATCHDAY[i] as number) ? i : null;
}

/** Every club still in the cup. Before the preliminary round has been played that is all of them. */
export function clubsStillIn(cup: Cup): string[] {
  const lastPlayed = cup.rounds.map((r) => r.played).lastIndexOf(true);
  if (lastPlayed === -1) return [...cup.byes, ...(cup.rounds[0] as CupRound).ties.flatMap((t) => [t.homeId, t.awayId])];
  const round = cup.rounds[lastPlayed] as CupRound;
  const winners = round.ties.map((t) => t.winnerId);
  return lastPlayed === 0 ? [...cup.byes, ...winners] : winners;
}

/** The user's tie in a round, or null if they have no match in it (out already, or a bye). */
export function userTie(world: World, round: CupRound): CupTie | null {
  return round.ties.find((t) => t.homeId === world.userClubId || t.awayId === world.userClubId) ?? null;
}

export type UserCupStatus =
  | { status: 'in' }
  | { status: 'out'; round: number; by: string }
  | { status: 'won' };

export function userCupStatus(world: World, cup: Cup): UserCupStatus {
  if (cup.winnerId === world.userClubId) return { status: 'won' };
  for (let i = 0; i < cup.rounds.length; i++) {
    const tie = userTie(world, cup.rounds[i] as CupRound);
    if (tie?.played && tie.winnerId !== world.userClubId) {
      return { status: 'out', round: i, by: tie.winnerId };
    }
  }
  return { status: 'in' };
}

/**
 * Plays the next drawn round, then draws the one after. Every tie is simulated except the user's, which uses
 * `userScore` if given. Mutates the cup and returns the ties played.
 */
export function playCupRound(world: World, season: Season, cup: Cup, rng: Rng, userScore?: UserCupScore): CupTie[] {
  const i = nextCupRound(cup);
  if (i === null) throw new Error('There is no cup round to play');
  const round = cup.rounds[i] as CupRound;

  round.ties = round.ties.map((tie) => {
    const mine = tie.homeId === world.userClubId || tie.awayId === world.userClubId;
    const result = playKnockout(world, season, tie.homeId, tie.awayId, rng, mine ? userScore : undefined);
    return { ...result, round: i, played: true };
  });
  round.played = true;

  const winners = round.ties.map((t) => t.winnerId);
  if (i === cup.rounds.length - 1) {
    cup.winnerId = winners[0] as string;
  } else {
    const entrants = i === 0 ? [...cup.byes, ...winners] : winners;
    (cup.rounds[i + 1] as CupRound).ties = drawRound(i + 1, rng.shuffle(entrants));
  }
  return round.ties;
}

/**
 * Plays every cup round that is due and does not involve the user: all of them once the user is out, or in
 * a round they have a bye. Stops as soon as the user has a tie to play. Returns the rounds played.
 */
export function autoPlayCup(world: World, season: Season, cup: Cup, rng: Rng): number[] {
  const played: number[] = [];
  for (;;) {
    const due = cupRoundDue(cup, season.round);
    if (due === null) break;
    if (userTie(world, cup.rounds[due] as CupRound)) break;
    playCupRound(world, season, cup, rng);
    played.push(due);
  }
  return played;
}
