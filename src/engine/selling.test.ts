import { describe, expect, it } from 'vitest';
import { TRANSFER } from './config';
import { marketValue } from './contracts';
import { acceptBid, cannotSell, counterBid, expireBids, generateBids, rejectBid } from './selling';
import { createRng } from './rng';
import { squadsAreConsistent } from './squad';
import { generateWorld } from './worldgen';

const OPEN = '2027-01-10';
const CLOSED = '2026-11-14';

const fresh = () => {
  const world = generateWorld(281);
  const user = world.clubs[world.userClubId]!;
  // Make the user's players attractive and the buyers rich so bids happen.
  for (const id of user.playerIds) world.players[id]!.ability += 6;
  for (const c of Object.values(world.clubs)) if (!c.isUser) c.cash = 3_000_000;
  return { world, user, rng: createRng(1) };
};

/** Runs generateBids on weeks until at least one offer exists. */
function withBid() {
  const s = fresh();
  for (let i = 0; i < 200 && s.world.incomingBids.length === 0; i++) generateBids(s.world, OPEN, s.rng);
  const bid = s.world.incomingBids[0];
  if (!bid) throw new Error('no bid generated');
  return { ...s, bid };
}

describe('generateBids', () => {
  it('makes no offers while the window is shut', () => {
    const { world, rng } = fresh();
    for (let i = 0; i < 100; i++) expect(generateBids(world, CLOSED, rng)).toEqual([]);
    expect(world.incomingBids).toEqual([]);
  });

  it('makes offers for the user players while the window is open, never more than five at once', () => {
    const { world, user, rng } = fresh();
    for (let i = 0; i < 100; i++) generateBids(world, OPEN, rng);
    expect(world.incomingBids.length).toBeGreaterThan(0);
    expect(world.incomingBids.length).toBeLessThanOrEqual(TRANSFER.maxBids);
    for (const b of world.incomingBids) {
      expect(user.playerIds).toContain(b.playerId);
      expect(world.clubs[b.buyerClubId]!.isUser).toBe(false);
    }
  });

  it('bids close to market value from clubs that can pay and would improve', () => {
    const { world, rng } = fresh();
    for (let i = 0; i < 100; i++) generateBids(world, OPEN, rng);
    for (const b of world.incomingBids) {
      const value = marketValue(world.players[b.playerId]!);
      expect(b.fee).toBeGreaterThanOrEqual(value * 0.85);
      expect(b.fee).toBeLessThanOrEqual(value * 1.25);
      expect(world.clubs[b.buyerClubId]!.cash).toBeGreaterThanOrEqual(b.fee * 1.3);
    }
  });

  it('only bids once for each player at a time', () => {
    const { world, rng } = fresh();
    for (let i = 0; i < 100; i++) generateBids(world, OPEN, rng);
    const ids = world.incomingBids.map((b) => b.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is more interested in better players', () => {
    const { world, user } = fresh();
    const sorted = [...user.playerIds].sort((a, b) => world.players[b]!.ability - world.players[a]!.ability);
    const counts = new Map<string, number>();
    const rng = createRng(7);
    for (let i = 0; i < 600; i++) {
      world.incomingBids = [];
      for (const b of generateBids(world, OPEN, rng)) counts.set(b.playerId, (counts.get(b.playerId) ?? 0) + 1);
    }
    const top = sorted.slice(0, 4).reduce((s, id) => s + (counts.get(id) ?? 0), 0);
    const bottom = sorted.slice(-4).reduce((s, id) => s + (counts.get(id) ?? 0), 0);
    expect(top).toBeGreaterThan(bottom);
  });
});

describe('expireBids', () => {
  it('drops offers when the window shuts, when the player has gone, or the buyer cannot pay', () => {
    const { world, rng } = fresh();
    for (let i = 0; i < 200; i++) generateBids(world, OPEN, rng);
    const n = world.incomingBids.length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(expireBids(world, OPEN)).toEqual([]);
    world.clubs[world.incomingBids[0]!.buyerClubId]!.cash = 0;
    expect(expireBids(world, OPEN)).toHaveLength(1);
    expect(world.incomingBids).toHaveLength(n - 1);
    expect(expireBids(world, CLOSED)).toHaveLength(n - 1);
    expect(world.incomingBids).toEqual([]);
  });
});

describe('acceptBid', () => {
  it('sells the player: money in, player at the buyer, buyer squad kept at eighteen', () => {
    const { world, user, rng, bid } = withBid();
    const buyer = world.clubs[bid.buyerClubId]!;
    const cash = user.cash;
    const received = acceptBid(world, OPEN, bid.id, rng);
    expect(received).toBe(bid.fee);
    expect(user.cash).toBe(cash + bid.fee);
    expect(user.playerIds).not.toContain(bid.playerId);
    expect(world.players[bid.playerId]!.clubId).toBe(buyer.id);
    expect(buyer.playerIds).toHaveLength(18);
    expect(world.incomingBids.some((b) => b.id === bid.id)).toBe(false);
    expect(squadsAreConsistent(world)).toBe(true);
  });

  it('refuses when the window is closed, the squad is too small, or the buyer has no money', () => {
    const { world, user, rng, bid } = withBid();
    expect(cannotSell(world, CLOSED, bid)).toMatch(/closed/);
    expect(() => acceptBid(world, CLOSED, bid.id, rng)).toThrow(/closed/);
    world.clubs[bid.buyerClubId]!.cash = 0;
    expect(cannotSell(world, OPEN, bid)).toMatch(/pay/);
    world.clubs[bid.buyerClubId]!.cash = 9e6;
    const keep = user.playerIds.slice();
    user.playerIds = user.playerIds.slice(0, TRANSFER.minSquad);
    user.playerIds.push(bid.playerId);
    user.playerIds = [...new Set(user.playerIds)].slice(0, TRANSFER.minSquad);
    if (!user.playerIds.includes(bid.playerId)) user.playerIds[0] = bid.playerId;
    expect(cannotSell(world, OPEN, bid)).toMatch(/too small/);
    expect(keep.length).toBeGreaterThan(TRANSFER.minSquad);
  });

  it('refuses an offer that does not exist', () => {
    const { world, rng } = fresh();
    expect(() => acceptBid(world, OPEN, 'nothing', rng)).toThrow();
  });
});

describe('rejectBid', () => {
  it('removes the offer and leaves the player where he is', () => {
    const { world, user, bid } = withBid();
    rejectBid(world, bid.id);
    expect(world.incomingBids.some((b) => b.id === bid.id)).toBe(false);
    expect(user.playerIds).toContain(bid.playerId);
    expect(() => rejectBid(world, bid.id)).toThrow();
  });
});

describe('counterBid', () => {
  it('has to ask for more than the offer', () => {
    const { world, rng, bid } = withBid();
    expect(() => counterBid(world, OPEN, bid.id, bid.fee, rng)).toThrow();
  });

  it('sells at the higher price when the club agrees', () => {
    let sold = false;
    for (let seed = 1; seed < 60 && !sold; seed++) {
      const { world, rng, bid } = withBidSeeded(seed);
      const user = world.clubs[world.userClubId]!;
      const original = bid.fee;
      const cash = user.cash;
      const r = counterBid(world, OPEN, bid.id, original + 100, rng);
      if (r.result !== 'accepted') continue;
      sold = true;
      expect(r.fee).toBe(original + 100);
      expect(world.players[bid.playerId]!.clubId).toBe(bid.buyerClubId);
      expect(user.cash).toBe(cash + original + 100);
      expect(world.incomingBids.some((b) => b.id === bid.id)).toBe(false);
      expect(squadsAreConsistent(world)).toBe(true);
    }
    expect(sold).toBe(true);
  });

  it('is likely when the ask is small and unlikely when it is big', () => {
    const rate = (factor: number): number => {
      let yes = 0;
      const n = 400;
      for (let i = 0; i < n; i++) {
        const { world, rng, bid } = withBidSeeded(i);
        const r = counterBid(world, OPEN, bid.id, Math.round(bid.fee * factor), rng);
        if (r.result === 'accepted') yes++;
      }
      return yes / n;
    };
    const small = rate(1.05);
    const big = rate(1.3);
    expect(small).toBeGreaterThan(0.6);
    expect(big).toBeLessThan(0.25);
    expect(small).toBeGreaterThan(big + 0.4);
  }, 20000);

  it('keeps the offer after one refusal and withdraws it after the second', () => {
    const { world, rng, bid } = withBid();
    const greedy = bid.fee * 4;
    const first = counterBid(world, OPEN, bid.id, greedy, rng);
    expect(first).toEqual({ result: 'refused', withdrawn: false });
    expect(world.incomingBids.some((b) => b.id === bid.id)).toBe(true);
    expect(world.incomingBids.find((b) => b.id === bid.id)!.counters).toBe(1);
    const second = counterBid(world, OPEN, bid.id, greedy, rng);
    expect(second).toEqual({ result: 'refused', withdrawn: true });
    expect(world.incomingBids.some((b) => b.id === bid.id)).toBe(false);
  });
});

function withBidSeeded(seed: number) {
  const world = generateWorld(281);
  for (const id of world.clubs[world.userClubId]!.playerIds) world.players[id]!.ability += 6;
  for (const c of Object.values(world.clubs)) if (!c.isUser) c.cash = 3_000_000;
  const rng = createRng(seed + 1000);
  for (let i = 0; i < 300 && world.incomingBids.length === 0; i++) generateBids(world, OPEN, rng);
  return { world, rng, bid: world.incomingBids[0]! };
}
