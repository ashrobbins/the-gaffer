import { describe, expect, it } from 'vitest';
import { playToEnd } from './engine/match';
import { userTie, userCupStatus } from './engine/cup';
import { matchdayDate } from './engine/calendar';
import { CUP_ROUND_AFTER_MATCHDAY } from './engine/config';
import { createGame, type Game } from './game';
import { completeMatch, cupDate, nextMatch, startSession } from './play';

const club = { name: 'Test Town', stadiumName: 'Test Park', kit: { style: 'plain' as const, primary: '#1f5fd8', secondary: '#f2f2f2' } };
const fresh = (seed = 5): Game => createGame(club, seed);

/** Plays the user's match through with the computer managing both sides. */
function playOut(game: Game) {
  const session = startSession(game)!;
  playToEnd(game.world, session.state, session.rng);
  return { session, report: completeMatch(game, session) };
}

describe('nextMatch', () => {
  it('is the first league fixture on opening day, with the date and a label', () => {
    const game = fresh();
    const m = nextMatch(game)!;
    expect(m.kind).toBe('league');
    expect(m.date).toBe('2026-08-22');
    expect(m.label).toBe('Matchday 1');
    expect([m.homeId, m.awayId]).toContain(game.world.userClubId);
  });

  it('is a cup tie once a round is due and the user is in it, played midweek', () => {
    const game = fresh();
    // Put the user into the first tie of the preliminary round, and make it due.
    const tie = game.cup.rounds[0]!.ties[0]!;
    tie.homeId = game.world.userClubId;
    game.season.round = CUP_ROUND_AFTER_MATCHDAY[0]!;
    const m = nextMatch(game)!;
    expect(m).toMatchObject({ kind: 'cup', cupRound: 0, label: 'Challenge Cup, Preliminary round' });
    expect(m.date).toBe(cupDate(0));
    expect(new Date(m.date + 'T00:00:00Z').getUTCDay()).toBe(3);
  });

  it('skips a cup round the user is not in', () => {
    const game = fresh();
    game.cup.rounds[0]!.ties = game.cup.rounds[0]!.ties.filter((t) => t.homeId !== game.world.userClubId && t.awayId !== game.world.userClubId);
    game.season.round = CUP_ROUND_AFTER_MATCHDAY[0]!;
    expect(nextMatch(game)!.kind).toBe('league');
  });

  it('is null once the league season is over', () => {
    const game = fresh();
    game.season.round = 38;
    expect(nextMatch(game)).toBeNull();
  });
});

describe('ensurePlayableSquad', () => {
  it('calls up academy players when the user has fewer than eleven fit players', () => {
    const game = fresh();
    const club = game.world.clubs[game.world.userClubId]!;
    for (const id of club.playerIds.slice(5)) game.world.players[id]!.injury = { weeks: 3, kind: 'Knee' };
    const session = startSession(game)!;
    expect(session.calledUp.length).toBe(6);
    const called = session.calledUp.map((id) => game.world.players[id]!);
    expect(called.every((p) => p.age <= 19 && p.clubId === club.id)).toBe(true);
    expect(session.state.sides[session.userSide].slots.filter(Boolean)).toHaveLength(11);
  });

  it('does nothing for a healthy squad', () => {
    expect(startSession(fresh())!.calledUp).toEqual([]);
  });
});

describe('startSession', () => {
  it('sets up the match with the user as the right side and eleven players on the pitch each', () => {
    const game = fresh();
    const s = startSession(game)!;
    const me = game.world.userClubId;
    expect(s.state.sides[s.userSide].clubId).toBe(me);
    expect(s.state.sides.home.slots.filter(Boolean)).toHaveLength(11);
    expect(s.state.sides.away.slots.filter(Boolean)).toHaveLength(11);
    expect(s.state.minute).toBe(0);
    expect(s.state.sides[s.userSide].slots).toEqual(game.lineup.xi);
    expect(s.state.sides[s.userSide].formation).toBe(game.lineup.formation);
    expect(s.state.sides[s.userSide].style).toBe(game.lineup.style);
  });

  it('is repeatable for the same game', () => {
    const a = startSession(fresh())!;
    const b = startSession(fresh())!;
    expect(a.state.sides.away.formation).toBe(b.state.sides.away.formation);
    expect(a.state.sides.home.slots).toEqual(b.state.sides.home.slots);
  });
});

