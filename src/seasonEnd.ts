import { addDays, matchdayDate, summerWeeks } from './engine/calendar';
import { MATCHES_PER_SEASON } from './engine/config';
import { autoPlayCup, userCupStatus } from './engine/cup';
import { createCup } from './engine/cup';
import { fanBaseAfterSeason, processSummerWeek } from './engine/finance';
import { repairLineup } from './engine/lineup';
import { applyMovements, computeMovements, recordHonours, seasonHonours, type SeasonMovements } from './engine/movements';
import { playPlayoffs } from './engine/playoffs';
import { endOfSeasonProgression } from './engine/progression';
import { topScorers } from './engine/scorers';
import { createSeason, tableFor } from './engine/season';
import { refreshOffers } from './engine/sponsors';
import { processTransferWeek } from './engine/transferWeek';
import type { Club, Honour, PlayoffFinal } from './engine/types';
import { withRng, type Game } from './game';

/** How a season went, kept for the summer so the user can read it. Club ids, so it saves as plain data. */
export interface SeasonReview {
  /** The year the season started, for example 2026 for 2026-27. */
  year: number;
  /** The division the user's club played in. */
  division: number;
  position: number;
  points: number;
  movement: 'promoted' | 'relegated' | 'stayed';
  /** Where the user's club plays next season. */
  nextDivision: number;
  /** Champions of each division, top first. */
  champions: string[];
  promoted: string[][];
  relegated: string[][];
  playoffs: PlayoffFinal[];
  /** Trophies the user's club won. */
  honours: Honour[];
  cupWinnerId: string | null;
  /** The user's cup result: how far they got, or that they won. */
  cupResult: string;
  topScorer: { playerId: string; clubId: string; goals: number } | null;
}

/** True once every league match, the cup and the user's play-off final (if they have one) are done, so the season can be closed. */
export function seasonReadyToClose(game: Game): boolean {
  if (game.phase !== 'season' || game.season.round < MATCHES_PER_SEASON) return false;
  const user = game.world.clubs[game.world.userClubId] as Club;
  if (game.playoffs) return true;
  if (user.division === 0) return true;
  const table = tableFor(game.world, game.season, user.division);
  const position = table.findIndex((r) => r.clubId === user.id) + 1;
  return position < 3 || position > 4;
}

/**
 * Closes the season. Computer clubs' play-off finals are played, the clubs move between divisions, honours go in the
 * trophy cabinet, every player gets a year older, and the next season's fixtures and cup are drawn. The game moves into
 * the close season, on the first day of the summer transfer window. Returns the review of the season just ended.
 */
export function closeSeason(game: Game): SeasonReview {
  if (!seasonReadyToClose(game)) throw new Error('The season is not over yet');
  const { world, season } = game;
  const me = world.userClubId;

  return withRng(game, (rng) => {
    autoPlayCup(world, season, game.cup, rng);
    const user = world.clubs[me] as Club;
    const division = user.division;
    const table = tableFor(world, season, division);
    const row = table.find((r) => r.clubId === me);
    const finals = game.playoffs ?? playPlayoffs(world, season, rng);
    const movements: SeasonMovements = computeMovements(world, season, finals);
    const honours = recordHonours(world, seasonHonours(world, season, game.cup));
    const scorer = topScorers(world, division, 1)[0] ?? null;
    const cupStatus = userCupStatus(world, game.cup);
    const cupResult =
      cupStatus.status === 'won'
        ? 'Winners'
        : cupStatus.status === 'out'
          ? `Out in the ${game.cup.rounds[cupStatus.round]!.name.toLowerCase()}`
          : 'Still in';

    fanBaseAfterSeason(world, season);
    applyMovements(world, movements);
    endOfSeasonProgression(world, rng);
    for (const p of Object.values(world.players)) {
      p.fatigue = 0;
      p.injury = null;
    }
    refreshOffers(world, rng);

    const nextYear = season.year + 1;
    const review: SeasonReview = {
      year: season.year,
      division,
      position: table.findIndex((r) => r.clubId === me) + 1,
      points: row?.points ?? 0,
      movement: user.division < division ? 'promoted' : user.division > division ? 'relegated' : 'stayed',
      nextDivision: user.division,
      champions: movements.champions,
      promoted: movements.promoted,
      relegated: movements.relegated,
      playoffs: finals,
      honours,
      cupWinnerId: game.cup.winnerId,
      cupResult,
      topScorer: scorer,
    };

    game.season = createSeason(world, rng, nextYear);
    game.cup = createCup(world, rng, nextYear);
    game.playoffs = null;
    game.review = review;
    game.phase = 'summer';
    game.date = summerWeeks(nextYear)[0] as string;
    processTransferWeek(world, game.date, rng);
    game.lineup = repairLineup(world, me, game.lineup);
    return review;
  });
}

/** The dates the close season moves through, a week at a time. */
export const summerDates = (game: Game): string[] => summerWeeks(game.season.year);

/** True on the last week of the close season, when the next step is the new season itself. */
export function isLastSummerWeek(game: Game): boolean {
  const weeks = summerDates(game);
  return game.phase === 'summer' && game.date >= (weeks[weeks.length - 1] as string);
}

/**
 * Moves the close season on a week: the transfer market and offers move with it. In the last week this starts the new
 * season instead, on its opening day. Returns true if the new season has begun.
 */
export function advanceSummer(game: Game): boolean {
  if (game.phase !== 'summer') throw new Error('It is not the close season');
  const { world, season } = game;
  return withRng(game, (rng) => {
    if (isLastSummerWeek(game)) {
      game.phase = 'season';
      game.date = matchdayDate(season.year, 0);
      game.review = null;
      processSummerWeek(world);
      processTransferWeek(world, game.date, rng);
      return true;
    }
    game.date = addDays(game.date, 7);
    processSummerWeek(world);
    processTransferWeek(world, game.date, rng);
    game.lineup = repairLineup(world, world.userClubId, game.lineup);
    return false;
  });
}
