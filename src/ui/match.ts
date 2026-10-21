import { aiManageSide, changeFormation, makeSubstitution, pendingForcedSub, setStyle as setLiveStyle, setTeamSheet, startSecondHalf, stepMinute, swapSlots } from '../engine/match';
import { setFormation, setStyle, swapPositions, swapWithBench, toTeamSheet } from '../engine/lineup';
import type { FormationId, PlayStyle, Side } from '../engine/matchTypes';
import type { Game } from '../game';
import { completeMatch, type MatchReport, type MatchSession } from '../play';
import type { LineupRef } from './dnd';
import type { MatchPhaseUi, MatchView } from './screens/match';

/** Real time for each minute of the match, and how long the clock stands still while a goal or red card banner flashes. */
export const MINUTE_MS = 330;
export const FLASH_MS = 2300;

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

  private timer: ReturnType<typeof setInterval> | null = null;
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
    this.timer = setInterval(() => this.tick(), MINUTE_MS);
  }

  private stopTimer(): void {
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
      void this.finish();
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

  private async finish(): Promise<void> {
    this.paused = false;
    this.planOpen = false;
    this.report = completeMatch(this.game, this.session);
    this.phase = 'full';
    await this.hooks.persist();
    this.hooks.render();
  }

  /** Stops the clock without opening the plan sheet, for example when the user leaves the screen. */
  suspend(): void {
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
    this.paused = false;
    this.startTimer();
    this.hooks.render();
  }

  openPlan(): void {
    this.planOpen = true;
    this.planJustOpened = true;
    this.hooks.render();
  }

  closePlan(): void {
    this.planOpen = false;
    this.notice = null;
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
