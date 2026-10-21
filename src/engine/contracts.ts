import { CONTRACT } from './config';
import type { Rng } from './rng';
import { FREE_AGENT, type Player, type World } from './types';
import { valueFor, wageForAbility } from './worldgen';

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const roundTo = (n: number, step: number): number => Math.round(n / step) * step;

/** What a player expects to be paid: what he earns now, or the going rate for his rating if that is higher. */
export const askingWage = (player: Pick<Player, 'wage' | 'ability'>): number => Math.max(player.wage, wageForAbility(player.ability));

/** A player's current market value. It follows his rating and age, not his old wage. */
export const marketValue = (player: Pick<Player, 'ability' | 'age'>): number => valueFor(wageForAbility(player.ability), player.age);

/**
 * The chance, from 0 to 100, that a player agrees to a new deal. A happy player in good form is keen; more money
 * helps, and offering less than he expects hurts badly. He prefers a short deal a little, and a long one slightly less.
 */
export function renewalChance(player: Player, offerWage: number, games: number): number {
  const ratio = offerWage / askingWage(player);
  const length = games <= CONTRACT.minGames ? 4 : games >= CONTRACT.maxGames ? -6 : 0;
  const underpaid = offerWage < player.wage ? -30 : 0;
  const chance = player.mood * 14 + player.formRating * 3 + (ratio - 1) * 100 * 0.9 + length + underpaid;
  return Math.round(clamp(chance, 0, 100));
}

export interface RenewalResult {
  accepted: boolean;
  chance: number;
}

/** Offers a player a new contract. If he accepts, his wage and contract length are updated. */
export function offerRenewal(world: World, playerId: string, offerWage: number, games: number, rng: Rng): RenewalResult {
  const player = world.players[playerId];
  if (!player) throw new Error(`Unknown player ${playerId}`);
  if (player.clubId === FREE_AGENT) throw new Error('He is not at the club');
  if (offerWage <= 0) throw new Error('The wage must be more than nothing');
  if (games < CONTRACT.minGames || games > CONTRACT.maxGames) throw new Error('The contract length is out of range');
  const chance = renewalChance(player, offerWage, games);
  const accepted = rng.chance(chance / 100);
  if (accepted) {
    player.wage = roundTo(offerWage, 50);
    player.contractGames = games;
  }
  return { accepted, chance };
}

/** Lets a player go. He leaves the club and joins the pool of players without one. */
export function releasePlayer(world: World, playerId: string): void {
  const player = world.players[playerId];
  if (!player) throw new Error(`Unknown player ${playerId}`);
  const club = world.clubs[player.clubId];
  if (club) club.playerIds = club.playerIds.filter((id) => id !== playerId);
  player.clubId = FREE_AGENT;
  if (!world.freeAgents.includes(playerId)) world.freeAgents.push(playerId);
}

export interface ContractReport {
  /** Players whose contracts ran out and who were not kept: they have left. */
  released: string[];
  /** Players a computer club re-signed. */
  renewed: string[];
}

/**
 * Runs every contract down by one matchday. When a computer club's player reaches the end, the club re-signs him
 * on the going rate. When the user's player reaches the end, he leaves the club.
 */
export function tickContracts(world: World, rng: Rng): ContractReport {
  const report: ContractReport = { released: [], renewed: [] };
  for (const player of Object.values(world.players)) {
    if (player.clubId === FREE_AGENT) continue;
    player.contractGames = Math.max(0, player.contractGames - 1);
    if (player.contractGames > 0) continue;
    if (world.clubs[player.clubId]?.isUser) {
      releasePlayer(world, player.id);
      report.released.push(player.id);
    } else {
      player.wage = Math.max(300, roundTo(wageForAbility(player.ability), 50));
      player.contractGames = rng.int(CONTRACT.minGames, CONTRACT.maxGames);
      report.renewed.push(player.id);
    }
  }
  return report;
}

/** A club's players whose contracts are about to run out, soonest first. */
export function contractsExpiringSoon(world: World, clubId: string, withinGames = 10): Player[] {
  const club = world.clubs[clubId];
  if (!club) throw new Error(`Unknown club ${clubId}`);
  return club.playerIds
    .map((id) => world.players[id] as Player)
    .filter((p) => p.contractGames <= withinGames)
    .sort((a, b) => a.contractGames - b.contractGames);
}
