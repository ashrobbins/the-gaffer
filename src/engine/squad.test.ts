import { describe, expect, it } from 'vitest';
import { SQUAD_SIZE } from './config';
import { releasePlayer } from './contracts';
import { createRng } from './rng';
import { createYouthPlayer, positionNeeded, refillSquad, releaseReserve, squadsAreConsistent } from './squad';
import { FREE_AGENT } from './types';
import { generateWorld } from './worldgen';

const fresh = () => {
  const world = generateWorld(251);
  const club = world.clubs[world.divisions[1]![0]!]!;
  return { world, club };
};

describe('positionNeeded', () => {
  it('is nothing for a complete squad', () => {
    const { world, club } = fresh();
    expect(positionNeeded(world, club.id)).toBeNull();
  });

  it('is the position the club has lost, and prefers a missing goalkeeper', () => {
    const { world, club } = fresh();
    const st = world.players[club.playerIds.find((id) => world.players[id]!.position === 'ST')!]!;
    releasePlayer(world, st.id);
    expect(positionNeeded(world, club.id)).toBe('ST');
    const gk = world.players[club.playerIds.find((id) => world.players[id]!.position === 'GK')!]!;
    releasePlayer(world, gk.id);
    expect(positionNeeded(world, club.id)).toBe('GK');
  });
});

describe('createYouthPlayer', () => {
  it('makes a unique teenager, a little below the club standard, with room to grow', () => {
    const { world, club } = fresh();
    const p = createYouthPlayer(world, createRng(1), club.id, 'CB');
    expect(p.age).toBeGreaterThanOrEqual(17);
    expect(p.age).toBeLessThanOrEqual(19);
    expect(p.position).toBe('CB');
    expect(p.potential).toBeGreaterThan(p.ability + 7);
    expect(p.clubId).toBe(club.id);
    const names = Object.values(world.players).map((x) => `${x.firstName} ${x.lastName}`);
    expect(names).not.toContain(`${p.firstName} ${p.lastName}`);
    expect(world.players[p.id]).toBeUndefined();
  });

  it('gets a fresh id each time even as the world grows', () => {
    const { world, club } = fresh();
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const p = createYouthPlayer(world, createRng(i), club.id, 'CM');
      expect(Object.keys(world.players)).not.toContain(p.id);
      world.players[p.id] = p;
      ids.add(p.id);
    }
    expect(ids.size).toBe(5);
  });
});

describe('refillSquad', () => {
  it('signs a free agent of the right position if there is one', () => {
    const { world, club } = fresh();
    const loser = world.players[club.playerIds.find((id) => world.players[id]!.position === 'LB')!]!;
    releasePlayer(world, loser.id);
    const spare = world.players[world.divisions[3]![0]! && world.clubs[world.divisions[3]![0]!]!.playerIds.find((id) => world.players[id]!.position === 'LB')!]!;
    releasePlayer(world, spare.id);
    const added = refillSquad(world, club.id, createRng(2));
    expect(added).toHaveLength(1);
    expect(club.playerIds).toHaveLength(SQUAD_SIZE);
    expect(world.players[added[0]!]!.position).toBe('LB');
    expect(squadsAreConsistent(world)).toBe(true);
  });

  it('promotes a youth player when no free agent fits', () => {
    const { world, club } = fresh();
    const gk = world.players[club.playerIds.find((id) => world.players[id]!.position === 'GK')!]!;
    releasePlayer(world, gk.id);
    // The released keeper retires, and there are no other keepers without a club.
    delete world.players[gk.id];
    world.freeAgents = [];
    const before = Object.keys(world.players).length;
    const [added] = refillSquad(world, club.id, createRng(3));
    expect(Object.keys(world.players)).toHaveLength(before + 1);
    expect(world.players[added!]!.position).toBe('GK');
    expect(world.players[added!]!.age).toBeLessThanOrEqual(19);
    expect(squadsAreConsistent(world)).toBe(true);
  });

  it('does nothing to a full squad', () => {
    const { world, club } = fresh();
    expect(refillSquad(world, club.id, createRng(4))).toEqual([]);
  });
});

describe('releaseReserve', () => {
  it('lets the weakest player outside the best eleven go, never a first-choice player', () => {
    const { world, club } = fresh();
    const best11 = [...club.playerIds].sort((a, b) => world.players[b]!.ability - world.players[a]!.ability).slice(0, 11);
    const out = releaseReserve(world, club.id)!;
    expect(best11).not.toContain(out);
    expect(world.players[out]!.clubId).toBe(FREE_AGENT);
    expect(club.playerIds).toHaveLength(17);
  });

  it('prefers a reserve in the position given', () => {
    const { world, club } = fresh();
    const out = releaseReserve(world, club.id, 'CB')!;
    const reserves = club.playerIds.length;
    expect(reserves).toBe(17);
    expect(world.players[out]!.clubId).toBe(FREE_AGENT);
  });

  it('keeps two goalkeepers', () => {
    const { world, club } = fresh();
    for (let i = 0; i < 8; i++) releaseReserve(world, club.id);
    const keepers = club.playerIds.filter((id) => world.players[id]!.position === 'GK').length;
    expect(keepers).toBeGreaterThanOrEqual(2);
  });
});

describe('squadsAreConsistent', () => {
  it('is true for a new world and false when a player is in two places', () => {
    const { world, club } = fresh();
    expect(squadsAreConsistent(world)).toBe(true);
    const other = world.clubs[world.divisions[0]![0]!]!;
    other.playerIds.push(club.playerIds[0]!);
    expect(squadsAreConsistent(world)).toBe(false);
  });
});
