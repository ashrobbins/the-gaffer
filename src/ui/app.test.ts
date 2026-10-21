// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createGame } from '../game';
import { memoryStorage, type GameStorage } from '../storage';
import { App, NAV } from './app';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

let root: HTMLElement;
let storage: GameStorage;

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector('#app') as HTMLElement;
  storage = memoryStorage();
});

async function boot(): Promise<App> {
  const app = new App(root, { storage, random: () => 0.123 });
  await app.start();
  return app;
}

const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel) as T;
const type = (sel: string, value: string): void => {
  const input = q<HTMLInputElement>(sel);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const click = async (sel: string): Promise<void> => {
  q(sel).click();
  await tick();
};
const navLabels = (): string[] => [...root.querySelectorAll('.nav button')].map((b) => b.textContent ?? '');

async function createDefaultClub(app: App): Promise<void> {
  await click('#create-club');
  expect(app.current).not.toBeNull();
}

describe('starting a new game', () => {
  it('shows only the New Game screen, with no navigation and no club details in the header', async () => {
    const app = await boot();
    expect(app.currentScreen).toBe('new-game');
    expect(q('#new-game')).not.toBeNull();
    expect(root.querySelector('.nav')).toBeNull();
    expect(root.querySelector('.meta')).toBeNull();
    expect(root.querySelector('.logo')!.textContent).toBe('THE GAFFER');
  });

  it('starts the form with the default names and a kit already chosen', async () => {
    await boot();
    expect(q<HTMLInputElement>('#club-name').value).toBe('New Club FC');
    expect(q<HTMLInputElement>('#stadium-name').value).toBe('The Recreation Ground');
    expect(q('#preview-name').textContent).toBe('NEW CLUB FC');
    expect(q('#preview-stadium').textContent).toBe('The Recreation Ground');
    expect(root.querySelectorAll('.kit')).toHaveLength(4);
    expect(root.querySelector('.kit[aria-pressed="true"]')!.getAttribute('data-style')).toBe('stripes');
  });

  it('offers four shirt styles, twelve colours for each of the two colours, and a custom picker', async () => {
    await boot();
    expect([...root.querySelectorAll('.kit')].map((b) => b.getAttribute('data-style'))).toEqual(['plain', 'hoops', 'stripes', 'sleeves']);
    expect(root.querySelectorAll('#primary .sw')).toHaveLength(12);
    expect(root.querySelectorAll('#secondary .sw')).toHaveLength(12);
    expect(root.querySelectorAll('input[type="color"]')).toHaveLength(2);
  });

  it('updates the live preview as the names are typed, without redrawing the inputs', async () => {
    await boot();
    const input = q<HTMLInputElement>('#club-name');
    type('#club-name', 'Marlowe Mariners');
    type('#stadium-name', 'Harbour Road');
    expect(q('#preview-name').textContent).toBe('MARLOWE MARINERS');
    expect(q('#preview-stadium').textContent).toBe('Harbour Road');
    expect(q<HTMLInputElement>('#club-name')).toBe(input);
  });

  it('changes the preview shirt when a style or colour is chosen', async () => {
    await boot();
    const before = q('#preview-shirt').innerHTML;
    await click('.kit[data-style="hoops"]');
    const hoops = q('#preview-shirt').innerHTML;
    expect(hoops).not.toBe(before);
    expect(root.querySelector('.kit[aria-pressed="true"]')!.getAttribute('data-style')).toBe('hoops');
    await click('#primary .sw[data-value="#1f5fd8"]');
    expect(q('#preview-shirt').innerHTML).toContain('#1f5fd8');
    expect(q('#primary .sw[data-value="#1f5fd8"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('takes a custom colour from the picker', async () => {
    await boot();
    const picker = q<HTMLInputElement>('#secondary .sw-in');
    picker.value = '#00ff88';
    picker.dispatchEvent(new Event('input', { bubbles: true }));
    expect(q('#preview-shirt').innerHTML).toContain('#00ff88');
  });

  it('will not create a club with an empty name or stadium, and says why', async () => {
    const app = await boot();
    type('#club-name', '   ');
    expect(q<HTMLButtonElement>('#create-club').disabled).toBe(true);
    expect(q('#new-game-error').textContent).toMatch(/name/);
    await click('#create-club');
    expect(app.current).toBeNull();
    type('#club-name', 'Ok FC');
    type('#stadium-name', '');
    expect(q('#new-game-error').textContent).toMatch(/stadium/);
    expect(q<HTMLButtonElement>('#create-club').disabled).toBe(true);
    type('#stadium-name', 'Ok Park');
    expect(q<HTMLButtonElement>('#create-club').disabled).toBe(false);
    expect(q('#new-game-error').textContent).toBe('');
  });

  it('will not create a club whose two kit colours are the same', async () => {
    await boot();
    await click('#primary .sw[data-value="#161616"]');
    expect(q('#new-game-error').textContent).toMatch(/different colours/);
    expect(q<HTMLButtonElement>('#create-club').disabled).toBe(true);
    await click('#primary .sw[data-value="#d32f2f"]');
    expect(q<HTMLButtonElement>('#create-club').disabled).toBe(false);
  });
});

describe('creating the club', () => {
  it('removes the New Game screen, shows the normal navigation, and lands on HQ', async () => {
    const app = await boot();
    await createDefaultClub(app);
    expect(app.currentScreen).toBe('hq');
    expect(root.querySelector('#new-game')).toBeNull();
    expect(navLabels()).toEqual(['HQ', 'Team', 'Season', 'Transfers', 'Club']);
    expect(root.querySelector('.nav [aria-current="true"]')!.textContent).toBe('HQ');
  });

  it('never has a New Game or Match Day item in the navigation', async () => {
    const app = await boot();
    await createDefaultClub(app);
    for (const label of navLabels()) {
      expect(label).not.toMatch(/new game/i);
      expect(label).not.toMatch(/match/i);
    }
    expect(NAV.map(([id]) => id)).not.toContain('match');
  });

  it('builds the world with the details that were chosen', async () => {
    const app = await boot();
    type('#club-name', 'Marlowe Mariners');
    type('#stadium-name', 'Harbour Road');
    await click('.kit[data-style="sleeves"]');
    await click('#primary .sw[data-value="#1f5fd8"]');
    await click('#secondary .sw[data-value="#f2f2f2"]');
    await click('#create-club');
    const club = app.current!.world.clubs[app.current!.world.userClubId]!;
    expect(club.name).toBe('Marlowe Mariners');
    expect(club.stadium.name).toBe('Harbour Road');
    expect(club.kit).toEqual({ style: 'sleeves', primary: '#1f5fd8', secondary: '#f2f2f2' });
    expect(club.division).toBe(3);
  });

  it('trims stray spaces from the names', async () => {
    const app = await boot();
    type('#club-name', '  Padded Town  ');
    await click('#create-club');
    expect(app.current!.world.clubs[app.current!.world.userClubId]!.name).toBe('Padded Town');
  });

  it('shows the club in the header: crest, name, week and cash', async () => {
    const app = await boot();
    await createDefaultClub(app);
    const meta = q('.meta').textContent!;
    expect(meta).toContain('New Club FC');
    expect(meta).toContain('WK 1/38');
    expect(meta).toContain('£86,400');
    expect(q('.meta svg')).not.toBeNull();
  });

  it('saves the new game straight away', async () => {
    const app = await boot();
    await createDefaultClub(app);
    expect(await storage.load()).toEqual(app.current);
  });

  it('creates the club when Enter is pressed in a name box', async () => {
    const app = await boot();
    q<HTMLInputElement>('#club-name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick();
    expect(app.current).not.toBeNull();
  });
});

describe('coming back to a saved game', () => {
  it('goes straight to HQ with the navigation, skipping the New Game screen', async () => {
    await storage.save(createGame({ name: 'Saved FC', stadiumName: 'Saved Park', kit: { style: 'plain', primary: '#43b84a', secondary: '#f2f2f2' } }, 9));
    const app = await boot();
    expect(app.currentScreen).toBe('hq');
    expect(root.querySelector('#new-game')).toBeNull();
    expect(q('.meta').textContent).toContain('Saved FC');
    expect(navLabels()).toHaveLength(5);
  });

  it('shows the New Game screen when the storage cannot be read', async () => {
    const broken: GameStorage = { load: () => Promise.reject(new Error('nope')), save: async () => undefined, clear: async () => undefined };
    const app = new App(root, { storage: broken });
    await app.start();
    expect(app.currentScreen).toBe('new-game');
    expect(root.querySelector('.foot')!.textContent).toMatch(/would not let the game be saved/);
  });

  it('warns if the game could not be saved, but carries on', async () => {
    const failing: GameStorage = { load: async () => null, save: () => Promise.reject(new Error('full')), clear: async () => undefined };
    const app = new App(root, { storage: failing, random: () => 0.5 });
    await app.start();
    await click('#create-club');
    expect(app.current).not.toBeNull();
    expect(root.querySelector('.foot')!.textContent).toMatch(/lost when you close/);
  });
});

describe('the screens', () => {
  it('has an HQ with the next fixture, standing and money, using real data', async () => {
    const app = await boot();
    await createDefaultClub(app);
    const text = q('#screen').textContent!;
    expect(text).toContain('Next fixture');
    expect(text).toContain('Matchday 1');
    expect(text).toContain('Sat 22 Aug');
    expect(text).toContain('Division Four');
    expect(text).toContain('Day one');
    expect(text).toContain('Played0 of 38');
    expect(text).toContain('£86,400');
    expect(root.querySelectorAll('#screen svg.px').length).toBeGreaterThanOrEqual(2);
    const opponent = app.current!.season.fixtures.find((f) => f.round === 0 && (f.homeId === app.current!.world.userClubId || f.awayId === app.current!.world.userClubId))!;
    const other = app.current!.world.clubs[opponent.homeId === app.current!.world.userClubId ? opponent.awayId : opponent.homeId]!;
    expect(text).toContain(other.name);
  });

  it('lists the next league matches under Coming up', async () => {
    const app = await boot();
    await createDefaultClub(app);
    expect(root.querySelectorAll('.cu').length).toBeGreaterThanOrEqual(2);
  });

  it('switches between the five screens from the navigation', async () => {
    const app = await boot();
    await createDefaultClub(app);
    for (const [id, label] of NAV) {
      await click(`[data-nav="${id}"]`);
      expect(app.currentScreen).toBe(id);
      expect(root.querySelector('.nav [aria-current="true"]')!.textContent).toBe(label);
    }
  });

  it('reaches Match day only through the Go to match button on HQ, and can come back', async () => {
    const app = await boot();
    await createDefaultClub(app);
    await click('[data-act="go-match"]');
    expect(app.currentScreen).toBe('match');
    expect(q('#screen').textContent).toContain('Match day');
    expect(root.querySelector('.nav [aria-current="true"]')).toBeNull();
    expect(navLabels()).toEqual(['HQ', 'Team', 'Season', 'Transfers', 'Club']);
    await click('[data-act="back-to-hq"]');
    expect(app.currentScreen).toBe('hq');
  });

  it('leaves Match day when any navigation item is used', async () => {
    const app = await boot();
    await createDefaultClub(app);
    await click('[data-act="go-match"]');
    await click('[data-nav="team"]');
    expect(app.currentScreen).toBe('team');
  });
});

describe('resetting the game', () => {
  async function toClub(): Promise<App> {
    const app = await boot();
    await createDefaultClub(app);
    await click('[data-nav="club"]');
    return app;
  }

  it('is a quiet option at the very bottom of the Club page, not a big button', async () => {
    await toClub();
    const reset = q<HTMLButtonElement>('[data-act="reset"]');
    expect(reset.classList.contains('subtle')).toBe(true);
    expect(reset.classList.contains('btn')).toBe(false);
    const content = [...q('#screen').children];
    expect(content.at(-1)!.contains(reset)).toBe(true);
  });

  it('asks first, in the page itself, and keeps the game if cancelled', async () => {
    const app = await toClub();
    await click('[data-act="reset"]');
    expect(q('#reset-confirm').textContent).toMatch(/cannot be undone/);
    expect(await storage.load()).not.toBeNull();
    await click('[data-act="reset-cancel"]');
    expect(root.querySelector('#reset-confirm')).toBeNull();
    expect(app.current).not.toBeNull();
    expect(await storage.load()).not.toBeNull();
  });

  it('deletes every saved detail and returns to the New Game screen with no navigation', async () => {
    const app = await toClub();
    await click('[data-act="reset"]');
    await click('[data-act="reset-confirm"]');
    expect(app.current).toBeNull();
    expect(await storage.load()).toBeNull();
    expect(app.currentScreen).toBe('new-game');
    expect(root.querySelector('.nav')).toBeNull();
    expect(root.querySelector('#new-game')).not.toBeNull();
    expect(q<HTMLInputElement>('#club-name').value).toBe('New Club FC');
  });

  it('lets a new game be created straight after a reset', async () => {
    const app = await toClub();
    await click('[data-act="reset"]');
    await click('[data-act="reset-confirm"]');
    type('#club-name', 'Second Chance FC');
    await click('#create-club');
    expect(app.current!.world.clubs[app.current!.world.userClubId]!.name).toBe('Second Chance FC');
    expect(navLabels()).toHaveLength(5);
  });

  it('does not show the confirmation again when you leave and return to the Club page', async () => {
    await toClub();
    await click('[data-act="reset"]');
    await click('[data-nav="hq"]');
    await click('[data-nav="club"]');
    expect(root.querySelector('#reset-confirm')).toBeNull();
  });

  it('has the Stadium, Sponsors and Trophies tabs on the Club page', async () => {
    await toClub();
    expect([...root.querySelectorAll('[data-club-tab]')].map((b) => b.textContent)).toEqual(['Stadium', 'Sponsors', 'Trophies']);
    await click('[data-club-tab="trophies"]');
    expect(root.querySelector('[data-club-tab="trophies"]')!.getAttribute('aria-pressed')).toBe('true');
  });
});
