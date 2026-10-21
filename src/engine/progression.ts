import { CONTRACT } from './config';
import { injuryChancePerMinute, injurySeverity } from './match';
import type { MatchState, Side } from './matchTypes';
import { INJURY_KINDS } from './data/names';
import type { Rng } from './rng';
import type { Player, World } from './types';
import { emptyStats } from './worldgen';
import { marketValue } from './contracts';

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * How well a player did in a match, from 3 to 10, with 6 meaning an ordinary game. Goals, the result, clean sheets for
 * defenders and cards all count; a short appearance counts for less.
 */
export function performanceRating(
  player: Pick<Player, 'position'>,
  m: { minutes: number; goals: number; yellowCards: number; redCards: number },
  teamGoals: number,
  conceded: number,
  rng: Rng,
): number {
  let r = 6;
  r += Math.min(2.7, m.goals * 0.9);
  r += teamGoals > conceded ? 0.35 : teamGoals < conceded ? -0.35 : 0;
  if (player.position === 'GK' || ['LB', 'CB', 'RB', 'DM'].includes(player.position)) {
    r += conceded === 0 ? 0.5 : -Math.min(0.6, conceded * 0.15);
  }
  r -= m.yellowCards * 0.3 + m.redCards * 1.5;
  r += rng.normal(0, 0.35);
  const share = clamp(m.minutes / 60, 0.2, 1);
  r = 6 + (r - 6) * share;
  return clamp(r, 3, 10);
}

/** Form from a match rating: 6.5 is a 3 out of 5, and each point of rating is worth a little over one point of form. */
export const formTarget = (rating: number): number => clamp(3 + (rating - 6.5) * 1.2, 1, 5);

const growthAgeFactor = (age: number): number => (age <= 21 ? 1.6 : age <= 24 ? 1.3 : age <= 28 ? 1 : age <= 31 ? 0.6 : 0.3);

/**
 * Adds progress towards the next rating point. At 100 the player gains a point, as long as he has not reached his
 * potential. A player at his potential keeps the progress topped up just below the next point.
 */
export function addGrowth(player: Player, amount: number): boolean {
  player.growth += amount;
  let gained = false;
  while (player.growth >= 100) {
    if (player.ability >= player.potential) {
      player.growth = 99;
      break;
    }
    player.ability = Math.min(99, player.ability + 1);
    player.growth -= 100;
    gained = true;
  }
  player.growth = Math.max(0, player.growth);
  return gained;
}

/** How happy a player should be, from 1 to 5: form and playing time, with starters expecting to play and fringe players not. */
export function moodTarget(player: Player, expectation: number): number {
  const formShare = (player.formRating - 1) / 4;
  const playSatisfaction = Math.min(1, player.playShare / Math.max(0.05, expectation));
  return 1 + 4 * (0.5 * formShare + 0.5 * playSatisfaction);
}

/** How much a club's player expects to play: its best eleven expect to start, the next few to feature, the rest to watch. */
function expectationFor(world: World, player: Player): number {
  const club = world.clubs[player.clubId];
  if (!club) return 0.2;
  const rank = club.playerIds
    .map((id) => world.players[id] as Player)
    .sort((a, b) => b.ability - a.ability)
    .findIndex((p) => p.id === player.id);
  return rank < 11 ? 1 : rank < 14 ? 0.5 : 0.2;
}

/**
 * Updates players after a match the user played: form from how each played, progress towards a better rating,
 * playing time, and mood. Call after `finishMatch`. Applies to every player of both clubs.
 */
export function applyMatchProgression(world: World, state: MatchState, rng: Rng): void {
  for (const side of ['home', 'away'] as Side[]) {
    const club = world.clubs[state.sides[side].clubId];
    if (!club) continue;
    const goalsFor = state.score[side === 'home' ? 0 : 1];
    const conceded = state.score[side === 'home' ? 1 : 0];
    for (const id of club.playerIds) {
      const player = world.players[id];
      if (!player) continue;
      const pm = state.players[id];
      const minutes = pm?.minutes ?? 0;
      player.playShare = clamp(player.playShare * 0.8 + 0.2 * (minutes / 90), 0, 1);

      if (pm && minutes > 0) {
        const rating = performanceRating(player, pm, goalsFor, conceded, rng);
        player.formRating = clamp(player.formRating * 0.7 + formTarget(rating) * 0.3, 1, 5);
        const gain = (rating - 5.8) * 3.5 * growthAgeFactor(player.age) * clamp(minutes / 90, 0.2, 1);
        if (gain > 0) addGrowth(player, gain);
      } else {
        player.formRating = clamp(player.formRating + (3 - player.formRating) * 0.05, 1, 5);
      }
      player.form = Math.round(player.formRating);
      player.mood = clamp(player.mood * 0.85 + moodTarget(player, expectationFor(world, player)) * 0.15, 1, 5);
      player.happiness = Math.round(player.mood);
    }
  }
}

/** Fatigue left after a week's rest: some fixed recovery plus a share of what is there. */
export const recoveredFatigue = (fatigue: number): number =>
  Math.max(0, fatigue - (CONTRACT.recoveryFlat + CONTRACT.recoveryShare * fatigue));

/** Between matchdays every player rests, and every injury heals by a week. */
export function recoverBetweenMatches(world: World): string[] {
  const healed: string[] = [];
  for (const p of Object.values(world.players)) {
    p.fatigue = Math.round(recoveredFatigue(p.fatigue));
    if (p.injury) {
      p.injury.weeks--;
      if (p.injury.weeks <= 0) {
        p.injury = null;
        healed.push(p.id);
      }
    }
  }
  return healed;
}

/**
 * Injuries to the players of computer clubs, which are not played minute by minute. Each fit player has a small
 * chance each week, higher when tired: about two thirds of the squad play a match, so that is the exposure.
 * Returns the players hurt.
 */
export function rollAiInjuries(world: World, rng: Rng): string[] {
  const hurt: string[] = [];
  for (const club of Object.values(world.clubs)) {
    if (club.isUser) continue;
    for (const id of club.playerIds) {
      const p = world.players[id];
      if (!p || p.injury) continue;
      if (rng.chance(injuryChancePerMinute(p.fatigue, p.age) * 90 * 0.65)) {
        p.injury = { weeks: injurySeverity(rng), kind: rng.pick(INJURY_KINDS) };
        hurt.push(id);
      }
    }
  }
  return hurt;
}

/**
 * The end of a season for every player: a year older, new ratings, and a clean slate for the season's figures.
 * Young players grow towards their potential, players in their prime hold steady, and older players slip.
 * Players who played well all season have already banked their growth in matches, so this is the background change.
 */
export function endOfSeasonProgression(world: World, rng: Rng): void {
  for (const p of Object.values(world.players)) {
    p.age++;
    const gap = Math.max(0, p.potential - p.ability);
    let delta: number;
    if (p.age <= 23) delta = clamp(Math.round(rng.normal(gap * 0.35, 1.2)), -1, gap);
    else if (p.age <= 29) delta = clamp(Math.round(rng.normal(0.3, 1)), -1, Math.min(2, gap));
    else if (p.age <= 32) delta = clamp(Math.round(rng.normal(-0.4, 1)), -2, 1);
    else delta = clamp(Math.round(rng.normal(-1.2, 1)), -3, 0);
    p.ability = clamp(p.ability + delta, 38, 95);
    p.potential = p.age >= 26 ? p.ability : Math.max(p.ability, p.potential);
    p.growth = 0;
    p.seasonStats = emptyStats();
    p.value = marketValue(p);
  }
}
