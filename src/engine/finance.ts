import { ECONOMY } from './config';
import { buildTable } from './league';
import type { Rng } from './rng';
import { clubForm } from './season';
import { formScore } from './sim';
import type { Club, MatchResult, Season, World } from './types';

const roundTo = (n: number, step: number): number => Math.round(n / step) * step;

/** Wages paid every week: every player's weekly wage added up. */
export function wageBill(world: World, clubId: string): number {
  const club = world.clubs[clubId];
  if (!club) throw new Error(`Unknown club ${clubId}`);
  return club.playerIds.reduce((sum, id) => sum + (world.players[id]?.wage ?? 0), 0);
}

/** Money from sponsors for one match, home or away. */
export const sponsorIncome = (club: Club): number => club.sponsors.reduce((sum, s) => sum + s.perMatch, 0);

/** Weekly upkeep of the stadium, bigger for a bigger ground. */
export const runningCosts = (club: Club): number => Math.round(club.stadium.capacity * ECONOMY.runningCostPerSeat);

/**
 * How the crowd compares with the club's usual one: more when it is winning and high in the table, fewer when it
 * is not, plus a little chance. 1 means an average turnout. `position` is 1 for top of the table.
 */
export function demandFactor(form: string, position: number, clubsInDivision: number, noise = 0): number {
  const a = ECONOMY.attendance;
  const half = (clubsInDivision - 1) / 2;
  const positionEffect = half === 0 ? 0 : ((clubsInDivision + 1) / 2 - position) / half;
  return Math.max(a.minShare, 1 + (formScore(form) / 2.5) * a.formSwing + positionEffect * a.positionSwing + noise);
}

/** The crowd at a home match: the club's fan base, swung by form and position, never more than the ground holds. */
export function attendance(club: Club, form: string, position: number, clubsInDivision: number, rng?: Rng): number {
  const noise = rng ? rng.normal(0, ECONOMY.attendance.noise) : 0;
  return Math.min(club.stadium.capacity, Math.round(club.fanBase * demandFactor(form, position, clubsInDivision, noise)));
}

/** Grows or shrinks a club's fan base by a share, for success or failure on the pitch. */
export function adjustFanBase(club: Club, share: number): void {
  club.fanBase = Math.max(500, Math.round(club.fanBase * (1 + share)));
}

/** At the end of a season, fans follow results: a top-three finish brings more of them, a bottom-three finish loses some. */
export function fanBaseAfterSeason(world: World, season: Season): void {
  world.divisions.forEach((ids, d) => {
    const table = buildTable(ids, season.results.filter((r) => r.division === d));
    table.forEach((row, i) => {
      const club = world.clubs[row.clubId];
      if (!club) return;
      if (i < 3) adjustFanBase(club, ECONOMY.attendance.topThreeGrowth);
      else if (i >= table.length - 3) adjustFanBase(club, -ECONOMY.attendance.bottomThreeLoss);
    });
  });
}

export interface FinanceLine {
  clubId: string;
  /** Crowd at a home match, or null for an away match. */
  attendance: number | null;
  gate: number;
  sponsors: number;
  wages: number;
  running: number;
  net: number;
  cashAfter: number;
}

/**
 * Money in and out for a typical week, so the user can tell whether the books balance: the average of a home
 * and an away match, against the weekly wage bill and running costs.
 */
export function weeklyProjection(world: World, clubId: string, extraWages = 0): {
  homeNet: number;
  awayNet: number;
  averageIncome: number;
  outgoings: number;
  surplus: number;
} {
  const club = world.clubs[clubId];
  if (!club) throw new Error(`Unknown club ${clubId}`);
  const gate = Math.min(club.stadium.capacity, club.fanBase) * club.ticketPrice;
  const sponsors = sponsorIncome(club);
  const outgoings = wageBill(world, clubId) + extraWages + runningCosts(club);
  const averageIncome = (gate + 2 * sponsors) / 2;
  return {
    homeNet: gate + sponsors - outgoings,
    awayNet: sponsors - outgoings,
    averageIncome,
    outgoings,
    surplus: averageIncome - outgoings,
  };
}

/**
 * Pays for a matchday in the league: every club banks its sponsors, home clubs bank the gate, and every club pays its
 * wages and running costs for the week. Returns one line for each club.
 */
