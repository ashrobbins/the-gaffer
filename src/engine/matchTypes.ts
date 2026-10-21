import type { Injury, Position } from './types';

export type PlayStyle = 'gung-ho' | 'attacking' | 'balanced' | 'defensive' | 'park-the-bus';
export type FormationId = '4-4-2' | '4-3-3' | '3-5-2' | '4-2-3-1' | '5-3-2';
export type Side = 'home' | 'away';
export type MatchPhase = 'first-half' | 'half-time' | 'second-half' | 'full-time';
export type ShotOutcome = 'saved' | 'wide' | 'over' | 'post' | 'blocked';

/** What a manager hands in before kick-off: formation, play style, and who plays where. */
export interface TeamSheet {
  formation: FormationId;
  style: PlayStyle;
  /** Eleven player ids. Entry i plays the position `FORMATIONS[formation][i]`. */
  xi: string[];
  bench: string[];
}

interface EventBase {
  /** Match minute, 1 to 90. */
  minute: number;
  side: Side;
  clubId: string;
  /** Picks between wordings, so commentary is varied but repeatable. */
  variant: number;
  /** Score after this event, home first. */
  score: [number, number];
}

export type MatchEvent = EventBase &
  (
    | { kind: 'kick-off' }
    | { kind: 'half-time' }
    | { kind: 'full-time' }
    | { kind: 'shot'; playerId: string; outcome: ShotOutcome; keeperId: string | null }
    | { kind: 'goal'; playerId: string; penalty: boolean }
    | { kind: 'penalty-miss'; playerId: string; saved: boolean; keeperId: string | null }
    | { kind: 'corner' }
    | { kind: 'yellow'; playerId: string }
    | { kind: 'red'; playerId: string; reason: 'straight' | 'second-yellow' }
    | { kind: 'injury'; playerId: string; injury: Injury; exhausted: boolean; mustReplace: boolean }
    | { kind: 'sub'; offId: string; onId: string; forced: boolean }
  );

export interface PlayerMatch {
  id: string;
  clubId: string;
  started: boolean;
  onPitch: boolean;
  /** Fatigue now, 0 to 100. Starts from the player's fatigue going into the match. */
  fatigue: number;
  minutes: number;
  goals: number;
  shots: number;
  yellowCards: number;
  redCards: number;
  injury: Injury | null;
}

export interface SideState {
  clubId: string;
  formation: FormationId;
  style: PlayStyle;
  /** Player ids by formation slot. A slot is null after a sending-off or an injury with nobody to replace the player. */
  slots: (string | null)[];
  bench: string[];
  subsUsed: number;
  subbedOff: string[];
  sentOff: string[];
  /** An injured player who must be replaced before play can go on, or null. */
  forcedSub: string | null;
}

export interface SideStats {
  shots: number;
  onTarget: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

export interface MatchState {
  /** Minutes played so far, 0 to 90. */
  minute: number;
  phase: MatchPhase;
  /** Home first. */
  score: [number, number];
  sides: Record<Side, SideState>;
  players: Record<string, PlayerMatch>;
  stats: Record<Side, SideStats>;
  /** Home share of possession in each minute played, 0 to 1. */
  possession: number[];
  events: MatchEvent[];
}

export interface PlayerRole {
  att: number;
  def: number;
  ctrl: number;
}

export type RolesByPosition = Record<Position, PlayerRole>;
