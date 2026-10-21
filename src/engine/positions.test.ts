import { describe, expect, it } from 'vitest';
import { ADJACENT, ROLES, positionFit } from './positions';
import type { Position } from './types';

const ALL: Position[] = ['GK', 'LB', 'CB', 'RB', 'DM', 'CM', 'LM', 'RM', 'AM', 'LW', 'RW', 'ST'];

describe('positionFit', () => {
  it('is full strength in a natural position', () => {
    for (const p of ALL) expect(positionFit(p, p)).toEqual({ kind: 'natural', multiplier: 1 });
  });

  it('costs 14% in an adjacent position, in either direction', () => {
    expect(positionFit('CB', 'RB')).toEqual({ kind: 'adjacent', multiplier: 0.86 });
    expect(positionFit('RB', 'CB')).toEqual({ kind: 'adjacent', multiplier: 0.86 });
    expect(positionFit('AM', 'ST')).toEqual({ kind: 'adjacent', multiplier: 0.86 });
  });

  it('costs 40% in an alien position, such as a striker at left back', () => {
    expect(positionFit('ST', 'LB')).toEqual({ kind: 'alien', multiplier: 0.6 });
    expect(positionFit('LW', 'CB')).toEqual({ kind: 'alien', multiplier: 0.6 });
  });

  it('makes a striker in goal, or a goalkeeper outfield, very poor', () => {
    expect(positionFit('ST', 'GK').multiplier).toBeLessThan(0.3);
    expect(positionFit('GK', 'ST').multiplier).toBeLessThanOrEqual(0.3);
    expect(positionFit('GK', 'CB').kind).toBe('alien');
  });

  it('never makes an adjacent or alien player better than a natural one', () => {
    for (const a of ALL) for (const b of ALL) expect(positionFit(a, b).multiplier).toBeLessThanOrEqual(1);
  });

  it('is symmetrical for adjacency: if A covers B then B covers A', () => {
    for (const a of ALL) for (const b of ADJACENT[a]) expect(positionFit(a, b).kind).toBe('adjacent');
  });
});

describe('ROLES', () => {
  it('makes forwards attack most and defenders defend most', () => {
    expect(ROLES.ST.att).toBeGreaterThan(ROLES.CB.att);
    expect(ROLES.CB.def).toBeGreaterThan(ROLES.ST.def);
    expect(ROLES.CM.ctrl).toBeGreaterThanOrEqual(ROLES.ST.ctrl);
  });

  it('defines every position', () => {
    for (const p of ALL) expect(ROLES[p]).toBeDefined();
  });
});
