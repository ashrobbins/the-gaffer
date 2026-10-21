import { isWindowOpen } from './calendar';
import { marketValue } from './contracts';
import { TRANSFER } from './config';
import { movePlayer } from './market';
import type { Rng } from './rng';
import type { Player, TransferBid, World } from './types';

const roundTo = (n: number, step: number): number => Math.round(n / step) * step;

/** How much a computer club needs a player: how far he would improve its weakest starter in his position. */
function improvement(world: World, buyerId: string, player: Player): number {
  const club = world.clubs[buyerId];
  if (!club) return 0;
  const same = club.playerIds.map((id) => world.players[id] as Player).filter((p) => p.position === player.position);
  const weakest = Math.min(...same.map((p) => p.ability), 999);
  return player.ability - weakest;
}

/**
 * Computer clubs make offers for the user's players while a window is open. Better players draw more interest, and
 * a club only bids for someone who would improve it, with the money to pay. There are never more than a few offers
 * waiting at once. Returns the new bids.
 */
export function generateBids(world: World, date: string, rng: Rng): TransferBid[] {
  if (!isWindowOpen(date)) return [];
  const user = world.clubs[world.userClubId];
  if (!user) return [];
  const added: TransferBid[] = [];
  const buyers = Object.values(world.clubs).filter((c) => !c.isUser);

  for (const id of user.playerIds) {
    if (world.incomingBids.length + added.length >= TRANSFER.maxBids) break;
    const player = world.players[id] as Player;
    if (world.incomingBids.some((b) => b.playerId === id)) continue;
    const appeal = 0.03 + Math.max(0, player.ability - 66) * 0.012;
    if (!rng.chance(Math.min(0.3, appeal))) continue;
    const fee = roundTo(marketValue(player) * (0.9 + rng.next() * 0.3), 100);
    const interested = buyers.filter((b) => b.cash >= fee * 1.3 && improvement(world, b.id, player) > 0);
    if (interested.length === 0) continue;
    const buyer = rng.pick(interested);
    added.push({ id: `bid-${id}-${world.incomingBids.length + added.length}`, playerId: id, buyerClubId: buyer.id, fee, counters: 0 });
  }
  world.incomingBids.push(...added);
  return added;
}

/** Drops offers that are no longer possible: the window has shut, the player has gone, or the buyer cannot pay. */
export function expireBids(world: World, date: string): TransferBid[] {
  const user = world.clubs[world.userClubId];
  const open = isWindowOpen(date);
  const dropped = world.incomingBids.filter(
    (b) => !open || world.players[b.playerId]?.clubId !== user?.id || (world.clubs[b.buyerClubId]?.cash ?? 0) < b.fee,
  );
  world.incomingBids = world.incomingBids.filter((b) => !dropped.includes(b));
  return dropped;
}

export function cannotSell(world: World, date: string, bid: TransferBid): string | null {
  const user = world.clubs[world.userClubId];
  if (!user) return 'No club';
  if (!isWindowOpen(date)) return 'The transfer window is closed';
  if (world.players[bid.playerId]?.clubId !== user.id) return 'He is no longer at the club';
  if (user.playerIds.length <= TRANSFER.minSquad) return 'The squad is too small to sell anyone';
  if ((world.clubs[bid.buyerClubId]?.cash ?? 0) < bid.fee) return 'The buyer can no longer pay';
  return null;
}

const findBid = (world: World, bidId: string): TransferBid => {
  const bid = world.incomingBids.find((b) => b.id === bidId);
  if (!bid) throw new Error('No such offer');
  return bid;
};

/** Accepts an offer: the player leaves, the fee is paid, and the buying club makes room for him. */
export function acceptBid(world: World, date: string, bidId: string, rng: Rng): number {
  const bid = findBid(world, bidId);
  const why = cannotSell(world, date, bid);
  if (why) throw new Error(why);
  const user = world.clubs[world.userClubId] as { cash: number };
  const before = user.cash;
  const player = world.players[bid.playerId] as Player;
  movePlayer(world, bid.playerId, bid.buyerClubId, bid.fee, rng);
  player.contractGames = Math.max(player.contractGames, 38);
  return user.cash - before;
}

export function rejectBid(world: World, bidId: string): void {
  findBid(world, bidId);
  world.incomingBids = world.incomingBids.filter((b) => b.id !== bidId);
}

export type CounterResult = { result: 'accepted'; fee: number } | { result: 'refused'; withdrawn: boolean };

/**
 * Asks a club for more than it offered. The further above the offer, the less likely it agrees, and asking for half as much again is never accepted. If it agrees, the sale
 * goes through at the new price. If it refuses, the offer stays, but a second refusal makes the club walk away.
 */
export function counterBid(world: World, date: string, bidId: string, fee: number, rng: Rng): CounterResult {
  const bid = findBid(world, bidId);
  if (fee <= bid.fee) throw new Error('A counter-offer must ask for more');
  const buyer = world.clubs[bid.buyerClubId];
  if (!buyer || buyer.cash < fee) {
    bid.counters++;
    return refuse(world, bid);
  }
  const ratio = fee / bid.fee;
  const chance = ratio > 1.5 ? 0 : Math.min(0.9, Math.max(0.05, 0.85 - (ratio - 1) * 2.5));
  if (rng.chance(chance)) {
    bid.fee = fee;
    acceptBid(world, date, bidId, rng);
    return { result: 'accepted', fee };
  }
  bid.counters++;
  return refuse(world, bid);
}

function refuse(world: World, bid: TransferBid): CounterResult {
  const withdrawn = bid.counters >= 2;
  if (withdrawn) world.incomingBids = world.incomingBids.filter((b) => b.id !== bid.id);
  return { result: 'refused', withdrawn };
}