export function processMatchdayFinances(world: World, season: Season, results: readonly MatchResult[], rng: Rng): FinanceLine[] {
  const lines: FinanceLine[] = [];
  const divisions = new Map<number, string[]>(world.divisions.map((ids, d) => [d, ids]));
  const positions = new Map<string, number>();
  divisions.forEach((ids, d) => {
    buildTable(ids, season.results.filter((r) => r.division === d)).forEach((row, i) => positions.set(row.clubId, i + 1));
  });

  for (const r of results) {
    const home = world.clubs[r.homeId];
    const away = world.clubs[r.awayId];
    if (!home || !away) continue;
    const size = world.divisions[r.division]?.length ?? 20;
    const crowd = attendance(home, clubForm(season, home.id), positions.get(home.id) ?? 10, size, rng);
    lines.push(settle(world, home, crowd));
    lines.push(settle(world, away, null));
  }
  return lines;
}

/** Pays one club's money for one match. */
function settle(world: World, club: Club, crowd: number | null): FinanceLine {
  const gate = crowd === null ? 0 : crowd * club.ticketPrice;
  const sponsors = sponsorIncome(club);
  const wages = wageBill(world, club.id);
  const running = runningCosts(club);
  const net = gate + sponsors - wages - running;
  club.cash += net;
  return { clubId: club.id, attendance: crowd, gate, sponsors, wages, running, net, cashAfter: club.cash };
}

/** Pays for a cup tie. The home club takes the gate, both clubs take their sponsors. Wages are paid weekly in the league, not again here. */
export function processCupFinances(world: World, season: Season, ties: readonly { homeId: string; awayId: string }[], rng: Rng): FinanceLine[] {
  const lines: FinanceLine[] = [];
  for (const t of ties) {
    const home = world.clubs[t.homeId];
    const away = world.clubs[t.awayId];
    if (!home || !away) continue;
    const size = world.divisions[home.division]?.length ?? 20;
    const table = buildTable(world.divisions[home.division] ?? [], season.results.filter((r) => r.division === home.division));
    const position = table.findIndex((r) => r.clubId === home.id) + 1 || 10;
    const crowd = attendance(home, clubForm(season, home.id), position, size, rng);
    for (const [club, c] of [[home, crowd], [away, null]] as const) {
      const gate = c === null ? 0 : c * club.ticketPrice;
      const sponsors = sponsorIncome(club);
      club.cash += gate + sponsors;
      lines.push({ clubId: club.id, attendance: c, gate, sponsors, wages: 0, running: 0, net: gate + sponsors, cashAfter: club.cash });
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------------------------
// Stadium
// ---------------------------------------------------------------------------------------------------------------

export const buildCost = (seats: number): number => seats * ECONOMY.costPerSeat;

/**
 * Starts building extra seats. The money is spent now, the seats arrive after six matchdays, and until then the
 * ground keeps its old capacity. Only one build at a time.
 */
export function startStadiumBuild(world: World, clubId: string, seats: number): number {
  const club = world.clubs[clubId];
  if (!club) throw new Error(`Unknown club ${clubId}`);
  if (club.building) throw new Error('A stand is already being built');
  if (!Number.isInteger(seats) || seats < ECONOMY.minBuildSeats || seats > ECONOMY.maxBuildSeats) {
    throw new Error(`Build between ${ECONOMY.minBuildSeats} and ${ECONOMY.maxBuildSeats} seats`);
  }
  const cost = buildCost(seats);
  if (club.cash < cost) throw new Error('Not enough money');
  club.cash -= cost;
  club.building = { seats, matchdaysLeft: ECONOMY.buildMatchdays };
  return cost;
}

/** Moves a build on by a matchday. Returns true on the matchday the new seats open. */
export function progressBuild(club: Club): boolean {
  if (!club.building) return false;
  club.building.matchdaysLeft--;
  if (club.building.matchdaysLeft > 0) return false;
  club.stadium.capacity += club.building.seats;
  club.building = null;
  return true;
}

/**
 * The extra gate money per home match that `seats` more seats would bring at an average crowd. Only the part of
 * the fan base that does not already fit in the ground brings money, so a ground that is not full earns nothing extra.
 */
export function extraGatePerHomeMatch(club: Club, seats: number): number {
  const before = Math.min(club.stadium.capacity, club.fanBase);
  const after = Math.min(club.stadium.capacity + seats, club.fanBase);
  return roundTo((after - before) * club.ticketPrice, 10);
}
