import { marketValue } from './contracts';
import type { Rng } from './rng';
import { refillSquad, releaseReserve } from './squad';
import { FREE_AGENT, type MarketEntry, type Player, type World } from './types';

const roundTo = (n: number, step: number): number => Math.round(n / step) * step;

/** The price a club asks for a player: a little either side of his market value. */
export function askingFeeFor(player: Player, rng: Rng): number {
  return Math.max(500, roundTo(marketValue(player) * (0.95 + rng.next() * 0.15), 100));
}

/** Who a computer club would let go: players outside its best eleven, and anyone who is getting on. */
function sellable(world: World, clubId: string): Player[] {
  const club = world.clubs[clubId];
  if (!club) return [];
  const squad = club.playerIds.map((id) => world.players[id] as Player);
  const best11 = new Set([...squad].sort((a, b) => b.ability - a.ability).slice(0, 11).map((p) => p.id));
  const keepers = squad.filter((p) => p.position === 'GK').length;
  return squad.filter((p) => (!best11.has(p.id) || p.age >= 32) && (p.position !== 'GK' || keepers > 2));
}

const freeAgentEntries = (world: World): MarketEntry[] =>
  world.freeAgents.map((playerId) => ({ playerId, sellerClubId: null, askingFee: 0 }));

/** Players one computer club puts up for sale: usually one, sometimes two, sometimes none. */
function listFrom(world: World, clubId: string, rng: Rng, taken: ReadonlySet<string>): MarketEntry[] {
  const roll = rng.next();
  const count = roll < 0.25 ? 0 : roll < 0.8 ? 1 : 2;
  const pool = rng.shuffle(sellable(world, clubId).filter((p) => !taken.has(p.id)));
  return pool.slice(0, count).map((p) => ({ playerId: p.id, sellerClubId: clubId, askingFee: askingFeeFor(p, rng) }));
}

/** Builds the market from scratch: players the computer clubs are selling, plus every free agent. */
export function refreshMarket(world: World, rng: Rng): MarketEntry[] {
  const listed: MarketEntry[] = [];
  for (const club of Object.values(world.clubs)) {
    if (club.isUser) continue;
    listed.push(...listFrom(world, club.id, rng, new Set()));
  }
  world.market = [...listed, ...freeAgentEntries(world)];
  return world.market;
}

/**
 * Changes part of the market, as clubs change their minds from week to week: some listed players are taken off and
 * others put on, and the free agents are brought up to date.
 */
export function rotateMarket(world: World, rng: Rng, share = 0.3): MarketEntry[] {
  const kept = world.market.filter((e) => e.sellerClubId !== null && marketEntryIsValid(world, e) && !rng.chance(share));
  const taken = new Set(kept.map((e) => e.playerId));
  const added: MarketEntry[] = [];
  for (const club of Object.values(world.clubs)) {
    if (club.isUser || !rng.chance(share)) continue;
    added.push(...listFrom(world, club.id, rng, taken));
  }
  world.market = [...kept, ...added, ...freeAgentEntries(world)];
  return world.market;
}

/** A market entry is only good while the player is still at the club selling him, or still a free agent. */
export function marketEntryIsValid(world: World, e: MarketEntry): boolean {
  const p = world.players[e.playerId];
  if (!p) return false;
  return e.sellerClubId === null ? p.clubId === FREE_AGENT : p.clubId === e.sellerClubId;
}

export function marketEntryFor(world: World, playerId: string): MarketEntry | undefined {
  return world.market.find((e) => e.playerId === playerId && marketEntryIsValid(world, e));
}

/** Everything the user could bid for, best players first. */
export function visibleMarket(world: World): MarketEntry[] {
  return world.market
    .filter((e) => marketEntryIsValid(world, e) && world.players[e.playerId]?.clubId !== world.userClubId)
    .sort((a, b) => (world.players[b.playerId]?.ability ?? 0) - (world.players[a.playerId]?.ability ?? 0));
}

/**
 * Moves a player to a new club and pays for him. The old club's squad is topped back up, and the new club, if it is a
 * computer club, makes room by letting a reserve go. Returns the reserve released, if any.
 */
export function movePlayer(world: World, playerId: string, toClubId: string, fee: number, rng: Rng): string | null {
  const player = world.players[playerId];
  const to = world.clubs[toClubId];
  if (!player || !to) throw new Error('Unknown player or club');
  const from = world.clubs[player.clubId];
  if (from) {
    from.playerIds = from.playerIds.filter((id) => id !== playerId);
    from.cash += fee;
  }
  world.freeAgents = world.freeAgents.filter((id) => id !== playerId);
  to.cash -= fee;
  player.clubId = toClubId;
  to.playerIds.push(playerId);
  world.market = world.market.filter((e) => e.playerId !== playerId);
  world.incomingBids = world.incomingBids.filter((b) => b.playerId !== playerId);

  let released: string | null = null;
  if (!to.isUser && to.playerIds.length > 18) released = releaseReserve(world, toClubId, player.position);
  if (from && !from.isUser) refillSquad(world, from.id, rng);
  return released;
}

/**
 * Computer clubs trade with each other. A club that has a weak spot buys a better player from another club's
 * sale list, paying the asking price, and lets a reserve go to make room. Run once a week while a window is open.
 * Returns the number of transfers made.
 */
export function simulateAiTransfers(world: World, rng: Rng, attempts = 6): number {
  let done = 0;
  const buyers = rng.shuffle(Object.values(world.clubs).filter((c) => !c.isUser));
  for (const buyer of buyers.slice(0, attempts)) {
    const squad = buyer.playerIds.map((id) => world.players[id] as Player);
    const candidates = world.market
      .filter((e) => e.sellerClubId !== null && e.sellerClubId !== buyer.id && marketEntryIsValid(world, e) && !world.clubs[e.sellerClubId]?.isUser)
      .map((e) => ({ e, p: world.players[e.playerId] as Player }))
      .filter(({ e, p }) => {
        const weakest = Math.min(...squad.filter((s) => s.position === p.position).map((s) => s.ability), 999);
        return buyer.cash >= e.askingFee * 2 && p.ability > weakest + 2 && e.askingFee > 0;
      })
      .sort((a, b) => b.p.ability - a.p.ability);
    const pick = candidates[0];
    if (!pick) continue;
    movePlayer(world, pick.p.id, buyer.id, pick.e.askingFee, rng);
    done++;
  }
  return done;
}
