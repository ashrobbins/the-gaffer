// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../engine/rng';
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
const game = () => app.current!;
const sheet = (): string => q('#sheet').textContent ?? '';

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
  await click('[data-nav="team"]');
  await click('[data-team-tab="contracts"]');
});
afterEach(() => vi.useRealTimers());

describe('contract offers', () => {
  it('cannot be repeated after a refusal, until two weeks have passed', async () => {
    const row = q<HTMLElement>('tr[data-c]');
    const id = row.dataset.c!;
    game().world.players[id]!.mood = 1;
    row.click();
    await flush();
    // A generator state whose first draw is high, so the offer is refused.
    for (let k = 1; ; k++) if (createRng(k).next() > 0.99) { game().rngState = k; break; }
    await click('#sheet [data-offer]');
    expect(sheet()).toContain('turned the offer down');
    expect(sheet()).toContain('No more offers until Sat 5 Sept');
    expect(q<HTMLButtonElement>('#sheet [data-offer]').disabled).toBe(true);
    expect(game().world.contractBlocks![id]).toBe('2026-09-05');

    // Closing and opening the sheet again does not help.
    await click('#sheet [data-close]');
    q<HTMLElement>(`tr[data-c="${id}"]`).click();
    await flush();
    expect(sheet()).toContain('He will not talk about a new deal yet');
    expect(q<HTMLButtonElement>('#sheet [data-offer]').disabled).toBe(true);

    // Two weeks on he will talk again.
    game().date = '2026-09-05';
    await click('#sheet [data-close]');
    q<HTMLElement>(`tr[data-c="${id}"]`).click();
    await flush();
    expect(q<HTMLButtonElement>('#sheet [data-offer]').disabled).toBe(false);
  });

  it('can still be made to other players', async () => {
    const rows = [...root.querySelectorAll<HTMLElement>('tr[data-c]')];
    const first = rows[0]!.dataset.c!;
    game().world.contractBlocks = { [first]: '2026-09-05' };
    rows[1]!.click();
    await flush();
    expect(q<HTMLButtonElement>('#sheet [data-offer]').disabled).toBe(false);
  });
});
