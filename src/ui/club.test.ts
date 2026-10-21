// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { progressBuild } from '../engine/finance';
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
const game = () => app.current!;
const me = () => game().world.clubs[game().world.userClubId]!;

/** Goes to another screen and back, so the Club page is drawn again from the game's data. */
async function refresh(): Promise<void> {
  await click('[data-nav="hq"]');
  await click('[data-nav="club"]');
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
  await click('[data-nav="club"]');
});
afterEach(() => vi.useRealTimers());

describe('the Stadium tab', () => {
  it('shows the ground, the crowd and the gate', () => {
    expect(text()).toContain(me().stadium.name);
    expect(text()).toContain('Capacity');
    expect(text()).toContain('Average crowd');
    expect(text()).toContain('Gate income, home games');
    expect(text()).toContain('£0 gate');
    expect(q('canvas.art')).not.toBeNull();
  });

  it('lists four stands to build with their cost', () => {
    expect(all('[data-build]')).toHaveLength(4);
    expect(text()).toContain('£60,000');
    expect(text()).toContain('+500');
  });

  it('asks for a second press before spending the money', async () => {
    const cash = me().cash;
    await click('[data-build="0"]');
    expect(q('[data-build="0"]').textContent).toContain('Confirm');
    expect(me().cash).toBe(cash);
    expect(me().building).toBeNull();
  });

  it('cancels the confirmation when anything else is pressed', async () => {
    await click('[data-build="0"]');
    await click('[data-club-tab="sponsors"]');
    await click('[data-club-tab="stadium"]');
    expect(q('[data-build="0"]').textContent).not.toContain('Confirm');
  });

  it('builds the stand: pays now, shows progress and blocks a second build', async () => {
    me().cash = 200000;
    await refresh();
    await click('[data-build="0"]');
    await click('[data-build="0"]');
    expect(me().cash).toBe(140000);
    expect(me().building).toEqual({ seats: 500, matchdaysLeft: 6 });
    expect(text()).toContain('Building 500 seats');
    expect(text()).toContain('6 matches');
    expect(all<HTMLButtonElement>('[data-build]').every((b) => b.disabled)).toBe(true);
  });

  it('opens the seats after six matchdays', async () => {
    me().cash = 200000;
    const before = me().stadium.capacity;
    await refresh();
    await click('[data-build="1"]');
    await click('[data-build="1"]');
    for (let i = 0; i < 6; i++) progressBuild(me());
    await refresh();
    expect(me().stadium.capacity).toBe(before + 500);
    expect(text()).not.toContain('Building 500');
  });

  it('switches a stand off when the club cannot pay for it', async () => {
    me().cash = 1000;
    await refresh();
    expect(all<HTMLButtonElement>('[data-build]').every((b) => b.disabled)).toBe(true);
  });

  it('saves a build in progress', async () => {
    me().cash = 200000;
    await refresh();
    await click('[data-build="2"]');
    await click('[data-build="2"]');
    const saved = await (app as unknown as { deps: { storage: { load(): Promise<{ world: { clubs: Record<string, { building: unknown }> } }> } } }).deps.storage.load();
    expect(saved.world.clubs[game().world.userClubId]!.building).not.toBeNull();
  });
});

describe('the Sponsors tab', () => {
  beforeEach(async () => {
    await click('[data-club-tab="sponsors"]');
  });

  it('shows four slots: one filled, the rest locked until promotion', () => {
    expect(all('#screen .grid.g4 > .box')).toHaveLength(4);
    expect(all('#screen .grid.g4 > .box.lock')).toHaveLength(3);
    expect(text()).toContain(me().sponsors[0]!.name);
    expect(text()).toContain('Unlocks on promotion to Division Three');
    expect(text()).toContain('Unlocks on promotion to Division One');
  });

  it('lists the offers with what they ask for, and progress towards each', () => {
    expect(text()).toContain('Sponsor offers');
    expect(text()).toContain('Win 5 league games in a row');
    expect(text()).toContain('Finish top three');
    expect(text()).toContain('0/5');
  });

  it('cannot sign an earned offer without a free slot', async () => {
    game().world.sponsorOffers[0]!.requirement = { kind: 'points', target: 0 };
    await click('[data-club-tab="stadium"]');
    await click('[data-club-tab="sponsors"]');
    const button = q<HTMLButtonElement>('[data-sponsor-sign]');
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('needs free slot');
  });

  it('signs an earned offer into a free slot, and the income goes up', async () => {
    const offer = game().world.sponsorOffers[0]!;
    offer.requirement = { kind: 'points', target: 0 };
    me().sponsorSlots = 2;
    const income = me().sponsors.reduce((s, d) => s + d.perMatch, 0);
    await click('[data-club-tab="stadium"]');
    await click('[data-club-tab="sponsors"]');
    expect(text()).toContain('Free slot');
    await click('[data-sponsor-sign]');
    expect(me().sponsors).toHaveLength(2);
    expect(me().sponsors[1]!.name).toBe(offer.name);
    expect(me().sponsors.reduce((s, d) => s + d.perMatch, 0)).toBe(income + offer.perMatch);
    expect(game().world.sponsorOffers.some((o) => o.id === offer.id)).toBe(false);
    expect(all('#screen .grid.g4 > .box.lock')).toHaveLength(2);
  });
});

describe('the Trophies tab', () => {
  beforeEach(async () => {
    await click('[data-club-tab="trophies"]');
  });

  it('is an empty cabinet to begin with', () => {
    expect(text()).toContain('Nothing here yet');
    expect(all('.cab .slot')).toHaveLength(6);
    expect(all('.cab .slot.empty')).toHaveLength(6);
  });

  it('puts every title and cup on the shelf with its season, and counts them', async () => {
    game().world.honours.push(
      { kind: 'league', name: 'Division Four champions', year: 2026 },
      { kind: 'cup', name: 'Challenge Cup winners', year: 2027 },
    );
    await click('[data-club-tab="stadium"]');
    await click('[data-club-tab="trophies"]');
    expect(all('.cab .slot:not(.empty)')).toHaveLength(2);
    expect(text()).toContain('Division Four champions');
    expect(text()).toContain('2026/27');
    expect(text()).toContain('Challenge Cup winners');
    expect(text()).toContain('2027/28');
    expect(text()).toMatch(/League titles\s*1/);
    expect(text()).toMatch(/Cup wins\s*1/);
  });

  it('adds a shelf when there are more than six trophies', async () => {
    for (let y = 0; y < 7; y++) game().world.honours.push({ kind: 'league', name: 'Division Four champions', year: 2026 + y });
    await click('[data-club-tab="stadium"]');
    await click('[data-club-tab="trophies"]');
    expect(all('.cab .slot')).toHaveLength(9);
  });
});

describe('Reset game', () => {
  it('is still at the bottom of every tab', async () => {
    for (const tab of ['stadium', 'sponsors', 'trophies']) {
      await click(`[data-club-tab="${tab}"]`);
      expect(q('[data-act="reset"]')).not.toBeNull();
    }
  });
});
