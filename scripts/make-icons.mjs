// Draws the app icons: a red striped shirt on a lime slab, on the dark game background. Run with `node scripts/make-icons.mjs`.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

// The shirt, in a 32 x 28 box.
const BODY = [[11, 1], [1, 6], [4, 14], [8, 12.5], [8, 27], [24, 27], [24, 12.5], [28, 14], [31, 6], [21, 1], [18.5, 3.2], [16, 3.6], [13.5, 3.2]];
const STRIPES = [[12, 4.6, 14.6, 27], [17.4, 4.6, 20, 27]];
const INK = [6, 10, 20];
const SHIRT = [221, 52, 52];
const LIME = [198, 255, 61];

function crc32(buf) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const inside = (poly, x, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const distToEdges = (poly, x, y) => {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
};

/** Colour at a point of the icon, in a 0..1 square. `fill` is how much of the icon the shirt takes up. */
function colourAt(u, v, fill) {
  // Background: a dark gradient.
  const g = 1 - v * 0.45;
  let rgb = [Math.round(16 * g), Math.round(30 * g), Math.round(66 * g)];
  // A lime slab behind the shirt, leaning like the wordmark.
  const sx = (u - 0.5) / fill;
  const sy = (v - 0.5) / fill;
  const slabLeft = -0.62 - sy * 0.18;
  const slabRight = 0.62 - sy * 0.18;
  if (Math.abs(sy) < 0.34 && sx > slabLeft && sx < slabRight) rgb = LIME;
  // The shirt.
  const scale = 32 * fill;
  const x = (u - 0.5) * (32 / scale) * 32 + 16;
  const y = (v - 0.5) * (32 / scale) * 32 + 14;
  const edge = 1.1;
  if (inside(BODY, x, y)) {
    rgb = SHIRT;
    if (STRIPES.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) rgb = INK;
    return rgb;
  }
  if (distToEdges(BODY, x, y) < edge) return INK;
  return rgb;
}

function png(size, fill) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const sub = 3;
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const c = colourAt((px + (sx + 0.5) / sub) / size, (py + (sy + 0.5) / sub) / size, fill);
          sum[0] += c[0];
          sum[1] += c[1];
          sum[2] += c[2];
        }
      }
      raw.set(sum.map((s) => Math.round(s / (sub * sub))), py * (size * 3 + 1) + 1 + px * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('public/icons/icon-192.png', png(192, 0.62));
writeFileSync('public/icons/icon-512.png', png(512, 0.62));
writeFileSync('public/icons/maskable-512.png', png(512, 0.46));
writeFileSync('public/icons/apple-touch-icon.png', png(180, 0.58));
console.log('icons written');
