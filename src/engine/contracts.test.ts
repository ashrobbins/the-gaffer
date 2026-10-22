import { describe, expect, it } from 'vitest';
import {
  askingWage,
  contractsExpiringSoon,
  marketValue,
  offerRenewal,
  releasePlayer,
  renewalBlockedUntil,
  renewalChance,
  tickContracts,
} from './contracts';
import { createRng, type Rng } from './rng';
import { FREE_AGENT } from './types';
import { generateWorld, wageForAbility } from './worldgen';

const setup = () => {
  const world = generateWorld(211);
  const user = world.clubs[world.userClubId]!;
  const player = world.players[user.playerIds[10]!]!;
  return { world, user, player };
};

describe('askingWage', () => {
  it('is the current wage, or the going rate for his rating if that is higher', () => {
    const { player } = setup();
    expect(askingWage({ wage: 5000, ability: 60 })).toBe(5000);
    expect(askingWage({ wage: 100, ability: 70 })).toBe(wageForAbility(70));
    expect(askingWage(player)).toBeGreaterThanOrEqual(player.wage);
  });
});

describe('renewalChance', () => {
  it('rises with a better offer and falls with a worse one', () => {
    const { player } = setup();
    const ask = askingWage(player);
    const low = renewalChance(player, ask * 0.9, 38);
    const fair = renewalChance(player, ask, 38);
    const generous = renewalChance(player, ask * 1.3, 38);
    expect(low).toBeLessThan(fair);
    expect(fair).toBeLessThan(generous);
  });

  it('is much worse if the offer is a pay cut', () => {
    const { player } = setup();
    player.wage = 2000;
    const cut = renewalChance(player, 1800, 38);
    const keep = renewalChance(player, 2000, 38);
    expect(keep - cut).toBeGreaterThan(30);
  });

  it('is higher for a happy player in good form', () => {
    const { player } = setup();
    const ask = askingWage(player);
    player.mood = 1.5;
    player.formRating = 1.5;
    const unhappy = renewalChance(player, ask, 38);
    player.mood = 4.8;
    player.formRating = 4.5;
    const happy = renewalChance(player, ask, 38);
    expect(happy).toBeGreaterThan(unhappy + 30);
  });

  it('prefers a short deal a little and a very long one less', () => {
    const { player } = setup();
    const ask = askingWage(player);
    const short = renewalChance(player, ask, 19);
    const mid = renewalChance(player, ask, 38);
    const long = renewalChance(player, ask, 76);
    expect(short).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(long);
  });

  it('stays between 0 and 100', () => {
    const { player } = setup();
    expect(renewalChance(player, 1, 38)).toBe(0);
    player.mood = 5;
    player.formRating = 5;
    expect(renewalChance(player, askingWage(player) * 5, 38)).toBe(100);
  });
});

describe('offerRenewal', () => {
  it('updates the wage and contract when he agrees', () => {
    const { world, player } = setup();
    player.mood = 5;
    player.formRating = 5;
    const offer = Math.round((askingWage(player) * 2) / 50) * 50;
    const result = offerRenewal(world, player.id, offer, 38, createRng(1));
    expect(result).toEqual({ accepted: true, chance: 100 });
    expect(player.contractGames).toBe(38);
    expect(player.wage).toBe(offer);
  });

  it('leaves the contract alone when he refuses', () => {
    const { world, player } = setup();
    const wage = player.wage;
    const games = player.contractGames;
    const result = offerRenewal(world, player.id, 1, 38, createRng(1));
    expect(result.accepted).toBe(false);
    expect(player.wage).toBe(wage);
    expect(player.contractGames).toBe(games);
  });

  it('agrees about as often as the chance says', () => {
    const { world, player } = setup();
    const offer = askingWage(player);
    const chance = renewalChance(player, offer, 38);
    const rng = createRng(2);
    let yes = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const wage = player.wage;
      const games = player.contractGames;
      if (offerRenewal(world, player.id, offer, 38, rng).accepted) yes++;
      player.wage = wage;
      player.contractGames = games;
    }
    expect(Math.abs(yes / n - chance / 100)).toBeLessThan(0.04);
  });

  it('rejects silly offers and players who are not at the club', () => {
    const { world, player } = setup();
    expect(() => offerRenewal(world, player.id, 0, 38, createRng(1))).toThrow();
    expect(() => offerRenewal(world, player.id, 1000, 5, createRng(1))).toThrow();
    expect(() => offerRenewal(world, player.id, 1000, 200, createRng(1))).toThrow();
    expect(() => offerRenewal(world, 'nobody', 1000, 38, createRng(1))).toThrow();
    releasePlayer(world, player.id);
    expect(() => offerRenewal(world, player.id, 1000, 38, createRng(1))).toThrow();
  });
});

