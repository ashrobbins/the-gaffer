import type { FormationId, PlayStyle, TeamSheet } from './matchTypes';
import { positionFit } from './positions';
import type { Player, Position, World } from './types';

export const FORMATION_IDS: readonly FormationId[] = ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '5-3-2'];

/** The eleven positions of each formation, goalkeeper first. */
export const FORMATIONS: Record<FormationId, readonly Position[]> = {
  '4-4-2': ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'],
  '4-3-3': ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'DM', 'CM', 'LW', 'ST', 'RW'],
  '3-5-2': ['GK', 'CB', 'CB', 'CB', 'LM', 'CM', 'CM', 'RM', 'AM', 'ST', 'ST'],
  '4-2-3-1': ['GK', 'LB', 'CB', 'CB', 'RB', 'DM', 'DM', 'LW', 'AM', 'RW', 'ST'],
  '5-3-2': ['GK', 'LB', 'CB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'ST', 'ST'],
};

export const PLAY_STYLES: readonly PlayStyle[] = ['gung-ho', 'attacking', 'balanced', 'defensive', 'park-the-bus'];

const FATIGUE_PENALTY = 0.2;

/** A player's playing strength in a given position and at a given tiredness: rating, fit, fatigue and a little for form. */
export function effectiveRating(player: Pick<Player, 'ability' | 'position' | 'form'>, slot: Position, fatigue: number): number {
  const fatigueFactor = 1 - (FATIGUE_PENALTY * Math.min(100, Math.max(0, fatigue))) / 100;
  const formFactor = 1 + (player.form - 3) * 0.01;
  return player.ability * positionFit(player.position, slot).multiplier * fatigueFactor * formFactor;
}

/**
 * Puts players into a formation's positions. Each position goes first to a natural player, then to one who can
 * cover it, and then to anyone left (never a goalkeeper outfield, and a goalkeeper position only to a goalkeeper
 * while one is available). Better players are placed first. Slots that cannot be filled are null.
 */
export function assignToFormation(world: World, playerIds: readonly string[], formation: FormationId): (string | null)[] {
  const slots = FORMATIONS[formation];
  const pool = playerIds
    .map((id) => world.players[id])
    .filter((p): p is Player => p !== undefined)
    .sort((a, b) => b.ability - a.ability);
  const out: (string | null)[] = slots.map(() => null);
  const used = new Set<string>();

  const place = (accept: (p: Player, slot: Position) => boolean): void => {
    slots.forEach((slot, i) => {
      if (out[i] !== null) return;
      const p = pool.find((q) => !used.has(q.id) && accept(q, slot));
      if (p) {
        out[i] = p.id;
        used.add(p.id);
      }
    });
  };

  place((p, slot) => positionFit(p.position, slot).kind === 'natural');
  place((p, slot) => positionFit(p.position, slot).kind === 'adjacent');
  place((p, slot) => slot !== 'GK' && p.position !== 'GK');
  place(() => true);
  return out;
}

/** The best eleven fit players a club has for a formation, plus everyone else who is fit as the bench. */
export function autoPickXI(world: World, clubId: string, formation: FormationId): { xi: string[]; bench: string[] } {
  const club = world.clubs[clubId];
  if (!club) throw new Error(`Unknown club ${clubId}`);
  const fit = club.playerIds.filter((id) => !world.players[id]?.injury);
  if (fit.length < 11) throw new Error(`${club.name} has fewer than eleven fit players`);
  const slots = assignToFormation(world, fit, formation);
  const xi = slots.filter((id): id is string => id !== null);
  const inXi = new Set(xi);
  const bench = fit
    .filter((id) => !inXi.has(id))
    .sort((a, b) => (world.players[b]?.ability ?? 0) - (world.players[a]?.ability ?? 0));
  // Keep a spare goalkeeper near the top of the bench, if there is one.
  const gk = bench.findIndex((id) => world.players[id]?.position === 'GK');
  if (gk > 0) bench.unshift(...bench.splice(gk, 1));
  return { xi, bench };
}

export function defaultTeamSheet(
  world: World,
  clubId: string,
  formation: FormationId = '4-4-2',
  style: PlayStyle = 'balanced',
): TeamSheet {
  const { xi, bench } = autoPickXI(world, clubId, formation);
  return { formation, style, xi, bench };
}

/** Throws if a team sheet is not playable: wrong number of players, strangers, duplicates, or injured players. */
export function validateTeamSheet(world: World, clubId: string, sheet: TeamSheet): void {
  const club = world.clubs[clubId];
  if (!club) throw new Error(`Unknown club ${clubId}`);
  if (sheet.xi.length !== 11) throw new Error('A team needs eleven players');
  const all = [...sheet.xi, ...sheet.bench];
  if (new Set(all).size !== all.length) throw new Error('A player appears twice in the team sheet');
  for (const id of all) {
    const p = world.players[id];
    if (!p || p.clubId !== clubId) throw new Error(`Player ${id} does not play for ${club.name}`);
    if (p.injury) throw new Error(`${p.firstName} ${p.lastName} is injured`);
  }
  if (sheet.bench.length > 7) throw new Error('The bench holds at most seven players');
}
