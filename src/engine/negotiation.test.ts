import { describe, expect, it } from 'vitest';
import { TRANSFER } from './config';
import { askingWage, releasePlayer } from './contracts';
import { refreshMarket } from './market';
import {
  acceptCounter,
  baseAmount,
  cannotSign,
  completeSigning,
  makeOffer,
  offerOptions,
  startNegotiation,
} from './negotiation';
import { createRng, type Rng } from './rng';
import { squadsAreConsistent } from './squad';
import { FREE_AGENT } from './types';
import { generateWorld } from './worldgen';

const OPEN = '2027-01-10';
const CLOSED = '2026-11-14';

/** A random source that answers `chance()` from a list, so a test can decide exactly what happens. */
function scripted(answers: boolean[]): Rng {
  const base = createRng(1);
  let i = 0;
  return { ...base, chance: () => answers[Math.min(i++, answers.length - 1)] as boolean };
}

function setup() {
  const world = generateWorld(271);
  const user = world.clubs[world.userClubId]!;
  user.cash = 500000;
  refreshMarket(world, createRng(2));
  const entry = world.market.find((e) => e.sellerClubId !== null && world.clubs[e.sellerClubId]!.division === 3)!;
  return { world, user, entry, player: world.players[entry.playerId]!, rng: createRng(3) };
}

describe('cannotSign', () => {
  it('is fine for a player who is for sale while the window is open', () => {
    const { world, entry } = setup();
    expect(cannotSign(world, OPEN, entry.playerId)).toBeNull();
  });

  it('refuses when the window is closed, he is not for sale, he is already at the club or the squad is full', () => {
    const { world, user, entry } = setup();
    expect(cannotSign(world, CLOSED, entry.playerId)).toMatch(/closed/);
    expect(cannotSign(world, OPEN, user.playerIds[0]!)).toMatch(/already/);
    const unlisted = Object.values(world.players).find((p) => p.clubId !== user.id && !world.market.some((e) => e.playerId === p.id))!;
    expect(cannotSign(world, OPEN, unlisted.id)).toMatch(/not for sale/);
    while (user.playerIds.length < TRANSFER.maxSquad) user.playerIds.push(`filler-${user.playerIds.length}`);
    expect(cannotSign(world, OPEN, entry.playerId)).toMatch(/full/);
  });

  it('throws when talks are started and not allowed', () => {
    const { world, entry } = setup();
    expect(() => startNegotiation(world, CLOSED, entry.playerId)).toThrow(/closed/);
  });
});

describe('startNegotiation', () => {
  it('starts with the fee for a player at a club, with three attempts', () => {
    const { world, entry } = setup();
    const n = startNegotiation(world, OPEN, entry.playerId);
    expect(n).toMatchObject({ phase: 'fee', attemptsLeft: 3, fee: null, wage: null, counter: null, sellerClubId: entry.sellerClubId });
  });

  it('starts with the wage for a free agent, who costs no fee', () => {
    const { world, user } = setup();
    const id = user.playerIds[8]!;
    releasePlayer(world, id);
    refreshMarket(world, createRng(2));
    const n = startNegotiation(world, OPEN, id);
    expect(n).toMatchObject({ phase: 'wage', fee: 0, sellerClubId: null });
  });
});

describe('offerOptions', () => {
  it('offers lower, market and higher fees with rising odds, around the asking price', () => {
    const { world, entry } = setup();
    const n = startNegotiation(world, OPEN, entry.playerId);
    const [low, market, high] = offerOptions(world, n);
    expect(baseAmount(world, n)).toBe(entry.askingFee);
    expect([low!.level, market!.level, high!.level]).toEqual(['low', 'market', 'high']);
    expect(low!.amount).toBeLessThan(market!.amount);
    expect(market!.amount).toBeLessThan(high!.amount);
    expect(market!.amount).toBeCloseTo(entry.askingFee, -3);
    expect(low!.chance).toBeCloseTo(0.25, 5);
    expect(market!.chance).toBeCloseTo(0.6, 5);
    expect(high!.chance).toBeCloseTo(0.9, 5);
  });

  it('marks fees the club cannot afford', () => {
    const { world, user, entry } = setup();
    user.cash = 10;
    const n = startNegotiation(world, OPEN, entry.playerId);
    expect(offerOptions(world, n).every((o) => !o.affordable)).toBe(true);
  });

  it('offers wages around what the player expects, and makes a player keener the less he drops down', () => {
    const { world, entry, player } = setup();
    const n = startNegotiation(world, OPEN, entry.playerId);
    n.phase = 'wage';
    const sameDivision = offerOptions(world, n);
    expect(sameDivision[1]!.amount).toBeCloseTo(askingWage(player), -2);
    expect(sameDivision[1]!.chance).toBeCloseTo(0.6, 5);
    // A player from a higher division is less keen to drop down to the user's division.
    const upper = Object.values(world.market).find((e) => e.sellerClubId && world.clubs[e.sellerClubId]!.division === 0)!;
    const n2 = startNegotiation(world, OPEN, upper.playerId);
    n2.phase = 'wage';
    const dropping = offerOptions(world, n2);
    expect(dropping[1]!.chance).toBeCloseTo(0.6 - 3 * TRANSFER.divisionDropPenalty, 5);
    expect(dropping[0]!.chance).toBeGreaterThanOrEqual(0.03);
  });

  it('has no options once talks are over', () => {
    const { world, entry } = setup();
    const n = startNegotiation(world, OPEN, entry.playerId);
    n.phase = 'done';
    expect(offerOptions(world, n)).toEqual([]);
  });
});

