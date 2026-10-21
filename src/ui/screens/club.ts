import { DIVISION_NAMES, ECONOMY } from '../../engine/config';
import { attendance, buildCost, extraGatePerHomeMatch, sponsorIncome } from '../../engine/finance';
import { offerStatus } from '../../engine/sponsors';
import { clubForm, tableFor } from '../../engine/season';
import type { Club, SponsorOffer } from '../../engine/types';
import type { Game } from '../../game';
import { esc, gbp, num } from '../format';
import { segs } from '../icons';
import { shirt, trophy } from '../sprites';

export type ClubTab = 'stadium' | 'sponsors' | 'trophies';

export interface ClubScreenState {
  tab: ClubTab;
  /** True while the "are you sure?" step of resetting the game is showing. */
  confirmingReset: boolean;
  /** The stand whose building is waiting for a second press to confirm, since the money goes straight away. */
  confirmingBuild?: number | null;
}

const TABS: [ClubTab, string][] = [
  ['stadium', 'Stadium'],
  ['sponsors', 'Sponsors'],
  ['trophies', 'Trophies'],
];

/** The stands that can be built, and how many seats each adds. */
export const STANDS: readonly { name: string; seats: number }[] = [
  { name: 'North Stand', seats: 500 },
  { name: 'South Stand', seats: 500 },
  { name: 'East Stand', seats: 1000 },
  { name: 'West Stand · Family', seats: 800 },
];

const SLOT_NAMES = ['Shirt front', 'Shirt sleeve', 'Training kit', 'Stadium naming'];

