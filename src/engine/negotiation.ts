import { addDays, isWindowOpen } from './calendar';
import { askingWage } from './contracts';
import { TRANSFER } from './config';
import { marketEntryFor, movePlayer } from './market';
import type { Rng } from './rng';
import { FREE_AGENT, type World } from './types';

export type OfferLevel = 'low' | 'market' | 'high';
export const OFFER_LEVELS: readonly OfferLevel[] = ['low', 'market', 'high'];

export type NegotiationPhase = 'fee' | 'wage' | 'done' | 'failed';

/**
 * Signing a player is a two-step negotiation, each with three attempts: first the fee with the selling club, then
 * the wage with the player. A free agent has no fee, so his talks start with the wage.
 */
export interface Negotiation {
  playerId: string;
  /** The club selling him, or null for a free agent. */
  sellerClubId: string | null;
  phase: NegotiationPhase;
  attemptsLeft: number;
  /** The fee agreed, once the first step is done. */
  fee: number | null;
  /** The wage agreed, once the second step is done. */
  wage: number | null;
  /** The other side's counter-offer after a rejection, which can be accepted instead of making a new offer. */
  counter: number | null;
}

export interface OfferOption {
  level: OfferLevel;
  amount: number;
  /** Chance the other side says yes, 0 to 1. */
  chance: number;
  /** False if the user's club cannot pay it. */
  affordable: boolean;
}

export type OfferResult =
  | { result: 'accepted'; amount: number }
  | { result: 'rejected'; amount: number; counter: number }
  | { result: 'collapsed'; amount: number };

const roundTo = (n: number, step: number): number => Math.round(n / step) * step;
const clampChance = (c: number): number => Math.min(0.97, Math.max(0.03, c));

/** The chance a signing is possible at all: why not, or null if it can go ahead. */
export function cannotSign(world: World, date: string, playerId: string): string | null {
  const user = world.clubs[world.userClubId];
  const player = world.players[playerId];
  if (!user || !player) return 'Unknown player';
  if (!isWindowOpen(date)) return 'The transfer window is closed';
  if (player.clubId === user.id) return 'He already plays for you';
  if (!marketEntryFor(world, playerId)) return 'He is not for sale';
  if (user.playerIds.length >= TRANSFER.maxSquad) return 'The squad is full';
  const block = world.transferBlocks[playerId];
  if (block && date < block) return 'Talks broke down: try again later';
  return null;
}

export function startNegotiation(world: World, date: string, playerId: string): Negotiation {
  const why = cannotSign(world, date, playerId);
  if (why) throw new Error(why);
  const entry = marketEntryFor(world, playerId)!;
  const free = entry.sellerClubId === null;
  return {
    playerId,
    sellerClubId: entry.sellerClubId,
    phase: free ? 'wage' : 'fee',
    attemptsLeft: TRANSFER.attempts,
    fee: free ? 0 : null,
    wage: null,
    counter: null,
  };
}

/** The amount that offers are measured against in the current step: the club's price, or the wage the player expects. */
export function baseAmount(world: World, neg: Negotiation): number {
  const player = world.players[neg.playerId];
  if (!player) throw new Error('Unknown player');
  if (neg.phase === 'fee') return marketEntryFor(world, neg.playerId)?.askingFee ?? 0;
  return askingWage(player);
}

/** The step a player takes down the divisions to join the user's club, which makes him less keen. */
function divisionDrop(world: World, neg: Negotiation): number {
  const user = world.clubs[world.userClubId];
  const seller = neg.sellerClubId ? world.clubs[neg.sellerClubId] : null;
  if (!user || !seller) return 0;
  return Math.max(0, user.division - seller.division);
}

