import { teamRatingText } from '../pitch';
import { FORMATIONS, FORMATION_IDS, PLAY_STYLES } from '../../engine/formations';
import { lineupRating } from '../../engine/lineup';
import { pendingForcedSub, teamProfile } from '../../engine/match';
import type { MatchEvent, MatchState, PlayStyle, Side } from '../../engine/matchTypes';
import { positionFit } from '../../engine/positions';
import { effectiveRating } from '../../engine/formations';
import type { Position } from '../../engine/types';
import { clubForm } from '../../engine/season';
import { MATCH } from '../../engine/config';
import { commentary } from '../../engine/commentary';
import type { Club, Player } from '../../engine/types';
import type { Game } from '../../game';
import type { MatchReport, MatchSession } from '../../play';
import { textOn } from '../colour';
import { esc, gbp, num, shortDate } from '../format';
import { form5, positionGroup, segs, surname } from '../icons';
import { benchHtml, pitchHtml, pitchLayout } from '../pitch';

export const STYLE_INFO: Record<PlayStyle, [string, string]> = {
  'gung-ho': ['Gung ho', 'All out attack'],
  attacking: ['Attacking', 'Push forward'],
  balanced: ['Balanced', 'Even shape'],
  defensive: ['Defensive', 'Stay compact'],
  'park-the-bus': ['Park the bus', 'Ten behind the ball'],
};

export type MatchPhaseUi = 'pre' | 'live' | 'penalties' | 'full';

/** What the match screens need to know beyond the engine's own state. */
export interface MatchView {
  phase: MatchPhaseUi;
  paused: boolean;
  planOpen: boolean;
  notice: string | null;
  report: MatchReport | null;
  speed: number;
  /** The position on the pitch the user has tapped, to take that player off or move him. */
  selectedSlot: number | null;
  /** A substitution waiting to be confirmed: which position, and who comes on. */
  pending: { slot: number; benchId: string } | null;
  shootout: { kicks: { side: Side; scored: boolean; playerId: string }[]; score: [number, number]; shown: number } | null;
}

const club = (game: Game, id: string): Club => game.world.clubs[id] as Club;
const player = (game: Game, id: string): Player => game.world.players[id] as Player;

function scoreboard(game: Game, state: MatchState): string {
  const home = club(game, state.sides.home.clubId);
  const away = club(game, state.sides.away.clubId);
  return `<div class="sb">
    <div class="tm" style="background:${home.kit.primary};${textOn(home.kit.primary)}"><span>${esc(home.name)}</span></div>
    <div class="sc" id="score-home">${state.score[0]}</div><div class="sc" id="score-away">${state.score[1]}</div>
    <div class="tm" style="background:${away.kit.primary};${textOn(away.kit.primary)}"><span>${esc(away.name)}</span></div></div>`;
}

// ---------------------------------------------------------------------------------------------------------------
// Before kick-off
// ---------------------------------------------------------------------------------------------------------------

