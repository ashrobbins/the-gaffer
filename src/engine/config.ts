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

/** Matches each club plays in a league season: home and away against the other 19. */
export const MATCHES_PER_SEASON = (CLUBS_PER_DIVISION - 1) * 2;
/** Matchday index (0-based) of the last round. */
export const ROUNDS_PER_SEASON = MATCHES_PER_SEASON;

/** Tuning for the simulation of matches the user does not play. */
export const SIM = {
  homeAdvantage: 3,
  /** Rating points per unit of recent form. Form runs from -3.5 (five defeats) to +3.5 (five wins). */
  formWeight: 1.4,
  /** Rating points for each league place above mid-table. */
  positionWeight: 0.18,
  homeGoals: 1.35,
  awayGoals: 1.05,
  /** How quickly a rating gap turns into a goal gap: larger means less decisive. */
  goalScale: 22,
  maxGap: 30,
};

export const CUP_NAME = 'Challenge Cup';
export const CUP_ROUND_NAMES: readonly string[] = [
  'Preliminary round',
  'Round 1',
  'Round 2',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  'Final',
];
/** Cup round i is played midweek once this many league matchdays have been played. */
export const CUP_ROUND_AFTER_MATCHDAY: readonly number[] = [3, 7, 11, 16, 22, 28, 35];
/** Clubs playing in the preliminary round. The other 48 get a bye into Round 1. */
export const CUP_PRELIM_CLUBS = 32;
