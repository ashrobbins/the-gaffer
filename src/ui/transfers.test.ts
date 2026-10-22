// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshMarket } from '../engine/market';
import { createRng } from '../engine/rng';
import { FREE_AGENT } from '../engine/types';
import { memoryStorage } from '../storage';
import { App } from './app';

let root: HTMLElement;
let app: App;
const flush = async (): Promise<void> => void (await vi.advanceTimersByTimeAsync(0));
const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel) as T;
const all = <T extends HTMLElement>(sel: string): T[] => [...root.querySelectorAll<T>(sel)];
const click = async (sel: string): Promise<void> => {
  q(sel).click();
  await flush();
};
const text = (): string => q('#screen').textContent ?? '';
const sheetText = (): string => q('#sheet').textContent ?? '';
const game = () => app.current!;

/** A generator state whose first draw is low (every offer is accepted) or high (every offer is refused). */
function seedWhere(accept: boolean): number {
  for (let k = 1; ; k++) {
    const first = createRng(k).next();
    if (accept ? first < 0.5 : first > 0.985) return k;
  }
}

beforeEach(async () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector('#app') as HTMLElement;
  app = new App(root, { storage: memoryStorage(), random: () => 0.37 });
  const started = app.start();
  await flush();
  await started;
  (root.querySelector('#create-club') as HTMLElement).click();
  await flush();
});
afterEach(() => vi.useRealTimers());

async function openWindow(): Promise<void> {
  const w = game().world;
  game().date = '2027-01-09';
  // A few players without a club, so free agents can be tested.
  for (const id of w.clubs[w.divisions[0]![0]!]!.playerIds.slice(-3)) {
    w.clubs[w.divisions[0]![0]!]!.playerIds = w.clubs[w.divisions[0]![0]!]!.playerIds.filter((x) => x !== id);
    w.players[id]!.clubId = FREE_AGENT;
    w.freeAgents.push(id);
  }
  refreshMarket(w, createRng(3));
  await click('[data-nav="transfers"]');
}

describe('the Transfers screen when the window is shut', () => {
  beforeEach(async () => {
    await click('[data-nav="transfers"]');
  });

  it('says it is closed, and when it opens, but still lists the market with every Bid switched off', () => {
    expect(text()).toContain('Closed');
    expect(text()).toContain('Transfer window closed');
    expect(all('#screen [data-bid]').length).toBeGreaterThan(5);
    expect(all<HTMLButtonElement>('#screen [data-bid]').every((b) => b.disabled)).toBe(true);
  });

  it('shows the cash and squad size', () => {
    expect(text()).toContain('18 / 22');
  });

});

describe('the market when the window is open', () => {
  beforeEach(openWindow);

  it('says it is open and switches Bid on', () => {
    expect(text()).toContain('Open');
    expect(text()).toContain('Winter transfer window');
    expect(all<HTMLButtonElement>('#screen [data-bid]').some((b) => !b.disabled)).toBe(true);
  });

  it('lists the best players first and filters by position group', async () => {
    const ovr = all('#screen tbody tr').map((r) => Number(r.children[2]!.textContent));
    expect([...ovr].sort((a, b) => b - a)).toEqual(ovr);
    const total = ovr.length;
    await click('[data-tr-filter="DEF"]');
    const positions = all('#screen tbody tr').map((r) => r.children[0]!.textContent);
    expect(positions.length).toBeGreaterThan(0);
    expect(positions.length).toBeLessThan(total);
    expect(positions.every((p) => ['LB', 'CB', 'RB'].includes(p!))).toBe(true);
    await click('[data-tr-filter="ALL"]');
    expect(all('#screen tbody tr').length).toBeGreaterThan(positions.length);
  });

  it('does not list the user\'s own players', () => {
    const mine = new Set(game().world.clubs[game().world.userClubId]!.playerIds);
    const ids = all('#screen [data-bid]').map((b) => b.dataset.bid!);
    expect(ids.some((id) => mine.has(id))).toBe(false);
  });

  it('turns Bid off for everyone when the squad is full', async () => {
    const club = game().world.clubs[game().world.userClubId]!;
    const other = game().world.clubs[game().world.divisions[0]![0]!]!;
    while (club.playerIds.length < 22) {
      const id = other.playerIds.pop()!;
      game().world.players[id]!.clubId = club.id;
      club.playerIds.push(id);
    }
    await click('[data-tr-tab="sell"]');
    await click('[data-tr-tab="buy"]');
    expect(all<HTMLButtonElement>('#screen [data-bid]').every((b) => b.disabled)).toBe(true);
  });
});

