// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUP_ROUND_AFTER_MATCHDAY, MATCH } from '../engine/config';
import { memoryStorage } from '../storage';
import { App } from './app';
import { FLASH_MS, KICK_MS, MINUTE_MS, type MatchController } from './match';

let root: HTMLElement;
let app: App;

const flush = async (): Promise<void> => void (await vi.advanceTimersByTimeAsync(0));
const advance = async (ms: number): Promise<void> => void (await vi.advanceTimersByTimeAsync(ms));

beforeEach(async () => {
  localStorage.removeItem('gaffer-speed');
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
    // A seed on which a worn-out player does get hurt, so the test does not depend on luck.
    game().rngState = 11;
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

describe('match speed', () => {
  beforeEach(() => {
    localStorage.removeItem('gaffer-speed');
  });

  it('offers 0.5x, 1x and 2x, starting at normal speed', async () => {
    await toPreMatch();
    expect(all('#screen [data-speed]').map((b) => b.textContent)).toEqual(['0.5x', '1x', '2x']);
    expect(q('#screen [data-speed="1"]').classList.contains('on')).toBe(true);
  });

  it('runs the clock twice as fast at 2x', async () => {
    await toPreMatch();
    await click('#screen [data-speed="2"]');
    await click('[data-act="kick-off"]');
    await advance(MINUTE_MS * 4 + 10);
    expect(ctl().session.state.minute).toBeGreaterThanOrEqual(7);
  });

  it('runs the clock at half speed at 0.5x', async () => {
    await toPreMatch();
    await click('#screen [data-speed="0.5"]');
    await click('[data-act="kick-off"]');
    await advance(MINUTE_MS * 4 + 10);
    expect(ctl().session.state.minute).toBeLessThanOrEqual(2);
    expect(ctl().session.state.minute).toBeGreaterThanOrEqual(1);
  });

  it('can be changed in the middle of the match, taking effect at once', async () => {
    await toPreMatch();
    await click('[data-act="kick-off"]');
    await advance(MINUTE_MS * 2 + 10);
    const before = ctl().session.state.minute;
    await click('#screen [data-speed="2"]');
    expect(q('#screen [data-speed="2"]').classList.contains('on')).toBe(true);
    await advance(MINUTE_MS * 2 + 10);
    expect(ctl().session.state.minute - before).toBeGreaterThanOrEqual(3);
  });

  it('is remembered for the next match', async () => {
    await toPreMatch();
    await click('#screen [data-speed="2"]');
    expect(localStorage.getItem('gaffer-speed')).toBe('2');
    await click('[data-nav="hq"]');
    app = new App(root, { storage: memoryStorage(), random: () => 0.37 });
    const started = app.start();
    await flush();
    await started;
    (root.querySelector('#create-club') as HTMLElement).click();
    await flush();
    await toPreMatch();
    expect(q('#screen [data-speed="2"]').classList.contains('on')).toBe(true);
  });
});

describe('a cup tie that finishes level', () => {
  async function levelCupTie(): Promise<void> {
    const g = game();
    g.cup.rounds[0]!.ties[0]!.homeId = g.world.userClubId;
    g.season.round = CUP_ROUND_AFTER_MATCHDAY[0]!;
    await toPreMatch();
    await click('[data-act="kick-off"]');
    const st = ctl().session.state;
    st.score = [1, 1];
    st.minute = 88;
    st.phase = 'second-half';
    for (let i = 0; i < 60 && ctl().phase === 'live'; i++) await advance(50);
  }

  it('goes to a penalty shootout, shown one kick at a time', async () => {
    await levelCupTie();
    expect(ctl().phase).toBe('penalties');
    expect(q('#half-label').textContent).toBe('PENALTY SHOOTOUT');
    expect(q('#shootout')).not.toBeNull();
    expect(all('#shootout .pk')).toHaveLength(0);
    await advance(KICK_MS + 10);
    expect(all('#shootout .pk')).toHaveLength(1);
    await advance(KICK_MS * 3);
    expect(all('#shootout .pk')).toHaveLength(4);
    expect(q('#pk-banner').textContent).toMatch(/SCORES|MISSES/);
    expect(q('[data-act="skip-shootout"]')).not.toBeNull();
  });

  it('shows the score as the kicks go in, and ends with a winner and the result', async () => {
    await levelCupTie();
    const total = ctl().shootout!.kicks.length;
    await advance(KICK_MS * (total + 3));
    expect(ctl().phase).toBe('full');
    const [h, a] = ctl().shootout!.score;
    expect(h).not.toBe(a);
    expect(ctl().report!.penalties).toEqual([h, a]);
    expect(q('#full-time').textContent).toContain(`pens ${h}-${a}`);
    expect(q('#full-time').textContent).toMatch(/WIN|DEFEAT/);
    expect(game().cup.rounds[0]!.played).toBe(true);
  });

  it('names a taker for every kick, from the players on the pitch', async () => {
    await levelCupTie();
    const kicks = ctl().shootout!.kicks;
    const st = ctl().session.state;
    for (const k of kicks) expect(st.sides[k.side].slots).toContain(k.playerId);
    expect(kicks.every((k) => game().world.players[k.playerId]!.position !== 'GK')).toBe(true);
  });

  it('can be skipped to the result', async () => {
    await levelCupTie();
    await click('[data-act="skip-shootout"]');
    expect(ctl().phase).toBe('full');
    expect(q('#full-time')).not.toBeNull();
    expect(ctl().report!.penalties).toEqual(ctl().shootout!.score);
  });

  it('runs faster at 2x', async () => {
    await levelCupTie();
    await click('#screen [data-speed="2"]');
    await advance(KICK_MS / 2 * 4 + 20);
    expect(all('#shootout .pk').length).toBeGreaterThanOrEqual(4);
  });

  it('does not happen in a league match: a draw stays a draw', async () => {
    await toPreMatch();
    await click('[data-act="kick-off"]');
    const st = ctl().session.state;
    st.score = [1, 1];
    st.minute = 88;
    st.phase = 'second-half';
    await advance(MINUTE_MS * 3);
    expect(ctl().phase).toBe('full');
    expect(ctl().shootout).toBeNull();
  });
});

describe('winning the cup', () => {
  it('celebrates with a trophy once the final is won and Continue is pressed', async () => {
    const g = game();
    const me = g.world.userClubId;
    const other = g.world.divisions[0]![0]!;
    g.cup.rounds.forEach((r, i) => {
      if (i < 6) r.played = true;
    });
    g.cup.rounds[6]!.ties = [{ round: 6, homeId: me, awayId: other, homeGoals: 0, awayGoals: 0, penalties: null, winnerId: me, played: false }];
    g.season.round = 35;
    await toPreMatch();
    await click('[data-act="kick-off"]');
    const st = ctl().session.state;
    st.score = [3, 0];
    st.minute = 88;
    st.phase = 'second-half';
    for (let i = 0; i < 60 && ctl().phase !== 'full'; i++) await advance(50);
    expect(ctl().report!.userWon).toBe(true);
    expect(q('#celebrate').hidden).toBe(true);
    await click('[data-act="continue"]');
    expect(q('#celebrate').hidden).toBe(false);
    expect(q('#celebrate').textContent).toContain('CUP WINNERS!');
    expect(q('#celebrate .cel-trophy')).not.toBeNull();
    await click('#celebrate [data-celebrate]');
    expect(q('#celebrate').hidden).toBe(true);
    expect(app.currentScreen).toBe('hq');
  });

  it('does not celebrate an earlier round', async () => {
    const g = game();
    g.cup.rounds[0]!.ties[0]!.homeId = g.world.userClubId;
    g.season.round = CUP_ROUND_AFTER_MATCHDAY[0]!;
    await toPreMatch();
    await click('[data-act="kick-off"]');
    const st = ctl().session.state;
    st.score = [3, 0];
    st.minute = 88;
    st.phase = 'second-half';
    for (let i = 0; i < 60 && ctl().phase !== 'full'; i++) await advance(50);
    await click('[data-act="continue"]');
    expect(q('#celebrate').hidden).toBe(true);
  });
});
