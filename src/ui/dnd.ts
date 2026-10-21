/** A place in the lineup: a position on the pitch, or a spot on the bench. */
export type LineupRef = { kind: 'slot' | 'bench'; index: number };

export interface DndHandlers {
  /** Something was dragged onto something else. */
  onSwap(from: LineupRef, to: LineupRef): void;
  /** A tap or key press, with no drag. */
  onTap(ref: LineupRef): void;
}

const SELECTOR = '[data-slot],[data-bn]';

function refOf(el: HTMLElement): LineupRef {
  return el.dataset.slot !== undefined ? { kind: 'slot', index: Number(el.dataset.slot) } : { kind: 'bench', index: Number(el.dataset.bn) };
}

/**
 * Drag and drop for the pitch and bench, using pointer events so it works with a finger as well as a mouse.
 * Listeners sit on `root` and look for `[data-slot]` and `[data-bn]` elements, so the screen can be redrawn freely
 * without attaching them again. A press that moves less than a few pixels counts as a tap.
 */
export function attachLineupDnd(root: HTMLElement, handlers: DndHandlers): void {
  interface Drag {
    el: HTMLElement;
    startX: number;
    startY: number;
    moving: boolean;
    ghost: HTMLElement | null;
    over: HTMLElement | null;
    halfWidth: number;
    halfHeight: number;
  }
  let drag: Drag | null = null;

  const targetAt = (x: number, y: number, except: HTMLElement): HTMLElement | null => {
    const el = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
    const hit = el?.closest<HTMLElement>(SELECTOR) ?? null;
    return hit && hit !== except ? hit : null;
  };

  root.addEventListener('pointerdown', (e) => {
    const ev = e as PointerEvent;
    const el = (ev.target as HTMLElement).closest<HTMLElement>(SELECTOR);
    if (!el || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    drag = { el, startX: ev.clientX, startY: ev.clientY, moving: false, ghost: null, over: null, halfWidth: 0, halfHeight: 0 };
  });

  document.addEventListener('pointermove', (e) => {
    const ev = e as PointerEvent;
    if (!drag) return;
    if (!drag.moving) {
      if (Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) < 8) return;
      drag.moving = true;
      const pitch = drag.el.closest<HTMLElement>('.pitch');
      const wrap = document.createElement('div');
      wrap.className = 'ghostwrap';
      wrap.style.width = `${pitch ? pitch.offsetWidth : drag.el.offsetWidth}px`;
      const clone = drag.el.cloneNode(true) as HTMLElement;
      clone.removeAttribute('data-slot');
      clone.removeAttribute('data-bn');
      clone.style.width = `${drag.el.offsetWidth}px`;
      clone.style.left = '0';
      clone.style.top = '0';
      wrap.appendChild(clone);
      document.body.appendChild(wrap);
      drag.ghost = wrap;
      drag.halfWidth = drag.el.offsetWidth / 2;
      drag.halfHeight = drag.el.offsetHeight / 2;
      drag.el.classList.add('dragging');
    }
    const x = Math.max(0, Math.min(window.innerWidth - drag.halfWidth * 2, ev.clientX - drag.halfWidth));
    (drag.ghost as HTMLElement).style.transform = `translate(${x}px,${ev.clientY - drag.halfHeight}px)`;
    const over = targetAt(ev.clientX, ev.clientY, drag.el);
    if (over !== drag.over) {
      drag.over?.classList.remove('drop');
      drag.over = over;
      over?.classList.add('drop');
    }
  });

  const finish = (ev: PointerEvent, cancelled: boolean): void => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moving) {
      if (!cancelled) handlers.onTap(refOf(d.el));
      return;
    }
    d.ghost?.remove();
    d.over?.classList.remove('drop');
    d.el.classList.remove('dragging');
    const target = cancelled ? null : targetAt(ev.clientX, ev.clientY, d.el);
    if (target) handlers.onSwap(refOf(d.el), refOf(target));
  };
  document.addEventListener('pointerup', (e) => finish(e as PointerEvent, false));
  document.addEventListener('pointercancel', (e) => finish(e as PointerEvent, true));

  root.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const el = (ev.target as HTMLElement).closest<HTMLElement>(SELECTOR);
    if (!el) return;
    ev.preventDefault();
    handlers.onTap(refOf(el));
  });
}
