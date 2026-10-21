import { daysBetween, windowAt } from '../../engine/calendar';
import { askingWage } from '../../engine/contracts';
import { TRANSFER } from '../../engine/config';
import { visibleMarket } from '../../engine/market';
import { cannotSign } from '../../engine/negotiation';
import { cannotSell } from '../../engine/selling';
import type { Club, Player } from '../../engine/types';
import type { Game } from '../../game';
import { esc, gbp, num, shortDate } from '../format';
import { summerControls } from './hq';
import { positionGroup, type PositionGroup } from '../icons';

export type TransferTab = 'buy' | 'sell';
export type TransferFilter = 'ALL' | PositionGroup;

export interface TransferScreenState {
  tab: TransferTab;
  filter: TransferFilter;
  /** What happened last, for example a sale, shown above the lists. */
  notice: string | null;
}

export const initialTransferState = (): TransferScreenState => ({ tab: 'buy', filter: 'ALL', notice: null });

const FILTERS: TransferFilter[] = ['ALL', 'GK', 'DEF', 'MID', 'ATT'];
const shortName = (p: Player): string => `${p.firstName[0]}.${esc(p.lastName)}`;

function windowBox(game: Game, club: Club): string {
  const w = windowAt(game.date);
  const label = w.kind === 'summer' ? 'Summer' : 'Winter';
  const length = daysBetween(w.opens, w.closes) + 1;
  const fill = w.open ? Math.max(0, w.daysToClose) / length : 1 - Math.min(1, w.daysToOpen / 150);
  const lit = Math.round(fill * 30);
  const countdown = w.open ? `${Math.max(0, w.daysToClose)} days` : `${w.daysToOpen} days`;
  return `<div class="box" style="border-color:${w.open ? 'var(--cyan)' : 'var(--red)'}">
    <div class="row2" style="justify-content:space-between;gap:10px"><div class="row2" style="gap:10px"><span class="pill ${w.open ? 'g' : 'r'}">${w.open ? 'Open' : 'Closed'}</span><span class="mini">${label} transfer window${w.open ? ` · closes ${shortDate(w.closes)}` : ''}</span></div></div>
    <div class="tstats">
      <div><span class="mini">${w.open ? 'Closes in' : 'Opens in'}</span><b class="${w.open ? '' : 'red'}">${countdown}</b></div>
      <div><span class="mini">Cash</span><b>${gbp(club.cash)}</b></div>
      <div><span class="mini">Squad</span><b>${club.playerIds.length} / ${TRANSFER.maxSquad}</b></div></div>
    <div class="tprog ${w.open ? '' : 'closed'}" aria-hidden="true">${Array.from({ length: 30 }, (_, i) => `<i class="${i < lit ? 'f' : ''}"></i>`).join('')}</div>
    ${game.phase === 'summer' ? `<div style="margin-top:14px">${summerControls(game)}</div>` : ''}
    ${w.open ? '' : `<div class="cnote">Transfer window closed. You can browse the market, but bids are switched off until it opens on ${shortDate(w.opens)}, in ${w.daysToOpen} days.</div>`}</div>`;
}

function buyTable(game: Game, filter: TransferFilter): string {
  const rows = visibleMarket(game.world)
    .map((e) => ({ e, p: game.world.players[e.playerId] as Player }))
    .filter(({ p }) => filter === 'ALL' || positionGroup(p.position) === filter);
  if (rows.length === 0) return '<div class="note">Nobody is for sale in that position right now.</div>';
  const body = rows
    .map(({ e, p }) => {
      const why = cannotSign(game.world, game.date, p.id);
      const seller = e.sellerClubId ? (game.world.clubs[e.sellerClubId] as Club) : null;
      return `<tr><td class="dim">${p.position}</td><td>${shortName(p)}</td><td class="n gold">${p.ability}</td><td class="n">${e.sellerClubId ? num(e.askingFee) : '<span class="grn">Free</span>'}</td><td class="n">${num(askingWage(p))}</td><td class="n">${p.age}</td><td class="dim">${seller ? esc(seller.name) : 'Free agent'}</td><td class="stk"><button class="btn sm ${why ? 'faded' : ''}" data-bid="${p.id}" ${why ? `disabled title="${esc(why)}"` : ''} type="button">Bid</button></td></tr>`;
    })
    .join('');
  return `<table><thead><tr><th>Pos</th><th>Name</th><th class="n">OVR</th><th class="n">Fee</th><th class="n">Wage</th><th class="n">Age</th><th>Club</th><th class="stk"></th></tr></thead><tbody>${body}</tbody></table>`;
}

function sellTable(game: Game): string {
  const bids = game.world.incomingBids;
  if (bids.length === 0) {
    return `<div class="note">${windowAt(game.date).open ? 'No offers at the moment. Clubs make offers for good players while the window is open.' : 'Clubs only make offers while the transfer window is open.'}</div>`;
  }
  const body = bids
    .map((b) => {
      const p = game.world.players[b.playerId] as Player;
      const why = cannotSell(game.world, game.date, b);
      const buyer = game.world.clubs[b.buyerClubId] as Club;
      return `<tr><td class="dim">${p.position}</td><td>${shortName(p)}</td><td class="n">${p.ability}</td><td class="n">${p.contractGames}</td><td>${esc(buyer.name)}</td><td class="n grn">+${num(b.fee)}</td><td class="stk"><button class="btn sm cy ${why ? 'faded' : ''}" data-sale-accept="${b.id}" ${why ? `disabled title="${esc(why)}"` : ''} type="button">Accept</button> <button class="btn sm ghost ${why ? 'faded' : ''}" data-sale-counter="${b.id}" ${why ? 'disabled' : ''} type="button">Counter</button> <button class="btn sm ghost" data-sale-reject="${b.id}" type="button">No</button></td></tr>`;
    })
    .join('');
  const first = cannotSell(game.world, game.date, bids[0]!);
  return `<table><thead><tr><th>Pos</th><th>Name</th><th class="n">OVR</th><th class="n">Games left</th><th>Offer from</th><th class="n">Fee</th><th class="stk"></th></tr></thead><tbody>${body}</tbody></table>
    ${first ? `<div class="note" style="margin-top:8px">${esc(first)}.</div>` : ''}`;
}

export function renderTransfers(game: Game, club: Club, state: TransferScreenState): string {
  const offers = game.world.incomingBids.length;
  const filters =
    state.tab === 'buy'
      ? `<div class="row2" style="margin-bottom:12px;gap:6px"><span class="mini" style="margin-right:4px">Filter</span>${FILTERS.map((f) => `<button class="pill ${state.filter === f ? 'on' : ''}" data-tr-filter="${f}" type="button">${f}</button>`).join('')}</div>`
      : '';
  return `<div class="grid" style="gap:18px">
    ${windowBox(game, club)}
    ${state.notice ? `<div class="resp ok" style="margin:0">${esc(state.notice)}</div>` : ''}
    <div class="box"><div class="row2" style="margin-bottom:12px"><button class="pill ${state.tab === 'buy' ? 'on' : ''}" data-tr-tab="buy" type="button">Buy</button><button class="pill ${state.tab === 'sell' ? 'on' : ''}" data-tr-tab="sell" type="button">Sell <span>(${offers} offer${offers === 1 ? '' : 's'})</span></button></div>
      ${filters}<div class="tw">${state.tab === 'buy' ? buyTable(game, state.filter) : sellTable(game)}</div></div>
    <div class="note">Fees are paid straight from club funds, and any new wages go on top of the weekly bill. Check Contracts before you bid.</div></div>`;
}
