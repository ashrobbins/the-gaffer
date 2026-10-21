import { describe, expect, it } from 'vitest';
import { commentary } from './commentary';
import { defaultTeamSheet } from './formations';
import { createMatch, playToEnd } from './match';
import type { MatchEvent } from './matchTypes';
import { createRng } from './rng';
import { generateWorld } from './worldgen';

const world = generateWorld(95);
const [h, a] = [world.divisions[1]![0]!, world.divisions[1]![1]!];

/** Plays matches until every kind of key moment has been seen at least once. */
function collectEvents(): MatchEvent[] {
  const rng = createRng(1);
  const all: MatchEvent[] = [];
  for (let i = 0; i < 1500; i++) {
    const w = i % 3 === 0 ? tiredWorld() : world;
    const s = createMatch(w, h, defaultTeamSheet(w, h), a, defaultTeamSheet(w, a));
    all.push(...playToEnd(w, s, rng));
  }
  return all;
}

function tiredWorld() {
  const w = generateWorld(95);
  for (const id of [h, a]) for (const pid of w.clubs[id]!.playerIds) w.players[pid]!.fatigue = 92;
  return w;
}

const events = collectEvents();
const surnameOf = (id: string): string => world.players[id]!.lastName.toUpperCase();

describe('commentary', () => {
  it('has text for every kind of key moment', () => {
    const kinds = new Set(events.map((e) => e.kind));
    for (const k of ['kick-off', 'shot', 'goal', 'corner', 'yellow', 'red', 'injury', 'half-time', 'full-time', 'penalty-miss'] as const) {
      expect(kinds.has(k)).toBe(true);
    }
  });

  it('is always capital letters, never empty and never contains "undefined"', () => {
    for (const e of events) {
      const text = commentary(world, e);
      expect(text.length).toBeGreaterThan(3);
      expect(text).toBe(text.toUpperCase());
      expect(text).not.toContain('UNDEFINED');
      expect(text).not.toContain('NULL');
    }
  });

  it('names the player involved', () => {
    for (const e of events) {
      if (e.kind === 'goal' || e.kind === 'yellow' || e.kind === 'red' || e.kind === 'shot' || e.kind === 'injury' || e.kind === 'penalty-miss') {
        expect(commentary(world, e)).toContain(surnameOf(e.playerId));
      }
    }
  });

  it('shows the score on goals, half time and full time', () => {
    for (const e of events) {
      if (e.kind === 'goal' || e.kind === 'half-time' || e.kind === 'full-time') {
        expect(commentary(world, e)).toContain(`${e.score[0]}-${e.score[1]}`);
      }
    }
  });

  it('names the club on a corner', () => {
    const corner = events.find((e) => e.kind === 'corner')!;
    expect(commentary(world, corner)).toContain(world.clubs[corner.clubId]!.name.toUpperCase());
  });

  it('names both players on a substitution, and says so when it is forced by injury', () => {
    const rng = createRng(3);
    const w = tiredWorld();
    for (let i = 0; i < 300; i++) {
      const s = createMatch(w, h, defaultTeamSheet(w, h), a, defaultTeamSheet(w, a));
      const evs = playToEnd(w, s, rng);
      const sub = evs.find((e) => e.kind === 'sub');
      if (sub && sub.kind === 'sub') {
        const text = commentary(w, sub);
        expect(text).toContain(w.players[sub.onId]!.lastName.toUpperCase());
        expect(text).toContain(w.players[sub.offId]!.lastName.toUpperCase());
        if (sub.forced) expect(text).toContain('INJURY');
        return;
      }
    }
    throw new Error('no substitution found');
  });

  it('mentions exhaustion when a very tired player is hurt', () => {
    const exhausted = events.find((e) => e.kind === 'injury' && e.exhausted && e.mustReplace);
    expect(exhausted).toBeDefined();
    expect(commentary(world, exhausted!)).toContain('EXHAUSTED');
  });

  it('is the same every time for the same event, and varies between events of the same kind', () => {
    const shots = events.filter((e) => e.kind === 'shot' && e.outcome === 'saved');
    expect(commentary(world, shots[0]!)).toBe(commentary(world, shots[0]!));
    const wordings = new Set(shots.slice(0, 300).map((e) => commentary(world, e).replace(/[A-Z']+/g, (m) => (surnameWords.has(m) ? 'X' : m))));
    expect(wordings.size).toBeGreaterThan(1);
  });
});

const surnameWords = new Set(Object.values(world.players).map((p) => p.lastName.toUpperCase()).concat(Object.values(world.players).map((p) => `${p.lastName.toUpperCase()}'S`)));