export function preMatchHtml(game: Game, session: MatchSession, speed = 1): string {
  const me = club(game, game.world.userClubId);
  const oppId = session.userSide === 'home' ? session.match.awayId : session.match.homeId;
  const opp = club(game, oppId);
  const home = club(game, session.match.homeId);
  const lineup = game.lineup;
  const mine = lineupRating(game.world, lineup);
  const theirs = Math.round(
    (() => {
      const p = teamProfile(game.world, session.state, session.userSide === 'home' ? 'away' : 'home');
      return (p.att + p.def + p.ctrl) / 3 * 70;
    })(),
  );
  return `${scoreboard(game, session.state)}
    <div class="half" style="margin:16px 0">PRE-MATCH · ${esc(session.match.label.toUpperCase())} · ${esc(home.stadium.name)}</div>
    <div class="box"><h2>Opposition <small>${esc(opp.name)}</small></h2>
      <div class="grid g2" style="gap:0 24px">
        <div><div class="stat"><span>Division</span><span>${opp.division === me.division ? 'Same as yours' : opp.division < me.division ? 'Above you' : 'Below you'}</span></div>
          <div class="stat"><span>Last five</span>${clubForm(game.season, oppId) ? form5(clubForm(game.season, oppId)) : '<span class="dim">None yet</span>'}</div>
          <div class="stat"><span>Match</span><span>${session.userSide === 'home' ? 'Home' : 'Away'}</span></div></div>
        <div><div class="stat"><span>Their strength</span><span>${theirs}</span></div>
          <div class="stat"><span>Your team</span><span class="${mine >= theirs ? 'grn' : 'red'}">${mine}</span></div>
          <div class="stat"><span>Played</span><span>${esc(shortDate(session.match.date))}</span></div></div></div>
      <div class="note" style="margin-top:8px">Changes before kick off are free. They do not use up substitutions.${session.match.kind !== 'league' ? ' A level score after 90 minutes goes to a penalty shootout.' : ''}</div>
      ${session.calledUp.length ? `<div class="resp bad" style="margin-top:10px">You had too few fit players, so ${session.calledUp.length} academy player${session.calledUp.length > 1 ? 's were' : ' was'} called up.</div>` : ''}
    </div>
    <div class="grid g21" style="margin-top:18px">
      <div class="grid" style="align-content:start;gap:18px">
        <div class="box"><h2>Starting XI <small>rating <span class="gold">${teamRatingText(game, lineup)}</span></small></h2>${pitchHtml(game, lineup, me.kit)}</div>
        <div class="box"><h2>Bench <small>${lineup.bench.length} players</small></h2>${benchHtml(game, lineup, me.kit, 'Drag a bench player onto the pitch to swap them in. Drag players on the pitch to swap positions. Tap anyone for details.')}</div>
      </div>
      <div class="box" style="align-self:start"><h2>Play style</h2><div class="styles" style="grid-template-columns:repeat(2,minmax(0,1fr))">${PLAY_STYLES.map(
        (s) => `<button data-style="${s}" class="${lineup.style === s ? 'on' : ''}" type="button">${STYLE_INFO[s][0]}<small>${STYLE_INFO[s][1]}</small></button>`,
      ).join('')}</div>
        <div style="margin-top:14px">${speedHtml(speed)}</div></div>
    </div>
    <div class="kobar"><button class="btn" data-act="kick-off" type="button">Kick off</button></div>`;
}

// ---------------------------------------------------------------------------------------------------------------
// Live match
// ---------------------------------------------------------------------------------------------------------------

const HALF_NAMES = { 'first-half': 'FIRST HALF', 'half-time': 'HALF TIME', 'second-half': 'SECOND HALF', 'full-time': 'FULL TIME' } as const;

/** Goals first, then red cards, then injuries, for one side. */
function summaryFor(game: Game, state: MatchState, side: Side): string {
  const order = { goal: 0, red: 1, injury: 2 } as const;
  const items = state.events
    .filter((e): e is Extract<MatchEvent, { kind: 'goal' | 'red' | 'injury' }> => e.side === side && (e.kind === 'goal' || e.kind === 'red' || e.kind === 'injury'))
    .sort((a, b) => order[a.kind] - order[b.kind] || a.minute - b.minute);
  return items
    .map((e) => {
      const icon = e.kind === 'goal' ? '<i class="ball"></i>' : e.kind === 'red' ? '<i class="card r"></i>' : '<i class="cross"></i>';
      const text = `${surname(player(game, e.playerId))} ${e.minute}'${e.kind === 'goal' && e.penalty ? ' (PEN)' : ''}`;
      return `<div>${side === 'home' ? icon + text : text + icon.replace('class="', 'class="rt ')}</div>`;
    })
    .join('');
}

function bannerFor(game: Game, state: MatchState): { cls: string; style: string; text: string } {
  const last = state.events.at(-1);
  if (!last) return { cls: '', style: 'background:#1b2552;color:#fff', text: 'THE TEAMS ARE OUT. HERE WE GO' };
  const text = commentary(game.world, last);
  if (last.kind === 'goal') return { cls: 'goal', style: '', text };
  if (last.kind === 'yellow') return { cls: 'yel', style: '', text };
  if (last.kind === 'red') return { cls: 'red', style: '', text };
  if (last.kind === 'injury') return { cls: 'inj', style: '', text };
  if (last.kind === 'kick-off' || last.kind === 'half-time' || last.kind === 'full-time') return { cls: '', style: 'background:#1b2552;color:#fff', text };
  const colour = club(game, last.clubId).kit.primary;
  return { cls: '', style: `background:${colour};${textOn(colour)}`, text };
}

