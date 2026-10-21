import { askingWage, renewalChance } from '../engine/contracts';
import { baseAmount, offerOptions, type Negotiation } from '../engine/negotiation';
import { counterChance } from '../engine/selling';
import { weeklyProjection, wageBill } from '../engine/finance';
import { FORMATIONS } from '../engine/formations';
import { positionFit } from '../engine/positions';
import type { Club, Player } from '../engine/types';
import type { Game } from '../game';
import { esc, gbp, num } from './format';
import { pips, segs } from './icons';
import { goalkeeperKit } from './kits';
import { shirt } from './sprites';

export type SheetState =
  | { kind: 'player'; playerId: string }
  | { kind: 'bid'; neg: Negotiation; message: { ok: boolean; text: string } | null; signed: boolean }
  | { kind: 'sale-counter'; bidId: string; message: { ok: boolean; text: string } | null }
  | { kind: 'contract'; playerId: string; wage: number; games: number; result: 'accepted' | 'refused' | null; confirmRelease: boolean };

const close = '<button class="btn ghost sm" data-close aria-label="Close" type="button">X</button>';

/** The player details sheet: rating, fit, condition, contract and the season and career figures. */
export function playerSheet(game: Game, club: Club, playerId: string): string {
  const p = game.world.players[playerId] as Player;
  const lineup = game.lineup;
  const slot = lineup.xi.indexOf(playerId);
  const slotPosition = slot >= 0 ? FORMATIONS[lineup.formation][slot] : undefined;
  const fit = slotPosition ? positionFit(p.position, slotPosition) : null;
  const effective = fit ? Math.round(p.ability * fit.multiplier) : p.ability;
  const keeper = slotPosition ? slotPosition === 'GK' : p.position === 'GK';
  const isCaptain = lineup.captainId === playerId;
  const stats = (label: string, s: Player['seasonStats']): string =>
    `<tr><td class="dim">${label}</td><td class="n">${s.starts}${s.subAppearances ? `<span class="dim"> +${s.subAppearances}</span>` : ''}</td><td class="n">${s.goals}</td><td class="n">${s.yellowCards}</td><td class="n">${s.redCards}</td></tr>`;

  return `<div class="sh-grab"></div>
    <div class="row2" style="gap:14px;flex-wrap:nowrap;align-items:flex-start"><div style="width:84px;flex:none">${shirt(keeper ? goalkeeperKit(club.kit) : club.kit, 84)}</div>
      <div style="min-width:0;flex:1"><div class="gold" style="font-size:11px;line-height:1.6">${esc(p.firstName)} ${esc(p.lastName)}${isCaptain ? '<i class="capb">C</i>' : ''}</div>
        <div class="dim" style="margin-top:6px">${p.position} · age ${p.age}</div><div class="big" style="margin-top:10px">${p.ability}</div></div>${close}</div>
    <div style="margin-top:14px">
      <div class="stat"><span>Playing as</span><span>${slotPosition ?? 'Bench'}</span></div>
      <div class="stat"><span>Position fit</span>${fit ? `<span class="pill ${fit.kind === 'natural' ? 'g' : fit.kind === 'adjacent' ? 'y' : 'r'}">${fit.kind.toUpperCase()}</span>` : '<span class="dim">n/a</span>'}</div>
      <div class="stat"><span>Effective rating</span><span class="${effective < p.ability ? 'red' : 'grn'}">${effective}</span></div>
      <div class="stat"><span>Fatigue</span><span>${segs(p.fatigue, 10, p.fatigue > 45 ? 'bad' : p.fatigue > 30 ? 'warn' : '')} ${p.fatigue}%</span></div>
      ${p.injury ? `<div class="stat"><span>Injury</span><span class="red">${esc(p.injury.kind)}, out ${p.injury.weeks} weeks</span></div>` : ''}
      ${p.fatigue > 80 ? '<div class="stat"><span>Injury risk</span><span class="pill r">HIGH</span></div>' : ''}
      <div class="stat"><span>Form</span>${pips(p.form, p.form < 3)}</div>
      <div class="stat"><span>Next rating point</span><span>${segs(p.growth, 10, 'gd')}</span></div>
      <div class="stat"><span>Contract</span><span>${p.contractGames} games · ${gbp(p.wage)}/wk</span></div>
    </div>
    <span class="lab" style="margin-top:16px">Stats</span><div class="tw"><table><thead><tr><th></th><th class="n">Apps</th><th class="n">Gls</th><th class="n">Yel</th><th class="n">Red</th></tr></thead><tbody>${stats('Season', p.seasonStats)}${stats('Career', p.careerStats)}</tbody></table></div>
    <div class="note" style="margin-top:6px">Apps are starts, then +sub appearances. Career is with this club.</div>
    <div class="row2" style="margin-top:18px"><button class="btn" data-cap="${playerId}" ${isCaptain ? 'disabled' : ''} type="button">${isCaptain ? 'Captain' : 'Make captain'}</button><button class="btn ghost" data-contract="${playerId}" type="button">View contract</button></div>`;
}