describe('releasePlayer', () => {
  it('takes a player out of the club and into the free agents', () => {
    const { world, user, player } = setup();
    releasePlayer(world, player.id);
    expect(user.playerIds).not.toContain(player.id);
    expect(player.clubId).toBe(FREE_AGENT);
    expect(world.freeAgents).toContain(player.id);
  });

  it('does nothing odd if called twice', () => {
    const { world, player } = setup();
    releasePlayer(world, player.id);
    releasePlayer(world, player.id);
    expect(world.freeAgents.filter((id) => id === player.id)).toHaveLength(1);
  });
});

describe('tickContracts', () => {
  it('runs every contract down by a matchday', () => {
    const { world, player } = setup();
    const before = player.contractGames;
    tickContracts(world, createRng(1));
    expect(player.contractGames).toBe(before - 1);
  });

  it('lets the user player go when his contract ends', () => {
    const { world, user, player } = setup();
    player.contractGames = 1;
    const report = tickContracts(world, createRng(1));
    expect(report.released).toContain(player.id);
    expect(user.playerIds).not.toContain(player.id);
    expect(world.freeAgents).toContain(player.id);
  });

  it('has a computer club re-sign its player at the going rate for a fresh term', () => {
    const { world } = setup();
    const ai = world.clubs[world.divisions[0]![0]!]!;
    const p = world.players[ai.playerIds[0]!]!;
    p.contractGames = 1;
    p.wage = 100;
    const report = tickContracts(world, createRng(1));
    expect(report.renewed).toContain(p.id);
    expect(p.clubId).toBe(ai.id);
    expect(p.wage).toBe(Math.max(300, Math.round(wageForAbility(p.ability) / 50) * 50));
    expect(p.contractGames).toBeGreaterThanOrEqual(19);
    expect(p.contractGames).toBeLessThanOrEqual(76);
  });

  it('ignores players with no club', () => {
    const { world, player } = setup();
    releasePlayer(world, player.id);
    player.contractGames = 5;
    tickContracts(world, createRng(1));
    expect(player.contractGames).toBe(5);
  });
});

describe('contractsExpiringSoon and marketValue', () => {
  it('lists the players with contracts nearly up, soonest first', () => {
    const { world, user } = setup();
    const ps = user.playerIds.map((id) => world.players[id]!);
    ps[0]!.contractGames = 4;
    ps[1]!.contractGames = 2;
    ps[2]!.contractGames = 70;
    const list = contractsExpiringSoon(world, user.id, 10);
    expect(list.map((p) => p.id).slice(0, 2)).toEqual([ps[1]!.id, ps[0]!.id]);
    expect(list.every((p) => p.contractGames <= 10)).toBe(true);
    expect(list).not.toContainEqual(ps[2]);
  });

  it('follows rating and age', () => {
    expect(marketValue({ ability: 80, age: 25 })).toBeGreaterThan(marketValue({ ability: 70, age: 25 }));
    expect(marketValue({ ability: 75, age: 21 })).toBeGreaterThan(marketValue({ ability: 75, age: 33 }));
  });
});

describe('the cooldown after a refused contract offer', () => {
  const setup = () => {
    const world = generateWorld(11);
    const id = world.clubs[world.userClubId]!.playerIds[0]!;
    world.players[id]!.mood = 1;
    return { world, id };
  };
  const refuses = { chance: () => false, next: () => 0.99 } as unknown as Rng;
  const accepts = { chance: () => true, next: () => 0 } as unknown as Rng;

  it('stops further offers for two weeks', () => {
    const { world, id } = setup();
    const r = offerRenewal(world, id, 50, 38, refuses, '2026-09-05');
    expect(r.accepted).toBe(false);
    expect(renewalBlockedUntil(world, id, '2026-09-05')).toBe('2026-09-19');
    expect(renewalBlockedUntil(world, id, '2026-09-12')).toBe('2026-09-19');
    expect(() => offerRenewal(world, id, 5000, 38, accepts, '2026-09-12')).toThrow(/yet/);
    expect(renewalBlockedUntil(world, id, '2026-09-19')).toBeNull();
    expect(offerRenewal(world, id, 5000, 38, accepts, '2026-09-19').accepted).toBe(true);
  });

  it('applies only to that player', () => {
    const { world, id } = setup();
    offerRenewal(world, id, 50, 38, refuses, '2026-09-05');
    const other = world.clubs[world.userClubId]!.playerIds[1]!;
    expect(renewalBlockedUntil(world, other, '2026-09-06')).toBeNull();
  });

  it('is cleared once he signs', () => {
    const { world, id } = setup();
    offerRenewal(world, id, 50, 38, refuses, '2026-09-05');
    offerRenewal(world, id, 5000, 38, accepts, '2026-09-19');
    expect(world.contractBlocks?.[id]).toBeUndefined();
  });

  it('does not apply when no date is given', () => {
    const { world, id } = setup();
    offerRenewal(world, id, 50, 38, refuses);
    expect(renewalBlockedUntil(world, id, '2026-09-06')).toBeNull();
  });
});
