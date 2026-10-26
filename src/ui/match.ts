import { MATCH } from '../engine/config';
import { aiManageSide, changeFormation, makeSubstitution, pendingForcedSub, setStyle as setLiveStyle, setTeamSheet, startSecondHalf, stepMinute, swapSlots } from '../engine/match';
import { setFormation, setStyle, swapPositions, swapWithBench, toTeamSheet } from '../engine/lineup';
import type { FormationId, PlayStyle, Side } from '../engine/matchTypes';
import { cupStrength, shootoutKicks, type ShootoutKick } from '../engine/knockout';
import type { Player } from '../engine/types';
import type { Game } from '../game';
import { completeMatch, type MatchReport, type MatchSession } from '../play';
import type { LineupRef } from './dnd';
import type { MatchPhaseUi, MatchView } from './screens/match';

/** Real time for each minute of the match, and how long the clock stands still while a goal or red card banner flashes. */
export const MINUTE_MS = 330;
export const FLASH_MS = 2300;
/** Real time between penalties in a shoot-out, at normal speed. */
export const KICK_MS = 1300;

/** How fast the match clock runs, as a multiple of normal. */
export const SPEEDS = [0.5, 1, 2] as const;
export type MatchSpeed = (typeof SPEEDS)[number];
const SPEED_KEY = 'gaffer-speed';

/** The speed the user last picked, kept on this device. */
export function savedSpeed(): MatchSpeed {
  try {
    const n = Number(localStorage.getItem(SPEED_KEY));
    return (SPEEDS as readonly number[]).includes(n) ? (n as MatchSpeed) : 1;
  } catch {
    return 1;
  }
}

/** One penalty in a shoot-out, with the player who took it. */
export interface TakenKick extends ShootoutKick {
  playerId: string;
}

export interface ShootoutState {
  kicks: TakenKick[];
  score: [number, number];
  /** How many kicks have been shown so far. */
  shown: number;
}

export interface MatchHooks {
  /** Redraw the match screen and any sheet. */
  render(): void;
  /** Save the game. */
  persist(): Promise<void>;
}

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs the user's match. It owns the clock: it plays a minute at a time, stops for half time, for an injury that needs
 * a replacement, and while a goal or red card banner flashes, and it counts the match once full time is reached.
 */
export class MatchController implements MatchView {
  phase: MatchPhaseUi = 'pre';
  paused = true;
  planOpen = false;
  /** True for the render straight after the plan sheet opens, so it can scroll to the top. */
  planJustOpened = false;
  notice: string | null = null;
  report: MatchReport | null = null;

  speed: MatchSpeed = savedSpeed();
  /** The position the user has tapped in the plan sheet, and a substitution staged but not yet confirmed. */
  selectedSlot: number | null = null;
  pending: { slot: number; benchId: string } | null = null;
  shootout: ShootoutState | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private kickTimer: ReturnType<typeof setInterval> | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private holding = false;

  constructor(
    readonly game: Game,
    readonly session: MatchSession,
    private readonly hooks: MatchHooks,
  ) {}

  get userSide(): Side {
    return this.session.userSide;
  }

  private get oppSide(): Side {
    return this.userSide === 'home' ? 'away' : 'home';
  }

  // --- Before kick-off: the team is the lineup picked on the Team screen, changed freely --------------------------

  /** Puts the lineup on the pitch for the match after it has been changed. */
  syncLineup(): void {
    const { game, session } = this;
    setTeamSheet(game.world, session.state, this.userSide, toTeamSheet(game.world, game.lineup));
  }

  async lineupChanged(): Promise<void> {
    this.syncLineup();
    await this.hooks.persist();
    this.hooks.render();
  }

  async preMatchSwap(from: LineupRef, to: LineupRef): Promise<void> {
    const g = this.game;
    try {
      if (from.kind === 'slot' && to.kind === 'slot') g.lineup = swapPositions(g.lineup, from.index, to.index);
      else if (from.kind === 'slot' && to.kind === 'bench') g.lineup = swapWithBench(g.world, g.lineup, from.index, to.index);
      else if (from.kind === 'bench' && to.kind === 'slot') g.lineup = swapWithBench(g.world, g.lineup, to.index, from.index);
      else return;
    } catch {
      return;
    }
    await this.lineupChanged();
  }

  async preMatchFormation(f: FormationId): Promise<void> {
    this.game.lineup = setFormation(this.game.world, this.game.lineup, f);
    await this.lineupChanged();
  }

  async preMatchStyle(style: PlayStyle): Promise<void> {
    this.game.lineup = setStyle(this.game.lineup, style);
    await this.lineupChanged();
  }

  // --- The clock ------------------------------------------------------------------------------------------------

