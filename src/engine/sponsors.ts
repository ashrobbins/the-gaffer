import { ECONOMY, ROUNDS_PER_SEASON } from './config';
import { SPONSOR_NAMES } from './data/sponsors';
import { buildTable } from './league';
import type { Rng } from './rng';
import type { Achievement, Club, Season, Sponsor, SponsorOffer, World } from './types';

const roundTo = (n: number, step: number): number => Math.round(n / step) * step;

/** Income per match from a sponsor deal. Better divisions pay more. */
export const sponsorBase = (division: number): number => ECONOMY.sponsorPerSlot[division] ?? 3500;

/** A club's league results this season, in order, as goals for and against. */
function clubMatches(season: Season, clubId: string): { gf: number; ga: number }[] {
  return season.results
    .filter((r) => r.homeId === clubId || r.awayId === clubId)
    .sort((a, b) => a.round - b.round)
    .map((r) => (r.homeId === clubId ? { gf: r.homeGoals, ga: r.awayGoals } : { gf: r.awayGoals, ga: r.homeGoals }));
}

export interface OfferStatus {
  current: number;
  target: number;
  unlocked: boolean;
}

/** How far a club is towards a sponsor's condition this season. */
export function achievementProgress(world: World, season: Season, clubId: string, requirement: Achievement): OfferStatus {
  const club = world.clubs[clubId];
  if (!club) throw new Error(`Unknown club ${clubId}`);
  const matches = clubMatches(season, clubId);
  let current = 0;
  switch (requirement.kind) {
    case 'win-streak': {
      let run = 0;
      for (const m of matches) {
        run = m.gf > m.ga ? run + 1 : 0;
        current = Math.max(current, run);
      }
      break;
    }
    case 'points':
      current = matches.reduce((pts, m) => pts + (m.gf > m.ga ? 3 : m.gf === m.ga ? 1 : 0), 0);
      break;
    case 'clean-sheets':
      current = matches.filter((m) => m.ga === 0).length;
      break;
    case 'top-three': {
      if (season.round >= ROUNDS_PER_SEASON) {
        const ids = world.divisions[club.division] ?? [];
        const table = buildTable(ids, season.results.filter((r) => r.division === club.division));
        current = table.findIndex((r) => r.clubId === clubId) < 3 ? 1 : 0;
      }
      break;
    }
  }
  return { current, target: requirement.target, unlocked: current >= requirement.target };
}

/** Four sponsor offers for a division, each asking for something different. Names already in use are avoided. */
export function generateOffers(division: number, rng: Rng, taken: ReadonlySet<string> = new Set()): SponsorOffer[] {
  const base = sponsorBase(division);
  const names = rng.shuffle(SPONSOR_NAMES.filter((n) => !taken.has(n)));
  const specs: { requirement: Achievement; factor: number }[] = [
    { requirement: { kind: 'win-streak', target: 5 }, factor: 0.7 },
    { requirement: { kind: 'points', target: 20 }, factor: 1.1 },
    { requirement: { kind: 'clean-sheets', target: 5 }, factor: 1.5 },
    { requirement: { kind: 'top-three', target: 1 }, factor: 2.5 },
  ];
  return specs.map((spec, i) => ({
    id: `d${division}-${i}-${names[i]}`,
    name: names[i] as string,
    perMatch: roundTo(base * spec.factor * (0.9 + rng.next() * 0.2), 100),
    requirement: spec.requirement,
  }));
}

/** All the sponsors a club has deals with, as names. */
export const sponsorNames = (club: Club): Set<string> => new Set(club.sponsors.map((s) => s.name));

/** What a sponsor offer needs and whether the user's club has done it. */
export function offerStatus(world: World, season: Season, offer: SponsorOffer): OfferStatus {
  return achievementProgress(world, season, world.userClubId, offer.requirement);
}

/** Signs a sponsor for the user's club. It needs the condition met and a free sponsor slot. */
export function signSponsor(world: World, season: Season, offerId: string): Sponsor {
  const club = world.clubs[world.userClubId];
  if (!club) throw new Error('No user club');
  const offer = world.sponsorOffers.find((o) => o.id === offerId);
  if (!offer) throw new Error('No such sponsor offer');
  if (!offerStatus(world, season, offer).unlocked) throw new Error('That sponsor has not been earned yet');
  if (club.sponsors.length >= club.sponsorSlots) throw new Error('No free sponsor slot');
  const deal: Sponsor = { name: offer.name, perMatch: offer.perMatch };
  club.sponsors.push(deal);
  world.sponsorOffers = world.sponsorOffers.filter((o) => o.id !== offerId);
  return deal;
}

/** New offers suited to the division the user's club is now in, replacing the ones not yet taken up. */
export function refreshOffers(world: World, rng: Rng): void {
  const club = world.clubs[world.userClubId];
  if (!club) return;
  world.sponsorOffers = generateOffers(club.division, rng, sponsorNames(club));
}
