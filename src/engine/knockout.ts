import { SIM } from './config';
import type { Rng } from './rng';
import { formScore, simulateScore, teamRating } from './sim';
import { clubForm } from './season';
import type { KnockoutResult, Season, World } from './types';

/** A club's strength for a one-off match: its team rating and recent form. League position is ignored, since the clubs may be in different divisions. */
export function cupStrength(world: World, season: Season, clubId: string): number {
  return teamRating(world, clubId) + formScore(clubForm(season, clubId)) * SIM.formWeight;
}

/**
 * A penalty shoot-out. Five kicks each, then sudden death. A stronger side is only a touch more likely to score: shoot-outs are close to a coin flip.
 * Returns the score, which is never level.
 */
export function shootout(rng: Rng, homeStrength: number, awayStrength: number): [number, number] {
  return shootoutKicks(rng, homeStrength, awayStrength).score;
}

export interface ShootoutKick {
  side: 'home' | 'away';
  scored: boolean;
}

/**
 * A shoot-out played kick by kick, home first. Five kicks each, stopping as soon as one side cannot be caught, then
 * sudden death. Takes the same odds as `shootout`, so a slightly stronger side has a slightly better chance.
 */
export function shootoutKicks(rng: Rng, homeStrength: number, awayStrength: number): { kicks: ShootoutKick[]; score: [number, number] } {
  const edge = Math.max(-0.02, Math.min(0.02, (homeStrength - awayStrength) / 1000));
  const kicks: ShootoutKick[] = [];
  const score = { home: 0, away: 0 };
  const taken = { home: 0, away: 0 };
  const take = (side: 'home' | 'away'): void => {
    const scored = rng.chance(0.75 + (side === 'home' ? edge : -edge));
    kicks.push({ side, scored });
    taken[side]++;
    if (scored) score[side]++;
  };
  const decided = (): boolean => {
    if (taken.home < 5 || taken.away < 5) {
      return score.home > score.away + (5 - taken.away) || score.away > score.home + (5 - taken.home);
    }
    return taken.home === taken.away && score.home !== score.away;
  };
  for (;;) {
    take('home');
    if (decided()) break;
    take('away');
    if (decided()) break;
  }
  return { kicks, score: [score.home, score.away] };
}

/**
 * One match that must have a winner: cup ties and the play-off final.
 * If `played` is given (the user played the match themselves) that score is used; a level score with no
 * shoot-out score gets a simulated shoot-out.
 */
export function playKnockout(
  world: World,
  season: Season,
  homeId: string,
  awayId: string,
  rng: Rng,
  played?: { homeGoals: number; awayGoals: number; penalties?: [number, number] | null },
): KnockoutResult {
  const homeStrength = cupStrength(world, season, homeId);
  const awayStrength = cupStrength(world, season, awayId);
  const score = played ?? simulateScore(homeStrength, awayStrength, rng);
  let penalties: [number, number] | null = null;
  let winnerId: string;
  if (score.homeGoals !== score.awayGoals) {
    winnerId = score.homeGoals > score.awayGoals ? homeId : awayId;
  } else {
    const given = played?.penalties;
    if (given && given[0] === given[1]) throw new Error('A shoot-out cannot be level');
    penalties = given ?? shootout(rng, homeStrength, awayStrength);
    winnerId = penalties[0] > penalties[1] ? homeId : awayId;
  }
  return { homeId, awayId, homeGoals: score.homeGoals, awayGoals: score.awayGoals, penalties, winnerId };
}
