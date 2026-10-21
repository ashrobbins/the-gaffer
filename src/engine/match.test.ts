import { describe, expect, it } from 'vitest';
import { MATCH } from './config';
import { defaultTeamSheet } from './formations';
import {
  aiManageSide,
  changeFormation,
  chooseAiTeamSheet,
  createMatch,
  finishMatch,
  injuryChancePerMinute,
  makeSubstitution,
  pendingForcedSub,
  playToEnd,
  possessionShare,
  setStyle,
  setTeamSheet,
  simulateFullMatch,
  startSecondHalf,
  stepMinute,
  swapSlots,
  teamProfile,
} from './match';
import type { MatchEvent, MatchState, Side } from './matchTypes';
import { createRng } from './rng';
import { generateWorld } from './worldgen';
import type { World } from './types';

const world = generateWorld(91);
const division = world.divisions[2]!;
const [homeId, awayId] = [division[0]!, division[1]!];

const fresh = (w: World = world, h = homeId, a = awayId): MatchState =>
  createMatch(w, h, defaultTeamSheet(w, h), a, defaultTeamSheet(w, a));

/** A copy of the world where every player of the given clubs is worn out. */
function exhaustedWorld(clubIds: string[], fatigue = 92): World {
  const w = generateWorld(91);
  for (const id of clubIds) for (const pid of w.clubs[id]!.playerIds) w.players[pid]!.fatigue = fatigue;
  return w;
}

describe('createMatch', () => {
  it('starts at nought minutes, nil-nil, with eleven players a side on the pitch', () => {
    const s = fresh();
    expect(s).toMatchObject({ minute: 0, phase: 'first-half', score: [0, 0] });
    for (const side of ['home', 'away'] as const) {
      expect(s.sides[side].slots.filter(Boolean)).toHaveLength(11);
      expect(s.sides[side].bench).toHaveLength(7);
      expect(s.sides[side].subsUsed).toBe(0);
    }
  });

  it('tracks every player, with only the starters on the pitch', () => {
    const s = fresh();
    expect(Object.keys(s.players)).toHaveLength(36);
    expect(Object.values(s.players).filter((p) => p.onPitch)).toHaveLength(22);
  });

  it('starts each player at the tiredness he went into the match with', () => {
    const w = exhaustedWorld([homeId], 60);
    const s = fresh(w);
    for (const id of s.sides.home.slots) expect(s.players[id!]!.fatigue).toBe(60);
  });

  it('refuses an unplayable team sheet', () => {
    const sheet = defaultTeamSheet(world, homeId);
    expect(() => createMatch(world, homeId, { ...sheet, xi: sheet.xi.slice(1) }, awayId, defaultTeamSheet(world, awayId))).toThrow();
  });
});

describe('stepMinute: the clock', () => {
  it('plays minute by minute with a kick-off in the first and half time in the 45th', () => {
    const s = fresh();
    const rng = createRng(1);
    const first = stepMinute(world, s, rng);
    expect(s.minute).toBe(1);
    expect(first[0]).toMatchObject({ kind: 'kick-off', minute: 1 });
    for (let i = 2; i <= 45; i++) stepMinute(world, s, rng);
    expect(s.phase).toBe('half-time');
    expect(s.events.filter((e) => e.kind === 'half-time')).toHaveLength(1);
  });

  it('will not play on at half time until the second half is started', () => {
    const s = fresh();
    const rng = createRng(2);
    for (let i = 0; i < 45; i++) stepMinute(world, s, rng);
    expect(() => stepMinute(world, s, rng)).toThrow();
    startSecondHalf(s);
    expect(s.phase).toBe('second-half');
    expect(() => stepMinute(world, s, rng)).not.toThrow();
    expect(s.minute).toBe(46);
  });

  it('ends at full time after 90 minutes and then refuses to play on', () => {
    const s = fresh();
    playToEnd(world, s, createRng(3));
    expect(s.minute).toBe(90);
    expect(s.phase).toBe('full-time');
    expect(s.events.filter((e) => e.kind === 'full-time')).toHaveLength(1);
    expect(() => stepMinute(world, s, createRng(3))).toThrow();
  });

  it('records the home share of the ball in every minute', () => {
    const s = fresh();
    playToEnd(world, s, createRng(4));
    expect(s.possession).toHaveLength(90);
    expect(s.possession.every((p) => p > 0.2 && p < 0.8)).toBe(true);
  });

  it('keeps events in time order, each carrying the score at that moment', () => {
    const s = fresh();
    playToEnd(world, s, createRng(5));
    for (let i = 1; i < s.events.length; i++) expect(s.events[i]!.minute).toBeGreaterThanOrEqual(s.events[i - 1]!.minute);
    const goals = s.events.filter((e) => e.kind === 'goal');
    goals.forEach((g, i) => expect(g.score[0] + g.score[1]).toBe(i + 1));
    expect(goals.filter((g) => g.side === 'home')).toHaveLength(s.score[0]);
    expect(goals.filter((g) => g.side === 'away')).toHaveLength(s.score[1]);
  });

  it('is repeatable from the same seed', () => {
    const a = fresh();
    const b = fresh();
    playToEnd(world, a, createRng(6));
    playToEnd(world, b, createRng(6));
    expect(a.events).toEqual(b.events);
    expect(a.score).toEqual(b.score);
  });
});

