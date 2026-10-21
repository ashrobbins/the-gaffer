import { createRng } from './rng';
import type { Player, Position, World } from './types';

/** How likely each position is to score, before ability is taken into account. */
const SCORING_WEIGHT: Record<Position, number> = { GK: 0, CB: 0.5, LB: 0.7, RB: 0.7, DM: 1, CM: 1.6, LM: 2, RM: 2, AM: 3, LW: 3.2, RW: 3.2, ST: 5 };

/** The players a club is most likely to field: the best eleven who are fit. Computer clubs have no saved team sheet. */
function regulars(world: World, clubId: string): Player[] {
  const club = world.clubs[clubId];
  if (!club) return [];
  return club.playerIds
    .map((id) => world.players[id] as Player)
    .filter((p) => !p.injury)
    .sort((a, b) => b.ability - a.ability)
    .slice(0, 11);
}

/**
 * Gives a computer club's goals to its players, so the top scorers table is built from real players. The scorer is
 * drawn from the club's best eleven, weighted by position and ability. It uses its own random numbers, seeded from the
 * match, so crediting goals never changes the results of the league.
 */
export function creditGoals(world: World, clubId: string, goals: number, seed: number): void {
  if (goals <= 0) return;
  const team = regulars(world, clubId);
  const weights = team.map((p) => SCORING_WEIGHT[p.position] * Math.pow(p.ability / 50, 3));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return;
  const rng = createRng(seed);
  for (let g = 0; g < goals; g++) {
    let roll = rng.next() * total;
    const i = weights.findIndex((w) => (roll -= w) < 0);
    const scorer = team[i === -1 ? team.length - 1 : i] as Player;
    scorer.seasonStats.goals++;
    scorer.careerStats.goals++;
  }
}

export interface ScorerRow {
  playerId: string;
  clubId: string;
  goals: number;
}

/** The leading scorers in a division this season, most goals first. */
export function topScorers(world: World, division: number, limit = 12): ScorerRow[] {
  const rows: ScorerRow[] = [];
  for (const clubId of world.divisions[division] ?? []) {
    for (const id of world.clubs[clubId]?.playerIds ?? []) {
      const p = world.players[id] as Player;
      if (p.seasonStats.goals > 0) rows.push({ playerId: id, clubId, goals: p.seasonStats.goals });
    }
  }
  return rows.sort((a, b) => b.goals - a.goals || a.playerId.localeCompare(b.playerId)).slice(0, limit);
}