describe('signing a player', () => {
  beforeEach(openWindow);
  const firstBid = (): HTMLElement => all<HTMLButtonElement>('#screen [data-bid]').find((b) => !b.disabled && b.closest('tr')!.textContent!.indexOf('Free agent') === -1)!;
  const firstFree = (): HTMLElement => all<HTMLButtonElement>('#screen [data-bid]').find((b) => !b.disabled && b.closest('tr')!.textContent!.includes('Free agent'))!;

  it('opens a sheet at the club fee step, with three offers and their odds', async () => {
    firstBid().click();
    await flush();
    expect(q('#sheet').hidden).toBe(false);
    expect(sheetText()).toContain('Sign player');
    expect(sheetText()).toContain('1 Club fee');
    expect(sheetText()).toContain('Asking price');
    expect(all('#sheet [data-neg-offer]')).toHaveLength(3);
    expect(sheetText()).toContain('Very likely');
  });

  it('goes from the fee to the wage and then the signing, and the player joins the bench', async () => {
    const button = firstBid();
    const id = button.dataset.bid!;
    const cash = game().world.clubs[game().world.userClubId]!.cash;
    button.click();
    await flush();
    game().rngState = seedWhere(true);
    await click('#sheet [data-neg-offer="high"]');
    expect(sheetText()).toContain('accepted');
    expect(sheetText()).toContain('Asking wage');
    expect(sheetText()).toContain('Fee agreed');
    game().rngState = seedWhere(true);
    await click('#sheet [data-neg-offer="high"]');
    expect(sheetText()).toContain('Deal agreed');
    expect(sheetText()).toContain('Wage bill / wk');
    await click('#sheet [data-neg-finish]');
    expect(sheetText()).toContain('has signed');
    const me = game().world.clubs[game().world.userClubId]!;
    expect(me.playerIds).toContain(id);
    expect(game().lineup.bench).toContain(id);
    expect(me.cash).toBeLessThan(cash);
    expect(game().world.players[id]!.contractGames).toBe(76);
    await click('#sheet [data-close]');
    expect(q('#sheet').hidden).toBe(true);
    expect(text()).toContain('19 / 22');
    expect(all('#screen [data-bid]').some((b) => b.dataset.bid === id)).toBe(false);
  });

  it('skips the fee for a free agent and starts with the wage', async () => {
    firstFree().click();
    await flush();
    expect(sheetText()).toContain('Asking wage');
    game().rngState = seedWhere(true);
    await click('#sheet [data-neg-offer="market"]');
    expect(sheetText()).toContain('Deal agreed');
    expect(sheetText()).toContain('Free');
  });

  it('shows a counter-offer after a refusal and lets it be accepted', async () => {
    firstBid().click();
    await flush();
    game().rngState = seedWhere(false);
    await click('#sheet [data-neg-offer="low"]');
    expect(sheetText()).toContain('rejected');
    expect(sheetText()).toContain('They would do it for');
    expect(q('#sheet [data-neg-counter]')).not.toBeNull();
    await click('#sheet [data-neg-counter]');
    expect(sheetText()).toContain('Fee agreed');
    expect(sheetText()).toContain('Asking wage');
  });

  it('ends the talks after three refusals and blocks that player for two weeks', async () => {
    const button = firstBid();
    const id = button.dataset.bid!;
    button.click();
    await flush();
    for (let i = 0; i < 3; i++) {
      game().rngState = seedWhere(false);
      await click('#sheet [data-neg-offer="low"]');
    }
    expect(sheetText()).toContain('Talks collapsed');
    expect(sheetText()).toContain('14 days');
    expect(game().world.transferBlocks[id]).toBeDefined();
    await click('#sheet [data-close]');
    const again = all<HTMLButtonElement>('#screen [data-bid]').find((b) => b.dataset.bid === id)!;
    expect(again.disabled).toBe(true);
  });

  it('will not offer more than the club can afford', async () => {
    game().world.clubs[game().world.userClubId]!.cash = 100;
    await click('[data-nav="hq"]');
    await click('[data-nav="transfers"]');
    firstBid().click();
    await flush();
    expect(all<HTMLButtonElement>('#sheet [data-neg-offer]').every((b) => b.disabled)).toBe(true);
    expect(sheetText()).toContain('Cannot afford');
  });

  it('opens the sheet at the top', async () => {
    firstBid().click();
    await flush();
    expect(q('#sheet .sh').scrollTop).toBe(0);
  });
});