describe('tiredness', () => {
  it('rises through the match, more for those who work harder', () => {
    const s = fresh();
    const calm = fresh();
    setStyle(s, 'home', 'gung-ho');
    setStyle(calm, 'home', 'park-the-bus');
    playToEnd(world, s, createRng(7), []);
    playToEnd(world, calm, createRng(7), []);
    const avg = (st: MatchState): number => {
      const ids = st.sides.home.slots.filter((id): id is string => id !== null && !!st.players[id]!.minutes);
      return ids.reduce((sum, id) => sum + st.players[id]!.fatigue, 0) / ids.length;
    };
    expect(avg(s)).toBeGreaterThan(20);
    expect(avg(s)).toBeGreaterThan(avg(calm));
  });

  it('makes a tired team play worse', () => {
    const rested = fresh();
    const tired = fresh(exhaustedWorld([homeId]));
    const before = teamProfile(world, rested, 'home');
    const after = teamProfile(exhaustedWorld([homeId]), tired, 'home');
    expect(after.att).toBeLessThan(before.att * 0.9);
    expect(after.def).toBeLessThan(before.def * 0.9);
  });

  it('never goes above 100', () => {
    const w = exhaustedWorld([homeId, awayId], 99);
    const s = fresh(w);
    playToEnd(w, s, createRng(8));
    expect(Object.values(s.players).every((p) => p.fatigue <= 100)).toBe(true);
  });
});

describe('injuryChancePerMinute', () => {
  it('rises with tiredness, and very sharply above 80%', () => {
    const fresh0 = injuryChancePerMinute(0, 26);
    const half = injuryChancePerMinute(50, 26);
    const eighty = injuryChancePerMinute(80, 26);
    const ninety = injuryChancePerMinute(90, 26);
    const hundred = injuryChancePerMinute(100, 26);
    expect(half).toBeGreaterThan(fresh0);
    expect(eighty).toBeGreaterThan(half);
    expect(ninety - eighty).toBeGreaterThan(eighty - half);
    expect(hundred).toBeGreaterThan(ninety);
    expect(hundred / fresh0).toBeGreaterThan(8);
  });

  it('is a little higher for older players', () => {
    expect(injuryChancePerMinute(40, 34)).toBeGreaterThan(injuryChancePerMinute(40, 24));
  });

  it('is small for a rested player: well under one injury per player in ten matches', () => {
    expect(injuryChancePerMinute(10, 26) * 90 * 10).toBeLessThan(1);
  });
});