describe('makeOffer', () => {
  it('moves on to the wage when the club accepts, with three fresh attempts', () => {
    const { world, entry } = setup();
    const n = startNegotiation(world, OPEN, entry.playerId);
    n.attemptsLeft = 1;
    const r = makeOffer(world, n, OPEN, 'market', scripted([true]));
    expect(r.result).toBe('accepted');
    expect(n).toMatchObject({ phase: 'wage', fee: r.amount, attemptsLeft: 3, counter: null });
  });

  it('is done when the player accepts the wage', () => {
    const { world, entry } = setup();
    const n = startNegotiation(world, OPEN, entry.playerId);
    makeOffer(world, n, OPEN, 'market', scripted([true]));
    const r = makeOffer(world, n, OPEN, 'high', scripted([true]));
    expect(n).toMatchObject({ phase: 'done', wage: r.amount });
  });

  it('uses an attempt and comes back with a counter-offer when turned down', () => {
    const { world, entry } = setup();
    const n = startNegotiation(world, OPEN, entry.playerId);
    const r = makeOffer(world, n, OPEN, 'low', scripted([false]));
    expect(r.result).toBe('rejected');
    if (r.result !== 'rejected') return;
    expect(n.attemptsLeft).toBe(2);
    expect(n.counter).toBe(r.counter);
    expect(r.counter).toBeGreaterThan(r.amount);
    expect(r.counter).toBeLessThanOrEqual(Math.round(entry.askingFee * TRANSFER.counterCeiling) + 100);
    expect(n.phase).toBe('fee');
  });

  it('collapses after the third refusal and blocks talks with that player for two weeks', () => {
    const { world, entry } = setup();
    const n = startNegotiation(world, OPEN, entry.playerId);
    const rng = scripted([false, false, false]);
    makeOffer(world, n, OPEN, 'low', rng);
    makeOffer(world, n, OPEN, 'low', rng);
    const r = makeOffer(world, n, OPEN, 'low', rng);
    expect(r.result).toBe('collapsed');
    expect(n).toMatchObject({ phase: 'failed', counter: null });
    expect(world.transferBlocks[entry.playerId]).toBe('2027-01-24');
    expect(() => startNegotiation(world, '2027-01-17', entry.playerId)).toThrow(/later/);
    expect(() => startNegotiation(world, '2027-01-24', entry.playerId)).not.toThrow();
    expect(() => makeOffer(world, n, OPEN, 'low', rng)).toThrow();
  });

  it('refuses an offer the club cannot afford', () => {
    const { world, user, entry } = setup();
    const n = startNegotiation(world, OPEN, entry.playerId);
    user.cash = 1;
    expect(() => makeOffer(world, n, OPEN, 'high', scripted([true]))).toThrow(/money/);
  });

  it('accepts higher offers more often than lower ones, matching the stated odds', () => {
    const { world, entry } = setup();
    const rng = createRng(9);
    const rate = (level: 'low' | 'market' | 'high'): number => {
      let yes = 0;
      const n = 3000;
      for (let i = 0; i < n; i++) {
        const neg = startNegotiation(world, OPEN, entry.playerId);
        if (makeOffer(world, neg, OPEN, level, rng).result === 'accepted') yes++;
      }
      return yes / n;
    };
    const [low, market, high] = [rate('low'), rate('market'), rate('high')];
    expect(low).toBeLessThan(market);
    expect(market).toBeLessThan(high);
    expect(Math.abs(low - 0.25)).toBeLessThan(0.04);
    expect(Math.abs(market - 0.6)).toBeLessThan(0.04);
    expect(Math.abs(high - 0.9)).toBeLessThan(0.04);
  });
});

