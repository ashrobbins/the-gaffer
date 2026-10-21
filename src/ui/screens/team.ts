import { FORMATIONS } from '../../engine/formations';
import type { Lineup } from '../../engine/lineup';
import type { Club, Player } from '../../engine/types';
import type { Game } from '../../game';
import { esc, num } from '../format';
import { pips, segs, trend } from '../icons';
import { benchHtml, pitchHtml, teamRatingText } from '../pitch';

export type TeamTab = 'tactics' | 'squad' | 'contracts';

export interface TeamScreenState {
  tab: TeamTab;
}

const TABS: [TeamTab, string][] = [
  ['tactics', 'Tactics'],
  ['squad', 'Squad'],
  ['contracts', 'Contracts'],
];

const squad = (game: Game, club: Club): Player[] => club.playerIds.map((id) => game.world.players[id] as Player);

function tactics(game: Game, club: Club): string {
  const lineup = game.lineup;
  return `<div class="grid g21">
    <div class="box"><h2>Starting XI <small>rating <span class="gold">${teamRatingText(game, lineup)}</span></small></h2>${pitchHtml(game, lineup, club.kit)}</div>
    <div class="box" style="align-self:start"><h2>Bench <small>${lineup.bench.length} players</small></h2>${benchHtml(game, lineup, club.kit, 'Drag a bench player onto the pitch to swap them in. Drag players on the pitch to swap positions. Tap anyone for details.')}</div>
  </div>`;
}

/** Where a player is in the team: the position he is playing, or Bench or Injured. */
function roleOf(lineup: Lineup, p: Player): string {
  if (p.injury) return `<span class="red">Injured ${p.injury.weeks}w</span>`;
  const slot = lineup.xi.indexOf(p.id);
  return slot >= 0 ? `<span class="cyan">${FORMATIONS[lineup.formation][slot]}</span>` : '<span class="dim">Bench</span>';
}

function squadTable(game: Game, club: Club): string {
  const lineup = game.lineup;
  const rows = squad(game, club)
    .map(
      (p) => `<tr class="row" data-p="${p.id}"><td class="dim">${p.position}</td><td>${esc(p.firstName[0] as string)}.${esc(p.lastName)}${lineup.captainId === p.id ? '<i class="capb">C</i>' : ''}</td><td class="n">${p.ability}</td><td>${segs(p.fatigue, 6, p.fatigue > 45 ? 'bad' : p.fatigue > 30 ? 'warn' : '')}</td><td>${pips(p.form, p.form < 3)}</td><td class="hide-sm n">${p.seasonStats.starts + p.seasonStats.subAppearances}</td><td class="n">${p.seasonStats.goals}</td><td class="hide-sm n">${p.age}</td><td>${roleOf(lineup, p)}</td></tr>`,
    )
    .join('');
  return `<div class="box"><h2>Squad <small>${club.playerIds.length} players</small></h2><div class="tw"><table>
    <thead><tr><th>Pos</th><th>Name</th><th class="n">OVR</th><th>Fatigue</th><th>Form</th><th class="hide-sm n">Apps</th><th class="n">Gls</th><th class="hide-sm n">Age</th><th>Role</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

function contractsTable(game: Game, club: Club): string {
  const rows = squad(game, club)
    .sort((a, b) => a.contractGames - b.contractGames)
    .map(
      (p) => `<tr class="row" data-c="${p.id}"><td class="dim">${p.position}</td><td>${esc(p.firstName[0] as string)}.${esc(p.lastName)}</td><td class="n ${p.contractGames <= 10 ? 'red' : ''}">${p.contractGames}${p.contractGames <= 10 ? ' !' : ''}</td><td class="n">${num(p.wage)}</td><td>${pips(p.happiness, p.happiness < 3)}</td><td>${trend(p.form - 3)}${p.form}/5</td></tr>`,
    )
    .join('');
  return `<div class="box"><h2>Contracts <small>sorted by games left</small></h2>
    <div class="note" style="margin-bottom:12px">Tap a player to offer a new deal.</div><div class="tw"><table>
    <thead><tr><th>Pos</th><th>Name</th><th class="n">Games left</th><th class="n">Wage / wk</th><th>Happiness</th><th>Form</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

export function renderTeam(game: Game, club: Club, state: TeamScreenState): string {
  const tabs = `<div class="seg" style="grid-template-columns:repeat(3,1fr)">${TABS.map(
    ([id, label]) => `<button data-team-tab="${id}" aria-pressed="${state.tab === id}" type="button">${label}</button>`,
  ).join('')}</div>`;
  const body = state.tab === 'tactics' ? tactics(game, club) : state.tab === 'squad' ? squadTable(game, club) : contractsTable(game, club);
  return tabs + body;
}