describe('injuries in matches', () => {
  const injuriesPerMatch = (w: World, n: number, seed: number): number => {
    const rng = createRng(seed);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const s = fresh(w);
      playToEnd(w, s, rng);
      total += s.events.filter((e) => e.kind === 'injury').length;
    }
    return total / n;
  };

  it('are occasional between fit teams', () => {
    const rate = injuriesPerMatch(world, 500, 11);
    expect(rate).toBeGreaterThan(0.08);
    expect(rate).toBeLessThan(0.45);
  });

  it('are much more common when the players are exhausted', () => {
    const rested = injuriesPerMatch(world, 300, 12);
    const tired = injuriesPerMatch(exhaustedWorld([homeId, awayId]), 300, 12);
    expect(tired).toBeGreaterThan(rested * 3);
  });

  it('force a replacement: play stops until the injured player is replaced, even with no subs left', () => {
    const w = exhaustedWorld([homeId, awayId]);
    const rng = createRng(13);
    for (let attempt = 0; attempt < 200; attempt++) {
      const s = fresh(w);
      let found: Side | null = null;
      while (s.phase !== 'full-time' && !found) {
        if (s.phase === 'half-time') startSecondHalf(s);
        stepMinute(w, s, rng);
        found = pendingForcedSub(s);
      }
      if (!found) continue;
      const side = found;
      const injured = s.sides[side].forcedSub!;
      expect(() => stepMinute(w, s, rng)).toThrow();
      s.sides[side].subsUsed = MATCH.maxSubs;
      const on = s.sides[side].bench.find((id) => !w.players[id]!.injury)!;
      makeSubstitution(w, s, side, injured, on);
      expect(s.sides[side].forcedSub).toBeNull();
      expect(s.sides[side].slots).toContain(on);
      expect(s.sides[side].slots).not.toContain(injured);
      expect(() => stepMinute(w, s, rng)).not.toThrow();
      return;
    }
    throw new Error('no injury found');
  });

  it('leave the team a player short when there is nobody on the bench to bring on', () => {
    const w = exhaustedWorld([homeId, awayId]);
    const rng = createRng(14);
    for (let attempt = 0; attempt < 300; attempt++) {
      const s = fresh(w);
      s.sides.home.bench = [];
      s.sides.away.bench = [];
      while (s.phase !== 'full-time') {
        if (s.phase === 'half-time') startSecondHalf(s);
        stepMinute(w, s, rng);
      }
      const injury = s.events.find((e) => e.kind === 'injury');
      if (injury && injury.kind === 'injury') {
        expect(injury.mustReplace).toBe(false);
        const side = injury.side;
        expect(s.sides[side].slots.filter(Boolean).length).toBeLessThan(11);
        expect(s.players[injury.playerId]!.onPitch).toBe(false);
        return;
      }
    }
    throw new Error('no injury found');
  });
});

describe('substitutions', () => {
  const setup = (): MatchState => {
    const s = fresh();
    for (let i = 0; i < 20; i++) stepMinute(world, s, createRng(20 + i));
    return s;
  };

  it('swaps a player on the pitch with one from the bench and counts it', () => {
    const s = setup();
    const off = s.sides.home.slots[9]!;
    const on = s.sides.home.bench[2]!;
    makeSubstitution(world, s, 'home', off, on);
    expect(s.sides.home.slots[9]).toBe(on);
    expect(s.sides.home.bench).not.toContain(on);
    expect(s.sides.home.subsUsed).toBe(1);
    expect(s.players[off]!.onPitch).toBe(false);
    expect(s.players[on]!.onPitch).toBe(true);
    expect(s.events.at(-1)).toMatchObject({ kind: 'sub', offId: off, onId: on, forced: false, side: 'home' });
  });

  it('allows three and no more', () => {
    const s = setup();
    for (let i = 0; i < 3; i++) makeSubstitution(world, s, 'home', s.sides.home.slots[5 + i]!, s.sides.home.bench[0]!);
    expect(() => makeSubstitution(world, s, 'home', s.sides.home.slots[1]!, s.sides.home.bench[0]!)).toThrow();
    expect(s.sides.home.subsUsed).toBe(3);
  });

  it('does not let a player who came off go back on', () => {
    const s = setup();
    const off = s.sides.home.slots[7]!;
    makeSubstitution(world, s, 'home', off, s.sides.home.bench[0]!);
    expect(s.sides.home.bench).not.toContain(off);
    expect(() => makeSubstitution(world, s, 'home', s.sides.home.slots[8]!, off)).toThrow();
  });

  it('rejects a player who is not on the pitch, or not on the bench', () => {
    const s = setup();
    expect(() => makeSubstitution(world, s, 'home', s.sides.home.bench[0]!, s.sides.home.bench[1]!)).toThrow();
    expect(() => makeSubstitution(world, s, 'home', s.sides.home.slots[3]!, s.sides.home.slots[4]!)).toThrow();
    expect(() => makeSubstitution(world, s, 'home', s.sides.home.slots[3]!, s.sides.away.bench[0]!)).toThrow();
  });

  it('records appearances at the end: a start for the eleven, a sub appearance for those who came on', () => {
    const w = generateWorld(91);
    const s = fresh(w);
    const rng = createRng(30);
    for (let i = 0; i < 30; i++) stepMinute(w, s, rng);
    const off = s.sides.home.slots[6]!;
    const on = s.sides.home.bench[1]!;
    const unused = s.sides.home.bench[0]!;
    makeSubstitution(w, s, 'home', off, on);
    playToEnd(w, s, rng, ['away']);
    finishMatch(w, s);
    expect(w.players[on]!.seasonStats.subAppearances).toBe(1);
    expect(w.players[on]!.seasonStats.starts).toBe(0);
    expect(w.players[off]!.seasonStats.starts).toBe(1);
    expect(w.players[unused]!.seasonStats.starts + w.players[unused]!.seasonStats.subAppearances).toBe(0);
  });
});