export const LENGTHS: readonly [number, string][] = [
  [19, 'Half season'],
  [38, '1 season'],
  [76, '2 seasons'],
];

/** The wage range the slider allows for a player: from a fifth below what he earns to well above it. */
export function wageRange(p: Player): { min: number; max: number } {
  return { min: Math.round((p.wage * 0.8) / 50) * 50, max: Math.round((p.wage * 1.8) / 50) * 50 };
}

/** The starting offer for a contract sheet: what he expects, which is at least what he earns now. */
export const defaultOffer = (p: Player): number => Math.round(askingWage(p) / 50) * 50;

/** The parts of the contract sheet that change as the slider moves: the odds and what the wage does to the books. */
export function contractDynamic(game: Game, club: Club, s: Extract<SheetState, { kind: 'contract' }>): string {
  const p = game.world.players[s.playerId] as Player;
  const chance = renewalChance(p, s.wage, s.games);
  const delta = s.wage - p.wage;
  const projection = weeklyProjection(game.world, club.id, delta);
  const bill = wageBill(game.world, club.id);
  return `<span class="lab">Chance they sign</span>
    <div class="row2"><span class="big">${chance}%</span>${segs(chance, 12, chance > 65 ? '' : chance > 40 ? 'warn' : 'bad')}</div>
    <div class="note" style="margin-top:6px">${chance > 65 ? 'Happy to talk. A fair offer should do it.' : chance > 40 ? 'Undecided. More money or a shorter deal helps.' : 'Unlikely to sign. They want a lot more.'}</div>
    <h2 class="h2" style="margin:20px 0 10px;${projection.surplus < 0 ? 'color:var(--amber)' : ''}">Can we afford it?</h2>
    <div class="stat"><span>Wage bill / wk</span><span>${num(bill)} <span class="dim">→</span> <span class="${delta > 0 ? 'red' : 'grn'}">${num(bill + delta)}</span></span></div>
    <div class="stat"><span>Average income / match</span><span>${num(projection.averageIncome)}</span></div>
    <div class="stat"><span class="gold">Average surplus</span><span class="${projection.surplus >= 0 ? 'grn' : 'red'}">${projection.surplus >= 0 ? '+' : ''}${num(projection.surplus)}</span></div>
    <div class="note" style="margin-top:6px">Wages are paid every week. Gate money only arrives on home games.</div>`;
}

/** The contract offer sheet. */
export function contractSheet(game: Game, club: Club, s: Extract<SheetState, { kind: 'contract' }>): string {
  const p = game.world.players[s.playerId] as Player;
  const range = wageRange(p);
  const name = `${esc(p.firstName)} ${esc(p.lastName)}`;
  if (s.result === 'accepted') {
    return `<div class="sh-grab"></div><div class="row2" style="justify-content:space-between;flex-wrap:nowrap"><div class="gold" style="font-size:11px">${name}</div>${close}</div>
      <div class="resp ok" style="margin-top:16px">Agreed. ${esc(p.lastName)} signs for ${p.contractGames} games at ${gbp(p.wage)} a week.</div>
      <div class="row2" style="margin-top:18px"><button class="btn" data-close type="button">Done</button></div>`;
  }
  if (s.confirmRelease) {
    return `<div class="sh-grab"></div><div class="row2" style="justify-content:space-between;flex-wrap:nowrap"><div class="gold" style="font-size:11px">${name}</div>${close}</div>
      <div class="resp bad" style="margin-top:16px">Let ${esc(p.lastName)} go? He leaves the club straight away and becomes a free agent. This cannot be undone.</div>
      <div class="row2" style="margin-top:18px"><button class="btn" data-release-confirm type="button" style="background:var(--red);color:#fff">Let him go</button><button class="btn ghost" data-release-cancel type="button">Keep him</button></div>`;
  }
  return `<div class="sh-grab"></div>
    <div class="row2" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start"><div style="min-width:0"><div class="mini">Offer new deal</div><div class="gold" style="font-size:11px;line-height:1.6;margin-top:8px">${name}</div><div class="dim" style="margin-top:4px">${p.position} · age ${p.age}</div></div>${close}</div>
    ${s.result === 'refused' ? '<div class="resp bad" style="margin-top:14px">He turned the offer down. Try more money, or a shorter deal.</div>' : ''}
    <div style="margin-top:12px"><div class="stat"><span>Now</span><span>${num(p.wage)} / wk · ${p.contractGames} games left</span></div>
      <div class="stat"><span>Happiness</span>${pips(p.happiness, p.happiness < 3)}</div>
      <div class="stat"><span class="dim">Made of</span><span class="dim">form ${p.form}/5 and playing time</span></div></div>
    <label style="margin-top:14px"><span class="lab">Weekly wage <span class="gold" id="wage-label">${gbp(s.wage)}</span></span><input type="range" id="wage" min="${range.min}" max="${range.max}" step="50" value="${s.wage}"></label>
    <span class="lab">Length</span>
    <div class="chips" style="margin-bottom:14px">${LENGTHS.map(([g, t]) => `<button class="pill ${s.games === g ? 'on' : ''}" data-len="${g}" type="button">${t} · ${g}</button>`).join('')}</div>
    <div id="contract-dynamic">${contractDynamic(game, club, s)}</div>
    <div class="row2" style="margin-top:18px"><button class="btn" data-offer type="button">Make offer</button><button class="btn ghost" data-release type="button">Let them go</button></div>`;
}

