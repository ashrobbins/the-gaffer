import type { World } from './types';

/** The weekly wages of every player at a club. Handy for checking nothing has gone missing. */
export const totalWages = (world: World): number =>
  Object.values(world.clubs).reduce((sum, c) => sum + c.playerIds.reduce((s, id) => s + (world.players[id]?.wage ?? 0), 0), 0);