describe('formation, style and positions', () => {
  it('changes formation without using a substitution and keeps the same players on the pitch', () => {
    const s = fresh();
    const before = new Set(s.sides.home.slots);
    changeFormation(world, s, 'home', '4-3-3');
    expect(s.sides.home.formation).toBe('4-3-3');
    expect(new Set(s.sides.home.slots)).toEqual(before);
    expect(s.sides.home.subsUsed).toBe(0);
  });

  it('gives an attacking formation more attack and less defence than a defensive one', () => {
    const attack = fresh();
    const defend = fresh();
    changeFormation(world, attack, 'home', '4-3-3');
    changeFormation(world, defend, 'home', '5-3-2');
    const a = teamProfile(world, attack, 'home');
    const d = teamProfile(world, defend, 'home');
    expect(a.att).toBeGreaterThan(d.att);
    expect(d.def).toBeGreaterThan(a.def);
  });

  it('swaps two players for free, and a player out of position plays worse', () => {
    const s = fresh();
    const before = teamProfile(world, s, 'home');
    swapSlots(s, 'home', 0, 10); // goalkeeper and a striker
    expect(s.sides.home.subsUsed).toBe(0);
    expect(teamProfile(world, s, 'home').keeper).toBeLessThan(before.keeper * 0.5);
    swapSlots(s, 'home', 0, 10);
    expect(teamProfile(world, s, 'home')).toEqual(before);
    expect(() => swapSlots(s, 'home', 0, 11)).toThrow();
  });

  it('gives each play style its own balance of attack and defence', () => {
    const profile = (style: Parameters<typeof setStyle>[2]) => {
      const s = fresh();
      setStyle(s, 'home', style);
      return teamProfile(world, s, 'home');
    };
    expect(profile('gung-ho').att).toBeGreaterThan(profile('attacking').att);
    expect(profile('attacking').att).toBeGreaterThan(profile('balanced').att);
    expect(profile('balanced').att).toBeGreaterThan(profile('defensive').att);
    expect(profile('defensive').att).toBeGreaterThan(profile('park-the-bus').att);
    expect(profile('park-the-bus').def).toBeGreaterThan(profile('defensive').def);
    expect(profile('defensive').def).toBeGreaterThan(profile('balanced').def);
    expect(profile('balanced').def).toBeGreaterThan(profile('gung-ho').def);
  });

  it('allows free changes to the whole team before kick-off only', () => {
    const s = fresh();
    setTeamSheet(world, s, 'home', defaultTeamSheet(world, homeId, '5-3-2', 'defensive'));
    expect(s.sides.home).toMatchObject({ formation: '5-3-2', style: 'defensive', subsUsed: 0 });
    stepMinute(world, s, createRng(1));
    expect(() => setTeamSheet(world, s, 'home', defaultTeamSheet(world, homeId))).toThrow();
  });
});

describe('who has the ball', () => {
  it('goes to the side with stronger midfield, and the home side gets a small boost', () => {
    const even = possessionShare({ att: 1, def: 1, ctrl: 1, keeper: 70 }, { att: 1, def: 1, ctrl: 1, keeper: 70 });
    expect(even).toBeCloseTo(0.5, 5);
    expect(possessionShare({ att: 1, def: 1, ctrl: 1.1, keeper: 70 }, { att: 1, def: 1, ctrl: 1, keeper: 70 })).toBeGreaterThan(0.55);
  });
});

