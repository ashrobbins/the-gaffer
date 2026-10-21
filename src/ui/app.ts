import { createGame, type Game } from '../game';
import type { NewClubOptions } from '../engine/types';
import type { GameStorage } from '../storage';
import { esc, gbp } from './format';
import { renderClubScreen, type ClubScreenState, type ClubTab } from './screens/club';
import { renderHq, userClub } from './screens/hq';
import { renderComingSoon, renderMatchDay } from './screens/misc';
import { mountNewGame } from './screens/newGame';
import { crest } from './sprites';
import { MATCHES_PER_SEASON } from '../engine/config';

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
  private saveFailed = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly deps: AppDeps,
  ) {
    root.addEventListener('click', (e) => void this.onClick(e));
  }

  /** Looks for a saved game and shows the right first screen. */
  async start(): Promise<void> {
    try {
      this.game = await this.deps.storage.load();
    } catch {
      this.game = null;
      this.saveFailed = true;
    }
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
    await this.persist();
    this.render();
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
        break;
      default:
        return;
    }
    this.render();
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
        return renderComingSoon('Team', ['Tactics: formation, play style and your starting eleven', 'Your squad with appearances and goals', 'Contracts and renewals']);
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
    this.root.innerHTML = `<div class="wrap">
      <div class="top"><div class="topin">${this.header()}</div></div>
      <div class="frame"><div class="inner" id="screen">${this.game ? this.body() : ''}</div></div>
      ${this.saveFailed ? '<p class="foot" role="status">This device would not let the game be saved. Your progress will be lost when you close the page.</p>' : ''}
    </div>`;
    if (!this.game) {
      mountNewGame(this.root.querySelector<HTMLElement>('#screen') as HTMLElement, (options) => void this.createClub(options));
    }
  }
}
