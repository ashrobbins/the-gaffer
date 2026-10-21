import { CUP_NAME, DIVISION_COUNT, DIVISION_NAMES, ECONOMY, ROUNDS_PER_SEASON } from './config';
import { adjustFanBase } from './finance';
import { champion, zoneFor } from './league';
import { tableFor } from './season';
import type { Cup, Honour, PlayoffFinal, Season, World } from './types';

export interface SeasonMovements {
  /** Champions of each division, top division first. */
  champions: string[];
  /** For each division, the clubs leaving it for the one above. Empty for Division One. */
  promoted: string[][];
  /** For each division, the clubs leaving it for the one below. Empty for the bottom division. */
  relegated: string[][];
}

/**
 * Who goes up and who goes down once the league season and the play-off finals are over.
 * Each division above the bottom sends down its bottom three; each division below the top sends up its first
 * and second place and the winner of the play-off final between 3rd and 4th. Three clubs move each way
 * between every pair of divisions, so every division stays at 20.
 */
export function computeMovements(world: World, season: Season, playoffs: readonly PlayoffFinal[]): SeasonMovements {
  if (season.round < ROUNDS_PER_SEASON) throw new Error('The league season is not finished');
  const champions: string[] = [];
  const promoted: string[][] = [];
  const relegated: string[][] = [];

  for (let division = 0; division < DIVISION_COUNT; division++) {
    const table = tableFor(world, season, division);
    champions.push((table[0] as { clubId: string }).clubId);
    const up: string[] = [];
    const down: string[] = [];
    table.forEach((row, i) => {
      const zone = zoneFor(division, i + 1);
      if (zone === 'promotion') up.push(row.clubId);
      if (zone === 'relegation') down.push(row.clubId);
    });
    if (division > 0) {
      const final = playoffs.find((p) => p.division === division);
      if (!final) throw new Error(`Division ${division} has no play-off final`);
      up.push(final.winnerId);
    }
    promoted.push(up);
    relegated.push(down);
  }
  return { champions, promoted, relegated };
}

/**
 * Moves the clubs between divisions. The user's club gets an extra sponsor slot for each promotion, up to four.
 * Mutates the world.
 */
export function applyMovements(world: World, movements: SeasonMovements): void {
  const next: string[][] = world.divisions.map((ids, d) => {
    const leaving = new Set([...(movements.promoted[d] ?? []), ...(movements.relegated[d] ?? [])]);
    const stay = ids.filter((id) => !leaving.has(id));
    const arrivingFromBelow = movements.promoted[d + 1] ?? [];
    const arrivingFromAbove = movements.relegated[d - 1] ?? [];
    return [...stay, ...arrivingFromBelow, ...arrivingFromAbove];
  });

  next.forEach((ids, division) => {
    for (const id of ids) {
      const club = world.clubs[id];
      if (!club) continue;
      const wasPromoted = club.division > division;
      const wasRelegated = club.division < division;
      if (wasPromoted) adjustFanBase(club, ECONOMY.attendance.promotionGrowth);
      if (wasRelegated) adjustFanBase(club, -ECONOMY.attendance.relegationLoss);
      club.division = division;
      club.sponsorSlots = club.isUser
        ? wasPromoted
          ? Math.min(DIVISION_COUNT, club.sponsorSlots + 1)
          : club.sponsorSlots
        : DIVISION_COUNT - division;
    }
  });
  world.divisions = next;
}

/**
 * League and cup honours the user's club has just won this season. The league title counts once the
 * season is over, or as soon as it is mathematically safe. The cup counts when the final has been played.
 */
export function seasonHonours(world: World, season: Season, cup: Cup | null): Honour[] {
  const honours: Honour[] = [];
  const user = world.clubs[world.userClubId];
  if (user) {
    const champ = champion(tableFor(world, season, user.division));
    if (champ === user.id) {
      honours.push({ kind: 'league', name: `${DIVISION_NAMES[user.division]} champions`, year: season.year });
    }
  }
  if (cup && cup.winnerId === world.userClubId) {
    honours.push({ kind: 'cup', name: `${CUP_NAME} winners`, year: cup.year });
  }
  return honours;
}

/** Adds honours to the user's trophy cabinet, skipping any already recorded. Returns the ones added. */
export function recordHonours(world: World, honours: readonly Honour[]): Honour[] {
  const added: Honour[] = [];
  for (const h of honours) {
    if (!world.honours.some((x) => x.kind === h.kind && x.name === h.name && x.year === h.year)) {
      world.honours.push(h);
      added.push(h);
    }
  }
  return added;
}