describe('football realism over many matches', () => {
  const N = 800;
  const rng = createRng(100);
  const totals = { goals: 0, home: 0, draw: 0, away: 0, shots: 0, onTarget: 0, corners: 0, yellow: 0, red: 0, pens: 0, subs: 0, fouls: 0 };
  for (let i = 0; i < N; i++) {
    const [a, b] = rng.shuffle(division);
    const s = createMatch(world, a!, chooseAiTeamSheet(world, a!, b!, true, rng), b!, chooseAiTeamSheet(world, b!, a!, false, rng));
    const events = playToEnd(world, s, rng);
    totals.goals += s.score[0] + s.score[1];
    if (s.score[0] > s.score[1]) totals.home++;
    else if (s.score[0] < s.score[1]) totals.away++;
    else totals.draw++;
    for (const side of ['home', 'away'] as const) {
      totals.shots += s.stats[side].shots;
      totals.onTarget += s.stats[side].onTarget;
      totals.corners += s.stats[side].corners;
      totals.yellow += s.stats[side].yellowCards;
      totals.red += s.stats[side].redCards;
      totals.fouls += s.stats[side].fouls;
      totals.subs += s.sides[side].subsUsed;
    }
    totals.pens += events.filter((e) => (e.kind === 'goal' && e.penalty) || e.kind === 'penalty-miss').length;
  }
  const per = (n: number): number => n / N;

  it('scores about 2.6 goals a game', () => {
    expect(per(totals.goals)).toBeGreaterThan(2.2);
    expect(per(totals.goals)).toBeLessThan(3.0);
  });

  it('gives the home side an edge, with plenty of draws', () => {
    expect(totals.home).toBeGreaterThan(totals.away);
    expect(per(totals.draw)).toBeGreaterThan(0.2);
    expect(per(totals.draw)).toBeLessThan(0.33);
  });

  it('has about 23 shots, 9 on target and 9 corners a game', () => {
    expect(per(totals.shots)).toBeGreaterThan(19);
    expect(per(totals.shots)).toBeLessThan(28);
    expect(per(totals.onTarget)).toBeGreaterThan(6.5);
    expect(per(totals.onTarget)).toBeLessThan(11);
    expect(per(totals.corners)).toBeGreaterThan(7);
    expect(per(totals.corners)).toBeLessThan(12);
  });

  it('has a few yellow cards, very few reds and the odd penalty', () => {
    expect(per(totals.yellow)).toBeGreaterThan(1.8);
    expect(per(totals.yellow)).toBeLessThan(4);
    expect(per(totals.red)).toBeGreaterThan(0.03);
    expect(per(totals.red)).toBeLessThan(0.3);
    expect(per(totals.pens)).toBeGreaterThan(0.15);
    expect(per(totals.pens)).toBeLessThan(0.6);
  });

  it('has computer managers use their substitutions', () => {
    expect(per(totals.subs)).toBeGreaterThan(3.5);
    expect(per(totals.subs)).toBeLessThanOrEqual(6.5);
  });
});

