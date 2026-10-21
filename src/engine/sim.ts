import { SIM } from './config';
import type { Rng } from './rng';
import type { World } from './types';

/**
 * How good a club's first team is: its best goalkeeper plus its ten best fit outfield players.
 * Injured players do not count.
 */
export function teamRating(world: World, clubId: string): number {
  const club = world.clubs[clubId];
  if (!club) throw new Error(`Unknown club ${clubId}`);
  const fit = club.playerIds.map((id) => world.players[id]).filter((p) => p && !p.injury);
  const keepers = fit.filter((p) => p?.position === 'GK').map((p) => p!.ability).sort((a, b) => b - a);
  const outfield = fit.filter((p) => p?.position !== 'GK').map((p) => p!.ability).sort((a, b) => b - a);
  const xi = [...keepers.slice(0, 1), ...outfield.slice(0, 10)];
  if (xi.length === 0) return 0;
  return xi.reduce((a, b) => a + b, 0) / xi.length;
}

/**
 * Recent form from a string such as "WWDLW" (oldest first), from -3.5 (five defeats) to +3.5 (five wins).
 * Fewer than five results are scaled up, and no results at all is neutral.
 */
export function formScore(form: string): number {
  const recent = form.slice(-5);
  if (recent.length === 0) return 0;
  let points = 0;
  for (const c of recent) points += c === 'W' ? 1 : c === 'D' ? 0.5 : 0;
  return (points / recent.length) * 5 - 2.5;
}

/** A club's strength going into a match: ability, plus recent form, plus a nudge for league position. */
export function matchStrength(rating: number, form: string, position: number, clubsInDivision: number): number {
  const middle = (clubsInDivision + 1) / 2;
  return rating + formScore(form) * SIM.formWeight + (middle - position) * SIM.positionWeight;
}

/** Expected goals for each side from their strengths. A bigger gap means a bigger goal difference, never a certainty. */
export function expectedGoals(homeStrength: number, awayStrength: number): { home: number; away: number } {
  const gap = Math.max(-SIM.maxGap, Math.min(SIM.maxGap, homeStrength - awayStrength + SIM.homeAdvantage));
  return {
    home: SIM.homeGoals * Math.exp(gap / SIM.goalScale),
    away: SIM.awayGoals * Math.exp(-gap / SIM.goalScale),
  };
}

/** A whole number of goals with the given average (Knuth's method). */
export function poisson(rng: Rng, mean: number): number {
  const limit = Math.exp(-mean);
  let goals = 0;
  let p = rng.next();
  while (p > limit) {
    goals++;
    p *= rng.next();
  }
  return goals;
}

export function simulateScore(homeStrength: number, awayStrength: number, rng: Rng): { homeGoals: number; awayGoals: number } {
  const xg = expectedGoals(homeStrength, awayStrength);
  return { homeGoals: poisson(rng, xg.home), awayGoals: poisson(rng, xg.away) };
}
