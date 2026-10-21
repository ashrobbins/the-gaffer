import type { Kit } from '../engine/types';

/** True for a clearly green colour, which the goalkeeper must not share with the team. */
export function isGreen(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 30) return false;
  const d = max - min;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h >= 75 && h <= 165;
}

/** The goalkeeper's kit: green, unless the team's main colour is green, then yellow. */
export function goalkeeperKit(kit: Kit): Kit {
  return isGreen(kit.primary)
    ? { style: 'plain', primary: '#f7c92e', secondary: '#161616' }
    : { style: 'plain', primary: '#2fa84f', secondary: '#0f5a26' };
}
