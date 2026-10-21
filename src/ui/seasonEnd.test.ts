// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playToEnd } from '../engine/match';
import { completeMatch, nextMatch, startSession } from '../play';
import { memoryStorage } from '../storage';
import { App } from './app';

let root: HTMLElement;
let app: App;
const flush = async (): Promise<void> => void (await vi.advanceTimersByTimeAsync(0));
const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel) as T;
const click = async (sel: string): Promise<void> => {
  q(sel).click();
  await flush();
};
const text = (): string => q('#screen').textContent ?? '';
const game = () => app.current!;

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
  // Play the whole season through the engine, then look at the screens.
  for (let i = 0; i < 120 && nextMatch(game()); i++) {
    const s = startSession(game())!;
    playToEnd(game().world, s.state, s.rng);
    completeMatch(game(), s);
  }
  await click('[data-nav="team"]');
  await click('[data-nav="hq"]');
});
afterEach(() => vi.useRealTimers());

describe('the end of the season on HQ', () => {
  it('says the season is over and offers to finish it', () => {
    expect(text()).toContain('Season over');
    expect(q('[data-act="close-season"]')).not.toBeNull();
    expect(q('[data-act="go-match"]')).toBeNull();
    expect(q('.meta').textContent).toContain('WK 38/38');
  });

  it('shows the review of the season, then the close season with Advance a week', async () => {
    await click('[data-act="close-season"]');
    expect(text()).toContain('review');
    expect(text()).toContain('Champions and movements');
    expect(text()).toContain('Play-off finals');
    expect(text()).toMatch(/PROMOTED|RELEGATED|Staying in/);
    expect(text()).toContain('Close season');
    expect(q('.meta').textContent).toContain('CLOSE SEASON');
    expect(q('[data-act="advance-week"]').textContent).toBe('Advance a week');
    expect(q('[data-act="go-match"]')).toBeNull();
    expect(text()).toContain('Mon 24 May');
  });

  it('moves a week at a time, and the last week starts the new season', async () => {
    await click('[data-act="close-season"]');
    for (let i = 0; i < 12; i++) await click('[data-act="advance-week"]');
    expect(text()).toContain('Mon 16 Aug');
    expect(q('[data-act="start-season"]').textContent).toBe('Start the season');
    await click('[data-act="start-season"]');
    expect(text()).not.toContain('review');
    expect(text()).toContain('Matchday 1');
    expect(text()).toContain('Sat 21 Aug');
    expect(q('.meta').textContent).toContain('WK 1/38');
    expect(q('[data-act="go-match"]')).not.toBeNull();
  });

  it('puts the same controls on the Transfers screen, with the window open', async () => {
    await click('[data-act="close-season"]');
    await click('[data-nav="transfers"]');
    expect(text()).toContain('Summer transfer window');
    expect(text()).toContain('Open');
    expect(q('[data-act="advance-week"]')).not.toBeNull();
    const before = game().date;
    await click('[data-act="advance-week"]');
    expect(game().date > before).toBe(true);
    expect(text()).toContain('Open');
    expect(all('[data-bid]').some((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('plays the next season on the season screen with a clean table and new dates', async () => {
    await click('[data-act="close-season"]');
    for (let i = 0; i < 13; i++) await click('[data-act="advance-week"], [data-act="start-season"]');
    await click('[data-nav="season"]');
    expect(q('#screen tbody tr td:nth-child(4)').textContent).toBe('0');
    await click('[data-season-view="cup"]');
    expect(text()).toContain('Preliminary round');
  });

  it('saves the close season', async () => {
    await click('[data-act="close-season"]');
    const saved = await (app as unknown as { deps: { storage: { load(): Promise<{ phase: string; review: unknown }> } } }).deps.storage.load();
    expect(saved.phase).toBe('summer');
    expect(saved.review).not.toBeNull();
  });
});

const all = (sel: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(sel)];
