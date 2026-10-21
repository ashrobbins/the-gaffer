import { CUP_NAME, CLUBS_PER_DIVISION, DIVISION_NAMES, MATCHES_PER_SEASON } from '../../engine/config';
import { clubsStillIn, userCupStatus, userTie } from '../../engine/cup';
import { isChampionConfirmed, zoneFor } from '../../engine/league';
import { topScorers } from '../../engine/scorers';
import { clubForm, tableFor } from '../../engine/season';
import type { Club, CupRound, CupTie, Player } from '../../engine/types';
import type { Game } from '../../game';
import { cupDate } from '../../play';
import { esc, shortDate } from '../format';
import { form5 } from '../icons';
import { shirt } from '../sprites';

export type SeasonView = 'league' | 'scorers' | 'cup';

export interface SeasonScreenState {
  view: SeasonView;
  /** The division being looked at. Null means the user's own. */
  division: number | null;
  /** The cup round being looked at. Null means the next one to be played. */
  cupRound: number | null;
}

export const initialSeasonState = (): SeasonScreenState => ({ view: 'league', division: null, cupRound: null });

const VIEWS: [SeasonView, string][] = [
  ['league', 'League'],
  ['scorers', 'Top scorers'],
  ['cup', 'Cup'],
];

const ZONE_CLASS = { promotion: 'z-promo', playoff: 'z-po', relegation: 'z-rel', none: '' } as const;

const club = (game: Game, id: string): Club => game.world.clubs[id] as Club;

const clubCell = (c: Club): string => `<span class="row2" style="gap:8px;flex-wrap:nowrap">${shirt(c.kit, 22)}${esc(c.name)}</span>`;

const divisionPills = (selected: number): string =>
  `<div class="row2" style="margin-bottom:12px">${DIVISION_NAMES.map(
    (name, i) => `<button class="pill ${i === selected ? 'on' : ''}" data-season-div="${i}" type="button">${name}</button>`,
  ).join('')}</div>`;

function leagueView(game: Game, division: number): string {
  const table = tableFor(game.world, game.season, division);
  const confirmed = isChampionConfirmed(table);
  const finished = table.every((r) => r.played >= MATCHES_PER_SEASON);
  const rows = table
    .map((r, i) => {
      const c = club(game, r.clubId);
      const champ = i === 0 && (confirmed || finished);
      const gd = r.goalDifference;
      return `<tr class="${c.isUser ? 'me' : ''} ${ZONE_CLASS[zoneFor(division, i + 1)]} ${champ ? 'champ' : ''}"><td class="n dim">${i + 1}</td><td>${clubCell(c)}</td><td class="dim hide-sm">${esc(c.stadium.name)}</td><td class="n">${r.played}</td><td class="n">${r.won}</td><td class="n">${r.drawn}</td><td class="n">${r.lost}</td><td class="n">${r.goalsFor}</td><td class="n">${r.goalsAgainst}</td><td class="n">${gd > 0 ? '+' : ''}${gd}</td><td class="n gold">${r.points}</td><td>${form5(clubForm(game.season, r.clubId))}</td></tr>`;
    })
    .join('');
  const played = table[0]?.played ?? 0;
  return `<div class="box">${divisionPills(division)}
    <div class="note" style="margin-bottom:12px">${DIVISION_NAMES[division]} · ${CLUBS_PER_DIVISION} clubs · ${finished ? 'final table' : `played ${played}`}</div>
    <div class="tw"><table><thead><tr><th class="n">#</th><th>Club</th><th class="hide-sm">Ground</th><th class="n">P</th><th class="n">W</th><th class="n">D</th><th class="n">L</th><th class="n">GF</th><th class="n">GA</th><th class="n">GD</th><th class="n">Pts</th><th>Form</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="row2 note" style="margin-top:12px"><span class="pill gb">Champions</span>${division > 0 ? '<span class="pill g">1-2 Promoted</span><span class="pill o">3-4 Play-offs</span>' : ''}${division < DIVISION_NAMES.length - 1 ? '<span class="pill r">Bottom 3 relegated</span>' : ''}</div>
    <div class="note" style="margin-top:8px">${division > 0 ? 'Play-off: one match, 3rd against 4th at the higher-placed club. The winner is promoted. ' : ''}A club is champion as soon as nobody can catch them, or at the end of the season.</div></div>`;
}

