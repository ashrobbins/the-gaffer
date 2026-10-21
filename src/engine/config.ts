import type { Position } from './types';

export const DIVISION_COUNT = 4;
export const CLUBS_PER_DIVISION = 20;
export const SQUAD_SIZE = 18;
/** The division a new club starts in: the bottom one. */
export const USER_START_DIVISION = DIVISION_COUNT - 1;

export const DIVISION_NAMES: readonly string[] = ['Division One', 'Division Two', 'Division Three', 'Division Four'];

/** Typical player rating in each division, top division first. */
export const DIVISION_BASE_ABILITY: readonly number[] = [82, 77, 72, 68];
export const DIVISION_BASE_CAPACITY: readonly number[] = [18000, 11000, 7000, 4200];
export const DIVISION_TICKET_PRICE: readonly number[] = [24, 18, 14, 11];
export const DIVISION_BASE_CASH: readonly number[] = [900000, 350000, 150000, 60000];

export const USER_START_CASH = 86400;

export interface SquadSlot {
  position: Position;
  /** Nudge to the rating so a squad has starters and back-up players. */
  adjust: number;
}

/** Eighteen players: two keepers and a full set of outfield positions. */
export const SQUAD_TEMPLATE: readonly SquadSlot[] = [
  { position: 'GK', adjust: 2 },
  { position: 'GK', adjust: -6 },
  { position: 'LB', adjust: 0 },
  { position: 'CB', adjust: 2 },
  { position: 'CB', adjust: 0 },
  { position: 'CB', adjust: -4 },
  { position: 'RB', adjust: 0 },
  { position: 'RB', adjust: -5 },
  { position: 'DM', adjust: -1 },
  { position: 'CM', adjust: 1 },
  { position: 'CM', adjust: 0 },
  { position: 'LM', adjust: 0 },
  { position: 'RM', adjust: 0 },
  { position: 'AM', adjust: 2 },
  { position: 'LW', adjust: -3 },
  { position: 'RW', adjust: -3 },
  { position: 'ST', adjust: 3 },
  { position: 'ST', adjust: 0 },
];
