import { DIVISION_NAMES } from '../engine/config';
import type { Kit } from '../engine/types';
import { esc } from './format';
import { shirt, trophy } from './sprites';

/** A full-screen moment of celebration. Trophies get the bigger show. */
export interface Celebration {
  kind: 'promotion' | 'league' | 'cup';
  title: string;
  subtitle: string;
  /** A second line, for example the extra sponsor slot a promotion opens. */
  note?: string;
  clubName: string;
  kit: Kit;
}

const CONFETTI = ['#ffc933', '#e53935', '#29b6f6', '#43b84a', '#f2f2f2', '#ff6bd6'];

/** Falling pixels. Positions and timings come from the index, so the same celebration always looks the same. */
function confetti(count: number): string {
  return Array.from({ length: count }, (_, i) => {
    const left = (i * 37 + 11) % 100;
    const delay = ((i * 13) % 24) / 10;
    const fall = 2.6 + (i % 5) * 0.5;
    const size = 6 + (i % 3) * 3;
    return `<i class="cf" style="left:${left}%;width:${size}px;height:${size}px;background:${CONFETTI[i % CONFETTI.length]};animation-delay:${delay}s;animation-duration:${fall}s"></i>`;
  }).join('');
}

/** Bursts of light that open and fade, for the big occasions. */
function fireworks(): string {
  const spots: [number, number, string][] = [
    [18, 22, '#ffc933'],
    [78, 18, '#29b6f6'],
    [50, 12, '#ff6bd6'],
    [12, 52, '#43b84a'],
    [86, 50, '#e53935'],
    [34, 38, '#f2f2f2'],
  ];
  return spots.map(([x, y, c], i) => `<i class="fw" style="left:${x}%;top:${y}%;color:${c};animation-delay:${(i * 0.45).toFixed(2)}s"></i>`).join('');
}

const ARROWS = '<span class="arrows" aria-hidden="true"><i></i><i></i><i></i></span>';

export function celebrationHtml(c: Celebration): string {
  const big = c.kind !== 'promotion';
  const art = big ? `<div class="cel-trophy">${trophy(c.kind === 'league' ? 'league' : 'cup', 160)}<i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i></div>` : `<div class="cel-shirt">${shirt(c.kit, 130)}${ARROWS}</div>`;
  return `<div class="cel ${c.kind}" role="dialog" aria-modal="true" aria-label="${esc(c.title)}">
    <div class="cel-rays" aria-hidden="true"></div>${confetti(big ? 56 : 36)}${big ? fireworks() : ''}
    <div class="cel-body">${art}
      <div class="cel-title">${esc(c.title)}</div>
      <div class="cel-sub">${esc(c.subtitle)}</div>
      ${c.note ? `<div class="cel-note">${esc(c.note)}</div>` : ''}
      <div class="cel-club">${esc(c.clubName)}</div>
      <button class="btn" data-celebrate type="button">Continue</button>
    </div></div>`;
}

/** The celebrations earned by closing a season: a league title first, then promotion. */
export function seasonCelebrations(
  review: { year: number; division: number; movement: 'promoted' | 'relegated' | 'stayed'; nextDivision: number; honours: { kind: 'league' | 'cup'; name: string }[] },
  club: { name: string; kit: Kit },
): Celebration[] {
  const season = `${review.year}/${String(review.year + 1).slice(2)}`;
  const out: Celebration[] = [];
  // The cup is celebrated at the final itself, so only the league title waits for the end of the season.
  for (const h of review.honours.filter((x) => x.kind === 'league')) {
    out.push({
      kind: 'league',
      title: 'CHAMPIONS!',
      subtitle: `${h.name} · ${season}`,
      note: 'It goes in the trophy cabinet.',
      clubName: club.name,
      kit: club.kit,
    });
  }
  if (review.movement === 'promoted') {
    out.push({
      kind: 'promotion',
      title: 'PROMOTED!',
      subtitle: `Welcome to ${DIVISION_NAMES[review.nextDivision]}`,
      note: 'A new sponsor slot opens, and the fans are delighted.',
      clubName: club.name,
      kit: club.kit,
    });
  }
  return out;
}

/** The celebration for winning the Challenge Cup final. */
export function cupWinCelebration(season: number, club: { name: string; kit: Kit }): Celebration {
  return {
    kind: 'cup',
    title: 'CUP WINNERS!',
    subtitle: `Challenge Cup winners · ${season}/${String(season + 1).slice(2)}`,
    note: 'It goes in the trophy cabinet.',
    clubName: club.name,
    kit: club.kit,
  };
}