function scorersView(game: Game, division: number): string {
  const list = topScorers(game.world, division, 12);
  const rows = list
    .map((s, i) => {
      const p = game.world.players[s.playerId] as Player;
      const c = club(game, s.clubId);
      return `<tr class="${c.isUser ? 'me' : ''}"><td class="n dim">${i + 1}</td><td>${esc(p.firstName[0] as string)}.${esc(p.lastName)}</td><td class="n gold">${s.goals}</td><td>${clubCell(c)}</td><td class="dim hide-sm">${p.position}</td></tr>`;
    })
    .join('');
  return `<div class="box">${divisionPills(division)}
    ${list.length ? `<div class="tw"><table><thead><tr><th class="n">#</th><th>Player</th><th class="n">Gls</th><th>Club</th><th class="hide-sm">Pos</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="note" style="margin-top:12px">Top ${list.length} in ${DIVISION_NAMES[division]}. Updates after every match.</div>` : '<div class="note">Nobody has scored yet. The table fills in after the first matchday.</div>'}</div>`;
}

const divisionTag = (c: Club): string => `<span class="dim">D${c.division + 1}</span>`;

function tieRow(game: Game, t: CupTie): string {
  const mine = club(game, t.homeId).isUser || club(game, t.awayId).isUser;
  const score = t.played ? `${t.homeGoals} - ${t.awayGoals}${t.penalties ? `<small>pens ${t.penalties[0]}-${t.penalties[1]}</small>` : ''}` : 'v';
  return `<div class="rs ${mine ? 'me' : ''}"><span class="rh">${esc(club(game, t.homeId).name)} ${divisionTag(club(game, t.homeId))}</span><b>${score}</b><span class="ra">${esc(club(game, t.awayId).name)} ${divisionTag(club(game, t.awayId))}</span></div>`;
}

/** One line of the user's cup run for a round: what happened, or what is to come. */
function runLine(game: Game, i: number, round: CupRound, status: ReturnType<typeof userCupStatus>): string {
  const tie = userTie(game.world, round);
  const date = shortDate(cupDate(i, game.season.year));
  const name = `${esc(round.name)}<span class="dim" style="display:block;margin-top:3px">${date}</span>`;
  if (tie?.played) {
    const home = club(game, tie.homeId).isUser;
    const [mine, theirs] = home ? [tie.homeGoals, tie.awayGoals] : [tie.awayGoals, tie.homeGoals];
    const won = tie.winnerId === game.world.userClubId;
    const other = club(game, home ? tie.awayId : tie.homeId);
    return `<div class="stat"><span>${name}</span><span><span class="${won ? 'grn' : 'red'}">${won ? 'W' : 'L'} ${mine}-${theirs}${tie.penalties ? ' (pens)' : ''}</span> <span class="dim">${home ? 'v' : 'at'} ${esc(other.name)}</span></span></div>`;
  }
  if (tie) {
    const home = club(game, tie.homeId).isUser;
    return `<div class="stat"><span>${name}</span><span class="gold">${home ? 'Home v' : 'Away at'} ${esc(club(game, home ? tie.awayId : tie.homeId).name)}</span></div>`;
  }
  if (i === 0 && game.cup.byes.includes(game.world.userClubId)) return `<div class="stat"><span>${name}</span><span class="dim">Bye</span></div>`;
  return `<div class="stat"><span>${name}</span><span class="dim">${status.status === 'out' ? 'Out' : round.played ? 'Out' : 'To be drawn'}</span></div>`;
}

