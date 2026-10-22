import { addDays, matchdayDate } from './engine/calendar';
import { CUP_ROUND_AFTER_MATCHDAY, DIVISION_NAMES, MATCHES_PER_SEASON } from './engine/config';
import { autoPlayCup, cupRoundDue, playCupRound, userTie, type UserCupScore } from './engine/cup';
import { processCupFinances, type FinanceLine } from './engine/finance';
import { toTeamSheet } from './engine/lineup';
import { chooseAiTeamSheet, createMatch, finishMatch, type MatchSummary } from './engine/match';
import type { MatchState, Side } from './engine/matchTypes';
import { applyMatchProgression } from './engine/progression';
import { createRng, type Rng } from './engine/rng';
import { createYouthPlayer, positionNeeded } from './engine/squad';
import { playMatchday } from './engine/season';
import { shootout, cupStrength } from './engine/knockout';
import { playoffPairing, playPlayoffs } from './engine/playoffs';
import { processTransferWeek } from './engine/transferWeek';
import { processWeek } from './engine/week';
import { repairLineup } from './engine/lineup';
import { START_YEAR, type Game } from './game';

export interface NextMatch {
  kind: 'league' | 'cup' | 'playoff';
  homeId: string;
  awayId: string;
  /** The day it is played. */
  date: string;
  /** For a cup tie, the round it belongs to. */
  cupRound: number | null;
  /** Describes the match, for example "Matchday 3" or "Challenge Cup, Round 1". */
  label: string;
}

/** The Wednesday after the league matchday that a cup round follows. */
export function cupDate(round: number, year: number = START_YEAR): string {
  const after = CUP_ROUND_AFTER_MATCHDAY[round] as number;
  return addDays(matchdayDate(year, after - 1), 4);
}

/**
 * The user's next match. A cup tie that is due comes first, since cup ties are played midweek between league matches.
 * Otherwise it is the next league fixture. Null once the league season is over.
 */
export function nextMatch(game: Game): NextMatch | null {
  const { world, season, cup } = game;
  const me = world.userClubId;
  if (game.phase === 'summer') return null;
  const due = cupRoundDue(cup, season.round);
  if (due !== null) {
    const round = cup.rounds[due]!;
    const tie = userTie(world, round);
    if (tie) {
      return { kind: 'cup', homeId: tie.homeId, awayId: tie.awayId, date: cupDate(due, season.year), cupRound: due, label: `Challenge Cup, ${round.name}` };
    }
  }
  if (season.round >= MATCHES_PER_SEASON) return playoffMatch(game);
  const f = season.fixtures.find((x) => x.round === season.round && (x.homeId === me || x.awayId === me));
  if (!f) return null;
  return {
    kind: 'league',
    homeId: f.homeId,
    awayId: f.awayId,
    date: matchdayDate(season.year, f.round),
    cupRound: null,
    label: `Matchday ${f.round + 1}`,
  };
}

/** The user's play-off final, if their club finished 3rd or 4th below the top division and it has not been played. */
function playoffMatch(game: Game): NextMatch | null {
  const { world, season } = game;
  if (game.playoffs) return null;
  const user = world.clubs[world.userClubId] as { division: number };
  const pairing = playoffPairing(world, season, user.division);
  if (!pairing || (pairing.homeId !== world.userClubId && pairing.awayId !== world.userClubId)) return null;
  return {
    kind: 'playoff',
    homeId: pairing.homeId,
    awayId: pairing.awayId,
    date: addDays(matchdayDate(season.year, MATCHES_PER_SEASON - 1), 7),
    cupRound: null,
    label: `${DIVISION_NAMES[user.division]} play-off final`,
  };
}

/**
 * A club cannot play with fewer than eleven fit players. If the user has let the squad run down, teenagers from the
 * academy are called up to fill the gaps. Returns the players called up.
 */
export function ensurePlayableSquad(game: Game, rng: Rng): string[] {
  const { world } = game;
  const club = world.clubs[world.userClubId]!;
  const called: string[] = [];
  const fit = (): number => club.playerIds.filter((id) => !world.players[id]?.injury).length;
  while (fit() < 11) {
    const youth = createYouthPlayer(world, rng, club.id, positionNeeded(world, club.id) ?? 'CM');
    world.players[youth.id] = youth;
    club.playerIds.push(youth.id);
    called.push(youth.id);
  }
  return called;
}

/** A match being played: the engine state, which side the user is, and the random numbers it runs on. */
export interface MatchSession {
  match: NextMatch;
  state: MatchState;
  userSide: Side;
  rng: Rng;
  /** Academy players called up because the squad was too small to field a team. */
  calledUp: string[];
}