describe('completeMatch: a league match', () => {
  it('counts the result in the table and plays the rest of the round', () => {
    const game = fresh();
    const { session, report } = playOut(game);
    expect(game.season.round).toBe(1);
    expect(game.season.results).toHaveLength(40);
    const mine = game.season.results.find((r) => r.homeId === game.world.userClubId || r.awayId === game.world.userClubId)!;
    expect([mine.homeGoals, mine.awayGoals]).toEqual(session.state.score);
    expect([report.homeGoals, report.awayGoals]).toEqual(session.state.score);
  });

  it('takes the money, moves the date on a week and updates the lineup', () => {
    const game = fresh();
    const cash = game.world.clubs[game.world.userClubId]!.cash;
    const { report } = playOut(game);
    expect(report.finance).not.toBeNull();
    expect(game.world.clubs[game.world.userClubId]!.cash).toBe(cash + report.finance!.net);
    expect(report.finance!.wages).toBeGreaterThan(0);
    expect(game.date).toBe(matchdayDate(2026, 1));
    expect(report.nextDate).toBe(game.date);
    expect(game.lineup.xi).toHaveLength(11);
  });

  it('records the players who played and writes the new random state so the game stays repeatable', () => {
    const game = fresh();
    const before = game.rngState;
    playOut(game);
    expect(game.rngState).not.toBe(before);
    const starters = Object.values(game.world.players).filter((p) => p.seasonStats.starts > 0);
    expect(starters.length).toBe(22);
  });

  it('says whether the user won, drew or lost', () => {
    const game = fresh();
    const { report, session } = playOut(game);
    const [h, a] = session.state.score;
    const mine = session.userSide === 'home' ? h - a : a - h;
    expect(report.userWon).toBe(mine === 0 ? null : mine > 0);
    expect(report.penalties).toBeNull();
  });

  it('can play a whole season match by match', () => {
    const game = fresh(6);
    let reports = 0;
    for (let i = 0; i < 80; i++) {
      if (!nextMatch(game)) break;
      playOut(game);
      reports++;
    }
    // Nobody renewed a contract, so the academy has had to fill the gaps.
    expect(game.world.clubs[game.world.userClubId]!.playerIds.length).toBeGreaterThanOrEqual(11);
    expect(game.season.round).toBe(38);
    expect(reports).toBeGreaterThanOrEqual(38);
    expect(nextMatch(game)).toBeNull();
    for (const club of Object.values(game.world.clubs)) if (!club.isUser) expect(club.playerIds).toHaveLength(18);
  });
});

describe('completeMatch: a cup tie', () => {
  /** A new game where the user has been drawn into the preliminary round, with that round now due. */
  function cupGame(rngSeed = 1): Game {
    for (let seed = 1; seed < 300; seed++) {
      const game = fresh(seed);
      if (userTie(game.world, game.cup.rounds[0]!)) {
        game.season.round = CUP_ROUND_AFTER_MATCHDAY[0]!;
        game.rngState = rngSeed;
        return game;
      }
    }
    throw new Error('no game with the user in the preliminary round');
  }

  it('plays the round without touching the league, and pays a home gate', () => {
    const game = cupGame();
    const roundBefore = game.season.round;
    const resultsBefore = game.season.results.length;
    const cash = game.world.clubs[game.world.userClubId]!.cash;
    const { report } = playOut(game);
    expect(report.kind).toBe('cup');
    expect(game.season.round).toBe(roundBefore);
    expect(game.season.results).toHaveLength(resultsBefore);
    expect(report.finance!.gate > 0).toBe(report.homeId === game.world.userClubId);
    expect(report.finance!.wages).toBe(0);
    expect(game.world.clubs[game.world.userClubId]!.cash).toBe(cash + report.finance!.net);
    expect(game.cup.rounds[0]!.played).toBe(true);
  });

  it('always has a winner: a level match goes to a shoot-out', () => {
    let sawShootout = false;
    for (let seed = 1; seed < 40; seed++) {
      const game = cupGame(seed);
      const { report } = playOut(game);
      expect(report.userWon).not.toBeNull();
      const tie = userTie(game.world, game.cup.rounds[0]!)!;
      expect(tie.winnerId === game.world.userClubId).toBe(report.userWon);
      if (report.homeGoals === report.awayGoals) {
        sawShootout = true;
        expect(report.penalties).not.toBeNull();
        expect(report.penalties![0]).not.toBe(report.penalties![1]);
      } else expect(report.penalties).toBeNull();
    }
    expect(sawShootout).toBe(true);
  });

  it('puts the user out of the cup after a defeat, and then plays later rounds without them', () => {
    let out = false;
    for (let seed = 1; seed < 60 && !out; seed++) {
      const game = cupGame(seed);
      const { report } = playOut(game);
      if (report.userWon === false) {
        out = true;
        expect(userCupStatus(game.world, game.cup).status).toBe('out');
        expect(userTie(game.world, game.cup.rounds[1]!)).toBeNull();
        game.season.round = 38;
        expect(nextMatch(game)).toBeNull();
      }
    }
    expect(out).toBe(true);
  });

  it('moves the date to the next match', () => {
    const game = cupGame();
    const { report } = playOut(game);
    expect(report.nextDate).toBe(matchdayDate(2026, CUP_ROUND_AFTER_MATCHDAY[0]!));
  });
});
