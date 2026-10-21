import { DIVISION_NAMES } from '../../engine/config';
import type { Club, Player, PlayoffFinal } from '../../engine/types';
import type { Game } from '../../game';
import type { SeasonReview } from '../../seasonEnd';
import { esc, ordinal } from '../format';
import { shirt } from '../sprites';

const clubName = (game: Game, id: string): string => (game.world.clubs[id] as Club).name;
const names = (game: Game, ids: readonly string[]): string => ids.map((id) => esc(clubName(game, id))).join(', ');

function playoffLine(game: Game, f: PlayoffFinal): string {
  const score = `${f.homeGoals}-${f.awayGoals}${f.penalties ? ` (pens ${f.penalties[0]}-${f.penalties[1]})` : ''}`;
  const mine = f.homeId === game.world.userClubId || f.awayId === game.world.userClubId;
  return `<div class="rs ${mine ? 'me' : ''}"><span class="rh">${esc(clubName(game, f.homeId))}</span><b>${score}</b><span class="ra">${esc(clubName(game, f.awayId))}</span></div>`;
}

/** How the season that has just finished went, shown on HQ through the close season. */
export function reviewHtml(game: Game, r: SeasonReview): string {
  const user = game.world.clubs[game.world.userClubId] as Club;
  const season = `${r.year}-${String(r.year + 1).slice(2)}`;
  const verdict =
    r.movement === 'promoted'
      ? `<div class="resp ok" style="margin:12px 0">PROMOTED to ${DIVISION_NAMES[r.nextDivision]}. A new sponsor slot opens, and the fans are delighted.</div>`
      : r.movement === 'relegated'
        ? `<div class="resp bad" style="margin:12px 0">RELEGATED to ${DIVISION_NAMES[r.nextDivision]}. The fans are not happy.</div>`
        : `<div class="note" style="margin:12px 0">Staying in ${DIVISION_NAMES[r.nextDivision]} next season.</div>`;
  const scorer = r.topScorer ? (game.world.players[r.topScorer.playerId] as Player) : null;
  const wonPlayoff = r.playoffs.find((f) => f.homeId === user.id || f.awayId === user.id);
  const divisions = DIVISION_NAMES.map(
    (name, d) => `<div class="stat" style="align-items:flex-start"><span>${name}</span><span style="text-align:right;max-width:62%"><span class="gold">${esc(clubName(game, r.champions[d] as string))}</span>${
      d > 0 ? `<br><span class="grn">Up:</span> ${names(game, r.promoted[d] as string[])}` : ''
    }${d < DIVISION_NAMES.length - 1 ? `<br><span class="red">Down:</span> ${names(game, r.relegated[d] as string[])}` : ''}</span></div>`,
  ).join('');
  return `<div class="box" style="border-color:var(--gold)"><h2>Season ${season} <small>review</small></h2>
    <div class="row2" style="gap:12px;flex-wrap:nowrap">${shirt(user.kit, 44)}<div><div class="big">${ordinal(r.position)}</div><div class="dim">${DIVISION_NAMES[r.division]} · ${r.points} pts</div></div></div>
    ${verdict}
    ${r.honours.length ? r.honours.map((h) => `<div class="stat"><span class="gold">Trophy</span><span class="gold">${esc(h.name)}</span></div>`).join('') : ''}
    <div class="stat"><span>${'Challenge Cup'}</span><span>${esc(r.cupResult)}</span></div>
    ${wonPlayoff ? `<div class="lab" style="margin-top:12px">Your play-off final</div>${playoffLine(game, wonPlayoff)}` : ''}
    ${scorer ? `<div class="stat"><span>Top scorer in your division</span><span>${esc(scorer.firstName[0] as string)}.${esc(scorer.lastName)} <span class="gold">${r.topScorer!.goals}</span></span></div>` : ''}
    <div class="lab" style="margin-top:14px">Champions and movements</div>${divisions}
    ${r.cupWinnerId ? `<div class="stat"><span>Challenge Cup winners</span><span>${esc(clubName(game, r.cupWinnerId))}</span></div>` : ''}
    <div class="lab" style="margin-top:14px">Play-off finals</div>${r.playoffs.map((f) => playoffLine(game, f)).join('')}
    <div class="note" style="margin-top:10px">Everyone is a year older. Players have rested and recovered. New fixtures are drawn.</div></div>`;
}