function logHtml(game: Game, state: MatchState): string {
  return [...state.events]
    .reverse()
    .map((e) => {
      const cls = e.kind === 'goal' ? 'goal' : e.kind === 'red' ? 'red' : e.kind === 'yellow' ? 'yel' : e.kind === 'injury' ? 'inj' : e.kind === 'sub' ? 'sub' : e.kind === 'half-time' || e.kind === 'full-time' ? 'whi' : '';
      const icon = e.kind === 'goal' ? '<i class="ball"></i>' : e.kind === 'red' ? '<i class="card r"></i>' : e.kind === 'yellow' ? '<i class="card y"></i>' : e.kind === 'injury' ? '<i class="cross"></i>' : '';
      return `<div class="${cls}"><b>${e.minute}'</b><span>${icon}${esc(commentary(game.world, e))}</span></div>`;
    })
    .join('');
}

const SPEED_LABELS: [number, string][] = [
  [0.5, '0.5x'],
  [1, '1x'],
  [2, '2x'],
];

/** The match speed picker: half speed, normal and double. */
export function speedHtml(speed: number): string {
  return `<div class="row2 spd" role="group" aria-label="Match speed" style="justify-content:center;gap:6px"><span class="mini">Speed</span>${SPEED_LABELS.map(
    ([v, label]) => `<button class="pill ${v === speed ? 'on' : ''}" data-speed="${v}" aria-pressed="${v === speed}" type="button">${label}</button>`,
  ).join('')}</div>`;
}

/** The penalty shoot-out so far: each side's kicks and who took them. */
function shootoutHtml(game: Game, session: MatchSession, view: MatchView): string {
  const s = view.shootout as NonNullable<MatchView['shootout']>;
  const shown = s.kicks.slice(0, s.shown);
  const score: [number, number] = [shown.filter((k) => k.side === 'home' && k.scored).length, shown.filter((k) => k.side === 'away' && k.scored).length];
  const last = shown.at(-1);
  const column = (side: Side): string =>
    shown
      .filter((k) => k.side === side)
      .map((k, i) => `<div class="pk"><span class="dim">${i + 1}</span><span>${esc(surname(player(game, k.playerId)))}</span><b class="${k.scored ? 'grn' : 'red'}">${k.scored ? 'GOAL' : 'MISS'}</b></div>`)
      .join('');
  const banner = last
    ? `<div class="banner ${last.scored ? 'goal' : 'red'}" id="pk-banner">${esc(surname(player(game, last.playerId)))} ${last.scored ? 'SCORES' : 'MISSES'}</div>`
    : '<div class="banner" id="pk-banner" style="background:#1b2552;color:#fff">PENALTIES. NERVES OF STEEL NEEDED</div>';
  const home = club(game, session.match.homeId);
  const away = club(game, session.match.awayId);
  return `<div class="tact" id="shootout"><h2 class="h2">Penalty shootout <small>${score[0]}-${score[1]}</small></h2>${banner}
    <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 14px;margin-top:10px"><div><div class="lab">${esc(home.name)}</div>${column('home')}</div><div><div class="lab">${esc(away.name)}</div>${column('away')}</div></div></div>`;
}

function fullTimeHtml(game: Game, view: MatchView): string {
  const r = view.report as MatchReport;
  const fin = r.finance;
  const result = r.userWon === null ? 'DRAW' : r.userWon ? 'WIN' : 'DEFEAT';
  return `<div class="tact" id="full-time"><h2 class="h2">Full time <small>${r.homeGoals}-${r.awayGoals}${r.penalties ? ` (pens ${r.penalties[0]}-${r.penalties[1]})` : ''}</small></h2>
    <div class="stat"><span>Result</span><span class="${r.userWon === null ? 'gold' : r.userWon ? 'grn' : 'red'}">${result}</span></div>
    ${fin ? `<div class="stat"><span>Gate income</span><span class="grn">${fin.attendance === null ? 'None (away)' : `+${gbp(fin.gate)} <span class="dim">(${num(fin.attendance)} fans)</span>`}</span></div>
      <div class="stat"><span>Sponsors</span><span class="grn">+${gbp(fin.sponsors)}</span></div>
      ${fin.wages ? `<div class="stat"><span>Wages and upkeep</span><span class="red">-${gbp(fin.wages + fin.running)}</span></div>` : ''}
      <div class="stat"><span class="gold">Net</span><span class="${fin.net >= 0 ? 'grn' : 'red'}">${fin.net >= 0 ? '+' : ''}${gbp(fin.net)}</span></div>` : ''}
    ${r.injured.length ? `<div class="stat"><span>Injured</span><span class="red">${r.injured.map((id) => esc(player(game, id).lastName)).join(', ')}</span></div>` : ''}
    <div class="row2" style="margin-top:12px"><button class="btn" data-act="continue" type="button">Continue</button></div></div>
`;
}

