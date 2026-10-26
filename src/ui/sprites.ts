import type { Kit } from '../engine/types';

/** Shirts, club badges and trophies, drawn as small vector SVGs in the club's colours. */
const INK = '#060a14';
let clipCount = 0;

/** A darker shade of a hex colour. */
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const parts = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.min(255, Math.round(v * factor)));
  return '#' + parts.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const BODY = 'M11 1 1 6l3 8 4-1.5V27h16V12.5L28 14l3-8L21 1c-1.2 3-8.8 3-10 0z';
const NECK = 'M11 1c1.2 3 8.8 3 10 0';

/**
 * The pattern on a shirt, drawn over the plain body: stripes run down, hoops run across, and sleeves are the
 * second colour. Bars stay inside the body, so they need no clipping.
 */
function pattern(kit: Kit): string {
  const s = kit.secondary;
  switch (kit.style) {
    case 'stripes':
      return `<path d="M12 4.6h2.6V27H12zM17.4 4.6H20V27h-2.6z" fill="${s}"/>`;
    case 'hoops':
      return `<path d="M8 9.5h16v3H8zM8 16.5h16v3H8z" fill="${s}"/>`;
    case 'sleeves':
      return `<path d="M11 1 1 6l3 8 4-1.5V3z" fill="${s}"/><path d="M21 1l10 5-3 8-4-1.5V3z" fill="${s}"/>`;
    default:
      return '';
  }
}

/** A football shirt. */
export function shirt(kit: Kit, width = 48): string {
  return `<svg class="px" viewBox="0 0 32 28" width="${width}" height="${Math.round((width * 28) / 32)}" aria-hidden="true">
    <path d="${BODY}" fill="${kit.primary}"/>${pattern(kit)}
    <path d="${NECK}" fill="none" stroke="${kit.secondary}" stroke-width="1.6"/>
    <path d="${BODY}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

const SHIELD = 'M2 1.5h18v10c0 5-4 8-9 9.5-5-1.500-9-4.500-9-9.500z';

/** The club badge: a shield that follows the shirt style. */
export function crest(kit: Kit, width = 30): string {
  const id = `cr${++clipCount}`;
  let fill: string;
  switch (kit.style) {
    case 'hoops':
      fill = `<path d="M0 6h22v4H0zM0 14h22v4H0z" fill="${kit.secondary}"/>`;
      break;
    case 'stripes':
      fill = `<path d="M6.500 0H10v22H6.500zM12 0h3.500v22H12z" fill="${kit.secondary}"/>`;
      break;
    case 'sleeves':
      fill = `<path d="M0 0h6v22H0zM16 0h6v22h-6z" fill="${kit.secondary}"/>`;
      break;
    default:
      fill = `<path d="M0 0h22v4H0z" fill="${kit.secondary}"/>`;
  }
  return `<svg class="px" viewBox="0 0 22 22" width="${width}" height="${width}" aria-hidden="true"><defs><clipPath id="${id}"><path d="${SHIELD}"/></clipPath></defs>
    <path d="${SHIELD}" fill="${kit.primary}"/><g clip-path="url(#${id})">${fill}</g>
    <path d="${SHIELD}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

/** A trophy: gold for a league title, silver for a cup. */
export function trophy(kind: 'league' | 'cup', width = 64): string {
  const c = kind === 'league' ? '#ffc53d' : '#c9d4f0';
  return `<svg class="px" viewBox="0 0 40 52" width="${width}" height="${Math.round((width * 52) / 40)}" aria-hidden="true">
    <path d="M9 4h22v14c0 8-4.500 12.500-11 12.500S9 26 9 18z" fill="${c}"/>
    <path d="M9 8H3c0 8 3 12 8 13M31 8h6c0 8-3 12-8 13" fill="none" stroke="${c}" stroke-width="3"/>
    <rect x="17.500" y="30" width="5" height="9" fill="${c}"/><path d="M11 39h18v5H11z" fill="${c}"/>
    <rect x="8" y="44" width="24" height="6" fill="${shade(c, 0.7)}"/><path d="M14 7h4v14c-2-1-4-3-4-6z" fill="#fff" opacity=".5"/></svg>`;
}