function cupView(game: Game, state: SeasonScreenState): string {
  const { cup, world } = game;
  const status = userCupStatus(world, cup);
  const nextIdx = cup.rounds.findIndex((r) => !r.played);
  const viewing = state.cupRound ?? (nextIdx === -1 ? cup.rounds.length - 1 : nextIdx);
  const sel = cup.rounds[viewing] as CupRound;
  const nextRound = nextIdx === -1 ? null : (cup.rounds[nextIdx] as CupRound);
  const myNext = nextRound ? userTie(world, nextRound) : null;

  const left = clubsStillIn(cup).length;
  let headline: string;
  if (status.status === 'won') {
    headline = `<div class="stat"><span>Result</span><span class="gold">Winners of the ${esc(CUP_NAME)}</span></div>`;
  } else if (status.status === 'out') {
    const by = club(game, status.by);
    const winner = cup.winnerId ? `<div class="stat"><span>Winners</span><span>${esc(club(game, cup.winnerId).name)}</span></div>` : '';
    headline = `<div class="stat"><span>Result</span><span class="red">Out in the ${esc((cup.rounds[status.round] as CupRound).name)}, beaten by ${esc(by.name)}</span></div>${winner}
      <div class="note" style="margin-top:8px">${cup.winnerId ? 'The cup is over.' : 'The cup carries on without you. The remaining rounds are played on their dates until a winner is crowned.'}</div>`;
  } else if (myNext) {
    const home = club(game, myNext.homeId).isUser;
    const opp = club(game, home ? myNext.awayId : myNext.homeId);
    headline = `<div class="stat"><span>Next tie</span><span class="gold">${esc((nextRound as CupRound).name)} · ${shortDate(cupDate(nextIdx, game.season.year))}</span></div>
      <div class="stat"><span>${home ? 'Home v' : 'Away at'}</span><span>${esc(opp.name)} ${divisionTag(opp)}</span></div>
      <div class="note" style="margin-top:8px">Cup ties are played midweek, between league matches, until you are knocked out.</div>`;
  } else {
    headline = `<div class="stat"><span>Next round</span><span class="gold">${nextRound ? `${esc(nextRound.name)} · ${shortDate(cupDate(nextIdx, game.season.year))}` : '-'}</span></div>
      <div class="note" style="margin-top:8px">You have no tie in the next round.</div>`;
  }

  const ties = sel.ties.length
    ? `<div class="note" style="margin-bottom:8px">${esc(sel.name)} · ${shortDate(cupDate(viewing, game.season.year))}${sel.played ? '' : ' · draw made, not yet played'}</div>${sel.ties.map((t) => tieRow(game, t)).join('')}`
    : viewing === 0 && cup.byes.length
      ? '<div class="note">Everyone else had a bye into Round 1.</div>'
      : '<div class="note">The draw is made after the previous round has been played.</div>';

  return `<div class="box" style="margin-bottom:18px"><h2>${esc(CUP_NAME)} <small>all four divisions · 80 clubs</small></h2>
      <div class="row2" style="gap:10px;margin-bottom:12px"><span class="pill ${status.status === 'out' ? 'r' : 'g'}">${status.status === 'out' ? 'Knocked out' : status.status === 'won' ? 'Winners' : 'Still in'}</span>${status.status === 'in' ? `<span class="dim">${left} clubs left</span>` : ''}</div>
      ${headline}</div>
    <div class="box" style="margin-bottom:18px"><h2>Your cup run</h2>${cup.rounds.map((r, i) => runLine(game, i, r, status)).join('')}</div>
    <div class="box"><h2>All ties</h2><div class="chips" style="margin-bottom:12px">${cup.rounds
      .map((r, i) => `<button class="pill ${i === viewing ? 'on' : ''}" data-cup-round="${i}" type="button">${esc(r.name)}</button>`)
      .join('')}</div>${ties}</div>`;
}

export function renderSeason(game: Game, state: SeasonScreenState): string {
  const division = state.division ?? (game.world.clubs[game.world.userClubId] as Club).division;
  const tabs = `<div class="seg" style="grid-template-columns:repeat(3,1fr)">${VIEWS.map(
    ([id, label]) => `<button data-season-view="${id}" aria-pressed="${state.view === id}" type="button">${label}</button>`,
  ).join('')}</div>`;
  const body = state.view === 'league' ? leagueView(game, division) : state.view === 'scorers' ? scorersView(game, division) : cupView(game, state);
  return tabs + body;
}
