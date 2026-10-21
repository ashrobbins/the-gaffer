// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playMatchday } from '../engine/season';
import { createRng } from '../engine/rng';
import { memoryStorage } from '../storage';
import { App } from './app';

let root: HTMLElement;
let app: App;
const flush = async (): Promise<void> => void (await vi.advanceTimersByTimeAsync(0));
const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel) as T;
const all = (sel: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(sel)];
const click = async (sel: string): Promise<void> => {
  q(sel).click();
  await flush();
};
const text = (): string => q('#screen').textContent ?? '';

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
  await click('[data-nav="season"]');
});
afterEach(() => vi.useRealTimers());

describe('the Season screen', () => {
  it('opens on the league table of the user\'s division, with all 20 clubs and the user highlighted', () => {
    expect(all('[data-season-view]').map((b) => b.textContent)).toEqual(['League', 'Top scorers', 'Cup']);
    expect(all('#screen tbody tr')).toHaveLength(20);
    expect(all('#screen tbody tr.me')).toHaveLength(1);
    expect(q('[data-season-div="3"]').classList.contains('on')).toBe(true);
    expect(text()).toContain('1-2 Promoted');
  });

  it('shows another division when its button is pressed, and Division One has no promotion key', async () => {
    await click('[data-season-div="0"]');
    expect(q('[data-season-div="0"]').classList.contains('on')).toBe(true);
    expect(all('#screen tbody tr.me')).toHaveLength(0);
    expect(text()).not.toContain('Promoted');
    expect(text()).toContain('Bottom 3 relegated');
  });

  it('marks promotion, play-off and relegation places', async () => {
    expect(all('#screen tbody tr.z-promo')).toHaveLength(2);
    expect(all('#screen tbody tr.z-po')).toHaveLength(2);
    expect(all('#screen tbody tr.z-rel')).toHaveLength(0);
    await click('[data-season-div="1"]');
    expect(all('#screen tbody tr.z-rel')).toHaveLength(3);
  });

  it('updates the table when matches have been played', async () => {
    const game = app.current!;
    const rng = createRng(1);
    for (let i = 0; i < 5; i++) playMatchday(game.world, game.season, rng);
    await click('[data-season-view="scorers"]');
    await click('[data-season-view="league"]');
    expect(q('#screen tbody tr td:nth-child(4)').textContent).toBe('5');
  });

  it('lists the top scorers of a division, with the most goals first', async () => {
    const game = app.current!;
    const rng = createRng(1);
    for (let i = 0; i < 6; i++) playMatchday(game.world, game.season, rng);
    await click('[data-season-view="scorers"]');
    const goals = all('#screen tbody tr').map((r) => Number(r.children[2]!.textContent));
    expect(goals.length).toBeGreaterThan(5);
    expect([...goals].sort((a, b) => b - a)).toEqual(goals);
  });

  it('says nobody has scored before the first matchday', async () => {
    await click('[data-season-view="scorers"]');
    expect(text()).toContain('Nobody has scored yet');
  });

  it('shows the cup: the user\'s run, the next round and every tie by round', async () => {
    await click('[data-season-view="cup"]');
    expect(text()).toContain('Challenge Cup');
    expect(text()).toContain('Your cup run');
    expect(all('[data-cup-round]')).toHaveLength(7);
    expect(text()).toContain('Still in');
    await click('[data-cup-round="1"]');
    expect(q('[data-cup-round="1"]').classList.contains('on')).toBe(true);
  });

  it('shows a knocked-out club that the cup goes on without them', async () => {
    const game = app.current!;
    game.cup.rounds[0]!.played = true;
    // Make the user lose a played round-one tie.
    const other = game.world.divisions[0]![0]!;
    game.cup.rounds[1]!.ties = [
      { round: 1, homeId: game.world.userClubId, awayId: other, homeGoals: 0, awayGoals: 2, penalties: null, winnerId: other, played: true },
    ];
    game.cup.rounds[1]!.played = true;
    await click('[data-season-view="cup"]');
    expect(text()).toContain('Knocked out');
    expect(text()).toContain('beaten by');
  });
});
