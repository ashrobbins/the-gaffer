import { createRng } from '../engine/rng';
import type { Kit } from '../engine/types';

const W = 192;
const H = 76;

/** Paints the ground on a small canvas: stands that fill up with the capacity, the pitch and the floodlights, in the club's colours. */
export function drawStadium(canvas: HTMLCanvasElement, capacity: number, kit: Kit, seed = 5): void {
  const c = canvas.getContext('2d');
  if (!c) return;
  canvas.width = W;
  canvas.height = H;
  const r = createRng(seed);
  const px = (x: number, y: number, w: number, h: number, col: string): void => {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  };
  px(0, 0, W, H, '#0b1130');
  for (let i = 0; i < 40; i++) px(Math.floor(r.next() * W), Math.floor(r.next() * 14), 1, 1, '#4a5aa0');
  const fill = Math.min(1, capacity / 5200) * 0.55 + 0.3;
  const dark = kit.secondary === '#161616' || kit.secondary === '#1a1a1a';
  const cols = [kit.primary, dark ? '#f2f2f2' : kit.secondary, '#f2f2f2', kit.primary, '#ffd24a'];
  const stand = (x: number, y: number, w: number, h: number): void => {
    px(x, y, w, h, '#26315f');
    for (let yy = y + 1; yy < y + h - 1; yy += 2) {
      for (let xx = x + 1; xx < x + w - 1; xx += 2) px(xx, yy, 1, 2, r.next() < fill ? (cols[Math.floor(r.next() * cols.length)] as string) : '#3a4a8a');
    }
  };
  stand(24, 8, 144, 16);
  stand(24, 64, 144, 8);
  stand(6, 22, 34, 44);
  stand(152, 22, 34, 44);
  for (let i = 0; i < 7; i++) px(42, 26 + i * 6, 108, 6, i % 2 ? '#4d9628' : '#58a432');
  c.strokeStyle = '#ffffffcc';
  c.lineWidth = 1;
  c.strokeRect(42.5, 26.5, 107, 41);
  px(95, 26, 1, 41, '#ffffffcc');
  c.strokeRect(42.5, 36.5, 14, 21);
  c.strokeRect(135.5, 36.5, 14, 21);
  px(92, 44, 8, 1, '#ffffffcc');
  px(92, 49, 8, 1, '#ffffffcc');
  px(92, 44, 1, 6, '#ffffffcc');
  px(99, 44, 1, 6, '#ffffffcc');
  for (const [x, y] of [[3, 4], [185, 4], [3, 56], [185, 56]] as const) {
    px(x, y, 1, 16, '#6b78a8');
    px(x - 3, y - 2, 7, 3, '#ffe27a');
    px(x - 2, y - 4, 5, 1, '#ffe27a88');
  }
  px(44, 2, 104, 3, '#1b2552');
  for (let i = 0; i < 13; i++) px(46 + i * 8, 3, 4, 1, i % 2 ? '#ffc933' : kit.primary);
}
