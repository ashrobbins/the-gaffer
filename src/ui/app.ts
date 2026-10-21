import { offerRenewal, releasePlayer } from '../engine/contracts';
import { repairLineup, setCaptain, setFormation, swapPositions, swapWithBench } from '../engine/lineup';
import type { FormationId } from '../engine/matchTypes';
import type { NewClubOptions } from '../engine/types';
import { createGame, withRng, type Game } from '../game';
import type { GameStorage } from '../storage';
import { esc, gbp } from './format';
import { renderClubScreen, type ClubScreenState, type ClubTab } from './screens/club';
import { renderHq, userClub } from './screens/hq';
import { renderComingSoon, renderMatchDay } from './screens/misc';
import { mountNewGame } from './screens/newGame';
import { crest } from './sprites';
import { MATCHES_PER_SEASON } from '../engine/config';
import { attachLineupDnd, type LineupRef } from './dnd';
import { contractDynamic, contractSheet, defaultOffer, playerSheet, type SheetState } from './sheets';
import { renderTeam, type TeamScreenState, type TeamTab } from './screens/team';

export type Screen = 'hq' | 'team' | 'season' | 'transfers' | 'club' | 'match';

/** The navigation. Match day is deliberately not here: it can only be reached from the Go to match button on HQ. */
export const NAV: readonly (readonly [Screen, string])[] = [
  ['hq', 'HQ'],
  ['team', 'Team'],
  ['season', 'Season'],
  ['transfers', 'Transfers'],
  ['club', 'Club'],
];

export interface AppDeps {
  storage: GameStorage;
  /** A random number from 0 to 1, used to pick the seed of a new game. */
  random?: () => number;
}

/**
 * The whole interface. Until a club has been created only the New Game screen shows, with no navigation. After that
 * the navigation appears and the New Game screen is gone for good.
 */