describe('selling', () => {
  beforeEach(openWindow);
  const addBid = (fee = 30000): { id: string; playerId: string; buyer: string } => {
    const w = game().world;
    const me = w.clubs[w.userClubId]!;
    const playerId = me.playerIds[3]!;
    const buyer = w.divisions[3]!.find((c) => c !== me.id)!;
    w.clubs[buyer]!.cash = 5_000_000;
    w.incomingBids.push({ id: 'bid-test', playerId, buyerClubId: buyer, fee, counters: 0 });
    return { id: 'bid-test', playerId, buyer };
  };

  it('says how many offers there are, and says so when there are none', async () => {
    expect(text()).toContain('Sell (0 offers)');
    await click('[data-tr-tab="sell"]');
    expect(text()).toContain('No offers at the moment');
  });

  it('lists offers with the buyer and the fee', async () => {
    addBid();
    await click('[data-tr-tab="buy"]');
    expect(text()).toContain('Sell (1 offer)');
    await click('[data-tr-tab="sell"]');
    expect(all('#screen tbody tr')).toHaveLength(1);
    expect(text()).toContain('30,000');
  });

  it('sells the player on Accept, pays the fee and says so', async () => {
    const b = addBid();
    const me = game().world.clubs[game().world.userClubId]!;
    const cash = me.cash;
    await click('[data-tr-tab="sell"]');
    await click('[data-sale-accept="bid-test"]');
    expect(me.playerIds).not.toContain(b.playerId);
    expect(me.cash).toBe(cash + 30000);
    expect(game().world.players[b.playerId]!.clubId).toBe(b.buyer);
    expect(text()).toContain('Sold');
    expect(game().lineup.xi).not.toContain(b.playerId);
    expect(game().lineup.bench).not.toContain(b.playerId);
  });

  it('drops the offer on No', async () => {
    addBid();
    await click('[data-tr-tab="sell"]');
    await click('[data-sale-reject="bid-test"]');
    expect(game().world.incomingBids).toHaveLength(0);
    expect(text()).toContain('No offers');
  });

  it('does not let the squad drop below 16', async () => {
    addBid();
    const me = game().world.clubs[game().world.userClubId]!;
    while (me.playerIds.length > 16) {
      const id = me.playerIds.pop()!;
      game().world.players[id]!.clubId = FREE_AGENT;
      game().world.freeAgents.push(id);
    }
    game().lineup = { ...game().lineup, xi: game().lineup.xi.filter((id) => me.playerIds.includes(id)), bench: game().lineup.bench.filter((id) => me.playerIds.includes(id)) };
    await click('[data-tr-tab="sell"]');
    expect(q<HTMLButtonElement>('[data-sale-accept="bid-test"]').disabled).toBe(true);
    expect(text()).toContain('too small');
  });

  it('opens a counter-offer sheet with three asks and their odds', async () => {
    addBid();
    await click('[data-tr-tab="sell"]');
    await click('[data-sale-counter="bid-test"]');
    expect(q('#sheet').hidden).toBe(false);
    expect(sheetText()).toContain('Counter their offer');
    expect(all('#sheet [data-sale-ask]')).toHaveLength(3);
  });

  it('sells at the higher price when the club agrees to a counter', async () => {
    const b = addBid();
    const me = game().world.clubs[game().world.userClubId]!;
    const cash = me.cash;
    await click('[data-tr-tab="sell"]');
    await click('[data-sale-counter="bid-test"]');
    game().rngState = seedWhere(true);
    await click('#sheet [data-sale-ask="33000"]');
    expect(sheetText()).toContain('agreed');
    expect(me.playerIds).not.toContain(b.playerId);
    expect(me.cash).toBe(cash + 33000);
    expect(text()).toContain('Sold');
  });

  it('keeps the offer after one refused counter and drops it after a second', async () => {
    addBid();
    await click('[data-tr-tab="sell"]');
    await click('[data-sale-counter="bid-test"]');
    game().rngState = seedWhere(false);
    await click('#sheet [data-sale-ask="42000"]');
    expect(sheetText()).toContain('Their offer still stands');
    expect(game().world.incomingBids).toHaveLength(1);
    game().rngState = seedWhere(false);
    await click('#sheet [data-sale-ask="42000"]');
    expect(sheetText()).toContain('walked away');
    expect(game().world.incomingBids).toHaveLength(0);
  });
});

describe('saving', () => {
  it('keeps a signing across a reload', async () => {
    await openWindow();
    const button = all<HTMLButtonElement>('#screen [data-bid]').find((b) => !b.disabled)!;
    const id = button.dataset.bid!;
    button.click();
    await flush();
    for (let i = 0; i < 2; i++) {
      game().rngState = seedWhere(true);
      await click('#sheet [data-neg-offer="high"]');
    }
    if (!sheetText().includes('Deal agreed')) {
      game().rngState = seedWhere(true);
      await click('#sheet [data-neg-offer="high"]');
    }
    await click('#sheet [data-neg-finish]');
    const saved = await (app as unknown as { deps: { storage: { load(): Promise<{ world: { players: Record<string, { clubId: string }> } }> } } }).deps.storage.load();
    expect(saved.world.players[id]!.clubId).toBe(game().world.userClubId);
  });
});