export function liveMatchHtml(game: Game, session: MatchSession, view: MatchView): string {
  const st = session.state;
  const banner = bannerFor(game, st);
  const recent = st.possession.slice(-5);
  const homeShare = recent.length ? Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) * 100) : 50;
  const home = club(game, st.sides.home.clubId);
  const away = club(game, st.sides.away.clubId);
  const stats: [string, string][] = [
    ['Shots', `${st.stats.home.shots} - ${st.stats.away.shots}`],
    ['Corners', `${st.stats.home.corners} - ${st.stats.away.corners}`],
    ['Yellows', `${st.stats.home.yellowCards} - ${st.stats.away.yellowCards}`],
    ['Reds', `${st.stats.home.redCards} - ${st.stats.away.redCards}`],
  ];
  const finished = view.phase === 'full';
  const shooting = view.phase === 'penalties';
  const bar = finished
    ? ''
    : shooting
      ? `<button class="btn ghost" data-act="skip-shootout" type="button">Skip to result</button>`
      : view.paused
      ? `<button class="btn" data-act="resume" type="button">Resume match</button><button class="btn ghost" data-act="plan" type="button">Change plan</button>`
      : `<button class="btn" data-act="pause" type="button">Pause match</button>`;
  return `<div class="mwrap">${scoreboard(game, st)}
    <div class="stage"><div class="half" id="half-label">${shooting ? 'PENALTY SHOOTOUT' : `${HALF_NAMES[st.phase]} - ${st.minute}'`}</div>
      ${finished ? '' : speedHtml(view.speed)}
      <div class="scr" id="summary" ${st.events.some((e) => e.kind === 'goal' || e.kind === 'red' || e.kind === 'injury') ? '' : 'hidden'}><div>${summaryFor(game, st, 'home')}</div><div class="r">${summaryFor(game, st, 'away')}</div></div>
      ${shooting ? '' : `<div class="banner ${banner.cls}" id="banner" style="${banner.style}">${esc(banner.text)}</div>`}
      ${shooting && view.shootout ? shootoutHtml(game, session, view) : ''}
      <div class="poss"><span class="l">Last 5 mins</span><div class="t"><i style="width:${homeShare}%;background:${home.kit.primary};${textOn(home.kit.primary)}">${homeShare}%</i><i style="width:${100 - homeShare}%;background:${away.kit.primary};${textOn(away.kit.primary)}">${100 - homeShare}%</i></div></div>
      <div class="ms">${stats.map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>
      ${finished ? fullTimeHtml(game, view) : ''}
      <div class="log" id="log" role="log">${logHtml(game, st)}</div></div></div>
    ${bar ? `<div class="kobar" id="match-bar">${bar}</div>` : ''}`;
}

// ---------------------------------------------------------------------------------------------------------------
// The change-your-plan sheet
// ---------------------------------------------------------------------------------------------------------------

/** The rating a player would play at in a position, at his current tiredness. */
function ratingIn(p: Player, position: Position, fatigue: number): number {
  return Math.round(effectiveRating(p, position, fatigue));
}

interface XiRow {
  slot: number;
  player: Player;
  position: Position;
  fatigue: number;
  incoming: boolean;
}

interface BenchRow {
  player: Player;
  fatigue: number;
  /** The player the staged change takes off: he sits on the bench but cannot come back. */
  off: boolean;
}

/** The team and bench as they would be once a staged change is confirmed, or as they are now. */
function lineupView(game: Game, session: MatchSession, view: MatchView): { xi: XiRow[]; bench: BenchRow[] } {
  const st = session.state;
  const side = st.sides[session.userSide];
  const pending = view.pending;
  const xi: XiRow[] = [];
  side.slots.forEach((id, i) => {
    if (!id) return;
    const slotId = pending && pending.slot === i ? pending.benchId : id;
    const pm = st.players[slotId]!;
    xi.push({ slot: i, player: player(game, slotId), position: FORMATIONS[side.formation][i] as Position, fatigue: pm.fatigue, incoming: slotId !== id });
  });
  const bench: BenchRow[] = side.bench.map((id) => {
    const swappedIn = pending?.benchId === id;
    const offId = swappedIn ? (side.slots[pending!.slot] as string) : id;
    return { player: player(game, offId), fatigue: st.players[offId]!.fatigue, off: swappedIn };
  });
  return { xi, bench };
}

const teamRating = (rows: readonly XiRow[]): number => Math.round(rows.reduce((sum, r) => sum + effectiveRating(r.player, r.position, r.fatigue), 0) / Math.max(1, rows.length));

/** A small pitch of plain coloured dots, one for each player. Tapping a dot picks that player. */
function miniPitch(session: MatchSession, view: MatchView, xi: readonly XiRow[]): string {
  const side = session.state.sides[session.userSide];
  const layout = pitchLayout(side.formation);
  const dots = xi
    .map((r) => {
      const spot = layout[r.slot] as { x: number; y: number };
      const cls = ['mdot', positionGroup(r.player.position), view.selectedSlot === r.slot ? 'sel' : '', r.incoming ? 'inc' : '', r.fatigue > 50 ? 'tired' : '']
        .filter(Boolean)
        .join(' ');
      return `<button class="${cls}" type="button" data-pick-slot="${r.slot}" style="left:${spot.x}%;top:${spot.y}%" aria-label="${esc(r.player.firstName)} ${esc(r.player.lastName)}, ${r.position}"></button>`;
    })
    .join('');
  return `<div class="mpitch">
      <div class="ln" style="left:50%;top:-30px;width:60px;height:60px;border-radius:50%;transform:translateX(-50%)"></div>
      <div class="ln" style="left:25%;right:25%;bottom:-2px;height:22%"></div>${dots}</div>
    <div class="row2 note" style="justify-content:center;gap:12px;margin-top:8px"><span><i class="mdot-key GK"></i>GK</span><span><i class="mdot-key DEF"></i>DEF</span><span><i class="mdot-key MID"></i>MID</span><span><i class="mdot-key ATT"></i>ATT</span></div>`;
}

const fitClass = (kind: string): string => (kind === 'natural' ? 'dim' : kind === 'adjacent' ? 'amb' : 'red');

function xiTable(xi: readonly XiRow[], view: MatchView, forcedSlot: number): string {
  const rows = xi
    .map((r) => {
      const fit = positionFit(r.player.position, r.position);
      const picked = view.selectedSlot === r.slot;
      const cls = ['row', picked ? 'sel' : '', r.incoming ? 'in' : '', view.selectedSlot !== null && !picked ? 'faded' : ''].filter(Boolean).join(' ');
      const note = r.incoming ? '<span class="grn"> IN</span>' : r.slot === forcedSlot ? '<span class="red"> HURT</span>' : r.fatigue > 50 ? `<span class="amb"> ${Math.round(r.fatigue)}%</span>` : '';
      return `<tr class="${cls}" data-pick-slot="${r.slot}"><td><i class="posb ${positionGroup(r.player.position)}">${r.player.position}</i></td><td>${esc(r.player.firstName[0] as string)}.${esc(r.player.lastName)}${note}</td><td class="${fitClass(fit.kind)}">${r.position}</td><td class="n wht">${r.player.ability}</td><td>${segs(r.fatigue, 6, r.fatigue > 80 ? 'bad' : r.fatigue > 50 ? 'warn' : '')}</td></tr>`;
    })
    .join('');
  return `<div class="tw"><table class="mt"><thead><tr><th>Pos</th><th>Name</th><th>Slot</th><th class="n">OVR</th><th>Fatigue</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function benchTable(bench: readonly BenchRow[], off: boolean): string {
  const rows = bench
    .map((r) => {
      const hurt = !!r.player.injury;
      const cls = ['row', r.off ? 'off' : '', hurt ? 'hurt' : '', off ? 'faded' : ''].filter(Boolean).join(' ');
      const note = r.off ? '<span class="red"> OFF, CANNOT RETURN</span>' : hurt ? `<span class="red"> OUT ${r.player.injury!.weeks}W</span>` : '';
      const attrs = r.off || hurt ? '' : ` data-pick-bench="${r.player.id}"`;
      return `<tr class="${cls}"${attrs}><td><i class="posb ${positionGroup(r.player.position)}">${r.player.position}</i></td><td>${esc(r.player.firstName[0] as string)}.${esc(r.player.lastName)}${note}</td><td class="n wht">${r.player.ability}</td><td>${segs(r.fatigue, 6, r.fatigue > 80 ? 'bad' : r.fatigue > 50 ? 'warn' : '')}</td></tr>`;
    })
    .join('');
  return `<div class="tw"><table class="mt"><thead><tr><th>Pos</th><th>Name</th><th class="n">OVR</th><th>Fatigue</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** Who could come on for the picked player, with the rating each would have in his place, best first. */
function candidatesTable(game: Game, session: MatchSession, view: MatchView, canSub: boolean): string {
  const st = session.state;
  const side = st.sides[session.userSide];
  const slot = view.selectedSlot as number;
  const position = FORMATIONS[side.formation][slot] as Position;
  const offId = side.slots[slot] as string;
  const off = player(game, offId);
  const current = ratingIn(off, position, st.players[offId]!.fatigue);
  const list = side.bench
    .map((id) => {
      const p = player(game, id);
      const fatigue = st.players[id]!.fatigue;
      return { p, fatigue, rating: ratingIn(p, position, fatigue), hurt: !!p.injury };
    })
    .sort((a, b) => Number(a.hurt) - Number(b.hurt) || b.rating - a.rating);
  const best = list.find((c) => !c.hurt)?.p.id;
  const rows = list
    .map((c) => {
      const delta = c.rating - current;
      const cls = ['row', c.p.id === best ? 'best' : '', c.hurt ? 'hurt' : '', !canSub ? 'faded' : ''].filter(Boolean).join(' ');
      const tone = delta > 0 ? 'grn' : delta < 0 ? 'red' : 'dim';
      const attrs = c.hurt ? '' : ` data-pick-bench="${c.p.id}"`;
      return `<tr class="${cls}"${attrs}><td><i class="posb ${positionGroup(c.p.position)}">${c.p.position}</i></td><td>${esc(c.p.firstName[0] as string)}.${esc(c.p.lastName)}${c.p.id === best && canSub ? ' <span class="pill g">BEST</span>' : ''}${c.hurt ? ` <span class="red">OUT ${c.p.injury!.weeks}W</span>` : ''}</td><td class="n ${c.hurt ? 'dim' : tone}">${c.hurt ? '-' : c.rating}</td><td class="n ${c.hurt ? 'dim' : tone}">${c.hurt ? '' : (delta > 0 ? '+' : '') + delta}</td><td>${segs(c.fatigue, 6, c.fatigue > 80 ? 'bad' : c.fatigue > 50 ? 'warn' : '')}</td></tr>`;
    })
    .join('');
  return `<div class="tw"><table class="mt"><thead><tr><th>Pos</th><th>Name</th><th class="n">In slot</th><th class="n">+/-</th><th>Fatigue</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function planSheetHtml(game: Game, session: MatchSession, view: MatchView): string {
  const st = session.state;
  const side = st.sides[session.userSide];
  const forced = pendingForcedSub(st) === session.userSide ? side.forcedSub : null;
  const forcedSlot = forced ? side.slots.indexOf(forced) : -1;
  const left = MATCH.maxSubs - side.subsUsed;
  const canSub = left > 0 || forced !== null;
  const { xi, bench } = lineupView(game, session, view);
  const picked = view.selectedSlot !== null ? player(game, side.slots[view.selectedSlot] as string) : null;
  const pending = view.pending;
  const slotPosition = view.selectedSlot !== null ? (FORMATIONS[side.formation][view.selectedSlot] as Position) : null;

  let middle: string;
  if (pending && picked && slotPosition) {
    const incoming = player(game, pending.benchId);
    const before = teamRating(lineupView(game, session, { ...view, pending: null }).xi);
    const after = teamRating(xi);
    const inRating = ratingIn(incoming, slotPosition, st.players[pending.benchId]!.fatigue);
    const outRating = ratingIn(picked, slotPosition, st.players[picked.id]!.fatigue);
    middle = `<div class="staged" id="staged">
        <div class="stat"><span class="grn">ON</span><span>${esc(incoming.firstName)} ${esc(incoming.lastName)} <span class="dim">${incoming.position} playing ${slotPosition}</span> <b class="gold">${inRating}</b></span></div>
        <div class="stat"><span class="red">OFF</span><span>${esc(picked.firstName)} ${esc(picked.lastName)} <span class="dim">${Math.round(st.players[picked.id]!.fatigue)}% tired</span> <b class="red">${outRating}</b></span></div>
        <div class="stat"><span class="dim">Team rating</span><span>${before} <span class="dim">&rarr;</span> <b class="${after >= before ? 'grn' : 'red'}">${after}</b></span></div>
      </div>
      <h2 class="h2" style="margin:16px 0 8px">Starting XI <small>after the change</small></h2>${xiTable(xi, view, forcedSlot)}
      <h2 class="h2" style="margin:16px 0 8px">Bench <small>${left - (forced ? 0 : 1)} subs left after this</small></h2>${benchTable(bench, false)}`;
  } else if (picked) {
    middle = `<div class="picked" id="picked"><b>${esc(picked.firstName)} ${esc(picked.lastName)}</b> <span class="dim">${picked.position} playing ${slotPosition}</span>
        <div class="dim" style="margin-top:4px">${Math.round(st.players[picked.id]!.fatigue)}% tired &middot; plays at <b class="${st.players[picked.id]!.fatigue > 50 ? 'red' : 'grn'}">${ratingIn(picked, slotPosition as Position, st.players[picked.id]!.fatigue)}</b> right now</div></div>
      <h2 class="h2" style="margin:16px 0 8px">Who comes on for ${esc(picked.lastName)}? <small>${canSub ? 'best fit first' : 'no subs left'}</small></h2>${candidatesTable(game, session, view, canSub)}
      <h2 class="h2" style="margin:16px 0 8px">Starting XI <small>tap another to swap positions</small></h2>${xiTable(xi, view, forcedSlot)}`;
  } else {
    middle = `<h2 class="h2" style="margin:16px 0 8px">Starting XI <small>rating ${teamRating(xi)}</small></h2>${xiTable(xi, view, forcedSlot)}
      <h2 class="h2" style="margin:16px 0 8px">Bench <small>${left} subs left</small></h2>${benchTable(bench, true)}
      <div class="note" style="margin-top:8px">Tap a player, on the pitch or in the table, to take him off or swap his position.</div>`;
  }

  const bar = pending
    ? `<button class="btn ghost" data-act="sub-undo" type="button">Undo</button><button class="btn" data-act="sub-confirm" type="button">Confirm sub</button>`
    : picked && !forced
      ? `<button class="btn ghost" data-act="sub-cancel" type="button">Cancel</button><button class="btn ghost" disabled type="button">Pick a player</button>`
      : `<button class="btn" data-act="resume" ${forced ? 'disabled' : ''} type="button">Resume match</button>`;

  return `<div class="sh-grab"></div>
    <div class="row2" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start"><div><div class="gold" style="font-size:11px;line-height:1.6">Change your plan</div><div class="dim" style="margin-top:4px">${st.minute}' &middot; ${st.score[0]}-${st.score[1]} &middot; subs used ${side.subsUsed}/${MATCH.maxSubs}</div></div><button class="btn ghost sm" data-close aria-label="Close" type="button">X</button></div>
    ${forced ? `<div class="inotice" id="forced-notice"><i class="cross"></i>${esc(player(game, forced).firstName)} ${esc(player(game, forced).lastName)} is injured and cannot continue. Pick a replacement from the bench.</div>` : ''}
    ${view.notice ? `<div class="resp bad" id="plan-notice" style="margin-top:12px">${esc(view.notice)}</div>` : ''}
    <span class="lab" style="margin-top:14px">Shape</span>
    <div class="chips" style="margin-bottom:10px">${FORMATION_IDS.map((f) => `<button class="pill ${f === side.formation ? 'on' : ''}" data-formation="${f}" type="button">${f}</button>`).join('')}</div>
    ${miniPitch(session, view, xi)}
    ${middle}
    <span class="lab" style="margin-top:20px">Play style</span>
    <div class="styles">${PLAY_STYLES.map((s) => `<button data-style="${s}" class="${side.style === s ? 'on' : ''}" type="button">${STYLE_INFO[s][0]}<small>${STYLE_INFO[s][1]}</small></button>`).join('')}</div>
    <div class="kobar planbar" id="plan-bar">${bar}</div>`;
}
