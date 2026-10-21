import {
  CLUBS_PER_DIVISION,
  DIVISION_BASE_ABILITY,
  DIVISION_BASE_CAPACITY,
  DIVISION_BASE_CASH,
  DIVISION_COUNT,
  DIVISION_TICKET_PRICE,
  ECONOMY,
  SQUAD_TEMPLATE,
  USER_START_CASH,
  USER_START_DIVISION,
} from './config';
import { KIT_COLOURS, KIT_STYLES } from './data/palette';
import {
  CLUB_PLACES,
  CLUB_SUFFIXES,
  FIRST_NAMES,
  GROUND_ENDINGS,
  GROUND_NAMES,
  LAST_NAMES,
} from './data/names';
import { generateOffers, sponsorBase } from './sponsors';
import { SPONSOR_NAMES } from './data/sponsors';
import { createRng, type Rng } from './rng';
import type { Club, Kit, NewClubOptions, Player, Sponsor, Stats, World } from './types';

export const DEFAULT_NEW_CLUB: NewClubOptions = {
  name: 'New Club FC',
  stadiumName: 'The Recreation Ground',
  kit: { style: 'stripes', primary: '#d32f2f', secondary: '#161616' },
};

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const roundTo = (n: number, step: number): number => Math.round(n / step) * step;

export const emptyStats = (): Stats => ({ starts: 0, subAppearances: 0, goals: 0, yellowCards: 0, redCards: 0 });

/** Weekly wage from rating: about 700 at 61, 1,300 at 70 and 2,400 at 78. */
export function wageForAbility(ability: number): number {
  return Math.max(300, roundTo(1300 * Math.exp((ability - 70) / 14), 50));
}

/** Market value from wage and age. Younger players are worth more. */
export function valueFor(wage: number, age: number): number {
  const ageFactor = age <= 23 ? 1.3 : age <= 29 ? 1 : age <= 32 ? 0.7 : 0.45;
  return Math.max(500, roundTo(wage * 16 * ageFactor, 100));
}

function ageAdjustment(age: number): number {
  if (age <= 20) return -3;
  if (age <= 22) return -1;
  if (age <= 30) return 0;
  if (age <= 33) return -1;
  return -3;
}

interface NameBook {
  used: Set<string>;
}

function uniqueName(rng: Rng, book: NameBook): { firstName: string; lastName: string } {
  for (let attempt = 0; attempt < 200; attempt++) {
    const firstName = rng.pick(FIRST_NAMES);
    const lastName = rng.pick(LAST_NAMES);
    const key = `${firstName} ${lastName}`;
    if (!book.used.has(key)) {
      book.used.add(key);
      return { firstName, lastName };
    }
  }
  throw new Error('Ran out of unique player names');
}

function createSquad(
  rng: Rng,
  book: NameBook,
  clubId: string,
  division: number,
  clubOffset: number,
  nextId: () => string,
): Player[] {
  const base = DIVISION_BASE_ABILITY[division] ?? 68;
  return SQUAD_TEMPLATE.map((slot) => {
    const age = clamp(Math.round(rng.normal(26, 4.5)), 17, 36);
    const ability = clamp(
      Math.round(base + clubOffset + slot.adjust + ageAdjustment(age) + rng.normal(0, 3.5)),
      38,
      95,
    );
    const potential =
      age <= 23 ? ability + rng.int(3, 12) : age <= 27 ? ability + rng.int(0, 5) : ability;
    const wage = wageForAbility(ability);
    const happiness = rng.pick([2, 3, 3, 3, 4, 4, 5]);
    const { firstName, lastName } = uniqueName(rng, book);
    return {
      id: nextId(),
      clubId,
      firstName,
      lastName,
      age,
      position: slot.position,
      ability,
      potential: Math.min(potential, 99),
      wage,
      contractGames: rng.int(8, 76),
      happiness,
      form: 3,
      fatigue: 0,
      injury: null,
      value: valueFor(wage, age),
      seasonStats: emptyStats(),
      careerStats: emptyStats(),
      formRating: 3,
      mood: happiness,
      playShare: 0.6,
      growth: 0,
    };
  });
}

function randomKit(rng: Rng): Kit {
  const primary = rng.pick(KIT_COLOURS);
  let secondary = rng.pick(KIT_COLOURS);
  while (secondary === primary) secondary = rng.pick(KIT_COLOURS);
  return { style: rng.pick(KIT_STYLES), primary, secondary };
}

/**
 * Builds a whole world: four divisions of twenty fictional clubs, each with a squad of eighteen.
 * The same seed and options always give the same world.
 */