const OFFER_LABELS = { low: 'Lower', market: 'Market value', high: 'Higher' } as const;
const oddsWord = (chance: number): string => (chance >= 0.8 ? 'Very likely' : chance >= 0.5 ? 'Likely' : chance >= 0.3 ? 'Possible' : 'Unlikely');

/** The sheet for signing a player: the fee with his club, then his wage, three attempts each. */
export function bidSheet(game: Game, club: Club, s: Extract<SheetState, { kind: 'bid' }>): string {
  const world = game.world;
  const neg = s.neg;
  const p = world.players[neg.playerId] as Player;
  const seller = neg.sellerClubId ? (world.clubs[neg.sellerClubId] as Club).name : 'Free agent';
  const fee = neg.phase === 'fee';
  const stepClass = (k: 'fee' | 'wage'): string => (neg.phase === k ? 'on' : (neg.phase === 'wage' && k === 'fee') || neg.phase === 'done' ? 'g' : '');
  const head = `<div class="sh-grab"></div>
    <div class="row2" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start"><div style="min-width:0"><div class="mini">Sign player</div><div class="gold" style="font-size:11px;line-height:1.6;margin-top:8px">${esc(p.firstName)} ${esc(p.lastName)}</div><div class="dim" style="margin-top:4px">${p.position} · age ${p.age} · OVR ${p.ability} · ${esc(seller)}</div></div>${close}</div>
    <div class="row2" style="gap:6px;margin-top:14px"><span class="pill ${stepClass('fee')}">1 Club fee</span><span class="pill ${stepClass('wage')}">2 Player wage</span></div>`;
  const message = s.message ? `<div class="resp ${s.message.ok ? 'ok' : 'bad'}">${esc(s.message.text)}</div>` : '';

  if (neg.phase === 'failed') {
    return `${head}<div class="resp bad" style="margin-top:16px">Talks collapsed. ${esc(fee || neg.fee === 0 ? seller : p.lastName)} walked away. You cannot reopen negotiations for this player for 7 days.</div>
      <div class="row2" style="margin-top:16px"><button class="btn" data-close type="button">Close</button></div>`;
  }
  if (neg.phase === 'done') {
    const wage = neg.wage as number;
    const projection = weeklyProjection(world, club.id, wage);
    const bill = wageBill(world, club.id);
    if (s.signed) {
      return `${head}<div class="resp ok" style="margin-top:16px">${esc(p.firstName)} ${esc(p.lastName)} has signed for ${esc(club.name)}. He is on the bench.</div>
        <div class="row2" style="margin-top:18px"><button class="btn" data-close type="button">Done</button></div>`;
    }
    return `${head}<div class="resp ok" style="margin-top:16px">Deal agreed. ${esc(p.lastName)} will sign for ${esc(club.name)}.</div>
      <div class="stat"><span>Transfer fee</span><span class="gold">${neg.fee ? gbp(neg.fee) : 'Free'}</span></div>
      <div class="stat"><span>Wage</span><span>${gbp(wage)} / wk</span></div>
      <div class="stat"><span>Cash after fee</span><span>${gbp(club.cash - (neg.fee ?? 0))}</span></div>
      <div class="stat"><span>Wage bill / wk</span><span>${num(bill)} <span class="dim">→</span> <span class="red">${num(bill + wage)}</span></span></div>
      <div class="stat"><span>Average surplus</span><span class="${projection.surplus >= 0 ? 'grn' : 'red'}">${projection.surplus >= 0 ? '+' : ''}${num(projection.surplus)}</span></div>
      <div class="row2" style="margin-top:18px"><button class="btn" data-neg-finish type="button">Complete signing</button></div>`;
  }

  const base = baseAmount(world, neg);
  const options = offerOptions(world, neg);
  const counterCost = neg.counter ?? 0;
  const counterBlocked = fee && counterCost > club.cash;
  const per = fee ? '' : ' / wk';
  const bill = wageBill(world, club.id);
  return `${head}
    ${!fee ? `<div class="stat" style="margin-top:12px"><span>Fee agreed</span><span class="gold">${neg.fee ? gbp(neg.fee) : 'Free agent'}</span></div>` : ''}
    <div class="stat" style="${fee ? 'margin-top:12px' : ''}"><span>${fee ? 'Asking price' : 'Asking wage'}</span><span class="gold">${gbp(base)}${per}</span></div>
    <div class="stat"><span>Attempts left</span>${pips(neg.attemptsLeft)}</div>
    ${message}
    ${neg.counter !== null ? `<button class="btn" style="width:100%;margin-bottom:6px" data-neg-counter ${counterBlocked ? 'disabled' : ''} type="button">${counterBlocked ? 'Counter too high for our cash' : `Accept counter ${gbp(counterCost)}${per}`}</button>` : ''}
    <span class="lab" style="margin-top:14px">Make an offer to ${esc(fee ? seller : p.lastName)}</span>
    ${options
      .map((o) => {
        const d = o.amount - base;
        return `<button class="opt" data-neg-offer="${o.level}" ${o.affordable ? '' : 'disabled'} type="button"><span class="ol">${OFFER_LABELS[o.level]}</span><b>${gbp(o.amount)}</b><span class="od">${d === 0 ? 'Spot on' : (d > 0 ? '+' : '') + gbp(d)}${per}</span><span class="oc">${segs(o.chance * 100, 10, o.chance > 0.8 ? '' : o.chance > 0.4 ? 'warn' : 'bad')} ${o.affordable ? oddsWord(o.chance) : 'Cannot afford'}</span></button>`;
      })
      .join('')}
    ${!fee ? `<div class="stat"><span>Wage bill / wk if signed</span><span>${num(bill)} <span class="dim">→</span> ${num(bill + base)}</span></div>` : ''}`;
}

