import type { Kit } from '../engine/types';

/** Pixel-art shirts and crests, drawn as tiny SVG squares so they stay sharp at any size. */
const INK = '#070b1b';

type Template = readonly string[];

function pix(template: Template, colour: (ch: string, x: number, y: number) => string | null, width: number): string {
  const rows = template.length;
  const cols = (template[0] as string).length;
  let rects = '';
  template.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const fill = colour(ch, x, y);
      if (fill) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
    });
  });
  return `<svg class="px" viewBox="0 0 ${cols} ${rows}" width="${width}" height="${(width * rows) / cols}" aria-hidden="true">${rects}</svg>`;
}

// o outline, b body, k sleeve, c collar trim, d inside of the collar
const SHIRT: Template = [
  '.....oooooooooooo.....',
  '...ooobcddddddcbooo...',
  '.ookkbbbcddddcbbbkkoo.',
  'ookkkbbbbccccbbbbkkkoo',
  'okkkkbbbbbbbbbbbbkkkko',
  'okkkkbbbbbbbbbbbbkkkko',
  'okkkkobbbbbbbbbbokkkko',
  '.ooooobbbbbbbbbbooooo.',
  '.....obbbbbbbbbbo.....',
  '.....obbbbbbbbbbo.....',
  '.....obbbbbbbbbbo.....',
  '.....obbbbbbbbbbo.....',
  '.....obbbbbbbbbbo.....',
  '.....obbbbbbbbbbo.....',
  '.....obbbbbbbbbbo.....',
  '.....oooooooooooo.....',
];

const CREST: Template = [
  'oooooooooooo',
  'oaaaaaaaaaao',
  'oaaaaaaaaaao',
  'oaaaaaaaaaao',
  'oaaaaaaaaaao',
  'oaaaaaaaaaao',
  'oaaaaaaaaaao',
  '.oaaaaaaaao.',
  '..oaaaaaao..',
  '...oaaaao...',
  '....oaao....',
  '.....oo.....',
];

/** A darker shade of a hex colour, for the inside of a collar. */
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const parts = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * factor));
  return '#' + parts.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** The colour of a body pixel for each shirt style. Hoops run across, stripes run down. */
function bodyColour(kit: Kit, x: number, y: number): string {
  switch (kit.style) {
    case 'hoops':
      return (y >= 6 && y <= 7) || (y >= 10 && y <= 11) ? kit.secondary : kit.primary;
    case 'stripes':
      return (x >= 8 && x <= 9) || (x >= 12 && x <= 13) ? kit.secondary : kit.primary;
    default:
      return kit.primary;
  }
}

export function shirt(kit: Kit, width = 48): string {
  return pix(
    SHIRT,
    (ch, x, y) => {
      if (ch === 'o') return INK;
      if (ch === 'c') return kit.secondary;
      if (ch === 'd') return shade(kit.primary, 0.55);
      if (ch === 'k') return kit.style === 'sleeves' ? kit.secondary : bodyColour(kit, x, y);
      return bodyColour(kit, x, y);
    },
    width,
  );
}

/** The club badge: a shield that follows the shirt style. */
export function crest(kit: Kit, width = 30): string {
  return pix(
    CREST,
    (ch, x, y) => {
      if (ch === 'o') return INK;
      switch (kit.style) {
        case 'hoops':
          return Math.floor((y - 1) / 2) % 2 ? kit.secondary : kit.primary;
        case 'stripes':
          return Math.floor((x - 1) / 2) % 2 ? kit.secondary : kit.primary;
        case 'sleeves':
          return x <= 2 || x >= 9 ? kit.secondary : kit.primary;
        default:
          return kit.primary;
      }
    },
    width,
  );
}