export function generateWorld(seed: number, userClub: NewClubOptions = DEFAULT_NEW_CLUB): World {
  const rng = createRng(seed);
  const book: NameBook = { used: new Set() };
  const clubs: Record<string, Club> = {};
  const players: Record<string, Player> = {};
  const divisions: string[][] = Array.from({ length: DIVISION_COUNT }, () => []);

  let playerCount = 0;
  const nextPlayerId = (): string => `p${String(++playerCount).padStart(4, '0')}`;

  const aiClubCount = DIVISION_COUNT * CLUBS_PER_DIVISION - 1;
  const places = rng.shuffle(CLUB_PLACES).slice(0, aiClubCount);
  if (places.length < aiClubCount) throw new Error('Not enough club place names');
  const groundNames = rng.shuffle(GROUND_NAMES);
  const usedGrounds = new Set<string>([userClub.stadiumName]);

  const pickGround = (place: string): string => {
    if (rng.chance(0.3)) {
      const standalone = groundNames.find((g) => !usedGrounds.has(g));
      if (standalone) {
        usedGrounds.add(standalone);
        return standalone;
      }
    }
    let name = `${place} ${rng.pick(GROUND_ENDINGS)}`;
    while (usedGrounds.has(name)) name = `${place} ${rng.pick(GROUND_ENDINGS)}`;
    usedGrounds.add(name);
    return name;
  };

  const aiSponsors = (division: number, count: number): Sponsor[] =>
    rng.shuffle(SPONSOR_NAMES.slice(1)).slice(0, count).map((name) => ({ name, perMatch: roundTo(sponsorBase(division) * (0.8 + rng.next() * 0.4), 100) }));

  const addClub = (club: Club, offset: number): void => {
    clubs[club.id] = club;
    divisions[club.division]?.push(club.id);
    const squad = createSquad(rng, book, club.id, club.division, offset, nextPlayerId);
    for (const p of squad) {
      players[p.id] = p;
      club.playerIds.push(p.id);
    }
  };

  let clubCount = 0;
  const nextClubId = (): string => `c${String(++clubCount).padStart(2, '0')}`;
  let placeIndex = 0;

  for (let division = 0; division < DIVISION_COUNT; division++) {
    const isUserDivision = division === USER_START_DIVISION;
    const aiHere = isUserDivision ? CLUBS_PER_DIVISION - 1 : CLUBS_PER_DIVISION;
    const userSlot = isUserDivision ? rng.int(0, CLUBS_PER_DIVISION - 1) : -1;
    let aiMade = 0;

    for (let slot = 0; slot < CLUBS_PER_DIVISION; slot++) {
      if (slot === userSlot) {
        addClub(
          {
            id: nextClubId(),
            name: userClub.name,
            stadium: { name: userClub.stadiumName, capacity: DIVISION_BASE_CAPACITY[division] ?? 4200 },
            kit: userClub.kit,
            division,
            cash: USER_START_CASH,
            ticketPrice: DIVISION_TICKET_PRICE[division] ?? 11,
            sponsorSlots: 1,
            playerIds: [],
            isUser: true,
            sponsors: [{ name: SPONSOR_NAMES[0] as string, perMatch: sponsorBase(division) }],
            building: null,
            fanBase: Math.round((DIVISION_BASE_CAPACITY[division] ?? 4200) * ECONOMY.attendance.baseFill),
          },
          0,
        );
        continue;
      }
      if (aiMade >= aiHere) break;
      const place = places[placeIndex++] as string;
      const capacity = roundTo((DIVISION_BASE_CAPACITY[division] ?? 4200) * rng.int(80, 125) / 100, 100);
      const cash = roundTo((DIVISION_BASE_CASH[division] ?? 60000) * rng.int(70, 130) / 100, 100);
      addClub(
        {
          id: nextClubId(),
          name: `${place} ${rng.pick(CLUB_SUFFIXES)}`,
          stadium: { name: pickGround(place), capacity },
          kit: randomKit(rng),
          division,
          cash,
          ticketPrice: DIVISION_TICKET_PRICE[division] ?? 11,
          sponsorSlots: DIVISION_COUNT - division,
          playerIds: [],
          isUser: false,
          sponsors: aiSponsors(division, DIVISION_COUNT - division),
          building: null,
          fanBase: Math.round(capacity * ECONOMY.attendance.baseFill),
        },
        clamp(rng.normal(0, 2.2), -5, 5),
      );
      aiMade++;
    }
  }

  const user = Object.values(clubs).find((c) => c.isUser);
  if (!user) throw new Error('User club was not created');

  return {
    seed,
    clubs,
    players,
    divisions,
    userClubId: user.id,
    honours: [],
    sponsorOffers: generateOffers(USER_START_DIVISION, rng, new Set([SPONSOR_NAMES[0] as string])),
    freeAgents: [],
  };
}
