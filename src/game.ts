import { matchdayDate } from './engine/calendar';
import { createCup } from './engine/cup';
import { createLineup, type Lineup } from './engine/lineup';
import { createRng, type Rng } from './engine/rng';
import { createSeason } from './engine/season';
import type { Cup, NewClubOptions, Season, World } from './engine/types';
import { generateWorld } from './engine/worldgen';

/** Bump this when the shape of a saved game changes, so an old save is not loaded by mistake. */
export const GAME_VERSION = 2;
export const START_YEAR = 2026;

/** Everything that makes up one game. It is plain data, so it saves and loads as JSON. */
export interface Game {
  version: number;
  world: World;
  season: Season;
  cup: Cup;
  /** The team picked for the next match. */
  lineup: Lineup;
  /** Today's date in the game, as YYYY-MM-DD. */
  date: string;
  /** Where the random-number generator has got to, so a loaded game carries on exactly. */
  rngState: number;
  createdAt: string;
}

/** Starts a new game: a fresh world with the user's club in the bottom division, on the opening day of the season. */
export function createGame(club: NewClubOptions, seed: number, now: Date = new Date()): Game {
  const rng = createRng(seed);
  const world = generateWorld(seed, club);
  const season = createSeason(world, rng, START_YEAR);
  const cup = createCup(world, rng, START_YEAR);
  return {
    version: GAME_VERSION,
    world,
    season,
    cup,
    lineup: createLineup(world, world.userClubId),
    date: matchdayDate(START_YEAR, 0),
    rngState: rng.state(),
    createdAt: now.toISOString(),
  };
}

/** Runs something that needs random numbers and remembers where the generator got to, so the game stays repeatable. */
export function withRng<T>(game: Game, run: (rng: Rng) => T): T {
  const rng = createRng(game.rngState);
  const result = run(rng);
  game.rngState = rng.state();
  return result;
}
