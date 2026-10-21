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
}

export interface World {
  seed: number;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  /** Club ids in each division, index 0 being the top division. */
  divisions: string[][];
  userClubId: string;
}

export interface NewClubOptions {
  name: string;
  stadiumName: string;
  kit: Kit;
}
