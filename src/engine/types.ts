export type Position =
  | 'GK'
  | 'LB'
  | 'CB'
  | 'RB'
  | 'DM'
  | 'CM'
  | 'LM'
  | 'RM'
  | 'AM'
  | 'LW'
  | 'RW'
  | 'ST';

export type KitStyle = 'plain' | 'hoops' | 'stripes' | 'sleeves';

export interface Kit {
  style: KitStyle;
  /** Hex colour, for example "#d32f2f". */
  primary: string;
  secondary: string;
}

export interface Stats {
  starts: number;
  subAppearances: number;
  goals: number;
  yellowCards: number;
  redCards: number;
}

export interface Injury {
  weeks: number;
  kind: string;
}

export interface Player {
  id: string;
  clubId: string;
  firstName: string;
  lastName: string;
  age: number;
  position: Position;
  /** Overall rating, 1 to 99. */
  ability: number;
  /** The ceiling this player can grow towards. */
  potential: number;
  /** Weekly wage in pounds. */
  wage: number;
  /** Matches left on the current contract. */
  contractGames: number;
  /** 1 (unhappy) to 5 (delighted). */
  happiness: number;
  /** 1 (poor) to 5 (excellent), from recent results. */
  form: number;
  /** 0 (fresh) to 100 (exhausted). */
  fatigue: number;
  injury: Injury | null;
  /** Market value in pounds. */
  value: number;
  seasonStats: Stats;
  careerStats: Stats;
  /** Recent form as a number from 1 to 5, built from match performances. `form` is this, rounded. */
  formRating: number;
  /** Mood as a number from 1 to 5, built from form and playing time. `happiness` is this, rounded. */
  mood: number;
  /** Share of recent matches he has played, 0 to 1. A player who expects to start and does not play gets unhappy. */
  playShare: number;
  /** Progress towards the next rating point, 0 to 99. */
  growth: number;
}

export interface Stadium {
  name: string;
  capacity: number;
}

export interface Club {
  id: string;
  name: string;
  stadium: Stadium;
  kit: Kit;
  /** 0 is the top division, 3 is the bottom one. */
  division: number;
  cash: number;
  ticketPrice: number;
  sponsorSlots: number;
  playerIds: string[];
  isUser: boolean;
  /** How many people would normally turn up to a home match. A bigger ground only earns more if this is bigger too. */
  fanBase: number;
  /** Sponsorship deals. There is room for `sponsorSlots` of them. */
  sponsors: Sponsor[];
  /** A stand being built, or null. */
  building: StadiumBuild | null;
}

export interface Sponsor {
  name: string;
  /** Paid for every match, home or away. */
  perMatch: number;
}

export interface StadiumBuild {
  seats: number;
  matchdaysLeft: number;
}

export type Achievement =
  | { kind: 'win-streak'; target: number }
  | { kind: 'points'; target: number }
  | { kind: 'clean-sheets'; target: number }
  | { kind: 'top-three'; target: 1 };

/** A sponsor who will sign once the club has done something. */
export interface SponsorOffer {
  id: string;
  name: string;
  perMatch: number;
  requirement: Achievement;
}

export interface World {
  seed: number;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  /** Club ids in each division, index 0 being the top division. */
  divisions: string[][];
  userClubId: string;
  /** League titles and cups the user's club has won. */
  honours: Honour[];
  sponsorOffers: SponsorOffer[];
  /** Players computer clubs are willing to sell, and free agents, for the user to bid for. */
  market: MarketEntry[];
  /** Offers from computer clubs for the user's players. */
  incomingBids: TransferBid[];
  /** Players the user cannot negotiate with again until the date given, after talks collapsed. */
  transferBlocks: Record<string, string>;
  /** Players without a club. Their `clubId` is `FREE_AGENT`. */
  freeAgents: string[];
}

export interface MarketEntry {
  playerId: string;
  /** The club selling him, or null for a free agent. */
  sellerClubId: string | null;
  /** What the club wants. Zero for a free agent. */
  askingFee: number;
}

export interface TransferBid {
  id: string;
  playerId: string;
  buyerClubId: string;
  fee: number;
  /** How many times the user has countered without success. */
  counters: number;
}

export const FREE_AGENT = 'free';

export interface NewClubOptions {
  name: string;
  stadiumName: string;
  kit: Kit;
}

export interface Fixture {
  division: number;
  /** Matchday index, 0 to 37. */
  round: number;
  homeId: string;
  awayId: string;
}

export interface MatchResult {
  division: number;
  round: number;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
}

export interface Season {
  year: number;
  /** How many matchdays have been played, which is also the index of the next one. */
  round: number;
  fixtures: Fixture[];
  results: MatchResult[];
}

export interface StandingRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface KnockoutResult {
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  /** Shoot-out score when the match was level after normal play. */
  penalties: [home: number, away: number] | null;
  winnerId: string;
}

export interface CupTie extends KnockoutResult {
  round: number;
  /** False until the tie has been played; the result fields are placeholders until then. */
  played: boolean;
}

export interface CupRound {
  name: string;
  /** Empty until the round has been drawn. */
  ties: CupTie[];
  played: boolean;
}

export interface Cup {
  year: number;
  rounds: CupRound[];
  /** Clubs that skipped the preliminary round. */
  byes: string[];
  winnerId: string | null;
}

export interface PlayoffFinal extends KnockoutResult {
  division: number;
}

export interface Honour {
  kind: 'league' | 'cup';
  /** For example "Division Four champions" or "Challenge Cup winners". */
  name: string;
  year: number;
}