/** The counter-offer sheet for a computer club's bid for one of the user's players. */
export function saleCounterSheet(game: Game, s: Extract<SheetState, { kind: 'sale-counter' }>): string {
  const bid = game.world.incomingBids.find((b) => b.id === s.bidId);
  const done = !bid;
  const p = game.world.players[(bid ?? { playerId: '' }).playerId] as Player | undefined;
  const buyer = bid ? (game.world.clubs[bid.buyerClubId] as Club).name : '';
  const head = `<div class="sh-grab"></div><div class="row2" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start"><div style="min-width:0"><div class="mini">Counter their offer</div>${p ? `<div class="gold" style="font-size:11px;line-height:1.6;margin-top:8px">${esc(p.firstName)} ${esc(p.lastName)}</div><div class="dim" style="margin-top:4px">${p.position} · age ${p.age} · OVR ${p.ability}</div>` : ''}</div>${close}</div>`;
  const message = s.message ? `<div class="resp ${s.message.ok ? 'ok' : 'bad'}">${esc(s.message.text)}</div>` : '';
  if (done || !bid) return `${head}${message}<div class="row2" style="margin-top:18px"><button class="btn" data-close type="button">Done</button></div>`;
  const asks = [1.1, 1.25, 1.4].map((f) => Math.round((bid.fee * f) / 100) * 100);
  return `${head}${message}
    <div class="stat" style="margin-top:12px"><span>${esc(buyer)} offered</span><span class="gold">${gbp(bid.fee)}</span></div>
    <div class="stat"><span>Counters refused</span>${pips(Math.max(0, 2 - bid.counters))}</div>
    <div class="note" style="margin:8px 0">A second refusal and the club walks away. The higher you ask, the less likely it is.</div>
    <span class="lab">Ask for</span>
    ${asks
      .map((a) => {
        const c = counterChance(bid, a);
        return `<button class="opt" data-sale-ask="${a}" type="button"><span class="ol">${a === asks[0] ? 'A little more' : a === asks[1] ? 'Quite a bit more' : 'A lot more'}</span><b>${gbp(a)}</b><span class="od">+${gbp(a - bid.fee)}</span><span class="oc">${segs(c * 100, 10, c > 0.65 ? '' : c > 0.35 ? 'warn' : 'bad')} ${oddsWord(c)}</span></button>`;
      })
      .join('')}`;
}