describe('ability and tactics decide results, but never completely', () => {
  const ratings = (w: World): string[] => Object.keys(w.clubs).sort((a, b) => teamStrength(w, b) - teamStrength(w, a));
  const teamStrength = (w: World, id: string): number => {
    const s = createMatch(w, id, defaultTeamSheet(w, id), id === awayId ? homeId : awayId, defaultTeamSheet(w, id === awayId ? homeId : awayId));
    return teamProfile(w, s, 'home').att + teamProfile(w, s, 'home').def;
  };
  const ranked = ratings(world);
  const top = ranked[0]!;
  const bottom = ranked[ranked.length - 1]!;

  function results(home: string, away: string, n: number, seed: number, homeSheetFor?: () => ReturnType<typeof defaultTeamSheet>) {
    const rng = createRng(seed);
    let h = 0;
    let d = 0;
    let a = 0;
    for (let i = 0; i < n; i++) {
      const s = createMatch(world, home, homeSheetFor ? homeSheetFor() : defaultTeamSheet(world, home), away, defaultTeamSheet(world, away));
      while (s.phase !== 'full-time') {
        if (s.phase === 'half-time') startSecondHalf(s);
        for (const side of ['home', 'away'] as const) if (s.sides[side].forcedSub) aiManageSide(world, s, side, rng);
        stepMinute(world, s, rng);
      }
      if (s.score[0] > s.score[1]) h++;
      else if (s.score[0] < s.score[1]) a++;
      else d++;
    }
    return { h: h / n, d: d / n, a: a / n };
  }

  it('makes the strongest club a big favourite over the weakest, with the weaker side still winning sometimes', () => {
    const r = results(top, bottom, 600, 1);
    expect(r.h).toBeGreaterThan(0.8);
    expect(r.a).toBeGreaterThan(0);
    expect(r.a).toBeLessThan(0.06);
  });

  it('lets the weaker club win at home to the stronger club now and then', () => {
    const r = results(bottom, top, 800, 2);
    expect(r.h).toBeGreaterThan(0.01);
    expect(r.h).toBeLessThan(0.12);
    expect(r.a).toBeGreaterThan(0.7);
  });

  it('makes a gung-ho side score more and a park-the-bus side score less than the same side playing balanced', () => {
    const goals = (style: 'gung-ho' | 'balanced' | 'park-the-bus'): number => {
      const rng = createRng(5);
      let g = 0;
      for (let i = 0; i < 500; i++) {
        const s = createMatch(world, homeId, defaultTeamSheet(world, homeId, '4-4-2', style), awayId, defaultTeamSheet(world, awayId));
        while (s.phase !== 'full-time') {
          if (s.phase === 'half-time') startSecondHalf(s);
          for (const side of ['home', 'away'] as const) if (s.sides[side].forcedSub) aiManageSide(world, s, side, rng);
          stepMinute(world, s, rng);
        }
        g += s.score[0];
      }
      return g / 500;
    };
    expect(goals('gung-ho')).toBeGreaterThan(goals('balanced'));
    expect(goals('balanced')).toBeGreaterThan(goals('park-the-bus'));
  });
});

describe('red cards', () => {
  it('take a player off for good and leave the team a man down', () => {
    const rng = createRng(40);
    for (let i = 0; i < 400; i++) {
      const s = fresh();
      playToEnd(world, s, rng);
      const red = s.events.find((e): e is Extract<MatchEvent, { kind: 'red' }> => e.kind === 'red');
      if (!red) continue;
      const side = s.sides[red.side];
      expect(side.sentOff).toContain(red.playerId);
      expect(side.slots).not.toContain(red.playerId);
      expect(side.bench).not.toContain(red.playerId);
      expect(s.players[red.playerId]!.onPitch).toBe(false);
      expect(s.players[red.playerId]!.redCards).toBe(1);
      expect(side.slots.filter(Boolean).length).toBeLessThanOrEqual(10);
      return;
    }
    throw new Error('no red card found');
  });

  it('are shown after two yellows as a second-yellow dismissal, and never twice for the same player', () => {
    const rng = createRng(41);
    for (let i = 0; i < 600; i++) {
      const s = fresh();
      playToEnd(world, s, rng);
      const reds = s.events.filter((e) => e.kind === 'red');
      const ids = reds.map((e) => (e.kind === 'red' ? e.playerId : ''));
      expect(new Set(ids).size).toBe(ids.length);
      for (const e of reds) {
        if (e.kind === 'red' && e.reason === 'second-yellow') expect(s.players[e.playerId]!.yellowCards).toBe(2);
      }
    }
  });
});

describe('finishMatch', () => {
  it('writes goals, cards, tiredness and injuries back to the players', () => {
    const w = generateWorld(91);
    const rng = createRng(50);
    const s = createMatch(w, homeId, defaultTeamSheet(w, homeId), awayId, defaultTeamSheet(w, awayId));
    playToEnd(w, s, rng);
    const summary = finishMatch(w, s);
    expect(summary).toMatchObject({ homeClubId: homeId, awayClubId: awayId, homeGoals: s.score[0], awayGoals: s.score[1] });
    const goals = [...w.clubs[homeId]!.playerIds, ...w.clubs[awayId]!.playerIds].reduce((n, id) => n + w.players[id]!.seasonStats.goals, 0);
    expect(goals).toBe(s.score[0] + s.score[1]);
    const starters = [...w.clubs[homeId]!.playerIds, ...w.clubs[awayId]!.playerIds].filter((id) => w.players[id]!.seasonStats.starts === 1);
    expect(starters.length).toBeGreaterThanOrEqual(20);
    for (const id of s.sides.home.slots) if (id && s.players[id]!.minutes > 0) expect(w.players[id]!.fatigue).toBeGreaterThan(0);
    for (const id of summary.injured) expect(w.players[id]!.injury).not.toBeNull();
  });

  it('adds the same figures to the career totals', () => {
    const w = generateWorld(91);
    const s = createMatch(w, homeId, defaultTeamSheet(w, homeId), awayId, defaultTeamSheet(w, awayId));
    playToEnd(w, s, createRng(51));
    finishMatch(w, s);
    for (const p of Object.values(w.players)) expect(p.careerStats).toEqual(p.seasonStats);
  });

  it('refuses to run before full time', () => {
    expect(() => finishMatch(world, fresh())).toThrow();
  });
});