/** Sets up the user's next match. The user's team is the lineup picked on the Team screen; the opposition picks its own. */
export function startSession(game: Game): MatchSession | null {
  const match = nextMatch(game);
  if (!match) return null;
  const me = game.world.userClubId;
  const userSide: Side = match.homeId === me ? 'home' : 'away';
  const rng = createRng(game.rngState);
  const calledUp = ensurePlayableSquad(game, rng);
  game.lineup = repairLineup(game.world, me, game.lineup);
  const mine = toTeamSheet(game.world, game.lineup);
  const oppId = userSide === 'home' ? match.awayId : match.homeId;
  const theirs = chooseAiTeamSheet(game.world, oppId, me, userSide === 'away', rng);
  const state =
    userSide === 'home'
      ? createMatch(game.world, me, mine, oppId, theirs)
      : createMatch(game.world, oppId, theirs, me, mine);
  return { match, state, userSide, rng, calledUp };
}

export interface MatchReport {
  kind: 'league' | 'cup' | 'playoff';
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  /** The shoot-out, if a cup tie was level after normal time. */
  penalties: [number, number] | null;
  /** True if the user's club won, false if it lost, null for a league draw. */
  userWon: boolean | null;
  /** The user's money for the match, or null if none was taken (not possible in the league). */
  finance: FinanceLine | null;
  /** Players of the user's club who were hurt. */
  injured: string[];
  /** The day of the next match. */
  nextDate: string | null;
}

/**
 * Makes the match count. The result is written to the world and the other matches of the round are played, then
 * money, contracts, recovery and the transfer market move on a week. Call once, at full time. A cup or play-off match that
 * finished level uses `shootoutScore` if the shoot-out was played out kick by kick, and a quick simulated one if not.
 */
export function completeMatch(game: Game, session: MatchSession, shootoutScore?: [number, number]): MatchReport {
  const { world, season, cup } = game;
  const { match, state, rng } = session;
  const me = world.userClubId;
  const summary: MatchSummary = finishMatch(world, state);
  applyMatchProgression(world, state, rng);
  const [homeGoals, awayGoals] = state.score;
  let penalties: [number, number] | null = null;
  let finance: FinanceLine | null = null;

  if (match.kind === 'league') {
    const results = playMatchday(world, season, rng, { homeGoals, awayGoals });
    const week = processWeek(world, season, results, rng);
    finance = week.userFinance;
  } else if (match.kind === 'playoff') {
    if (homeGoals === awayGoals) penalties = shootoutScore ?? shootout(rng, cupStrength(world, season, match.homeId), cupStrength(world, season, match.awayId));
    game.playoffs = playPlayoffs(world, season, rng, { homeGoals, awayGoals, penalties });
    const mine = game.playoffs.filter((f) => f.homeId === me || f.awayId === me);
    finance = cupFinance(game, mine, rng);
  } else {
    const level = homeGoals === awayGoals;
    if (level) penalties = shootoutScore ?? shootout(rng, cupStrength(world, season, match.homeId), cupStrength(world, season, match.awayId));
    const score: UserCupScore = { homeGoals, awayGoals, penalties };
    const ties = playCupRound(world, season, cup, rng, score);
    finance = cupFinance(game, ties, rng);
  }
  autoPlayCups(game, rng);

  const next = nextMatch(game);
  game.date = next?.date ?? addDays(game.date, 7);
  processTransferWeek(world, game.date, rng);
  game.lineup = repairLineup(world, me, game.lineup);
  game.rngState = rng.state();

  const userHome = match.homeId === me;
  const userGoals = userHome ? homeGoals : awayGoals;
  const theirGoals = userHome ? awayGoals : homeGoals;
  const shootoutWin = penalties ? (userHome ? penalties[0] > penalties[1] : penalties[1] > penalties[0]) : null;
  const userWon = userGoals === theirGoals ? (match.kind !== 'league' ? shootoutWin : null) : userGoals > theirGoals;
  return {
    kind: match.kind,
    homeId: match.homeId,
    awayId: match.awayId,
    homeGoals,
    awayGoals,
    penalties,
    userWon,
    finance,
    injured: summary.injured.filter((id) => world.players[id]?.clubId === me),
    nextDate: next?.date ?? null,
  };
}

/** The user's line from a cup round, taking the gate for a home tie and sponsors either way. */
function cupFinance(game: Game, ties: readonly { homeId: string; awayId: string }[], rng: Rng): FinanceLine | null {
  const lines = processCupFinances(game.world, game.season, ties, rng);
  return lines.find((l) => l.clubId === game.world.userClubId) ?? null;
}

/** Plays any cup rounds that are due and do not involve the user, and pays their gates. */
function autoPlayCups(game: Game, rng: Rng): void {
  for (const i of autoPlayCup(game.world, game.season, game.cup, rng)) {
    processCupFinances(game.world, game.season, game.cup.rounds[i]!.ties, rng);
  }
}
