import { assignToFormation, effectiveRating, FORMATIONS } from './formations';
import type { FormationId, PlayStyle } from './matchTypes';
import { positionFit, type Fit } from './positions';
import type { Player, World } from './types';

/**
 * The team the user has picked for the next match: formation, play style, who plays where, who is on the bench and
 * who is captain. Entry i of `xi` plays the position `FORMATIONS[formation][i]`. Everyone else in the squad is on the bench.
 */
export interface Lineup {
  formation: FormationId;
  style: PlayStyle;
  xi: string[];
  bench: string[];
  captainId: string | null;
}

const fitPlayers = (world: World, ids: readonly string[]): string[] => ids.filter((id) => !world.players[id]?.injury);

/** A sensible first team: the best eleven fit players in a 4-4-2, with the best player as captain. */
export function createLineup(world: World, clubId: string): Lineup {
  const club = world.clubs[clubId];
  if (!club) throw new Error(`Unknown club ${clubId}`);
  const formation: FormationId = '4-4-2';
  const slots = assignToFormation(world, fitPlayers(world, club.playerIds), formation);
  const xi = slots.filter((id): id is string => id !== null);
  const inXi = new Set(xi);
  const bench = club.playerIds.filter((id) => !inXi.has(id));
  const captainId = [...xi].sort((a, b) => (world.players[b]?.ability ?? 0) - (world.players[a]?.ability ?? 0))[0] ?? null;
  return { formation, style: 'balanced', xi, bench, captainId };
}

/**
 * Brings a lineup back in line with the squad after players have come, gone or been hurt. Players who have left are
 * removed, injured players in the first team are swapped for the best fit player on the bench, and anyone new goes to the bench.
 */
export function repairLineup(world: World, clubId: string, lineup: Lineup): Lineup {
  const club = world.clubs[clubId];
  if (!club) throw new Error(`Unknown club ${clubId}`);
  const squad = new Set(club.playerIds);
  const slots: (string | null)[] = lineup.xi.map((id) => (squad.has(id) ? id : null));
  while (slots.length < 11) slots.push(null);
  let bench = lineup.bench.filter((id) => squad.has(id));
  const placed = new Set([...slots.filter((id): id is string => id !== null), ...bench]);
  bench.push(...club.playerIds.filter((id) => !placed.has(id)));

  for (let i = 0; i < slots.length; i++) {
    const id = slots[i] ?? null;
    const needsReplacing = id === null || world.players[id]?.injury;
    if (!needsReplacing) continue;
    const position = FORMATIONS[lineup.formation][i]!;
    const candidates = bench
      .map((b) => world.players[b])
      .filter((p): p is Player => !!p && !p.injury)
      .sort((a, b) => effectiveRating(b, position, 0) - effectiveRating(a, position, 0));
    const pick = candidates[0];
    if (!pick) continue;
    if (id) bench.push(id);
    slots[i] = pick.id;
    bench = bench.filter((b) => b !== pick.id);
  }

  const xi = slots.filter((id): id is string => id !== null);
  const captainId = lineup.captainId && squad.has(lineup.captainId) ? lineup.captainId : (xi[0] ?? null);
  return { ...lineup, xi, bench, captainId };
}

/** Changes formation, keeping the same eleven players and putting each in the position he suits best. */
export function setFormation(world: World, lineup: Lineup, formation: FormationId): Lineup {
  const slots = assignToFormation(world, lineup.xi, formation);
  return { ...lineup, formation, xi: slots.filter((id): id is string => id !== null) };
}

export function setStyle(lineup: Lineup, style: PlayStyle): Lineup {
  return { ...lineup, style };
}

/** Swaps two players on the pitch. */
export function swapPositions(lineup: Lineup, a: number, b: number): Lineup {
  if (a < 0 || b < 0 || a >= lineup.xi.length || b >= lineup.xi.length) throw new Error('No such position');
  const xi = [...lineup.xi];
  [xi[a], xi[b]] = [xi[b] as string, xi[a] as string];
  return { ...lineup, xi };
}

/** Swaps a player on the pitch with one on the bench. An injured player cannot come in. */
export function swapWithBench(world: World, lineup: Lineup, slot: number, benchIndex: number): Lineup {
  const out = lineup.xi[slot];
  const inn = lineup.bench[benchIndex];
  if (out === undefined || inn === undefined) throw new Error('No such player');
  if (world.players[inn]?.injury) throw new Error('He is injured');
  const xi = [...lineup.xi];
  const bench = [...lineup.bench];
  xi[slot] = inn;
  bench[benchIndex] = out;
  return { ...lineup, xi, bench };
}

export function setCaptain(lineup: Lineup, playerId: string): Lineup {
  if (!lineup.xi.includes(playerId) && !lineup.bench.includes(playerId)) throw new Error('He is not in the squad');
  return { ...lineup, captainId: playerId };
}

export interface PositionInfo {
  playerId: string;
  slot: number;
  fit: Fit;
  /** The rating he plays at in that position, before tiredness. */
  rating: number;
}

/** For each place on the pitch, who is there and how well he fits it. */
export function lineupFit(world: World, lineup: Lineup): PositionInfo[] {
  return lineup.xi.map((playerId, slot) => {
    const p = world.players[playerId] as Player;
    const position = FORMATIONS[lineup.formation][slot]!;
    return { playerId, slot, fit: positionFit(p.position, position), rating: Math.round(p.ability * positionFit(p.position, position).multiplier) };
  });
}

/** The average rating of the eleven in the positions they are playing. */
export function lineupRating(world: World, lineup: Lineup): number {
  const infos = lineupFit(world, lineup);
  return Math.round(infos.reduce((s, i) => s + i.rating, 0) / Math.max(1, infos.length));
}

/** The matchday squad for the match engine: the eleven, and the best fit players from the bench, up to seven. */
export function toTeamSheet(world: World, lineup: Lineup): { formation: FormationId; style: PlayStyle; xi: string[]; bench: string[] } {
  const bench = fitPlayers(world, lineup.bench).slice(0, 7);
  return { formation: lineup.formation, style: lineup.style, xi: [...lineup.xi], bench };
}
