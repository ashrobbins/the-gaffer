// Draws the app icons: a gold pixel-art shirt on the dark game background. Run with `node scripts/make-icons.mjs`.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SHIRT = [
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
const COLOURS = { o: [7, 11, 27], b: [229, 57, 53], k: [255, 201, 51], c: [255, 201, 51], d: [90, 20, 20] };
const BG = [11, 17, 48];

function crc32(buf) {
  let c;
  const table = Array.from({ length: 256 }, (_, n) => {
    c = n;
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

/** `size` pixels square. `fill` is how much of the icon the shirt takes up (a maskable icon keeps it inside the safe zone). */
function png(size, fill) {
  const scale = Math.floor((size * fill) / SHIRT[0].length);
  const w = SHIRT[0].length * scale;
  const h = SHIRT.length * scale;
  const x0 = Math.floor((size - w) / 2);
  const y0 = Math.floor((size - h) / 2);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let rgb = BG;
      const sx = Math.floor((x - x0) / scale);
      const sy = Math.floor((y - y0) / scale);
      if (x >= x0 && y >= y0 && sx < SHIRT[0].length && sy < SHIRT.length) {
        const ch = SHIRT[sy][sx];
        if (ch !== '.') rgb = COLOURS[ch];
      }
      raw.set(rgb, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icons/icon-192.png', png(192, 0.8));
writeFileSync('public/icons/icon-512.png', png(512, 0.8));
writeFileSync('public/icons/maskable-512.png', png(512, 0.56));
writeFileSync('public/icons/apple-touch-icon.png', png(180, 0.74));
console.log('icons written');
