import { describe, expect, it } from 'vitest';
import { playToEnd } from './engine/match';
import { createGame, type Game } from './game';
import { completeMatch, nextMatch, startSession } from './play';
import { advanceSummer, closeSeason, isLastSummerWeek, seasonReadyToClose } from './seasonEnd';
import { CLUBS_PER_DIVISION } from './engine/config';

const club = { name: 'Test Town', stadiumName: 'Test Park', kit: { style: 'plain' as const, primary: '#1f5fd8', secondary: '#f2f2f2' } };

function playOut(game: Game): void {
  const session = startSession(game)!;
  playToEnd(game.world, session.state, session.rng);
  completeMatch(game, session);
}

/** Plays every match the user has until the season can be closed. */
function playSeason(game: Game): void {
  for (let i = 0; i < 120 && nextMatch(game); i++) playOut(game);
}

describe('the end of a season', () => {
  it('is not ready to close until every match, and the user\'s play-off final if they have one, is played', () => {
    const game = createGame(club, 8);
    expect(seasonReadyToClose(game)).toBe(false);
    expect(() => closeSeason(game)).toThrow();
    playSeason(game);
    expect(game.season.round).toBe(38);
    expect(nextMatch(game)).toBeNull();
    expect(seasonReadyToClose(game)).toBe(true);
  });

  it('offers the user a play-off final when they finish 3rd or 4th, and plays it as a match', () => {
    const game = createGame(club, 8);
    playSeason(game);
    // Put the user third by hand, whatever happened this season.
    const me = game.world.userClubId;
    const ids = game.world.divisions[3]!;
    game.season.results = game.season.results.filter((r) => r.division !== 3);
    const others = ids.filter((id) => id !== me);
    // Everyone beats everyone below them in this order, which puts the user third.
    const order = [others[0]!, others[1]!, me, ...others.slice(2)];
    order.forEach((id, i) => {
      order.slice(i + 1).forEach((other, j) => {
        game.season.results.push({ division: 3, round: (i + j) % 38, homeId: id, awayId: other, homeGoals: 1, awayGoals: 0 });
      });
    });
    game.season.round = 38;
    game.playoffs = null;
    const m = nextMatch(game)!;
    expect(m.kind).toBe('playoff');
    expect(m.homeId).toBe(me);
    expect(m.label).toBe('Division Four play-off final');
    expect(seasonReadyToClose(game)).toBe(false);
    playOut(game);
    expect(game.playoffs).toHaveLength(3);
    expect(nextMatch(game)).toBeNull();
    expect(seasonReadyToClose(game)).toBe(true);
  });

  it('closes the season: movements, a new season and cup, the close season, a review', () => {
    const game = createGame(club, 8);
    playSeason(game);
    const before = new Map(Object.values(game.world.players).map((p) => [p.id, p.age]));
    const review = closeSeason(game);
    for (const ids of game.world.divisions) expect(ids).toHaveLength(CLUBS_PER_DIVISION);
    expect(review.champions).toHaveLength(4);
    expect(review.promoted[0]).toHaveLength(0);
    expect(review.promoted[1]).toHaveLength(3);
    expect(review.relegated[2]).toHaveLength(3);
    expect(review.playoffs).toHaveLength(3);
    for (const [d, ids] of game.world.divisions.entries()) for (const id of ids) expect(game.world.clubs[id]!.division).toBe(d);
    expect(game.phase).toBe('summer');
    expect(game.date).toBe('2027-05-24');
    expect(game.season).toMatchObject({ year: 2027, round: 0, results: [] });
    expect(game.cup.year).toBe(2027);
    expect(game.cup.winnerId).toBeNull();
    expect(game.review).toBe(review);
    expect(game.playoffs).toBeNull();
    expect(Object.values(game.world.players).every((p) => p.age === before.get(p.id)! + 1 || !before.has(p.id))).toBe(true);
    expect(Object.values(game.world.players).every((p) => p.seasonStats.goals === 0 && p.fatigue === 0 && !p.injury)).toBe(true);
    expect(game.world.clubs[game.world.userClubId]!.division).toBe(review.nextDivision);
    expect(nextMatch(game)).toBeNull();
  });

  it('keeps the user\'s movement and sponsor slots in step', () => {
    const game = createGame(club, 8);
    playSeason(game);
    const slots = game.world.clubs[game.world.userClubId]!.sponsorSlots;
    const review = closeSeason(game);
    const user = game.world.clubs[game.world.userClubId]!;
    expect(review.division).toBe(3);
    if (review.movement === 'promoted') {
      expect(review.nextDivision).toBe(2);
      expect(user.sponsorSlots).toBe(slots + 1);
    } else {
      expect(review.nextDivision).toBe(3);
      expect(user.sponsorSlots).toBe(slots);
    }
  });

  it('records the user\'s honours in the trophy cabinet', () => {
    const game = createGame(club, 8);
    playSeason(game);
    // Make the user champions of their division.
    const me = game.world.userClubId;
    for (const r of game.season.results) {
      if (r.division === 3 && (r.homeId === me || r.awayId === me)) {
        r.homeGoals = r.homeId === me ? 5 : 0;
        r.awayGoals = r.awayId === me ? 5 : 0;
      }
    }
    const review = closeSeason(game);
    expect(review.honours.some((h) => h.kind === 'league')).toBe(true);
    expect(game.world.honours.some((h) => h.name === 'Division Four champions' && h.year === 2026)).toBe(true);
    expect(review.movement).toBe('promoted');
  });
});

describe('the close season', () => {
  const closed = (): Game => {
    const game = createGame(club, 8);
    playSeason(game);
    closeSeason(game);
    return game;
  };

  it('moves a week at a time through the summer window, with the market changing', () => {
    const game = closed();
    expect(game.world.market.length).toBeGreaterThan(10);
    const dates = [game.date];
    for (let i = 0; i < 20 && !isLastSummerWeek(game); i++) {
      expect(advanceSummer(game)).toBe(false);
      dates.push(game.date);
    }
    expect(dates).toHaveLength(13);
    expect(dates[0]).toBe('2027-05-24');
    expect(dates[12]).toBe('2027-08-16');
    expect(game.phase).toBe('summer');
  });

  it('starts the new season on its opening day, with a first fixture and the review cleared', () => {
    const game = closed();
    while (!isLastSummerWeek(game)) advanceSummer(game);
    expect(advanceSummer(game)).toBe(true);
    expect(game.phase).toBe('season');
    expect(game.date).toBe('2027-08-21');
    expect(game.review).toBeNull();
    const m = nextMatch(game)!;
    expect(m.kind).toBe('league');
    expect(m.date).toBe('2027-08-21');
    expect(m.label).toBe('Matchday 1');
    expect(() => advanceSummer(game)).toThrow();
  });

  it('plays a second season, with dates a year on', () => {
    const game = closed();
    while (!isLastSummerWeek(game)) advanceSummer(game);
    advanceSummer(game);
    playSeason(game);
    expect(game.season.round).toBe(38);
    expect(game.date.startsWith('2028')).toBe(true);
    const review = closeSeason(game);
    expect(review.year).toBe(2027);
    expect(game.date).toBe('2028-05-24');
    for (const ids of game.world.divisions) expect(ids).toHaveLength(CLUBS_PER_DIVISION);
  });
});
