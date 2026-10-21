import { matchdayDate } from '../../engine/calendar';
import { CUP_NAME, CUP_ROUND_AFTER_MATCHDAY, DIVISION_NAMES, MATCHES_PER_SEASON } from '../../engine/config';
import { nextCupRound, userTie } from '../../engine/cup';
import { sponsorIncome, weeklyProjection } from '../../engine/finance';
import { tableFor } from '../../engine/season';
import type { Club, Fixture } from '../../engine/types';
import { type Game } from '../../game';
import { isLastSummerWeek, seasonReadyToClose } from '../../seasonEnd';
import { windowAt } from '../../engine/calendar';
import { reviewHtml } from './review';
import { nextMatch } from '../../play';
import { esc, gbp, num, ordinal, shortDate } from '../format';
import { shirt } from '../sprites';

export const userClub = (game: Game): Club => game.world.clubs[game.world.userClubId] as Club;

/** The user's league fixtures from the next matchday on. */
export function upcomingFixtures(game: Game, limit = 3): Fixture[] {
  const me = game.world.userClubId;
  return game.season.fixtures
    .filter((f) => f.round >= game.season.round && (f.homeId === me || f.awayId === me))
    .sort((a, b) => a.round - b.round)
    .slice(0, limit);
}

function fixtureLine(game: Game, f: Fixture): { date: string; opponent: Club; home: boolean } {
  const me = game.world.userClubId;
  const home = f.homeId === me;
  return { date: matchdayDate(game.season.year, f.round), opponent: game.world.clubs[home ? f.awayId : f.homeId] as Club, home };
}

/** The cup tie the user is due to play next, with its date (the Wednesday after the league matchday), or null. */
function nextCupLine(game: Game): { date: string; round: string; opponent: Club | null; home: boolean } | null {
  const i = nextCupRound(game.cup);
  if (i === null) return null;
  const round = game.cup.rounds[i]!;
  const tie = userTie(game.world, round);
  if (!tie) return null;
  const home = tie.homeId === game.world.userClubId;
  const after = CUP_ROUND_AFTER_MATCHDAY[i] as number;
  const saturday = matchdayDate(game.season.year, after - 1);
  const date = new Date(Date.UTC(+saturday.slice(0, 4), +saturday.slice(5, 7) - 1, +saturday.slice(8, 10) + 4)).toISOString().slice(0, 10);
  return { date, round: round.name, opponent: game.world.clubs[home ? tie.awayId : tie.homeId] ?? null, home };
}

/** Cup ties and league matches after the next one, in date order. */
function comingUp(game: Game, later: Fixture[], cup: ReturnType<typeof nextCupLine>): string {
  const rows: { date: string; html: string }[] = later.map((f) => {
    const l = fixtureLine(game, f);
    return { date: l.date, html: `<div class="cu"><span class="dim">${shortDate(l.date)}</span><span class="pill">League</span><span>${esc(l.opponent.name)} (${l.home ? 'H' : 'A'})</span></div>` };
  });
  if (cup) {
    rows.push({ date: cup.date, html: `<div class="cu"><span class="dim">${shortDate(cup.date)}</span><span class="pill y">Cup</span><span>${esc(cup.round)} ${cup.home ? 'v' : 'at'} ${esc(cup.opponent?.name ?? '')}</span></div>` });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date)).map((r) => r.html).join('');
}

/** The summer controls: the date, the transfer window, and the button that moves time on a week. */
export function summerControls(game: Game): string {
  const w = windowAt(game.date);
  const last = isLastSummerWeek(game);
  return `<div class="stat"><span>Date</span><span class="gold">${shortDate(game.date)}</span></div>
    <div class="stat"><span>Transfer window</span><span class="${w.open ? 'grn' : 'red'}">${w.open ? `Open, ${Math.max(0, w.daysToClose)} days left` : 'Closed'}</span></div>
    <div class="row2" style="margin-top:14px"><button class="btn" data-act="${last ? 'start-season' : 'advance-week'}" type="button">${last ? 'Start the season' : 'Advance a week'}</button></div>
    <div class="note center" style="margin-top:8px">Between seasons, time moves one week at a time. Sign players, then advance when you are ready.${last ? ' The new season kicks off on ' + shortDate(matchdayDate(game.season.year, 0)) + '.' : ''}</div>`;
}