export class App {
  private game: Game | null = null;
  private screen: Screen = 'hq';
  private club: ClubScreenState = { tab: 'stadium', confirmingReset: false };
  private team: TeamScreenState = { tab: 'tactics' };
  private sheet: SheetState | null = null;
  private saveFailed = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly deps: AppDeps,
  ) {
    root.innerHTML =
      '<div id="shell"></div><div id="sheet" hidden><div class="sh-bg" data-close></div><div class="sh" role="dialog" aria-modal="true" aria-label="Details"></div></div>';
    root.addEventListener('click', (e) => void this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.sheet) this.closeSheet();
    });
    attachLineupDnd(root, {
      onTap: (ref) => this.openPlayer(this.playerAt(ref)),
      onSwap: (from, to) => void this.swap(from, to),
    });
  }

  /** Looks for a saved game and shows the right first screen. */
  async start(): Promise<void> {
    try {
      this.game = await this.deps.storage.load();
    } catch {
      this.game = null;
      this.saveFailed = true;
    }
    this.fixLineup();
    this.render();
  }

  /** The game being played, or null on the New Game screen. */
  get current(): Game | null {
    return this.game;
  }

  get currentScreen(): Screen | 'new-game' {
    return this.game ? this.screen : 'new-game';
  }

  private async createClub(options: NewClubOptions): Promise<void> {
    const seed = Math.floor((this.deps.random ?? Math.random)() * 2 ** 31);
    this.game = createGame(options, seed);
    this.screen = 'hq';
    this.club = { tab: 'stadium', confirmingReset: false };
    this.team = { tab: 'tactics' };
    this.sheet = null;
    await this.persist();
    this.render();
  }

  /** Keeps the picked team in step with the squad: injured players come out, new signings go to the bench. */
  private fixLineup(): void {
    if (!this.game) return;
    this.game.lineup = repairLineup(this.game.world, this.game.world.userClubId, this.game.lineup);
  }

  private playerAt(ref: LineupRef): string | undefined {
    const lineup = this.game?.lineup;
    return ref.kind === 'slot' ? lineup?.xi[ref.index] : lineup?.bench[ref.index];
  }

  private async swap(from: LineupRef, to: LineupRef): Promise<void> {
    const game = this.game;
    if (!game) return;
    try {
      if (from.kind === 'slot' && to.kind === 'slot') game.lineup = swapPositions(game.lineup, from.index, to.index);
      else if (from.kind === 'slot' && to.kind === 'bench') game.lineup = swapWithBench(game.world, game.lineup, from.index, to.index);
      else if (from.kind === 'bench' && to.kind === 'slot') game.lineup = swapWithBench(game.world, game.lineup, to.index, from.index);
      else return;
    } catch {
      return;
    }
    await this.persist();
    this.render();
  }

  private openPlayer(playerId: string | undefined): void {
    if (!playerId) return;
    this.sheet = { kind: 'player', playerId };
    this.renderSheet(true);
  }

  private openContract(playerId: string): void {
    const p = this.game?.world.players[playerId];
    if (!p) return;
    this.sheet = { kind: 'contract', playerId, wage: defaultOffer(p), games: 38, result: null, confirmRelease: false };
    this.renderSheet(true);
  }

  private closeSheet(): void {
    this.sheet = null;
    this.renderSheet(false);
  }

  /** Draws the sheet over the page, or hides it. A sheet always opens scrolled to the top. */
  private renderSheet(toTop: boolean): void {
    const host = this.root.querySelector<HTMLElement>('#sheet') as HTMLElement;
    const body = host.querySelector<HTMLElement>('.sh') as HTMLElement;
    const game = this.game;
    if (!this.sheet || !game) {
      host.hidden = true;
      return;
    }
    const club = userClub(game);
    body.innerHTML = this.sheet.kind === 'player' ? playerSheet(game, club, this.sheet.playerId) : contractSheet(game, club, this.sheet);
    host.hidden = false;
    if (toTop) body.scrollTop = 0;
  }

  private onInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    if (target.id !== 'wage' || this.sheet?.kind !== 'contract' || !this.game) return;
    this.sheet.wage = Number(target.value);
    this.sheet.result = null;
    const label = this.root.querySelector('#wage-label');
    if (label) label.textContent = gbp(this.sheet.wage);
    const dyn = this.root.querySelector('#contract-dynamic');
    if (dyn) dyn.innerHTML = contractDynamic(this.game, userClub(this.game), this.sheet);
  }

  private async persist(): Promise<void> {
    if (!this.game) return;
    try {
      await this.deps.storage.save(this.game);
      this.saveFailed = false;
    } catch {
      this.saveFailed = true;
    }
  }

  private async onClick(e: MouseEvent): Promise<void> {
    const target = e.target as HTMLElement;
    const nav = target.closest<HTMLElement>('[data-nav]');
    if (nav && this.game) {
      this.screen = nav.dataset.nav as Screen;
      this.club.confirmingReset = false;
      this.render();
      return;
    }
    if (await this.onGameClick(target)) return;
    const tab = target.closest<HTMLElement>('[data-club-tab]');
    if (tab) {
      this.club.tab = tab.dataset.clubTab as ClubTab;
      this.render();
      return;
    }
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    switch (act) {
      case 'go-match':
        this.screen = 'match';
        break;
      case 'back-to-hq':
        this.screen = 'hq';
        break;
      case 'reset':
        this.club.confirmingReset = true;
        break;
      case 'reset-cancel':
        this.club.confirmingReset = false;
        break;
      case 'reset-confirm':
        await this.deps.storage.clear();
        this.game = null;
        this.screen = 'hq';
        this.club = { tab: 'stadium', confirmingReset: false };
        this.sheet = null;
        break;
      default:
        return;
    }
    this.render();
  }

  /** Clicks on the Team screen and the sheets. Returns true if the click was one of them. */
  private async onGameClick(target: HTMLElement): Promise<boolean> {
    const game = this.game;
    if (!game) return false;
    const teamTab = target.closest<HTMLElement>('[data-team-tab]');
    if (teamTab) {
      this.team.tab = teamTab.dataset.teamTab as TeamTab;
      this.render();
      return true;
    }
    const formation = target.closest<HTMLElement>('[data-formation]');
    if (formation) {
      game.lineup = setFormation(game.world, game.lineup, formation.dataset.formation as FormationId);
      await this.persist();
      this.render();
      return true;
    }
    const row = target.closest<HTMLElement>('tr[data-p]');
    if (row) {
      this.openPlayer(row.dataset.p);
      return true;
    }
    const contractRow = target.closest<HTMLElement>('tr[data-c]');
    if (contractRow) {
      this.openContract(contractRow.dataset.c as string);
      return true;
    }
    if (target.closest('[data-slot],[data-bn]')) return true;
    if (!this.sheet) return false;

    if (target.closest('[data-close]')) {
      this.closeSheet();
      return true;
    }
    const cap = target.closest<HTMLButtonElement>('[data-cap]');
    if (cap && !cap.disabled) {
      game.lineup = setCaptain(game.lineup, cap.dataset.cap as string);
      await this.persist();
      this.render();
      this.renderSheet(false);
      return true;
    }
    const contract = target.closest<HTMLElement>('[data-contract]');
    if (contract) {
      this.openContract(contract.dataset.contract as string);
      return true;
    }
    if (this.sheet.kind !== 'contract') return false;
    const sheet = this.sheet;
    const len = target.closest<HTMLElement>('[data-len]');
    if (len) {
      sheet.games = Number(len.dataset.len);
      sheet.result = null;
      this.renderSheet(false);
      return true;
    }
    if (target.closest('[data-offer]')) {
      const result = withRng(game, (rng) => offerRenewal(game.world, sheet.playerId, sheet.wage, sheet.games, rng));
      sheet.result = result.accepted ? 'accepted' : 'refused';
      await this.persist();
      this.render();
      this.renderSheet(true);
      return true;
    }
    if (target.closest('[data-release]')) {
      sheet.confirmRelease = true;
      this.renderSheet(true);
      return true;
    }
    if (target.closest('[data-release-cancel]')) {
      sheet.confirmRelease = false;
      this.renderSheet(true);
      return true;
    }
    if (target.closest('[data-release-confirm]')) {
      releasePlayer(game.world, sheet.playerId);
      this.fixLineup();
      this.sheet = null;
      await this.persist();
      this.render();
      this.renderSheet(false);
      return true;
    }
    return false;
  }

  private header(): string {
    const game = this.game;
    if (!game) {
      return `<div class="bar"><div class="logo">THE GAFFER</div></div>`;
    }
    const club = userClub(game);
    return `<div class="bar">
      <div class="logo">THE GAFFER</div>
      <div class="meta"><span class="who">${crest(club.kit, 22)}<b>${esc(club.name)}</b></span><span class="hide-sm">WK <b>${game.season.round + 1}</b>/${MATCHES_PER_SEASON}</span><span>CASH <b>${gbp(club.cash)}</b></span></div>
    </div>
    <nav class="nav" aria-label="Screens">${NAV.map(
      ([id, label]) => `<button data-nav="${id}" aria-current="${this.screen === id}" type="button">${label}</button>`,
    ).join('')}</nav>`;
  }

  private body(): string {
    const game = this.game;
    if (!game) return '';
    switch (this.screen) {
      case 'hq':
        return renderHq(game);
      case 'team':
        return renderTeam(game, userClub(game), this.team);
      case 'season':
        return renderComingSoon('Season', ['The league table and results', 'Top scorers', 'The Challenge Cup']);
      case 'transfers':
        return renderComingSoon('Transfers', ['The market, with the window dates', 'Fee and wage negotiations', 'Offers for your players']);
      case 'club':
        return renderClubScreen(this.club);
      case 'match':
        return renderMatchDay();
    }
  }

  render(): void {
    const shell = this.root.querySelector<HTMLElement>('#shell') as HTMLElement;
    shell.innerHTML = `<div class="wrap">
      <div class="top"><div class="topin">${this.header()}</div></div>
      <div class="frame"><div class="inner" id="screen">${this.game ? this.body() : ''}</div></div>
      ${this.saveFailed ? '<p class="foot" role="status">This device would not let the game be saved. Your progress will be lost when you close the page.</p>' : ''}
    </div>`;
    if (!this.game) {
      mountNewGame(shell.querySelector<HTMLElement>('#screen') as HTMLElement, (options) => void this.createClub(options));
    }
  }
}
