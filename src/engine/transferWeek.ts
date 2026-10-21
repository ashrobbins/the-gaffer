import { windowAt } from './calendar';
import { refreshMarket, rotateMarket, simulateAiTransfers } from './market';
import type { Rng } from './rng';
import { expireBids, generateBids } from './selling';
import type { TransferBid, World } from './types';

export interface TransferWeekReport {
  open: boolean;
  /** Transfers between computer clubs this week. */
  aiTransfers: number;
  newBids: TransferBid[];
  /** Offers that fell through, for instance because the window shut. */
  expiredBids: TransferBid[];
}

/**
 * The transfer side of a week. While the window is open the market changes, computer clubs trade, and they make offers
 * for the user's players. While it is shut the market can still be looked at, but nothing moves and every
 * offer lapses. Call once a week, with the date of that week.
 */
export function processTransferWeek(world: World, date: string, rng: Rng): TransferWeekReport {
  const window = windowAt(date);
  if (world.market.length === 0) refreshMarket(world, rng);

  if (!window.open) {
    return { open: false, aiTransfers: 0, newBids: [], expiredBids: expireBids(world, date) };
  }
  if (date === window.opens) refreshMarket(world, rng);
  else rotateMarket(world, rng);
  const aiTransfers = simulateAiTransfers(world, rng);
  const expiredBids = expireBids(world, date);
  const newBids = generateBids(world, date, rng);
  return { open: true, aiTransfers, newBids, expiredBids };
}
