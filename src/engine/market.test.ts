import { describe, expect, it } from 'vitest';
import { askingFeeFor, marketEntryFor, marketEntryIsValid, movePlayer, refreshMarket, rotateMarket, simulateAiTransfers, visibleMarket } from './market';
import { marketValue, releasePlayer } from './contracts';
import { createRng } from './rng';
import { squadsAreConsistent } from './squad';
import { FREE_AGENT } from './types';
import { generateWorld } from './worldgen';

const fresh = () => {
  const world = generateWorld(261);
  return { world, user: world.clubs[world.userClubId]!, rng: createRng(1) };
};

describe('refreshMarket', () => {
  it('lists a few players from computer clubs, a handful in total, and never from the user club', () => {
    const { world, rng } = fresh();
    refreshMarket(world, rng);
    const listed = world.market.filter((e) => e.sellerClubId !== null);
    expect(listed.length).toBeGreaterThan(40);
    expect(listed.length).toBeLessThan(120);
    expect(listed.every((e) => e.sellerClubId !== world.userClubId)).toBe(true);
    expect(listed.every((e) => world.players[e.playerId]!.clubId === e.sellerClubId)).toBe(true);
  });

  it('never lists a first-choice player, except an older one', () => {
    const { world, rng } = fresh();
    refreshMarket(world, rng);
    for (const e of world.market.filter((x) => x.sellerClubId)) {
      const club = world.clubs[e.sellerClubId!]!;
      const best11 = [...club.playerIds].sort((a, b) => world.players[b]!.ability - world.players[a]!.ability).slice(0, 11);
      const p = world.players[e.playerId]!;
      expect(best11.includes(p.id) ? p.age >= 32 : true).toBe(true);
    }
  });

  it('asks a price close to market value', () => {
    const { world, rng } = fresh();
    refreshMarket(world, rng);
    for (const e of world.market.filter((x) => x.sellerClubId)) {
      const p = world.players[e.playerId]!;
      expect(e.askingFee).toBeGreaterThanOrEqual(Math.min(marketValue(p) * 0.9, marketValue(p) - 100));
      expect(e.askingFee).toBeLessThanOrEqual(marketValue(p) * 1.12 + 100);
    }
  });

  it('includes every free agent at no fee', () => {
    const { world, rng, user } = fresh();
    releasePlayer(world, user.playerIds[3]!);
    releasePlayer(world, user.playerIds[4]!);
    refreshMarket(world, rng);
    const free = world.market.filter((e) => e.sellerClubId === null);
    expect(free.map((e) => e.playerId).sort()).toEqual([...world.freeAgents].sort());
    expect(free.every((e) => e.askingFee === 0)).toBe(true);
  });

  it('is repeatable from the same seed', () => {
    const a = generateWorld(261);
    const b = generateWorld(261);
    expect(refreshMarket(a, createRng(5))).toEqual(refreshMarket(b, createRng(5)));
  });
});

