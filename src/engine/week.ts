import { tickContracts, type ContractReport } from './contracts';
import { processMatchdayFinances, progressBuild, type FinanceLine } from './finance';
import type { Rng } from './rng';
import { recoverBetweenMatches, rollAiInjuries } from './progression';
import type { MatchResult, Season, World } from './types';

export interface WeekReport {
  /** One line per club per match, for every club in every division. */
  finances: FinanceLine[];
  /** The user's own line, or null if the user's club did not play. */
  userFinance: FinanceLine | null;
  contracts: ContractReport;
  /** Clubs whose new seats opened this week. */
  standsOpened: string[];
  /** Computer-club players hurt this week. */
  aiInjuries: string[];
  /** Players, mostly the user's, who are fit again. */
  healed: string[];
}

/**
 * Everything that happens in the club after a league matchday has been played: money in and out, contracts run down,
 * players rest and heal, stands get built and computer clubs pick up injuries. Call once after `playMatchday` and, if
 * the user played the match themselves, after `finishMatch` and `applyMatchProgression`.
 */
export function processWeek(world: World, season: Season, results: readonly MatchResult[], rng: Rng): WeekReport {
  const finances = processMatchdayFinances(world, season, results, rng);
  const standsOpened: string[] = [];
  for (const club of Object.values(world.clubs)) if (progressBuild(club)) standsOpened.push(club.id);
  const contracts = tickContracts(world, rng);
  const aiInjuries = rollAiInjuries(world, rng);
  const healed = recoverBetweenMatches(world);
  return {
    finances,
    userFinance: finances.find((l) => l.clubId === world.userClubId) ?? null,
    contracts,
    standsOpened,
    aiInjuries,
    healed,
  };
}
