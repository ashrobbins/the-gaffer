import type { PlayerRole } from './matchTypes';
import type { Position } from './types';

/** Positions a player can cover at a small cost. */
export const ADJACENT: Record<Position, readonly Position[]> = {
  GK: [],
  LB: ['CB', 'LM'],
  RB: ['CB', 'RM'],
  CB: ['LB', 'RB', 'DM'],
  DM: ['CM', 'CB'],
  CM: ['DM', 'AM', 'LM', 'RM'],
  LM: ['LB', 'CM', 'LW'],
  RM: ['RB', 'CM', 'RW'],
  AM: ['CM', 'ST', 'LW', 'RW'],
  LW: ['LM', 'ST', 'AM'],
  RW: ['RM', 'ST', 'AM'],
  ST: ['AM', 'LW', 'RW'],
};

export interface Fit {
  kind: 'natural' | 'adjacent' | 'alien';
  /** Multiplier on the player's rating. */
  multiplier: number;
}

/**
 * How well a player suits the position they are asked to play. In their own position they are at full strength;
 * in a neighbouring one about 14% worse; anywhere else 40% worse. Goalkeepers are a special case: nobody else
 * can keep goal and a goalkeeper is poor anywhere else.
 */
export function positionFit(player: Position, slot: Position): Fit {
  if (player === slot) return { kind: 'natural', multiplier: 1 };
  if (slot === 'GK') return { kind: 'alien', multiplier: 0.25 };
  if (player === 'GK') return { kind: 'alien', multiplier: 0.3 };
  if (ADJACENT[slot].includes(player) || ADJACENT[player].includes(slot)) return { kind: 'adjacent', multiplier: 0.86 };
  return { kind: 'alien', multiplier: 0.6 };
}

/**
 * What each position adds to a team's attack, defence and control of the ball. A team with more forwards
 * attacks harder and defends worse; more defenders the other way round.
 */
export const ROLES: Record<Position, PlayerRole> = {
  GK: { att: 0, def: 0.2, ctrl: 0.05 },
  LB: { att: 0.2, def: 0.95, ctrl: 0.25 },
  RB: { att: 0.2, def: 0.95, ctrl: 0.25 },
  CB: { att: 0.05, def: 1.1, ctrl: 0.2 },
  DM: { att: 0.2, def: 0.7, ctrl: 0.85 },
  CM: { att: 0.4, def: 0.4, ctrl: 1 },
  LM: { att: 0.6, def: 0.3, ctrl: 0.6 },
  RM: { att: 0.6, def: 0.3, ctrl: 0.6 },
  AM: { att: 0.8, def: 0.2, ctrl: 0.7 },
  LW: { att: 0.95, def: 0.1, ctrl: 0.3 },
  RW: { att: 0.95, def: 0.1, ctrl: 0.3 },
  ST: { att: 1.1, def: 0.05, ctrl: 0.15 },
};
