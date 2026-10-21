import { askingWage, renewalChance } from '../engine/contracts';
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