/** The three offers the user can make in the current step, with the odds of each. */
export function offerOptions(world: World, neg: Negotiation): OfferOption[] {
  if (neg.phase !== 'fee' && neg.phase !== 'wage') return [];
  const user = world.clubs[world.userClubId];
  const base = baseAmount(world, neg);
  const table = neg.phase === 'fee' ? TRANSFER.feeOffers : TRANSFER.wageOffers;
  const step = neg.phase === 'fee' ? 100 : 50;
  return OFFER_LEVELS.map((level) => {
    const amount = roundTo(base * table[level].factor, step);
    const penalty = neg.phase === 'wage' ? divisionDrop(world, neg) * TRANSFER.divisionDropPenalty : 0;
    return {
      level,
      amount,
      chance: clampChance(table[level].chance - penalty),
      affordable: neg.phase === 'fee' ? (user?.cash ?? 0) >= amount : true,
    };
  });
}

/** What the other side will do it for after turning an offer down: a bit more than the offer, but never silly. */
function counterFor(base: number, offer: number, step: number): number {
  const counter = Math.min(base * TRANSFER.counterCeiling, Math.max(offer * 1.06, base * 0.97));
  return Math.max(offer + step, roundTo(counter, step));
}

function agree(neg: Negotiation, amount: number): void {
  if (neg.phase === 'fee') {
    neg.fee = amount;
    neg.phase = 'wage';
    neg.attemptsLeft = TRANSFER.attempts;
  } else {
    neg.wage = amount;
    neg.phase = 'done';
  }
  neg.counter = null;
}

/** Makes an offer at one of the three levels. The other side accepts, turns it down with a counter-offer, or walks away after the last attempt. */
export function makeOffer(world: World, neg: Negotiation, date: string, level: OfferLevel, rng: Rng): OfferResult {
  if (neg.phase !== 'fee' && neg.phase !== 'wage') throw new Error('The talks are over');
  const option = offerOptions(world, neg).find((o) => o.level === level);
  if (!option) throw new Error('No such offer');
  if (!option.affordable) throw new Error('Not enough money');

  if (rng.chance(option.chance)) {
    agree(neg, option.amount);
    return { result: 'accepted', amount: option.amount };
  }
  neg.attemptsLeft--;
  if (neg.attemptsLeft <= 0) {
    neg.phase = 'failed';
    neg.counter = null;
    world.transferBlocks[neg.playerId] = addDays(date, TRANSFER.blockDays);
    return { result: 'collapsed', amount: option.amount };
  }
  const step = neg.phase === 'fee' ? 100 : 50;
  neg.counter = counterFor(baseAmount(world, neg), option.amount, step);
  return { result: 'rejected', amount: option.amount, counter: neg.counter };
}

/** Takes the counter-offer the other side has put on the table. It is always accepted. */
export function acceptCounter(world: World, neg: Negotiation): number {
  if (neg.counter === null) throw new Error('There is no counter-offer');
  if (neg.phase === 'fee' && (world.clubs[world.userClubId]?.cash ?? 0) < neg.counter) throw new Error('Not enough money');
  const amount = neg.counter;
  agree(neg, amount);
  return amount;
}

export interface SigningResult {
  playerId: string;
  fee: number;
  wage: number;
}

/**
 * Finishes the deal once both steps are agreed: the fee is paid, the player joins the user's club on the wage agreed
 * and a two-season contract, and the selling club's squad is topped up.
 */
export function completeSigning(world: World, neg: Negotiation, date: string, rng: Rng): SigningResult {
  if (neg.phase !== 'done' || neg.fee === null || neg.wage === null) throw new Error('The deal is not agreed yet');
  const user = world.clubs[world.userClubId];
  const player = world.players[neg.playerId];
  if (!user || !player) throw new Error('Unknown club or player');
  if (!isWindowOpen(date)) throw new Error('The transfer window is closed');
  if (user.playerIds.length >= TRANSFER.maxSquad) throw new Error('The squad is full');
  if (user.cash < neg.fee) throw new Error('Not enough money');
  if (player.clubId !== (neg.sellerClubId ?? FREE_AGENT)) throw new Error('He is no longer available');

  movePlayer(world, neg.playerId, user.id, neg.fee, rng);
  player.wage = neg.wage;
  player.contractGames = TRANSFER.signingContractGames;
  player.mood = 3.5;
  player.happiness = Math.round(player.mood);
  player.playShare = 0.5;
  return { playerId: neg.playerId, fee: neg.fee, wage: neg.wage };
}
