import { releasePlayer } from './contracts';
import { CONTRACT, DIVISION_BASE_ABILITY, SQUAD_SIZE, SQUAD_TEMPLATE } from './config';
import { FIRST_NAMES, LAST_NAMES } from './data/names';
import type { Rng } from './rng';
import { FREE_AGENT, type Player, type Position, type World } from './types';
import { emptyStats, valueFor, wageForAbility } from './worldgen';

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** How many players of each position a full squad of 18 has. */
const TEMPLATE_COUNTS: Record<string, number> = SQUAD_TEMPLATE.reduce<Record<string, number>>((acc, s) => {
  acc[s.position] = (acc[s.position] ?? 0) + 1;
  return acc;
}, {});

/** The position a club is shortest of, compared with a standard squad. Null if it has the full set. */
export function positionNeeded(world: World, clubId: string): Position | null {
  const club = world.clubs[clubId];
  if (!club) throw new Error(`Unknown club ${clubId}`);
  const have: Record<string, number> = {};
  for (const id of club.playerIds) {
    const pos = world.players[id]?.position;
    if (pos) have[pos] = (have[pos] ?? 0) + 1;
  }
  let worst: { pos: Position; gap: number } | null = null;
  for (const [pos, want] of Object.entries(TEMPLATE_COUNTS)) {
    const gap = want - (have[pos] ?? 0);
    if (gap > 0 && (!worst || gap > worst.gap || (gap === worst.gap && pos === 'GK'))) worst = { pos: pos as Position, gap };
  }
  return worst?.pos ?? null;
}

function freshName(world: World, rng: Rng): { firstName: string; lastName: string } {
  const used = new Set(Object.values(world.players).map((p) => `${p.firstName} ${p.lastName}`));
  for (let i = 0; i < 500; i++) {
    const firstName = rng.pick(FIRST_NAMES);
    const lastName = rng.pick(LAST_NAMES);
    if (!used.has(`${firstName} ${lastName}`)) return { firstName, lastName };
  }
  throw new Error('Ran out of unique player names');
}

/** A teenage player from a club's academy, a little below the club's usual standard but with room to grow. */
export function createYouthPlayer(world: World, rng: Rng, clubId: string, position: Position): Player {
  const club = world.clubs[clubId];
  if (!club) throw new Error(`Unknown club ${clubId}`);
  const base = DIVISION_BASE_ABILITY[club.division] ?? 68;
  const ability = clamp(Math.round(base - 8 + rng.normal(0, 3)), 38, 80);
  const wage = wageForAbility(ability);
  const age = rng.int(17, 19);
  let n = Object.keys(world.players).length + 1;
  while (world.players[`p${String(n).padStart(4, '0')}`]) n++;
  const id = `p${String(n).padStart(4, '0')}`;
  const happiness = 4;
  const { firstName, lastName } = freshName(world, rng);
  return {
    id,
    clubId,
    firstName,
    lastName,
    age,
    position,
    ability,
    potential: Math.min(95, ability + rng.int(8, 18)),
    wage,
    contractGames: rng.int(CONTRACT.minGames, CONTRACT.maxGames),
    happiness,
    form: 3,
    fatigue: 0,
    injury: null,
    value: valueFor(wage, age),
    seasonStats: emptyStats(),
    careerStats: emptyStats(),
    formRating: 3,
    mood: happiness,
    playShare: 0.3,
    growth: 0,
  };
}

/**
 * Brings a computer club back up to eighteen players after it has lost some. It signs the best free agent in the
 * position it is shortest of, or promotes a youth player if there is none.
 * Returns the players added.
 */
export function refillSquad(world: World, clubId: string, rng: Rng): string[] {
  const club = world.clubs[clubId];
  if (!club) throw new Error(`Unknown club ${clubId}`);
  const added: string[] = [];
  while (club.playerIds.length < SQUAD_SIZE) {
    const need = positionNeeded(world, clubId) ?? 'CM';
    const free = world.freeAgents
      .map((id) => world.players[id] as Player)
      .filter((p) => p.position === need)
      .sort((a, b) => b.ability - a.ability)[0];
    if (free) {
      world.freeAgents = world.freeAgents.filter((id) => id !== free.id);
      free.clubId = clubId;
      free.wage = wageForAbility(free.ability);
      free.contractGames = rng.int(CONTRACT.minGames, CONTRACT.maxGames);
      club.playerIds.push(free.id);
      added.push(free.id);
    } else {
      const youth = createYouthPlayer(world, rng, clubId, need);
      world.players[youth.id] = youth;
      club.playerIds.push(youth.id);
      added.push(youth.id);
    }
  }
  return added;
}

/**
 * Sends a computer club's weakest reserve out of the club, to keep room for a new signing. A goalkeeper is only
 * released if the club has a third. Returns the player let go, or null if nobody could go.
 */
export function releaseReserve(world: World, clubId: string, preferPosition: Position | null = null): string | null {
  const club = world.clubs[clubId];
  if (!club) throw new Error(`Unknown club ${clubId}`);
  const squad = club.playerIds.map((id) => world.players[id] as Player);
  const best11 = new Set([...squad].sort((a, b) => b.ability - a.ability).slice(0, 11).map((p) => p.id));
  const keepers = squad.filter((p) => p.position === 'GK').length;
  const candidates = squad
    .filter((p) => !best11.has(p.id) && (p.position !== 'GK' || keepers > 2))
    .sort((a, b) => {
      const pa = preferPosition && a.position === preferPosition ? 0 : 1;
      const pb = preferPosition && b.position === preferPosition ? 0 : 1;
      return pa - pb || a.ability - b.ability;
    });
  const out = candidates[0];
  if (!out) return null;
  releasePlayer(world, out.id);
  return out.id;
}

/** True if every player is in exactly one place: one club squad, or the free agents. Used to check the books balance. */
export function squadsAreConsistent(world: World): boolean {
  const seen = new Set<string>();
  for (const club of Object.values(world.clubs)) {
    for (const id of club.playerIds) {
      if (seen.has(id)) return false;
      seen.add(id);
      if (world.players[id]?.clubId !== club.id) return false;
    }
  }
  for (const id of world.freeAgents) {
    if (seen.has(id)) return false;
    seen.add(id);
    if (world.players[id]?.clubId !== FREE_AGENT) return false;
  }
  return seen.size === Object.keys(world.players).length;
}