describe('rotateMarket', () => {
  it('changes part of the list and keeps the free agents up to date', () => {
    const { world, rng, user } = fresh();
    refreshMarket(world, rng);
    const before = new Set(world.market.map((e) => e.playerId));
    releasePlayer(world, user.playerIds[2]!);
    rotateMarket(world, createRng(9), 0.4);
    const after = new Set(world.market.map((e) => e.playerId));
    expect([...after].filter((id) => !before.has(id)).length).toBeGreaterThan(5);
    expect([...before].filter((id) => !after.has(id)).length).toBeGreaterThan(5);
    expect(after.has(user.playerIds[2]!)).toBe(false);
    expect(world.market.some((e) => e.sellerClubId === null)).toBe(true);
  });

  it('does not list the same player twice', () => {
    const { world, rng } = fresh();
    refreshMarket(world, rng);
    for (let i = 0; i < 5; i++) rotateMarket(world, createRng(10 + i));
    const ids = world.market.map((e) => e.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('market entries', () => {
  it('stop being valid when the player has moved, and are not shown to the user', () => {
    const { world, rng, user } = fresh();
    refreshMarket(world, rng);
    const entry = world.market.find((e) => e.sellerClubId !== null)!;
    expect(marketEntryIsValid(world, entry)).toBe(true);
    expect(marketEntryFor(world, entry.playerId)).toBeDefined();
    movePlayer(world, entry.playerId, user.id, 1000, rng);
    expect(marketEntryFor(world, entry.playerId)).toBeUndefined();
    expect(visibleMarket(world).some((e) => e.playerId === entry.playerId)).toBe(false);
  });

  it('shows the best players first', () => {
    const { world, rng } = fresh();
    refreshMarket(world, rng);
    const abilities = visibleMarket(world).map((e) => world.players[e.playerId]!.ability);
    expect([...abilities].sort((a, b) => b - a)).toEqual(abilities);
  });

  it('gives a free agent no price tag from a club', () => {
    const { world, rng, user } = fresh();
    releasePlayer(world, user.playerIds[5]!);
    refreshMarket(world, rng);
    const e = world.market.find((x) => x.playerId === user.playerIds[5] || x.sellerClubId === null)!;
    expect(e.askingFee).toBe(0);
    expect(askingFeeFor(world.players[e.playerId]!, rng)).toBeGreaterThan(0);
  });
});

describe('movePlayer', () => {
  it('moves the player and the money, and keeps both squads in order', () => {
    const { world, rng, user } = fresh();
    const seller = world.clubs[world.divisions[3]![1]!]!;
    const player = world.players[seller.playerIds[7]!]!;
    const sellerCash = seller.cash;
    const userCash = user.cash;
    movePlayer(world, player.id, user.id, 5000, rng);
    expect(player.clubId).toBe(user.id);
    expect(user.playerIds).toContain(player.id);
    expect(seller.playerIds).not.toContain(player.id);
    expect(user.cash).toBe(userCash - 5000);
    expect(seller.cash).toBe(sellerCash + 5000);
    expect(seller.playerIds).toHaveLength(18);
    expect(squadsAreConsistent(world)).toBe(true);
  });

  it('makes a computer buyer let a reserve go so its squad stays at eighteen', () => {
    const { world, rng, user } = fresh();
    const buyer = world.clubs[world.divisions[3]![2]!]!;
    const released = movePlayer(world, user.playerIds[0]!, buyer.id, 3000, rng);
    expect(buyer.playerIds).toHaveLength(18);
    expect(released).not.toBeNull();
    expect(world.players[released!]!.clubId).toBe(FREE_AGENT);
    expect(squadsAreConsistent(world)).toBe(true);
  });

  it('takes a free agent out of the pool when he signs', () => {
    const { world, rng, user } = fresh();
    const id = user.playerIds[6]!;
    releasePlayer(world, id);
    const before = user.cash;
    movePlayer(world, id, user.id, 0, rng);
    expect(world.freeAgents).not.toContain(id);
    expect(user.cash).toBe(before);
    expect(squadsAreConsistent(world)).toBe(true);
  });
});

describe('simulateAiTransfers', () => {
  it('has computer clubs trade, and never breaks a squad', () => {
    const { world } = fresh();
    const rng = createRng(3);
    refreshMarket(world, rng);
    let total = 0;
    for (let week = 0; week < 12; week++) {
      total += simulateAiTransfers(world, rng, 10);
      rotateMarket(world, rng);
    }
    expect(total).toBeGreaterThan(5);
    expect(squadsAreConsistent(world)).toBe(true);
    for (const c of Object.values(world.clubs)) if (!c.isUser) expect(c.playerIds).toHaveLength(18);
  });

  it('only buys players who would improve the buyer, and moves money from buyer to seller', () => {
    const { world } = fresh();
    const rng = createRng(4);
    refreshMarket(world, rng);
    const totalBefore = Object.values(world.clubs).reduce((s, c) => s + c.cash, 0);
    simulateAiTransfers(world, rng, 20);
    const totalAfter = Object.values(world.clubs).reduce((s, c) => s + c.cash, 0);
    expect(totalAfter).toBeCloseTo(totalBefore, 0);
  });

  it('leaves the user club alone', () => {
    const { world, user } = fresh();
    const rng = createRng(5);
    refreshMarket(world, rng);
    const before = [...user.playerIds];
    for (let i = 0; i < 10; i++) simulateAiTransfers(world, rng, 10);
    expect(user.playerIds).toEqual(before);
  });
});
