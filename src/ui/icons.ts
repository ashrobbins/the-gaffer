import type { Player } from '../engine/types';

export const segs = (value: number, max = 10, tone = ''): string => {
  const filled = Math.round((value / 100) * max);
  return `<span class="segs ${tone}">${Array.from({ length: max }, (_, i) => `<i class="${i < filled ? 'f' : ''}"></i>`).join('')}</span>`;
};

export const pips = (value: number, low = false): string =>
  `<span class="pips ${low ? 'lo' : ''}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= value ? 'f' : ''}"></i>`).join('')}</span>`;

export const trend = (n: number): string => (n > 0 ? '<i class="up"></i>' : n < 0 ? '<i class="dn"></i>' : '<i class="eq"></i>');

const BATTERY =
  '<svg viewBox="0 0 10 6" aria-hidden="true" shape-rendering="crispEdges"><rect width="8" height="6" fill="#07101f"/><rect x="8" y="2" width="2" height="2" fill="#07101f"/><rect x="1" y="1" width="2" height="4" fill="#ff4b3e"/></svg>';
const CROSS =
  '<svg viewBox="0 0 5 5" aria-hidden="true" shape-rendering="crispEdges"><rect x="2" y="0" width="1" height="5" fill="#fff"/><rect x="0" y="2" width="5" height="1" fill="#fff"/></svg>';

/** The small badges on a shirt: a battery when a player is tired (red once an injury is likely), a cross when injured. */
export function conditionIcons(p: Pick<Player, 'fatigue' | 'injury'>): string {
  const tired =
    p.fatigue > 80
      ? `<i class="tired hi" title="High injury risk">${BATTERY}</i>`
      : p.fatigue > 50
        ? `<i class="tired" title="Tired">${BATTERY}</i>`
        : '';
  return tired + (p.injury ? `<i class="injb" title="Injured">${CROSS}</i>` : '');
}

export const surname = (p: Pick<Player, 'lastName'>): string => p.lastName.toUpperCase().slice(0, 9);

export type PositionGroup = 'GK' | 'DEF' | 'MID' | 'ATT';
export const positionGroup = (pos: string): PositionGroup =>
  pos === 'GK' ? 'GK' : ['LB', 'CB', 'RB'].includes(pos) ? 'DEF' : ['LW', 'RW', 'ST'].includes(pos) ? 'ATT' : 'MID';

/** The last results as small coloured letters, oldest first. */
export const form5 = (results: string): string =>
  `<span class="fm">${[...results].map((c) => `<i class="${c}">${c}</i>`).join('')}</span>`;