describe('acceptCounter', () => {
  it('takes the counter as the agreed fee and moves to the wage', () => {
    const { world, entry } = setup();
    const n = startNegotiation(world, OPEN, entry.playerId);
    const r = makeOffer(world, n, OPEN, 'low', scripted([false]));
    if (r.result !== 'rejected') throw new Error('expected a rejection');
    const amount = acceptCounter(world, n);
    expect(amount).toBe(r.counter);
    expect(n).toMatchObject({ phase: 'wage', fee: r.counter, counter: null, attemptsLeft: 3 });
  });

  it('is not possible without a counter, or when the club cannot pay it', () => {
    const { world, user, entry } = setup();
    const n = startNegotiation(world, OPEN, entry.playerId);
    expect(() => acceptCounter(world, n)).toThrow();
    makeOffer(world, n, OPEN, 'low', scripted([false]));
    user.cash = 1;
    expect(() => acceptCounter(world, n)).toThrow(/money/);
  });
});

describe('completeSigning', () => {
  function agreed() {
    const s = setup();
    const n = startNegotiation(s.world, OPEN, s.entry.playerId);
    makeOffer(s.world, n, OPEN, 'market', scripted([true]));
    makeOffer(s.world, n, OPEN, 'market', scripted([true]));
    return { ...s, n };
  }

  it('pays the fee, brings the player in on the wage agreed, and tops up the selling club', () => {
    const { world, user, entry, player, n, rng } = agreed();
    const seller = world.clubs[entry.sellerClubId!]!;
    const cash = user.cash;
    const sellerCash = seller.cash;
    const result = completeSigning(world, n, OPEN, rng);
    expect(result).toEqual({ playerId: player.id, fee: n.fee, wage: n.wage });
    expect(user.cash).toBe(cash - n.fee!);
    expect(seller.cash).toBe(sellerCash + n.fee!);
    expect(player.clubId).toBe(user.id);
    expect(user.playerIds).toContain(player.id);
    expect(player.wage).toBe(n.wage);
    expect(player.contractGames).toBe(TRANSFER.signingContractGames);
    expect(seller.playerIds).toHaveLength(18);
    expect(world.market.some((e) => e.playerId === player.id)).toBe(false);
    expect(squadsAreConsistent(world)).toBe(true);
  });

  it('signs a free agent without paying a fee', () => {
    const { world, user, rng } = setup();
    const id = user.playerIds[9]!;
    releasePlayer(world, id);
    refreshMarket(world, createRng(2));
    const n = startNegotiation(world, OPEN, id);
    makeOffer(world, n, OPEN, 'market', scripted([true]));
    const cash = user.cash;
    completeSigning(world, n, OPEN, rng);
    expect(user.cash).toBe(cash);
    expect(world.players[id]!.clubId).toBe(user.id);
    expect(world.freeAgents).not.toContain(id);
  });

  it('will not finish before both steps are agreed, after the window shuts, or without the money', () => {
    const { world, user, entry, rng } = setup();
    const early = startNegotiation(world, OPEN, entry.playerId);
    expect(() => completeSigning(world, early, OPEN, rng)).toThrow(/not agreed/);
    const a = agreed();
    expect(() => completeSigning(a.world, a.n, CLOSED, a.rng)).toThrow(/closed/);
    a.user.cash = 0;
    expect(() => completeSigning(a.world, a.n, OPEN, a.rng)).toThrow(/money/);
    expect(user).toBeDefined();
  });

  it('will not finish if the player has moved elsewhere in the meantime', () => {
    const a = agreed();
    releasePlayer(a.world, a.entry.playerId);
    expect(() => completeSigning(a.world, a.n, OPEN, a.rng)).toThrow(/no longer/);
    expect(a.world.players[a.entry.playerId]!.clubId).toBe(FREE_AGENT);
  });

  it('works end to end with real chance: keep trying until a deal is done', () => {
    const { world, user, entry } = setup();
    const rng = createRng(11);
    const startSquad = user.playerIds.length;
    let signed = false;
    for (let attempt = 0; attempt < 50 && !signed; attempt++) {
      const w = generateWorld(271);
      w.clubs[w.userClubId]!.cash = 500000;
      refreshMarket(w, createRng(2));
      const e = w.market.find((x) => x.sellerClubId !== null && w.clubs[x.sellerClubId]!.division === 3)!;
      const n = startNegotiation(w, OPEN, e.playerId);
      for (const level of ['market', 'high'] as const) {
        if (n.phase === 'fee' || n.phase === 'wage') makeOffer(w, n, OPEN, level, rng);
        if (n.phase === 'fee' || n.phase === 'wage') makeOffer(w, n, OPEN, 'high', rng);
      }
      if (n.phase === 'done') {
        completeSigning(w, n, OPEN, rng);
        expect(w.clubs[w.userClubId]!.playerIds).toHaveLength(startSquad + 1);
        signed = true;
      }
    }
    expect(signed).toBe(true);
    expect(world).toBeDefined();
    expect(entry).toBeDefined();
  });
});
