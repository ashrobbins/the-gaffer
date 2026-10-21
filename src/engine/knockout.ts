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
  const edge = Math.max(-0.02, Math.min(0.02, (homeStrength - awayStrength) / 1000));
  const scores = (strongerBy: number): boolean => rng.chance(0.75 + strongerBy);
  let home = 0;
  let away = 0;
  for (let kick = 0; kick < 5; kick++) {
    if (scores(edge)) home++;
    if (scores(-edge)) away++;
  }
  while (home === away) {
    const h = scores(edge);
    const a = scores(-edge);
    if (h) home++;
    if (a) away++;
  }
  return [home, away];
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
