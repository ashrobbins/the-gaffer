// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MATCH } from '../engine/config';
import { memoryStorage } from '../storage';
import { App } from './app';
import { FLASH_MS, MINUTE_MS, type MatchController } from './match';

let root: HTMLElement;
let app: App;

const flush = async (): Promise<void> => void (await vi.advanceTimersByTimeAsync(0));
const advance = async (ms: number): Promise<void> => void (await vi.advanceTimersByTimeAsync(ms));

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

afterEach(() => {
  vi.useRealTimers();
});

const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel) as T;
const all = (sel: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(sel)];
const game = () => app.current!;
const ctl = (): MatchController => (app as unknown as { match: MatchController }).match;
async function click(sel: string): Promise<void> {
  q(sel).click();
  await flush();
}
const sheetOpen = (): boolean => !q('#sheet').hidden;
const text = (): string => q('#screen').textContent ?? '';

function pointer(target: EventTarget, type: string, x: number, y: number): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
}
async function drag(from: HTMLElement, to: HTMLElement): Promise<void> {
  (document as unknown as { elementFromPoint: () => Element }).elementFromPoint = () => to;
  pointer(from, 'pointerdown', 10, 10);
  pointer(document, 'pointermove', 60, 60);
  pointer(document, 'pointerup', 60, 60);
  await flush();
}

/** Plays on, resuming at half time and stopping at the plan sheet, until the condition holds. */
async function playUntil(done: () => boolean, maxMs = 600_000): Promise<void> {
  for (let t = 0; t < maxMs && !done(); t += 100) {
    await advance(100);
    if (ctl().phase === 'live' && ctl().planOpen && !done()) {
      const forced = !!q('#forced-notice');
      if (forced) {
        const slot = ctl().session.state.sides[ctl().userSide].forcedSub;
        const idx = ctl().session.state.sides[ctl().userSide].slots.indexOf(slot);
        const bench = all('#sheet .bn[data-bn]')[0]!;
        await drag(bench, q(`#sheet .pl[data-slot="${idx}"]`));
      }
      await click('#sheet [data-act="resume"]');
    }
  }
}

async function toPreMatch(): Promise<void> {
  await click('[data-act="go-match"]');
}

describe('pre-match', () => {
  it('shows the scoreboard at nil-nil, the opposition, the team and bench, play styles and a Kick off button', async () => {
    await toPreMatch();
    expect(text()).toContain('PRE-MATCH');
    expect(text()).toContain('Opposition');
    expect(text()).toContain('Changes before kick off are free');
    expect(all('#screen .pl')).toHaveLength(11);
    expect(all('#screen .bn')).toHaveLength(7);
    expect(all('#screen [data-style]')).toHaveLength(5);
    expect(q('#score-home').textContent).toBe('0');
    expect(q('[data-act="kick-off"]')).not.toBeNull();
  });

  it('names both clubs on the scoreboard, home first, in their own colours', async () => {
    await toPreMatch();
    const m = ctl().session.match;
    const names = all('.sb .tm').map((e) => e.textContent);
    expect(names[0]).toBe(game().world.clubs[m.homeId]!.name);
    expect(names[1]).toBe(game().world.clubs[m.awayId]!.name);
    expect(all('.sb .tm')[0]!.getAttribute('style')).toContain(game().world.clubs[m.homeId]!.kit.primary);
  });

  it('changes play style and formation for free, carrying them into the match', async () => {
    await toPreMatch();
    await click('#screen [data-style="gung-ho"]');
    await click('#screen [data-formation="3-5-2"]');
    const side = ctl().session.state.sides[ctl().userSide];
    expect(side.style).toBe('gung-ho');
    expect(side.formation).toBe('3-5-2');
    expect(side.subsUsed).toBe(0);
    expect(game().lineup.style).toBe('gung-ho');
  });

  it('lets the team be changed by dragging, without using a substitution', async () => {
    await toPreMatch();
    const off = game().lineup.xi[6]!;
    const on = game().lineup.bench[1]!;
    await drag(q('#screen .bn[data-bn="1"]'), q('#screen .pl[data-slot="6"]'));
    expect(game().lineup.xi[6]).toBe(on);
    expect(ctl().session.state.sides[ctl().userSide].slots[6]).toBe(on);
    expect(ctl().session.state.sides[ctl().userSide].bench).toContain(off);
    expect(ctl().session.state.sides[ctl().userSide].subsUsed).toBe(0);
  });

  it('opens a player sheet when a player is tapped, and does not start the clock', async () => {
    await toPreMatch();
    pointer(q('#screen .pl[data-slot="4"]'), 'pointerdown', 5, 5);
    pointer(document, 'pointerup', 5, 5);
    await flush();
    expect(sheetOpen()).toBe(true);
    expect(ctl().session.state.minute).toBe(0);
  });

  it('calls up academy players when too few are fit, and says so', async () => {
    const club = game().world.clubs[game().world.userClubId]!;
    for (const id of club.playerIds.slice(5)) game().world.players[id]!.injury = { weeks: 4, kind: 'Knee' };
    await toPreMatch();
    expect(text()).toContain('academy player');
  });
});