describe('computer managers', () => {
  it('choose a playable team sheet', () => {
    const rng = createRng(60);
    const sheet = chooseAiTeamSheet(world, homeId, awayId, true, rng);
    expect(sheet.xi).toHaveLength(11);
    expect(() => createMatch(world, homeId, sheet, awayId, defaultTeamSheet(world, awayId))).not.toThrow();
  });

  it('play cautiously against a much stronger side and boldly against a weaker one', () => {
    const top = world.divisions[0]![0]!;
    const low = world.divisions[3]![0]!;
    const rng = createRng(61);
    expect(['defensive', 'park-the-bus']).toContain(chooseAiTeamSheet(world, low, top, false, rng).style);
    expect(chooseAiTeamSheet(world, top, low, true, rng).style).toBe('attacking');
  });

  it('chase the game when behind late on and shut up shop when ahead', () => {
    const rng = createRng(62);
    const s = fresh();
    s.minute = 82;
    s.phase = 'second-half';
    s.score = [0, 1];
    aiManageSide(world, s, 'home', rng);
    aiManageSide(world, s, 'away', rng);
    expect(s.sides.home.style).toBe('gung-ho');
    expect(['defensive', 'park-the-bus']).toContain(s.sides.away.style);
  });

  it('replace an injured player straight away', () => {
    const w = exhaustedWorld([homeId, awayId]);
    const rng = createRng(63);
    for (let attempt = 0; attempt < 200; attempt++) {
      const s = fresh(w);
      let side: Side | null = null;
      while (s.phase !== 'full-time' && !side) {
        if (s.phase === 'half-time') startSecondHalf(s);
        stepMinute(w, s, rng);
        side = pendingForcedSub(s);
      }
      if (!side) continue;
      aiManageSide(w, s, side, rng);
      expect(s.sides[side].forcedSub).toBeNull();
      return;
    }
    throw new Error('no injury found');
  });

  it('cannot leave a human side with a pending injury: play stops until someone deals with it', () => {
    const w = exhaustedWorld([homeId, awayId]);
    const rng = createRng(64);
    let stopped = false;
    for (let attempt = 0; attempt < 100 && !stopped; attempt++) {
      const s = fresh(w);
      try {
        playToEnd(w, s, rng, []);
      } catch (e) {
        stopped = /injured player must be replaced/.test((e as Error).message);
      }
    }
    expect(stopped).toBe(true);
  });
});

describe('playToEnd', () => {
  it('returns every key moment from then on, including substitutions the computer managers made', () => {
    const s = fresh();
    const events = playToEnd(world, s, createRng(80));
    expect(events).toEqual(s.events);
    expect(events.filter((e) => e.kind === 'sub').length).toBe(s.sides.home.subsUsed + s.sides.away.subsUsed);
  });

  it('only returns the moments after the point it was called from', () => {
    const s = fresh();
    const rng = createRng(81);
    for (let i = 0; i < 30; i++) stepMinute(world, s, rng);
    const already = s.events.length;
    const rest = playToEnd(world, s, rng);
    expect(rest).toHaveLength(s.events.length - already);
    expect(rest.every((e) => e.minute >= 30)).toBe(true);
  });
});

describe('simulateFullMatch', () => {
  it('plays a whole match between two computer managers and writes the result to the world', () => {
    const w = generateWorld(91);
    const summary = simulateFullMatch(w, homeId, awayId, createRng(70));
    expect(summary.homeGoals).toBeGreaterThanOrEqual(0);
    const starts = Object.values(w.players).filter((p) => p.seasonStats.starts > 0).length;
    expect(starts).toBe(22);
  });
});