function seasonOverBox(game: Game): string {
  if (game.phase === 'summer') {
    return `<div class="box"><h2>Close season <small>${game.season.year}</small></h2>${summerControls(game)}</div>`;
  }
  if (seasonReadyToClose(game)) {
    return `<div class="box"><h2>Season over</h2><p class="note">Every match has been played. See how the season ended, who goes up and down, and move on to the summer.</p>
      <div class="row2" style="margin-top:14px"><button class="btn" data-act="close-season" type="button">Finish the season</button></div></div>`;
  }
  return `<div class="box"><h2>Season over</h2><p class="note">There are no more league matches this season.</p></div>`;
}

export function renderHq(game: Game): string {
  const club = userClub(game);
  const next = nextMatch(game);
  const table = tableFor(game.world, game.season, club.division);
  const position = table.findIndex((r) => r.clubId === club.id) + 1;
  const row = table[position - 1];
  const money = weeklyProjection(game.world, club.id);
  const later = upcomingFixtures(game, 4).slice(next?.kind === 'league' ? 1 : 0, next?.kind === 'league' ? 4 : 3);
  const cup = next?.kind === 'cup' ? null : nextCupLine(game);

  let fixtureBox: string;
  if (next) {
    const home = game.world.clubs[next.homeId] as Club;
    const away = game.world.clubs[next.awayId] as Club;
    fixtureBox = `<div class="box"><h2>Next fixture <small>${esc(next.label)} · ${shortDate(next.date)}</small></h2>
        <div class="grid" style="grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;text-align:center">
          <div class="fixture-team">${shirt(home.kit, 76)}<div style="margin-top:8px">${esc(home.name)}</div><div class="mini">Home</div></div>
          <div class="big">V</div>
          <div class="fixture-team">${shirt(away.kit, 76)}<div style="margin-top:8px">${esc(away.name)}</div><div class="mini">Away</div></div>
        </div>
        <p class="note center" style="margin-top:12px">Played at ${esc(home.stadium.name)}</p>
        <div class="row2" style="margin-top:16px"><button class="btn" data-act="go-match" type="button">Go to match</button></div>
        <div class="lab" style="margin-top:18px">Coming up</div>
        ${comingUp(game, later, cup)}
      </div>`;
  } else {
    fixtureBox = seasonOverBox(game);
  }

  const review = game.review ? reviewHtml(game, game.review) : '';
  return `<div class="grid g21">
    <div class="grid" style="align-content:start;gap:18px">${fixtureBox}${review}</div>
    <div class="grid" style="align-content:start;gap:18px">
      <div class="box"><h2>Standing <small>${DIVISION_NAMES[club.division]}</small></h2>
        <div class="big">${row && row.played > 0 ? `${ordinal(position)}<span style="font-size:9px" class="dim"> of 20</span>` : 'Day one'}</div>
        <div class="stat" style="margin-top:8px"><span>Played</span><span>${row?.played ?? 0} of ${MATCHES_PER_SEASON}</span></div>
        <div class="stat"><span>Points</span><span class="gold">${row?.points ?? 0}</span></div>
        <div class="stat"><span>Promotion</span><span class="grn">Top 2, play-offs 3-4</span></div>
      </div>
      <div class="box ${money.surplus < 0 ? 'warn' : ''}"><h2>Money</h2>
        <div class="stat"><span>Cash</span><span class="gold">${gbp(club.cash)}</span></div>
        <div class="stat"><span>Sponsors per match</span><span class="grn">+${num(sponsorIncome(club))}</span></div>
        <div class="stat"><span>Wages and upkeep a week</span><span class="red">-${num(money.outgoings)}</span></div>
        <div class="stat"><span>Average income per match</span><span>${num(money.averageIncome)}</span></div>
        <div class="stat"><span class="gold">Weekly surplus</span><span class="${money.surplus >= 0 ? 'grn' : 'red'}">${money.surplus >= 0 ? '+' : ''}${num(money.surplus)}</span></div>
        <p class="note" style="margin-top:8px">Gate money only comes in on home matches. ${esc(CUP_NAME)} ties pay the home side a gate too.</p>
      </div>
    </div>
  </div>`;
}