function stadiumTab(game: Game, club: Club, state: ClubScreenState): string {
  const table = tableFor(game.world, game.season, club.division);
  const position = Math.max(1, table.findIndex((r) => r.clubId === club.id) + 1);
  const crowd = attendance(club, clubForm(game.season, club.id), position, table.length);
  const capacity = club.stadium.capacity;
  const gate = crowd * club.ticketPrice;
  const building = club.building;
  const stands = STANDS.map((st, i) => {
    const cost = buildCost(st.seats);
    const extra = extraGatePerHomeMatch(club, st.seats);
    const confirming = state.confirmingBuild === i;
    const blocked = !!building || cost > club.cash;
    return `<div class="row2" style="padding:9px 0;border-bottom:1px dotted #26336a;flex-wrap:nowrap;justify-content:space-between"><div style="min-width:0"><div>${st.name}</div>
        <div class="dim" style="font-size:8px">${num(capacity)} seats → ${num(capacity + st.seats)} <span class="grn">(+${num(st.seats)})</span></div>
        <div class="dim" style="font-size:8px">${extra > 0 ? `<span class="grn">+${gbp(extra)}</span> per home game at today's crowds` : 'No extra gate: the ground is not full'}</div></div>
      <button class="btn sm ${confirming ? '' : blocked ? 'faded' : ''}" data-build="${i}" ${blocked ? 'disabled' : ''} type="button">${confirming ? `Confirm ${gbp(cost)}` : gbp(cost)}</button></div>`;
  }).join('');
  return `<div class="grid" style="gap:18px"><canvas class="art" data-cap="${capacity}"></canvas>
    <div class="grid g12">
      <div class="box"><h2>${esc(club.stadium.name)}</h2>
        <div class="stat"><span>Capacity</span><span class="gold">${num(capacity)}</span></div>
        <div class="stat"><span>Average crowd</span><span>${num(crowd)} <span class="dim">(${Math.round((crowd / capacity) * 100)}%)</span></span></div>
        <div class="stat"><span>Fan base</span><span>${num(club.fanBase)}</span></div>
        <div class="stat"><span>Ticket price</span><span>${gbp(club.ticketPrice)}</span></div>
        <div class="stat"><span>Gate income, home games</span><span class="grn">${gbp(gate)}</span></div>
        <div class="stat"><span>Away games</span><span class="dim">£0 gate</span></div>
        <div class="stat"><span>Upkeep a week</span><span class="red">-${gbp(Math.round(capacity * ECONOMY.runningCostPerSeat))}</span></div>
        <div class="note" style="margin-top:10px">Bigger crowds follow promotion and winning runs. A stand that stays half empty earns nothing extra.</div></div>
      <div class="box"><h2>Build <small>cash ${gbp(club.cash)}</small></h2>
        ${building ? `<div class="resp ok" style="margin:0 0 8px">Building ${num(building.seats)} seats. They open in ${building.matchdaysLeft} match${building.matchdaysLeft === 1 ? '' : 'es'}.</div>` : ''}
        ${stands}
        <div class="note" style="margin-top:10px">The money is paid now. Building takes ${ECONOMY.buildMatchdays} games, and one stand at a time. Gate keeps coming in from the old capacity while it is built.</div></div>
    </div></div>`;
}

function offerRow(game: Game, club: Club, offer: SponsorOffer): string {
  const status = offerStatus(game.world, game.season, offer);
  const free = club.sponsors.length < club.sponsorSlots;
  const description = {
    'win-streak': `Win ${offer.requirement.target} league games in a row`,
    points: `Reach ${offer.requirement.target} points`,
    'clean-sheets': `Keep ${offer.requirement.target} clean sheets`,
    'top-three': 'Finish top three',
  }[offer.requirement.kind];
  const action = status.unlocked
    ? `<button class="btn sm ${free ? '' : 'faded'}" data-sponsor-sign="${esc(offer.id)}" ${free ? '' : 'disabled'} type="button">${free ? 'Sign' : 'Sign (needs free slot)'}</button>`
    : `<span>${segs((status.current / status.target) * 100, 10, 'gd')} ${Math.min(status.current, status.target)}/${status.target}</span>`;
  return `<div style="padding:10px 0;border-bottom:1px dotted #26336a"><div class="row2" style="justify-content:space-between"><span style="font-size:11px">${esc(offer.name)}</span><span class="${status.unlocked ? 'grn' : 'dim'}">${gbp(offer.perMatch)} / match</span></div>
    <div class="row2" style="justify-content:space-between;margin-top:4px"><span class="dim">${description}</span>${action}</div></div>`;
}

function sponsorsTab(game: Game, club: Club): string {
  const slots = SLOT_NAMES.map((slot, i) => {
    const deal = club.sponsors[i];
    const open = i < club.sponsorSlots;
    const body = deal
      ? `<div style="margin:16px auto;width:56px">${shirt(club.kit, 56)}</div><div class="gold" style="font-size:11px">${esc(deal.name)}</div><div class="grn">${gbp(deal.perMatch)} per match</div>`
      : open
        ? `<div style="margin:16px auto;width:56px;height:56px;border:3px dashed var(--line)"></div><div class="dim" style="font-size:11px">Free slot</div><div class="dim">Sign an offer below</div>`
        : `<div style="margin:16px auto;width:56px;height:56px;border:3px solid var(--line)"></div><div class="dim" style="font-size:11px">Locked</div><div class="dim">Unlocks on promotion to ${DIVISION_NAMES[DIVISION_FOR_SLOT(i)]}</div>`;
    return `<div class="box ${deal || open ? '' : 'lock'}" style="text-align:center"><div class="mini">Slot ${i + 1} · ${slot}</div>${body}</div>`;
  }).join('');
  const offers = game.world.sponsorOffers.map((o) => offerRow(game, club, o)).join('');
  return `<div class="grid" style="gap:18px"><div class="grid g4">${slots}</div>
    <div class="grid g2">
      <div class="box"><h2>Sponsor offers <small>earned through play</small></h2>${offers || '<div class="note">No offers at the moment.</div>'}</div>
      <div class="box"><h2>How sponsors work</h2>
        <div class="stat"><span>Start</span><span>1 slot, ${DIVISION_NAMES[3]}</span></div>
        <div class="stat"><span>Each promotion</span><span class="gold">+1 slot (max 4)</span></div>
        <div class="stat"><span>Offers appear</span><span>when you hit an achievement</span></div>
        <div class="stat"><span>Paid</span><span>every match, home or away</span></div>
        <div class="stat"><span>Sponsor income now</span><span class="grn">${gbp(sponsorIncome(club))}</span></div>
        <div class="note" style="margin-top:10px">Sponsor money is the steady part of your income. Gate money swings with home fixtures.</div></div>
    </div></div>`;
}

/** The division a club must be promoted into to open sponsor slot `i` (0-based): the second slot opens in Division Three. */
const DIVISION_FOR_SLOT = (i: number): number => DIVISION_NAMES.length - 1 - i;

function trophiesTab(game: Game, club: Club): string {
  const list = game.world.honours;
  const league = list.filter((h) => h.kind === 'league').length;
  const cup = list.filter((h) => h.kind === 'cup').length;
  const slots = Math.max(6, Math.ceil(list.length / 3) * 3);
  const shelf = Array.from({ length: slots }, (_, i) => {
    const h = list[i];
    return h
      ? `<div class="slot"><div style="width:64px">${trophy(h.kind, 64)}</div><div class="plq">${esc(h.name)}<span>${h.year}/${String(h.year + 1).slice(2)}</span></div></div>`
      : `<div class="slot empty"><div style="width:64px">${trophy('league', 64)}</div></div>`;
  }).join('');
  return `<div class="box"><h2>Trophy cabinet <small>${esc(club.name)}</small></h2>
    <div class="row2" style="justify-content:space-between;margin-bottom:14px"><span>League titles <b class="gold" style="font-weight:400">${league}</b></span><span>Cup wins <b class="gold" style="font-weight:400">${cup}</b></span></div>
    <div class="cab">${shelf}</div>
    <div class="note" style="margin-top:12px">${list.length ? 'League titles and cup wins are added here the moment you win them, for as long as you manage the club.' : 'Nothing here yet. Win a league title or the cup and it goes on the shelf.'}</div></div>`;
}

/** The Club page: stadium, sponsors and trophies, with a quiet option at the very bottom to reset the game. */
export function renderClubScreen(game: Game, club: Club, state: ClubScreenState): string {
  const reset = state.confirmingReset
    ? `<div class="box warn" id="reset-confirm" role="alertdialog" aria-labelledby="reset-title">
        <h2 id="reset-title">Delete everything?</h2>
        <p class="note" style="margin-bottom:14px">This deletes your club, your players, your results and every other saved detail on this device. It cannot be undone.</p>
        <div class="row2"><button class="btn" data-act="reset-confirm" type="button" style="background:var(--red);color:#fff">Delete everything</button><button class="btn ghost" data-act="reset-cancel" type="button">Keep my game</button></div>
      </div>`
    : `<div class="row2" style="justify-content:center"><button class="subtle" data-act="reset" type="button">Reset game</button></div>`;

  return `<div class="seg" style="grid-template-columns:repeat(3,1fr)">${TABS.map(
    ([id, label]) => `<button data-club-tab="${id}" aria-pressed="${state.tab === id}" type="button">${label}</button>`,
  ).join('')}</div>
    ${state.tab === 'stadium' ? stadiumTab(game, club, state) : state.tab === 'sponsors' ? sponsorsTab(game, club) : trophiesTab(game, club)}
    <div style="margin-top:56px">${reset}</div>`;
}
