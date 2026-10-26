import { offerRenewal, releasePlayer } from '../engine/contracts';
import { repairLineup, setCaptain, setFormation, swapPositions, swapWithBench } from '../engine/lineup';
import type { FormationId, PlayStyle } from '../engine/matchTypes';
import { createGame, withRng, type Game } from '../game';
import type { GameStorage } from '../storage';
import { esc, gbp } from './format';
import type { Club, NewClubOptions, Player } from '../engine/types';
import { renderClubScreen, type ClubScreenState, type ClubTab } from './screens/club';
import { renderHq, userClub } from './screens/hq';
import { renderMatchDay } from './screens/misc';
import { mountNewGame } from './screens/newGame';
import { crest } from './sprites';
import { drawStadium } from './stadiumArt';
import { startStadiumBuild } from '../engine/finance';
import { signSponsor } from '../engine/sponsors';
import { STANDS } from './screens/club';
import { celebrationHtml, cupWinCelebration, seasonCelebrations, type Celebration } from './celebrate';
import { MatchController, type MatchSpeed } from './match';
import { liveMatchHtml, planSheetHtml, preMatchHtml } from './screens/match';
import { startSession } from '../play';
import { MATCHES_PER_SEASON } from '../engine/config';
import { attachLineupDnd, type LineupRef } from './dnd';
import { bidSheet, contractDynamic, contractSheet, defaultOffer, playerSheet, saleCounterSheet, type SheetState } from './sheets';
import { acceptCounter, completeSigning, makeOffer, startNegotiation, type OfferLevel } from '../engine/negotiation';
import { acceptBid, counterBid, rejectBid } from '../engine/selling';
import { advanceSummer, closeSeason } from '../seasonEnd';
import { initialTransferState, renderTransfers, type TransferFilter, type TransferScreenState, type TransferTab } from './screens/transfers';
import { initialSeasonState, renderSeason, type SeasonScreenState, type SeasonView } from './screens/season';
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
  private seasonScreen: SeasonScreenState = initialSeasonState();
  private transfers: TransferScreenState = initialTransferState();
  private sheet: SheetState | null = null;
  private match: MatchController | null = null;
  private saveFailed = false;
  /** Celebrations waiting to be shown, one after another. */
  private celebrations: Celebration[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly deps: AppDeps,
  ) {
    root.innerHTML =
      '<div id="shell"></div><div id="celebrate" hidden></div><div id="sheet" hidden><div class="sh-bg" data-close></div><div class="sh" role="dialog" aria-modal="true" aria-label="Details"></div></div>';
    root.addEventListener('click', (e) => void this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.match?.planOpen) this.match.closePlan();
      else if (this.sheet) this.closeSheet();
    });
    attachLineupDnd(root, {
      onTap: (ref) => this.onTap(ref),
      onSwap: (from, to) => void this.onSwap(from, to),
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
    this.seasonScreen = initialSeasonState();
    this.transfers = initialTransferState();
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

  private onTap(ref: LineupRef): void {
    const m = this.match;
    if (m?.planOpen) return;
    if (m && this.screen === 'match' && m.phase === 'live') return;
    if (m && this.screen === 'match' && m.phase === 'pre') {
      this.openPlayer(this.playerAt(ref));
      return;
    }
    this.openPlayer(this.playerAt(ref));
  }

  private async onSwap(from: LineupRef, to: LineupRef): Promise<void> {
    const m = this.match;
    if (m?.planOpen) {
      m.liveSwap(from, to);
      return;
    }
    if (m && this.screen === 'match' && m.phase === 'pre') {
      await m.preMatchSwap(from, to);
      return;
    }
    if (m && this.screen === 'match') return;
    await this.swap(from, to);
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
    const m = this.match;
    if (game && m?.planOpen) {
      body.innerHTML = planSheetHtml(game, m.session, m);
      host.hidden = false;
      if (m.planJustOpened) {
        body.scrollTop = 0;
        m.planJustOpened = false;
      }
      return;
    }
    if (!this.sheet || !game) {
      host.hidden = true;
      return;
    }
    const club = userClub(game);
    body.innerHTML =
      this.sheet.kind === 'player'
        ? playerSheet(game, club, this.sheet.playerId)
        : this.sheet.kind === 'bid'
          ? bidSheet(game, club, this.sheet)
          : this.sheet.kind === 'sale-counter'
            ? saleCounterSheet(game, this.sheet)
            : contractSheet(game, club, this.sheet);
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
      if (this.match?.phase === 'live') this.match.suspend();
      if (this.match?.phase === 'full') this.match = null;
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
        this.match = null;
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
    if (await this.onMatchClick(target)) return true;
    const teamTab = target.closest<HTMLElement>('[data-team-tab]');
    if (teamTab) {
      this.team.tab = teamTab.dataset.teamTab as TeamTab;
      this.render();
      return true;
    }
    if (target.closest('[data-celebrate]')) {
      this.celebrations.shift();
      this.renderCelebration();
      return true;
    }
    if (await this.onClubClick(target)) return true;
    if (await this.onSeasonFlowClick(target)) return true;
    if (await this.onTransferClick(target)) return true;
    const seasonView = target.closest<HTMLElement>('[data-season-view]');
    if (seasonView) {
      this.seasonScreen.view = seasonView.dataset.seasonView as SeasonView;
      this.render();
      return true;
    }
    const seasonDiv = target.closest<HTMLElement>('[data-season-div]');
    if (seasonDiv) {
      this.seasonScreen.division = Number(seasonDiv.dataset.seasonDiv);
      this.render();
      return true;
    }
    const cupRound = target.closest<HTMLElement>('[data-cup-round]');
    if (cupRound) {
      this.seasonScreen.cupRound = Number(cupRound.dataset.cupRound);
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
    if (target.closest<HTMLButtonElement>('[data-offer]')?.disabled) return true;
    if (target.closest('[data-offer]')) {
      const result = withRng(game, (rng) => offerRenewal(game.world, sheet.playerId, sheet.wage, sheet.games, rng, game.date));
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

  /** Building a stand and signing a sponsor on the Club page. */
  private async onClubClick(target: HTMLElement): Promise<boolean> {
    const game = this.game;
    if (!game) return false;
    const build = target.closest<HTMLButtonElement>('[data-build]');
    if (build) {
      if (build.disabled) return true;
      const i = Number(build.dataset.build);
      if (this.club.confirmingBuild === i) {
        startStadiumBuild(game.world, game.world.userClubId, (STANDS[i] as { seats: number }).seats);
        this.club.confirmingBuild = null;
        await this.persist();
      } else {
        this.club.confirmingBuild = i;
      }
      this.render();
      return true;
    }
    const sign = target.closest<HTMLButtonElement>('[data-sponsor-sign]');
    if (sign) {
      if (!sign.disabled) {
        signSponsor(game.world, game.season, sign.dataset.sponsorSign as string);
        await this.persist();
        this.render();
      }
      return true;
    }
    if (this.club.confirmingBuild !== null && this.club.confirmingBuild !== undefined) {
      this.club.confirmingBuild = null;
      this.render();
    }
    return false;
  }

  /** Finishing the season, moving the close season on a week, and starting the new season. */
  private async onSeasonFlowClick(target: HTMLElement): Promise<boolean> {
    const game = this.game;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!game || (act !== 'close-season' && act !== 'advance-week' && act !== 'start-season')) return false;
    if (act === 'close-season') {
      const review = closeSeason(game);
      this.celebrations.push(...seasonCelebrations(review, userClub(game)));
    } else advanceSummer(game);
    this.transfers.notice = null;
    this.fixLineup();
    await this.persist();
    this.render();
    return true;
  }

  /** Clicks on the Transfers screen and its negotiation and counter-offer sheets. */
  private async onTransferClick(target: HTMLElement): Promise<boolean> {
    const game = this.game;
    if (!game) return false;
    const tab = target.closest<HTMLElement>('[data-tr-tab]');
    if (tab) {
      this.transfers.tab = tab.dataset.trTab as TransferTab;
      this.transfers.notice = null;
      this.render();
      return true;
    }
    const filter = target.closest<HTMLElement>('[data-tr-filter]');
    if (filter) {
      this.transfers.filter = filter.dataset.trFilter as TransferFilter;
      this.render();
      return true;
    }
    const bid = target.closest<HTMLButtonElement>('[data-bid]');
    if (bid) {
      if (!bid.disabled) {
        this.sheet = { kind: 'bid', neg: startNegotiation(game.world, game.date, bid.dataset.bid as string), message: null, signed: false };
        this.renderSheet(true);
      }
      return true;
    }
    const accept = target.closest<HTMLButtonElement>('[data-sale-accept]');
    if (accept) {
      if (accept.disabled) return true;
      const b = game.world.incomingBids.find((x) => x.id === accept.dataset.saleAccept);
      if (!b) return true;
      const p = game.world.players[b.playerId] as Player;
      const buyer = game.world.clubs[b.buyerClubId] as Club;
      const gained = withRng(game, (rng) => acceptBid(game.world, game.date, b.id, rng));
      this.transfers.notice = `Sold ${p.firstName} ${p.lastName} to ${buyer.name} for ${gbp(gained)}.`;
      this.fixLineup();
      await this.persist();
      this.render();
      return true;
    }
    const counter = target.closest<HTMLButtonElement>('[data-sale-counter]');
    if (counter) {
      if (!counter.disabled) {
        this.sheet = { kind: 'sale-counter', bidId: counter.dataset.saleCounter as string, message: null };
        this.renderSheet(true);
      }
      return true;
    }
    const reject = target.closest<HTMLElement>('[data-sale-reject]');
    if (reject) {
      rejectBid(game.world, reject.dataset.saleReject as string);
      this.transfers.notice = null;
      await this.persist();
      this.render();
      return true;
    }

    const sheet = this.sheet;
    if (sheet?.kind === 'bid') {
      const offer = target.closest<HTMLButtonElement>('[data-neg-offer]');
      if (offer) {
        if (offer.disabled) return true;
        const neg = sheet.neg;
        const phase = neg.phase;
        const seller = neg.sellerClubId ? (game.world.clubs[neg.sellerClubId] as Club).name : 'The player';
        const result = withRng(game, (rng) => makeOffer(game.world, neg, game.date, offer.dataset.negOffer as OfferLevel, rng));
        const per = phase === 'wage' ? ' a week' : '';
        const who = phase === 'fee' ? seller : (game.world.players[neg.playerId] as Player).lastName;
        if (result.result === 'accepted') {
          sheet.message = { ok: true, text: phase === 'fee' ? `${seller} accepted ${gbp(result.amount)}. Now agree wages with the player.` : `He accepted ${gbp(result.amount)} a week.` };
        } else if (result.result === 'rejected') {
          sheet.message = { ok: false, text: `${who} rejected ${gbp(result.amount)}${per}. They would do it for ${gbp(result.counter)}${per}.` };
        } else {
          sheet.message = null;
          await this.persist();
          this.render();
        }
        this.renderSheet(true);
        return true;
      }
      if (target.closest('[data-neg-counter]')) {
        const neg = sheet.neg;
        const phase = neg.phase;
        const amount = acceptCounter(game.world, neg);
        sheet.message = { ok: true, text: phase === 'fee' ? `Fee agreed at ${gbp(amount)}. Now agree wages with the player.` : `Wage agreed at ${gbp(amount)} a week.` };
        this.renderSheet(true);
        return true;
      }
      if (target.closest('[data-neg-finish]')) {
        withRng(game, (rng) => completeSigning(game.world, sheet.neg, game.date, rng));
        sheet.signed = true;
        this.transfers.notice = null;
        this.fixLineup();
        await this.persist();
        this.render();
        this.renderSheet(true);
        return true;
      }
    }
    if (sheet?.kind === 'sale-counter') {
      const ask = target.closest<HTMLElement>('[data-sale-ask]');
      if (ask) {
        const b = game.world.incomingBids.find((x) => x.id === sheet.bidId);
        if (!b) return true;
        const p = game.world.players[b.playerId] as Player;
        const buyer = game.world.clubs[b.buyerClubId] as Club;
        const fee = Number(ask.dataset.saleAsk);
        const result = withRng(game, (rng) => counterBid(game.world, game.date, b.id, fee, rng));
        if (result.result === 'accepted') {
          sheet.message = { ok: true, text: `${buyer.name} agreed. ${p.firstName} ${p.lastName} leaves for ${gbp(fee)}.` };
          this.transfers.notice = `Sold ${p.firstName} ${p.lastName} to ${buyer.name} for ${gbp(fee)}.`;
          this.fixLineup();
        } else {
          sheet.message = { ok: false, text: result.withdrawn ? `${buyer.name} refused again and walked away.` : `${buyer.name} refused. Their offer still stands.` };
        }
        await this.persist();
        this.render();
        this.renderSheet(true);
        return true;
      }
    }
    return false;
  }

  /** Clicks on the match screens and the change-your-plan sheet. */
  private async onMatchClick(target: HTMLElement): Promise<boolean> {
    const m = this.match;
    const game = this.game;
    if (!game) return false;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'go-match') {
      if (!m || m.phase === 'full') {
        const session = startSession(game);
        if (!session) return true;
        this.match = new MatchController(game, session, { render: () => this.renderAll(), persist: () => this.persist() });
      }
      this.screen = 'match';
      this.render();
      return true;
    }
    if (!m) return false;
    switch (act) {
      case 'kick-off':
        m.kickOff();
        return true;
      case 'pause':
        m.pause();
        return true;
      case 'resume':
        m.resume();
        return true;
      case 'plan':
        m.openPlan();
        return true;
      case 'sub-confirm':
        m.confirmSub();
        return true;
      case 'sub-undo':
        m.undoSub();
        return true;
      case 'sub-cancel':
        m.cancelPick();
        return true;
      case 'skip-shootout':
        m.skipShootout();
        return true;
      case 'continue': {
        const won = m.report?.kind === 'cup' && m.report.userWon === true && m.session.match.cupRound === game.cup.rounds.length - 1;
        if (won) this.celebrations.push(cupWinCelebration(game.season.year, userClub(game)));
        this.match = null;
        this.screen = 'hq';
        this.render();
        return true;
      }
    }
    const speed = target.closest<HTMLElement>('[data-speed]');
    if (speed) {
      m.setSpeed(Number(speed.dataset.speed) as MatchSpeed);
      return true;
    }
    if (m.planOpen) {
      const pickSlot = target.closest<HTMLElement>('[data-pick-slot]');
      if (pickSlot) {
        m.pickSlot(Number(pickSlot.dataset.pickSlot));
        return true;
      }
      const pickBench = target.closest<HTMLElement>('[data-pick-bench]');
      if (pickBench) {
        m.pickBench(pickBench.dataset.pickBench as string);
        return true;
      }
      if (target.closest('[data-close]')) {
        m.closePlan();
        return true;
      }
      const style = target.closest<HTMLElement>('[data-style]');
      if (style) {
        m.liveSetStyle(style.dataset.style as PlayStyle);
        return true;
      }
      const formation = target.closest<HTMLElement>('[data-formation]');
      if (formation) {
        m.liveFormation(formation.dataset.formation as FormationId);
        return true;
      }
      return target.closest('[data-slot],[data-bn]') !== null;
    }
    if (this.screen === 'match' && m.phase === 'pre') {
      const style = target.closest<HTMLElement>('[data-style]');
      if (style) {
        await m.preMatchStyle(style.dataset.style as PlayStyle);
        return true;
      }
      const formation = target.closest<HTMLElement>('[data-formation]');
      if (formation) {
        await m.preMatchFormation(formation.dataset.formation as FormationId);
        return true;
      }
    }
    return false;
  }

  /** Shows the first waiting celebration over everything, or hides the overlay. */
  private renderCelebration(): void {
    const host = this.root.querySelector<HTMLElement>('#celebrate');
    if (!host) return;
    const next = this.celebrations[0];
    if (!next) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    if (host.hidden || host.dataset.title !== next.title + next.subtitle) {
      host.innerHTML = celebrationHtml(next);
      host.dataset.title = next.title + next.subtitle;
    }
    host.hidden = false;
    host.querySelector<HTMLElement>('[data-celebrate]')?.focus();
  }

  /** Redraws the page and whichever sheet is showing. */
  private renderAll(): void {
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
      <div class="meta"><span class="who">${crest(club.kit, 22)}<b>${esc(club.name)}</b></span><span class="hide-sm">${game.phase === 'summer' ? '<b>CLOSE SEASON</b>' : `WK <b>${Math.min(game.season.round + 1, MATCHES_PER_SEASON)}</b>/${MATCHES_PER_SEASON}`}</span><span>CASH <b>${gbp(club.cash)}</b></span></div>
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
        return renderSeason(game, this.seasonScreen);
      case 'transfers':
        return renderTransfers(game, userClub(game), this.transfers);
      case 'club':
        return renderClubScreen(game, userClub(game), this.club);
      case 'match':
        if (!this.match) return renderMatchDay();
        return this.match.phase === 'pre' ? preMatchHtml(game, this.match.session, this.match.speed) : liveMatchHtml(game, this.match.session, this.match);
    }
  }

  render(): void {
    const shell = this.root.querySelector<HTMLElement>('#shell') as HTMLElement;
    shell.innerHTML = `<div class="wrap">
      <div class="top"><div class="topin">${this.header()}</div></div>
      <div class="frame"><div class="inner" id="screen">${this.game ? this.body() : ''}</div></div>
      ${this.saveFailed ? '<p class="foot" role="status">This device would not let the game be saved. Your progress will be lost when you close the page.</p>' : ''}
    </div>`;
    this.renderSheet(false);
    this.renderCelebration();
    for (const canvas of shell.querySelectorAll<HTMLCanvasElement>('canvas.art')) {
      if (this.game) drawStadium(canvas, Number(canvas.dataset.cap), userClub(this.game).kit);
    }
    if (!this.game) {
      mountNewGame(shell.querySelector<HTMLElement>('#screen') as HTMLElement, (options) => void this.createClub(options));
    }
  }
}
