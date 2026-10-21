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

/** How a play style bends a team's attack, defence and control of the ball, and how hard its players work. */
export const STYLE_EFFECT: Record<import('./matchTypes').PlayStyle, { att: number; def: number; ctrl: number; effort: number }> = {
  'gung-ho': { att: 1.25, def: 0.8, ctrl: 1.05, effort: 1.2 },
  attacking: { att: 1.12, def: 0.92, ctrl: 1.03, effort: 1.1 },
  balanced: { att: 1, def: 1, ctrl: 1, effort: 1 },
  defensive: { att: 0.9, def: 1.1, ctrl: 0.98, effort: 0.97 },
  'park-the-bus': { att: 0.72, def: 1.28, ctrl: 0.9, effort: 0.92 },
};

/** Tuning for the match engine. */
export const MATCH = {
  minutes: 90,
  halfTime: 45,
  maxSubs: 3,
  maxBench: 7,
  /** Added to home attack and control. */
  homeBoost: 1.07,
  possessionExponent: 2.5,
  /** Shots per minute for evenly matched sides with an even share of the ball. */
  shotBase: 0.105,
  shotAttackExponent: 0.9,
  shotPossessionExponent: 0.7,
  blockedChance: 0.14,
  onTargetChance: 0.42,
  goalGivenOnTarget: 0.31,
  postGivenOffTarget: 0.08,
  wideGivenOffTarget: 0.47,
  cornerAfterSave: 0.12,
  cornerAfterBlock: 0.2,
  cornerHeaderChance: 0.2,
  /** Corners won per minute from pressure alone, for evenly matched sides. */
  cornerRate: 0.04,
  foulRate: 0.245,
  yellowChance: 0.11,
  yellowChanceOnPenalty: 0.3,
  straightRedChance: 0.002,
  penaltyOnFoulChance: 0.015,
  penaltyConversion: 0.78,
  fatiguePerMinute: 0.42,
  injuryPerPlayerMinute: 0.0001,
};
