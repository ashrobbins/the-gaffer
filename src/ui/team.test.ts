// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { askingWage } from '../engine/contracts';
import { memoryStorage } from '../storage';
import { App } from './app';
import { pitchLayout } from './pitch';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
let root: HTMLElement;
let app: App;

beforeEach(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector('#app') as HTMLElement;
  app = new App(root, { storage: memoryStorage(), random: () => 0.42 });
  await app.start();
  (root.querySelector('#create-club') as HTMLElement).click();
  await tick();
  await click('[data-nav="team"]');
});

const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel) as T;
const all = (sel: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(sel)];
async function click(sel: string): Promise<void> {
  q(sel).click();
  await tick();
}
const game = () => app.current!;
const sheetOpen = (): boolean => !q('#sheet').hidden;

function pointer(target: EventTarget, type: string, x: number, y: number): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
}

/** Presses on one element, drags to another, and lets go there. */
async function drag(from: HTMLElement, to: HTMLElement): Promise<void> {
  (document as unknown as { elementFromPoint: () => Element }).elementFromPoint = () => to;
  pointer(from, 'pointerdown', 10, 10);
  pointer(document, 'pointermove', 60, 60);
  pointer(document, 'pointerup', 60, 60);
  await tick();
}

describe('the Team screen', () => {
  it('has Tactics, Squad and Contracts tabs, starting on Tactics', () => {
    expect(all('[data-team-tab]').map((b) => b.textContent)).toEqual(['Tactics', 'Squad', 'Contracts']);
    expect(q('[data-team-tab="tactics"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows eleven players on the pitch and the rest on the bench, with the formation picker', () => {
    expect(all('.pl')).toHaveLength(11);
    expect(all('.bn')).toHaveLength(7);
    expect(all('[data-formation]').map((b) => b.textContent)).toEqual(['4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '5-3-2']);
    expect(q('[data-formation="4-4-2"]').classList.contains('on')).toBe(true);
  });

  it('gives the goalkeeper a different shirt from the outfield players', () => {
    const keeper = q('.pl[data-slot="0"] svg').innerHTML;
    const defender = q('.pl[data-slot="1"] svg').innerHTML;
    expect(keeper).not.toBe(defender);
    expect(keeper).toContain('#2fa84f');
  });

  it('puts a captain badge on exactly one player', () => {
    expect(all('.pl .cap')).toHaveLength(1);
  });

  it('spreads the rows of each formation evenly from the keeper to the attack', () => {
    for (const f of ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '5-3-2'] as const) {
      const spots = pitchLayout(f);
      expect(spots).toHaveLength(11);
      const rows = [...new Set(spots.map((s) => s.y))].sort((a, b) => b - a);
      const gaps = rows.slice(1).map((y, i) => Math.round((rows[i]! - y) * 10) / 10);
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.3);
      expect(rows[0]).toBe(88);
      expect(rows.at(-1)).toBe(13);
    }
  });

  it('changes formation, keeps the same players, and saves it', async () => {
    const before = new Set(game().lineup.xi);
    await click('[data-formation="3-5-2"]');
    expect(game().lineup.formation).toBe('3-5-2');
    expect(new Set(game().lineup.xi)).toEqual(before);
    expect(q('[data-formation="3-5-2"]').classList.contains('on')).toBe(true);
    expect(all('.pl')).toHaveLength(11);
  });
});

describe('dragging players', () => {
  it('swaps two players on the pitch when one is dropped on the other', async () => {
    const [a, b] = [game().lineup.xi[2]!, game().lineup.xi[9]!];
    await drag(q('.pl[data-slot="2"]'), q('.pl[data-slot="9"]'));
    expect(game().lineup.xi[2]).toBe(b);
    expect(game().lineup.xi[9]).toBe(a);
  });

  it('brings a bench player on when dropped on a player, and sends that player to the bench', async () => {
    const off = game().lineup.xi[6]!;
    const on = game().lineup.bench[2]!;
    await drag(q('.bn[data-bn="2"]'), q('.pl[data-slot="6"]'));
    expect(game().lineup.xi[6]).toBe(on);
    expect(game().lineup.bench[2]).toBe(off);
  });

  it('works the other way round: dragging a pitch player onto a bench player', async () => {
    const off = game().lineup.xi[7]!;
    const on = game().lineup.bench[0]!;
    await drag(q('.pl[data-slot="7"]'), q('.bn[data-bn="0"]'));
    expect(game().lineup.xi[7]).toBe(on);
    expect(game().lineup.bench[0]).toBe(off);
  });

  it('does nothing when dropped on empty space', async () => {
    const before = [...game().lineup.xi];
    (document as unknown as { elementFromPoint: () => Element }).elementFromPoint = () => document.body;
    pointer(q('.pl[data-slot="3"]'), 'pointerdown', 10, 10);
    pointer(document, 'pointermove', 80, 80);
    pointer(document, 'pointerup', 80, 80);
    await tick();
    expect(game().lineup.xi).toEqual(before);
    expect(root.querySelector('.ghostwrap')).toBeNull();
  });

  it('shows a ghost of the player while dragging, and removes it when let go', () => {
    (document as unknown as { elementFromPoint: () => Element }).elementFromPoint = () => document.body;
    pointer(q('.pl[data-slot="3"]'), 'pointerdown', 10, 10);
    pointer(document, 'pointermove', 80, 80);
    expect(document.querySelector('.ghostwrap')).not.toBeNull();
    expect(q('.pl[data-slot="3"]').classList.contains('dragging')).toBe(true);
    pointer(document, 'pointerup', 80, 80);
    expect(document.querySelector('.ghostwrap')).toBeNull();
  });

  it('cannot drag an injured player on from the bench', async () => {
    const g = game();
    g.world.players[g.lineup.bench[1]!]!.injury = { weeks: 3, kind: 'Ankle' };
    await click('[data-team-tab="squad"]');
    await click('[data-team-tab="tactics"]');
    const card = q('.bn.off');
    expect(card.hasAttribute('disabled')).toBe(true);
    expect(card.hasAttribute('data-bn')).toBe(false);
    expect(card.textContent).toContain('OUT 3W');
  });

  it('saves the new lineup', async () => {
    await drag(q('.pl[data-slot="2"]'), q('.pl[data-slot="3"]'));
    const saved = await (app as unknown as { deps: { storage: { load(): Promise<{ lineup: unknown }> } } }).deps.storage.load();
    expect(saved.lineup).toEqual(game().lineup);
  });
});

describe('the player sheet', () => {
  it('opens when a player is tapped, showing his details, and closes with X', async () => {
    pointer(q('.pl[data-slot="9"]'), 'pointerdown', 5, 5);
    pointer(document, 'pointerup', 5, 5);
    await tick();
    expect(sheetOpen()).toBe(true);
    const p = game().world.players[game().lineup.xi[9]!]!;
    expect(q('#sheet').textContent).toContain(p.lastName);
    expect(q('#sheet').textContent).toContain('Position fit');
    expect(q('#sheet').textContent).toContain('Season');
    await click('#sheet [data-close]');
    expect(sheetOpen()).toBe(false);
  });

  it('closes with Escape or by tapping the backdrop', async () => {
    await click('[data-team-tab="squad"]');
    await click('tr[data-p]');
    expect(sheetOpen()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(sheetOpen()).toBe(false);
    await click('tr[data-p]');
    await click('#sheet .sh-bg');
    expect(sheetOpen()).toBe(false);
  });

  it('opens a bench player the same way, and says he is on the bench', async () => {
    pointer(q('.bn[data-bn="1"]'), 'pointerdown', 5, 5);
    pointer(document, 'pointerup', 5, 5);
    await tick();
    expect(q('#sheet').textContent).toContain('Bench');
  });

  it('makes a player captain and shows the badge', async () => {
    const target = game().lineup.xi.find((id) => id !== game().lineup.captainId)!;
    const slot = game().lineup.xi.indexOf(target);
    pointer(q(`.pl[data-slot="${slot}"]`), 'pointerdown', 5, 5);
    pointer(document, 'pointerup', 5, 5);
    await tick();
    await click('#sheet [data-cap]');
    expect(game().lineup.captainId).toBe(target);
    expect(q(`.pl[data-slot="${slot}"] .cap`)).not.toBeNull();
    expect(all('.pl .cap')).toHaveLength(1);
    expect(q<HTMLButtonElement>('#sheet [data-cap]').disabled).toBe(true);
  });

  it('opens from the squad list too, and always opens scrolled to the top', async () => {
    await click('[data-team-tab="squad"]');
    await click('tr[data-p]');
    q('.sh').scrollTop = 300;
    await click('#sheet [data-close]');
    await click('tr[data-p]');
    expect(q('.sh').scrollTop).toBe(0);
  });
});

describe('the squad and contracts tabs', () => {
  it('lists the whole squad with position, rating, fatigue, form, appearances, goals and role', async () => {
    await click('[data-team-tab="squad"]');
    expect(all('tr[data-p]')).toHaveLength(18);
    const head = q('thead').textContent!;
    for (const h of ['Pos', 'Name', 'OVR', 'Fatigue', 'Form', 'Gls', 'Role']) expect(head).toContain(h);
    expect(q('#screen').textContent).toContain('Bench');
  });

  it('shows an injured player as injured in the squad list', async () => {
    const g = game();
    g.world.players[g.lineup.bench[0]!]!.injury = { weeks: 4, kind: 'Knee' };
    await click('[data-team-tab="squad"]');
    expect(q('#screen').textContent).toContain('Injured 4w');
  });

  it('lists contracts soonest first, marking those nearly up', async () => {
    const g = game();
    g.world.players[g.lineup.xi[4]!]!.contractGames = 3;
    await click('[data-team-tab="contracts"]');
    const rows = all('tr[data-c]');
    expect(rows).toHaveLength(18);
    expect(rows[0]!.textContent).toContain('3 !');
    const games = rows.map((r) => Number(r.children[2]!.textContent!.replace(/\D/g, '')));
    expect([...games].sort((a, b) => a - b)).toEqual(games);
  });
});

describe('the contract sheet', () => {
  async function openContract(): Promise<string> {
    await click('[data-team-tab="contracts"]');
    const row = q('tr[data-c]');
    const id = row.dataset.c!;
    row.click();
    await tick();
    return id;
  }

  it('shows the player, his wage, a slider, the three lengths, the odds and what it does to the books', async () => {
    await openContract();
    const text = q('#sheet').textContent!;
    expect(text).toContain('Offer new deal');
    expect(text).toContain('Chance they sign');
    expect(text).toContain('Can we afford it?');
    expect(all('#sheet [data-len]').map((b) => b.dataset.len)).toEqual(['19', '38', '76']);
    expect(q('#wage')).not.toBeNull();
  });

  it('updates the odds and the books as the slider moves, without redrawing the slider', async () => {
    await openContract();
    const slider = q<HTMLInputElement>('#wage');
    const before = q('#contract-dynamic').textContent;
    slider.value = String(Number(slider.max));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(q('#contract-dynamic').textContent).not.toBe(before);
    expect(q('#wage')).toBe(slider);
    expect(q('#wage-label').textContent).toContain('£');
  });

  it('changes the odds when a different length is chosen', async () => {
    await openContract();
    const odds = (): string => q('#contract-dynamic .big').textContent!;
    await click('#sheet [data-len="76"]');
    const long = odds();
    await click('#sheet [data-len="19"]');
    expect(odds()).not.toBe(long);
  });

  it('signs a happy player to a good offer: wage and contract change, and the sheet says so', async () => {
    const id = await openContract();
    const p = game().world.players[id]!;
    p.mood = 5;
    p.formRating = 5;
    const slider = q<HTMLInputElement>('#wage');
    slider.value = String(Number(slider.max));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await click('#sheet [data-len="76"]');
    await click('#sheet [data-offer]');
    expect(q('#sheet').textContent).toContain('Agreed');
    expect(p.contractGames).toBe(76);
    expect(p.wage).toBe(Number(slider.max));
    expect(game().world.clubs[game().world.userClubId]!.playerIds).toContain(id);
  });

  it('is refused by an unhappy player offered a pay cut, and says so, leaving the contract alone', async () => {
    const id = await openContract();
    const p = game().world.players[id]!;
    p.mood = 1;
    p.formRating = 1;
    const wage = p.wage;
    const games = p.contractGames;
    const slider = q<HTMLInputElement>('#wage');
    slider.value = slider.min;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await click('#sheet [data-offer]');
    expect(q('#sheet').textContent).toContain('turned the offer down');
    expect(p.wage).toBe(wage);
    expect(p.contractGames).toBe(games);
  });

  it('starts the offer at what the player expects', async () => {
    const id = await openContract();
    const p = game().world.players[id]!;
    expect(Number(q<HTMLInputElement>('#wage').value)).toBe(Math.round(askingWage(p) / 50) * 50);
  });

  it('asks before letting a player go, and only then releases him', async () => {
    const id = await openContract();
    await click('#sheet [data-release]');
    expect(q('#sheet').textContent).toContain('cannot be undone');
    expect(game().world.clubs[game().world.userClubId]!.playerIds).toContain(id);
    await click('#sheet [data-release-cancel]');
    expect(q('#sheet').textContent).toContain('Offer new deal');
    await click('#sheet [data-release]');
    await click('#sheet [data-release-confirm]');
    expect(sheetOpen()).toBe(false);
    expect(game().world.clubs[game().world.userClubId]!.playerIds).not.toContain(id);
    expect(game().lineup.xi).not.toContain(id);
    expect(game().lineup.bench).not.toContain(id);
    expect(all('tr[data-c]')).toHaveLength(17);
  });

  it('is reached from the player sheet with View contract', async () => {
    await click('[data-team-tab="squad"]');
    await click('tr[data-p]');
    await click('#sheet [data-contract]');
    expect(q('#sheet').textContent).toContain('Offer new deal');
  });
});