describe('kick off and the clock', () => {
  it('starts the match: the clock runs a minute at a time and the pre-match screen is replaced', async () => {
    await toPreMatch();
    await click('[data-act="kick-off"]');
    expect(ctl().phase).toBe('live');
    expect(q('#half-label').textContent).toBe("FIRST HALF - 0'");
    await advance(MINUTE_MS * 5 + 10);
    expect(ctl().session.state.minute).toBeGreaterThanOrEqual(4);
    expect(q('#half-label').textContent).toMatch(/^FIRST HALF - \d+'$/);
    expect(q('#pitch, .pitch')).toBeNull();
    expect(q('#match-bar [data-act="pause"]')).not.toBeNull();
  });

  it('shows commentary in the banner and the log, and the stats', async () => {
    await toPreMatch();
    await click('[data-act="kick-off"]');
    await advance(MINUTE_MS * 20);
    expect(q('#banner').textContent!.length).toBeGreaterThan(3);
    expect(all('#log > div').length).toBeGreaterThan(1);
    expect(all('#log > div').at(-1)!.textContent).toContain('KICK OFF');
    expect(text()).toContain('Shots');
    expect(text()).toContain('Last 5 mins');
  });

  it('keeps the clock still while a goal banner flashes, then carries on', async () => {
    await toPreMatch();
    await click('[data-act="kick-off"]');
    let guard = 0;
    while (ctl().session.state.events.at(-1)?.kind !== 'goal' && guard++ < 2000) {
      await advance(MINUTE_MS);
      if (ctl().planOpen && !q('#forced-notice')) await click('#sheet [data-act="resume"]');
    }
    const frozenAt = ctl().session.state.minute;
    expect(q('#banner').classList.contains('goal')).toBe(true);
    await advance(FLASH_MS - 200);
    expect(ctl().session.state.minute).toBe(frozenAt);
    await advance(MINUTE_MS * 2 + 400);
    expect(ctl().session.state.minute).toBeGreaterThan(frozenAt);
  });

  it('shows the scorers on their own side of the match, under the half label', async () => {
    await toPreMatch();
    await click('[data-act="kick-off"]');
    await playUntil(() => ctl().session.state.events.some((e) => e.kind === 'goal'));
    expect(q('#summary').hidden).toBe(false);
    const goal = ctl().session.state.events.find((e) => e.kind === 'goal')!;
    expect(goal.kind === 'goal' && q('#summary').textContent).toContain(game().world.players[(goal as { playerId: string }).playerId]!.lastName.toUpperCase());
    const sides = all('#summary > div');
    expect(sides[goal.side === 'home' ? 0 : 1]!.textContent).toContain(`${goal.minute}'`);
  });
});

describe('pausing and the change-your-plan sheet', () => {
  async function paused(): Promise<void> {
    await toPreMatch();
    await click('[data-act="kick-off"]');
    await advance(MINUTE_MS * 8);
    await click('#match-bar [data-act="pause"]');
  }

  it('stops the clock and opens the sheet with play styles, the most tired players, the pitch and substitutes', async () => {
    await paused();
    const minute = ctl().session.state.minute;
    expect(sheetOpen()).toBe(true);
    expect(q('#sheet').textContent).toContain('Change your plan');
    expect(all('#sheet [data-style]')).toHaveLength(5);
    expect(q('#sheet').textContent).toContain('Most tired');
    expect(all('#sheet .pl')).toHaveLength(11);
    expect(all('#sheet .bn')).toHaveLength(7);
    expect(q('#sheet').textContent).toContain('subs used 0/3');
    await advance(MINUTE_MS * 10);
    expect(ctl().session.state.minute).toBe(minute);
  });

  it('changes play style and formation, which take effect in the match', async () => {
    await paused();
    await click('#sheet [data-style="park-the-bus"]');
    await click('#sheet [data-formation="5-3-2"]');
    const side = ctl().session.state.sides[ctl().userSide];
    expect(side.style).toBe('park-the-bus');
    expect(side.formation).toBe('5-3-2');
    expect(q('#sheet [data-style="park-the-bus"]').classList.contains('on')).toBe(true);
  });

  it('makes a substitution by dragging a bench player on, and counts it', async () => {
    await paused();
    const state = ctl().session.state;
    const side = state.sides[ctl().userSide];
    const off = side.slots[7]!;
    const on = side.bench[0]!;
    await drag(q('#sheet .bn[data-bn="0"]'), q('#sheet .pl[data-slot="7"]'));
    expect(side.slots[7]).toBe(on);
    expect(side.subsUsed).toBe(1);
    expect(q('#sheet').textContent).toContain('subs used 1/3');
    expect(side.bench).not.toContain(on);
    expect(state.events.at(-1)).toMatchObject({ kind: 'sub', offId: off, onId: on });
    expect(all('#sheet .bn').map((b) => b.getAttribute('data-bn'))).not.toContain(null);
  });

  it('allows three substitutions and says no to a fourth', async () => {
    await paused();
    for (let i = 0; i < MATCH.maxSubs; i++) await drag(q('#sheet .bn[data-bn="0"]'), q(`#sheet .pl[data-slot="${3 + i}"]`));
    expect(ctl().session.state.sides[ctl().userSide].subsUsed).toBe(3);
    await drag(q('#sheet .bn[data-bn="0"]'), q('#sheet .pl[data-slot="9"]'));
    expect(ctl().session.state.sides[ctl().userSide].subsUsed).toBe(3);
    expect(q('#plan-notice').textContent).toMatch(/No substitutions left/);
  });

  it('swaps two players on the pitch for free', async () => {
    await paused();
    const side = ctl().session.state.sides[ctl().userSide];
    const [a, b] = [side.slots[2], side.slots[9]];
    await drag(q('#sheet .pl[data-slot="2"]'), q('#sheet .pl[data-slot="9"]'));
    expect(side.slots[2]).toBe(b);
    expect(side.slots[9]).toBe(a);
    expect(side.subsUsed).toBe(0);
  });

  it('resumes play from the sheet, and always reopens scrolled to the top', async () => {
    await paused();
    q('#sheet .sh').scrollTop = 400;
    const minute = ctl().session.state.minute;
    await click('#sheet [data-act="resume"]');
    expect(sheetOpen()).toBe(false);
    await advance(MINUTE_MS * 3 + 10);
    expect(ctl().session.state.minute).toBeGreaterThan(minute);
    await click('#match-bar [data-act="pause"]');
    expect(q('#sheet .sh').scrollTop).toBe(0);
  });

  it('can be closed with the X, leaving the match paused with Resume and Change plan on the bar', async () => {
    await paused();
    await click('#sheet [data-close]');
    expect(sheetOpen()).toBe(false);
    expect(ctl().paused).toBe(true);
    expect(q('#match-bar [data-act="resume"]')).not.toBeNull();
    await click('#match-bar [data-act="plan"]');
    expect(sheetOpen()).toBe(true);
  });

  it('closes with Escape too', async () => {
    await paused();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(sheetOpen()).toBe(false);
    expect(ctl().paused).toBe(true);
  });
});

describe('half time', () => {
  it('stops at half time and opens the plan sheet by itself, and the second half starts when resumed', async () => {
    await toPreMatch();
    await click('[data-act="kick-off"]');
    await playUntil(() => ctl().session.state.phase === 'half-time' && ctl().planOpen, 120_000);
    expect(ctl().session.state.phase).toBe('half-time');
    expect(sheetOpen()).toBe(true);
    expect(q('#half-label').textContent).toBe("HALF TIME - 45'");
    await click('#sheet [data-act="resume"]');
    expect(ctl().session.state.phase).toBe('second-half');
    await advance(MINUTE_MS * 3);
    expect(ctl().session.state.minute).toBeGreaterThan(45);
  });
});

describe('injuries', () => {
  it('stops the match for an injured player and will not resume until he is replaced', async () => {
    for (const id of game().world.clubs[game().world.userClubId]!.playerIds) game().world.players[id]!.fatigue = 98;
    await toPreMatch();
    await click('[data-act="kick-off"]');
    let guard = 0;
    while (!q('#forced-notice') && guard++ < 3000) {
      await advance(100);
      if (ctl().session.state.phase === 'half-time' && ctl().planOpen) await click('#sheet [data-act="resume"]');
    }
    expect(q('#forced-notice')).not.toBeNull();
    expect(q('#forced-notice').textContent).toContain('is injured');
    expect(q<HTMLButtonElement>('#sheet [data-act="resume"]').disabled).toBe(true);
    const side = ctl().session.state.sides[ctl().userSide];
    const minute = ctl().session.state.minute;
    await advance(MINUTE_MS * 5);
    expect(ctl().session.state.minute).toBe(minute);
    const idx = side.slots.indexOf(side.forcedSub);
    await drag(q('#sheet .bn[data-bn="0"]'), q(`#sheet .pl[data-slot="${idx}"]`));
    expect(side.forcedSub).toBeNull();
    expect(q('#forced-notice')).toBeNull();
    expect(q<HTMLButtonElement>('#sheet [data-act="resume"]').disabled).toBe(false);
  });
});

describe('full time', () => {
  async function playWholeMatch(): Promise<void> {
    await toPreMatch();
    await click('[data-act="kick-off"]');
    await playUntil(() => ctl().phase === 'full');
  }

  it('shows the result and the money, with a Continue button, and counts the match', async () => {
    const cashBefore = game().world.clubs[game().world.userClubId]!.cash;
    await playWholeMatch();
    expect(ctl().phase).toBe('full');
    expect(q('#half-label').textContent).toBe("FULL TIME - 90'");
    expect(q('#full-time')).not.toBeNull();
    expect(q('#full-time').textContent).toMatch(/WIN|DRAW|DEFEAT/);
    expect(q('#full-time').textContent).toContain('Sponsors');
    expect(q('#match-bar')).toBeNull();
    expect(game().season.round).toBe(1);
    expect(game().world.clubs[game().world.userClubId]!.cash).not.toBe(cashBefore);
    expect(game().season.results).toHaveLength(40);
  });

  it('saves the game when the match ends', async () => {
    await playWholeMatch();
    const saved = await (app as unknown as { deps: { storage: { load(): Promise<{ season: { round: number } }> } } }).deps.storage.load();
    expect(saved.season.round).toBe(1);
  });

  it('goes back to HQ on Continue, with the next fixture a week later and the week on the header', async () => {
    await playWholeMatch();
    await click('[data-act="continue"]');
    expect(app.currentScreen).toBe('hq');
    expect(q('.meta').textContent).toContain('WK 2/38');
    expect(text()).toContain('Matchday 2');
    expect(text()).toContain('Sat 29 Aug');
  });

  it('starts a fresh pre-match for the next fixture', async () => {
    await playWholeMatch();
    await click('[data-act="continue"]');
    await click('[data-act="go-match"]');
    expect(text()).toContain('PRE-MATCH');
    expect(text()).toContain('MATCHDAY 2');
    expect(ctl().session.state.minute).toBe(0);
  });

  it('drops the finished match when the user leaves for another screen instead of continuing', async () => {
    await playWholeMatch();
    await click('[data-nav="team"]');
    await click('[data-nav="hq"]');
    await click('[data-act="go-match"]');
    expect(text()).toContain('PRE-MATCH');
  });
});

describe('leaving a match part way through', () => {
  it('pauses the clock, and the match carries on from the same minute when Go to match is pressed again', async () => {
    await toPreMatch();
    await click('[data-act="kick-off"]');
    await advance(MINUTE_MS * 12);
    const minute = ctl().session.state.minute;
    await click('[data-nav="hq"]');
    await advance(MINUTE_MS * 20);
    expect(ctl().session.state.minute).toBe(minute);
    await click('[data-act="go-match"]');
    expect(ctl().session.state.minute).toBe(minute);
    expect(q('#match-bar [data-act="resume"]')).not.toBeNull();
    await click('#match-bar [data-act="resume"]');
    await advance(MINUTE_MS * 3 + 10);
    expect(ctl().session.state.minute).toBeGreaterThan(minute);
  });
});