  kickOff(): void {
    if (this.phase !== 'pre') return;
    this.phase = 'live';
    this.paused = false;
    this.startTimer();
    this.hooks.render();
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => this.tick(), MINUTE_MS / this.speed);
  }

  /** Changes how fast the match runs. The choice is remembered for next time. */
  setSpeed(speed: MatchSpeed): void {
    this.speed = speed;
    try {
      localStorage.setItem(SPEED_KEY, String(speed));
    } catch {
      // Not being able to remember it is fine.
    }
    if (this.timer) this.startTimer();
    if (this.kickTimer) this.startKicks();
    this.hooks.render();
  }

  private stopTimer(): void {
    if (this.kickTimer) clearInterval(this.kickTimer);
    this.kickTimer = null;
    if (this.timer) clearInterval(this.timer);
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.timer = null;
    this.holdTimer = null;
    this.holding = false;
  }

  private stopForPlan(): void {
    this.stopTimer();
    this.paused = true;
    this.openPlan();
  }

  private tick(): void {
    const { game, session } = this;
    const state = session.state;
    if (this.phase !== 'live' || this.paused || this.holding) return;

    aiManageSide(game.world, state, this.oppSide, session.rng);
    if (pendingForcedSub(state) === this.userSide) {
      this.stopForPlan();
      return;
    }
    const before = state.events.length;
    stepMinute(game.world, state, session.rng);
    const events = state.events.slice(before);

    if (state.phase === 'full-time') {
      this.stopTimer();
      if (this.session.match.kind !== 'league' && state.score[0] === state.score[1]) this.beginShootout();
      else void this.finish();
      return;
    }
    if (state.phase === 'half-time' || pendingForcedSub(state) === this.userSide) {
      this.stopForPlan();
      return;
    }
    if (!reducedMotion() && events.some((e) => e.kind === 'goal' || e.kind === 'red')) {
      // The clock stands still while the banner flashes.
      this.holding = true;
      this.holdTimer = setTimeout(() => {
        this.holding = false;
        this.holdTimer = null;
      }, FLASH_MS);
    }
    this.hooks.render();
  }

  /** A cup tie or play-off final that is level goes to penalties, played out one kick at a time. */
  private beginShootout(): void {
    const { game, session } = this;
    const { match, state } = session;
    const result = shootoutKicks(session.rng, cupStrength(game.world, game.season, match.homeId), cupStrength(game.world, game.season, match.awayId));
    const takers = (side: Side): string[] => {
      const players = state.sides[side].slots
        .filter((id): id is string => id !== null && !!state.players[id] && state.players[id]!.redCards === 0)
        .map((id) => game.world.players[id] as Player)
        .filter((p) => p.position !== 'GK')
        .sort((a, b) => b.ability - a.ability);
      return players.map((p) => p.id);
    };
    const order = { home: takers('home'), away: takers('away') };
    const used = { home: 0, away: 0 };
    const kicks: TakenKick[] = result.kicks.map((k) => {
      const list = order[k.side];
      const playerId = list[used[k.side]++ % Math.max(1, list.length)] as string;
      return { ...k, playerId };
    });
    this.shootout = { kicks, score: result.score, shown: 0 };
    this.phase = 'penalties';
    this.paused = false;
    this.planOpen = false;
    this.startKicks();
    this.hooks.render();
  }

  private startKicks(): void {
    if (this.kickTimer) clearInterval(this.kickTimer);
    this.kickTimer = setInterval(() => this.revealKick(), KICK_MS / this.speed);
  }

  private revealKick(): void {
    const s = this.shootout;
    if (!s) return;
    s.shown++;
    if (s.shown >= s.kicks.length) {
      if (this.kickTimer) clearInterval(this.kickTimer);
      this.kickTimer = null;
      // Let the last kick sink in before the result.
      this.holdTimer = setTimeout(() => void this.finish(), 1500);
    }
    this.hooks.render();
  }

  /** Shows the rest of the shoot-out at once. */
  skipShootout(): void {
    const s = this.shootout;
    if (!s || this.phase !== 'penalties' || s.shown >= s.kicks.length) return;
    if (this.kickTimer) clearInterval(this.kickTimer);
    this.kickTimer = null;
    s.shown = s.kicks.length;
    void this.finish();
  }

  private async finish(): Promise<void> {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
    this.paused = false;
    this.planOpen = false;
    this.report = completeMatch(this.game, this.session, this.shootout?.score);
    this.phase = 'full';
    await this.hooks.persist();
    this.hooks.render();
  }

  /** Stops the clock without opening the plan sheet, for example when the user leaves the screen. */
  suspend(): void {
    if (this.phase === 'penalties') return;
    if (this.phase !== 'live') return;
    this.stopTimer();
    this.paused = true;
    this.hooks.render();
  }

  pause(): void {
    if (this.phase !== 'live' || this.paused) return;
    this.stopForPlan();
  }

  resume(): void {
    if (this.phase !== 'live') return;
    const state = this.session.state;
    if (pendingForcedSub(state) === this.userSide) {
      this.notice = 'Replace the injured player first.';
      this.hooks.render();
      return;
    }
    if (state.phase === 'half-time') startSecondHalf(state);
    this.planOpen = false;
    this.notice = null;
    this.selectedSlot = null;
    this.pending = null;
    this.paused = false;
    this.startTimer();
    this.hooks.render();
  }

  openPlan(): void {
    this.planOpen = true;
    this.planJustOpened = true;
    this.pending = null;
    this.selectedSlot = this.forcedSlot();
    this.hooks.render();
  }

  closePlan(): void {
    this.planOpen = false;
    this.notice = null;
    this.selectedSlot = null;
    this.pending = null;
    this.hooks.render();
  }

  /** The position of the injured player who must be replaced, or null. */
  private forcedSlot(): number | null {
    const state = this.session.state;
    if (pendingForcedSub(state) !== this.userSide) return null;
    const side = state.sides[this.userSide];
    const slot = side.slots.indexOf(side.forcedSub);
    return slot === -1 ? null : slot;
  }

  // --- Substitutions by tapping: pick a position, pick who comes on, confirm ------------------------------------

  /** A tap on a dot on the mini pitch or a row of the Starting XI. Picks the player, or swaps him with the one already picked. */
  pickSlot(slot: number): void {
    if (!this.planOpen) return;
    this.notice = null;
    const forced = this.forcedSlot();
    this.pending = null;
    if (forced !== null) {
      this.selectedSlot = forced;
      if (slot !== forced) this.notice = 'Replace the injured player first.';
    } else if (this.selectedSlot === null) {
      this.selectedSlot = slot;
    } else if (this.selectedSlot === slot) {
      this.selectedSlot = null;
    } else {
      swapSlots(this.session.state, this.userSide, this.selectedSlot, slot);
      this.selectedSlot = null;
    }
    this.hooks.render();
  }

  /** A tap on a bench player: stage the substitution so the user can see what it does before confirming. */
  pickBench(playerId: string): void {
    if (!this.planOpen) return;
    const { game, session } = this;
    const side = session.state.sides[this.userSide];
    this.notice = null;
    if (this.selectedSlot === null) {
      this.notice = 'Tap the player you want to take off first.';
    } else if (game.world.players[playerId]?.injury) {
      this.notice = 'He is injured.';
    } else if (side.subsUsed >= MATCH.maxSubs && this.forcedSlot() === null) {
      this.notice = 'No substitutions left.';
    } else {
      this.pending = { slot: this.selectedSlot, benchId: playerId };
    }
    this.hooks.render();
  }

  confirmSub(): void {
    const pending = this.pending;
    if (!pending) return;
    const { game, session } = this;
    const side = session.state.sides[this.userSide];
    const offId = side.slots[pending.slot];
    this.pending = null;
    this.selectedSlot = null;
    this.notice = null;
    try {
      if (offId) makeSubstitution(game.world, session.state, this.userSide, offId, pending.benchId);
    } catch (e) {
      this.notice = (e as Error).message;
    }
    this.hooks.render();
  }

  undoSub(): void {
    this.pending = null;
    this.hooks.render();
  }

  cancelPick(): void {
    if (this.forcedSlot() !== null) return;
    this.selectedSlot = null;
    this.pending = null;
    this.hooks.render();
  }

  // --- Changes made while the match is paused -------------------------------------------------------------------

  liveSetStyle(style: PlayStyle): void {
    setLiveStyle(this.session.state, this.userSide, style);
    this.hooks.render();
  }

  liveFormation(f: FormationId): void {
    changeFormation(this.game.world, this.session.state, this.userSide, f);
    this.hooks.render();
  }

  /** Dragging on the live pitch: swapping two players is free, bringing a substitute on uses one of the three. */
  liveSwap(from: LineupRef, to: LineupRef): void {
    const { game, session } = this;
    const side = session.state.sides[this.userSide];
    this.notice = null;
    try {
      if (from.kind === 'slot' && to.kind === 'slot') {
        swapSlots(session.state, this.userSide, from.index, to.index);
      } else {
        const slot = from.kind === 'slot' ? from : to;
        const bench = from.kind === 'bench' ? from : to;
        if (slot.kind !== 'slot' || bench.kind !== 'bench') return;
        const off = side.slots[slot.index];
        const on = side.bench[bench.index];
        if (!off || !on) return;
        makeSubstitution(game.world, session.state, this.userSide, off, on);
      }
    } catch (e) {
      this.notice = (e as Error).message;
    }
    this.hooks.render();
  }
}
