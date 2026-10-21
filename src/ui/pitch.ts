import { FORMATIONS, FORMATION_IDS } from '../engine/formations';
import { lineupFit, lineupRating, type Lineup } from '../engine/lineup';
import type { FormationId } from '../engine/matchTypes';
import type { Game } from '../game';
import { conditionIcons, positionGroup, segs, surname } from './icons';
import { goalkeeperKit } from './kits';
import { shirt } from './sprites';
import type { Kit, Player } from '../engine/types';

/** Across-the-pitch positions of each row of players, keeper first. A row's height is worked out from how many rows there are. */
const ROWS: Record<FormationId, number[][]> = {
  '4-4-2': [[50], [12, 37, 63, 88], [12, 37, 63, 88], [36, 64]],
  '4-3-3': [[50], [12, 37, 63, 88], [22, 50, 78], [15, 50, 85]],
  '3-5-2': [[50], [22, 50, 78], [9, 31, 69, 91], [50], [36, 64]],
  '4-2-3-1': [[50], [12, 37, 63, 88], [36, 64], [14, 50, 86], [50]],
  '5-3-2': [[50], [9, 29, 50, 71, 91], [24, 50, 76], [36, 64]],
};

/** Where each of the eleven stands on the pitch, as percentages. Rows are spread evenly from the keeper to the attack. */
export function pitchLayout(formation: FormationId): { x: number; y: number }[] {
  const rows = ROWS[formation];
  const out: { x: number; y: number }[] = [];
  rows.forEach((row, k) => {
    const y = Math.round((88 - (k * 75) / (rows.length - 1)) * 10) / 10;
    for (const x of row) out.push({ x, y });
  });
  return out;
}

const player = (game: Game, id: string): Player => game.world.players[id] as Player;

/** The formation picker, the pitch with the team on it, and the key to the badges. */
export function pitchHtml(game: Game, lineup: Lineup, kit: Kit): string {
  const layout = pitchLayout(lineup.formation);
  const info = lineupFit(game.world, lineup);
  const tokens = lineup.xi
    .map((id, i) => {
      const p = player(game, id);
      const spot = layout[i] as { x: number; y: number };
      const fit = (info[i] as (typeof info)[number]).fit;
      const isKeeper = FORMATIONS[lineup.formation][i] === 'GK';
      return `<button class="pl ${fit.kind}" type="button" data-slot="${i}" style="left:${spot.x}%;top:${spot.y}%" aria-label="${p.firstName} ${p.lastName}, ${p.position} playing ${FORMATIONS[lineup.formation][i]}">
        <span class="shw">${shirt(isKeeper ? goalkeeperKit(kit) : kit, 100)}${conditionIcons(p)}</span>
        ${fit.kind !== 'natural' ? `<i class="fit ${fit.kind === 'adjacent' ? 'adj' : 'alien'}" title="${fit.kind}">!</i>` : ''}
        ${lineup.captainId === id ? '<i class="cap">C</i>' : ''}
        <span class="tag">${surname(p)}</span><span class="ov">${Math.round(p.ability * fit.multiplier)}</span></button>`;
    })
    .join('');
  return `<div class="chips" style="margin-bottom:12px">${FORMATION_IDS.map(
    (f) => `<button class="pill ${f === lineup.formation ? 'on' : ''}" data-formation="${f}" type="button">${f}</button>`,
  ).join('')}</div>
    <div class="pitch">
      <div class="ln" style="left:50%;top:-60px;width:120px;height:120px;border-radius:50%;transform:translateX(-50%)"></div>
      <div class="ln" style="left:22%;right:22%;bottom:-2px;height:21%"></div>
      <div class="ln" style="left:36%;right:36%;bottom:-2px;height:9%"></div>
      ${tokens}
    </div>
    <div class="row2 note" style="justify-content:center;margin-top:12px"><span class="pill o">Tired 50%+</span><span class="pill r">Injury risk 80%+</span><span class="pill y">! Adjacent -14%</span><span class="pill r">! Alien -40%</span></div>`;
}

export const teamRatingText = (game: Game, lineup: Lineup): number => lineupRating(game.world, lineup);

/** The players not in the starting eleven. Injured players are shown but cannot be dragged on. */
export function benchHtml(game: Game, lineup: Lineup, kit: Kit, note: string): string {
  const cards = lineup.bench
    .map((id, i) => {
      const p = player(game, id);
      const injured = p.injury !== null;
      return `<button class="bn ${injured ? 'off' : ''}" type="button" ${injured ? 'disabled' : `data-bn="${i}"`} aria-label="${p.firstName} ${p.lastName}, ${p.position}, bench">
        <i class="posb ${positionGroup(p.position)}">${p.position}</i>
        <span class="shw">${shirt(p.position === 'GK' ? goalkeeperKit(kit) : kit, 56)}${conditionIcons(p)}</span>
        ${lineup.captainId === id ? '<i class="capb" style="position:absolute;top:4px;right:4px;margin:0">C</i>' : ''}
        <span class="nm">${surname(p)}</span><span class="ov">${p.ability}</span>
        ${injured ? `<span class="inw">OUT ${p.injury!.weeks}W</span>` : segs(p.fatigue, 5, p.fatigue > 45 ? 'bad' : '')}</button>`;
    })
    .join('');
  return `<div class="benchg">${cards}</div><div class="note" style="margin-top:12px">${note}</div>`;
}
