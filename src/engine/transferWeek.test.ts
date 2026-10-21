import { describe, expect, it } from 'vitest';
import { summerWeeks } from './calendar';
import { totalWages } from './helpers.testutil';
import { acceptBid } from './selling';
import { completeSigning, makeOffer, startNegotiation } from './negotiation';
import { createRng } from './rng';
import { squadsAreConsistent } from './squad';
import { processTransferWeek } from './transferWeek';
import { generateWorld } from './worldgen';

describe('processTransferWeek', () => {
  it('fills the market once, even when the window is shut, so the list can always be browsed', () => {
    const world = generateWorld(291);
    const report = processTransferWeek(world, '2026-11-14', createRng(1));
    expect(report).toMatchObject({ open: false, aiTransfers: 0, newBids: [] });
    expect(world.market.length).toBeGreaterThan(40);
  });

  it('moves nothing while shut, and lets every offer lapse', () => {
    const world = generateWorld(291);
    const rng = createRng(2);
    for (const c of Object.values(world.clubs)) if (!c.isUser) c.cash = 3e6;
    for (const id of world.clubs[world.userClubId]!.playerIds) world.players[id]!.ability += 6;
    for (const date of ['2027-01-02', '2027-01-09', '2027-01-16']) processTransferWeek(world, date, rng);
    expect(world.incomingBids.length).toBeGreaterThan(0);
    const snapshot = JSON.stringify(Object.values(world.clubs).map((c) => c.playerIds));
    const lapsed = processTransferWeek(world, '2027-03-06', rng);
    expect(lapsed.aiTransfers).toBe(0);
    expect(world.incomingBids).toEqual([]);
    expect(JSON.stringify(Object.values(world.clubs).map((c) => c.playerIds))).toBe(snapshot);
  });

  it('runs a whole winter window: computer clubs trade, offers arrive, and every squad stays in order', () => {
    const world = generateWorld(292);
    const rng = createRng(3);
    for (const c of Object.values(world.clubs)) if (!c.isUser) c.cash = 2e6;
    for (const id of world.clubs[world.userClubId]!.playerIds) world.players[id]!.ability += 5;
    let trades = 0;
    let bids = 0;
    for (const date of ['2027-01-02', '2027-01-09', '2027-01-16', '2027-01-23', '2027-01-30']) {
      const r = processTransferWeek(world, date, rng);
      trades += r.aiTransfers;
      bids += r.newBids.length;
      expect(squadsAreConsistent(world)).toBe(true);
      for (const c of Object.values(world.clubs)) if (!c.isUser) expect(c.playerIds).toHaveLength(18);
    }
    expect(trades).toBeGreaterThan(5);
    expect(bids).toBeGreaterThan(0);
  });

  it('lets the user buy and sell through a summer window, keeping the books and squads straight', () => {
    const world = generateWorld(293);
    const rng = createRng(4);
    const user = world.clubs[world.userClubId]!;
    user.cash = 800_000;
    for (const c of Object.values(world.clubs)) if (!c.isUser) c.cash = 2e6;
    for (const id of user.playerIds) world.players[id]!.ability += 5;
    const startPlayers = Object.keys(world.players).length;
    let bought = 0;
    let sold = 0;
    for (const date of summerWeeks(2027)) {
      processTransferWeek(world, date, rng);
      const bid = world.incomingBids[0];
      if (bid && user.playerIds.length > 17) {
        acceptBid(world, date, bid.id, rng);
        sold++;
      }
      const entry = world.market.find((e) => e.sellerClubId !== null && world.players[e.playerId]!.clubId === e.sellerClubId);
      if (entry && user.playerIds.length < 21) {
        try {
          const n = startNegotiation(world, date, entry.playerId);
          for (let i = 0; i < 6 && (n.phase === 'fee' || n.phase === 'wage'); i++) makeOffer(world, n, date, 'high', rng);
          if (n.phase === 'done') {
            completeSigning(world, n, date, rng);
            bought++;
          }
        } catch {
          // talks that fail or cannot start are part of the game
        }
      }
      expect(squadsAreConsistent(world)).toBe(true);
    }
    expect(bought).toBeGreaterThan(0);
    expect(sold).toBeGreaterThan(0);
    for (const c of Object.values(world.clubs)) if (!c.isUser) expect(c.playerIds).toHaveLength(18);
    expect(Object.keys(world.players).length).toBeGreaterThanOrEqual(startPlayers);
    expect(totalWages(world)).toBeGreaterThan(0);
  });
});
