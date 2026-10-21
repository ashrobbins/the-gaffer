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
    pointerX: number;
    pointerY: number;
    scroller: HTMLElement | null;
    frame: number;
  }
  let drag: Drag | null = null;

  /** How close to the top or bottom of the view a drag must be before the page scrolls, and how fast it goes. */
  const EDGE = 90;
  const MAX_SPEED = 18;

  const scrollParent = (el: HTMLElement): HTMLElement | null => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const overflow = getComputedStyle(p).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    }
    return null;
  };

  const updateOver = (d: Drag): void => {
    const over = targetAt(d.pointerX, d.pointerY, d.el);
    if (over !== d.over) {
      d.over?.classList.remove('drop');
      d.over = over;
      over?.classList.add('drop');
    }
  };

  /** While the finger is near the top or bottom edge, scroll the page (or the sheet) that way, so a player can be carried a long way. */
  const autoScroll = (d: Drag): void => {
    if (drag !== d) return;
    const area = d.scroller ? d.scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const top = Math.max(0, area.top);
    const bottom = Math.min(window.innerHeight, area.bottom);
    let speed = 0;
    if (d.pointerY < top + EDGE) speed = -MAX_SPEED * Math.min(1, (top + EDGE - d.pointerY) / EDGE);
    else if (d.pointerY > bottom - EDGE) speed = MAX_SPEED * Math.min(1, (d.pointerY - (bottom - EDGE)) / EDGE);
    if (speed !== 0) {
      if (d.scroller) d.scroller.scrollTop += speed;
      else window.scrollBy(0, speed);
      updateOver(d);
    }
    d.frame = requestAnimationFrame(() => autoScroll(d));
  };

  const targetAt = (x: number, y: number, except: HTMLElement): HTMLElement | null => {
    const el = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
    const hit = el?.closest<HTMLElement>(SELECTOR) ?? null;
    return hit && hit !== except ? hit : null;
  };

  root.addEventListener('pointerdown', (e) => {
    const ev = e as PointerEvent;
    const el = (ev.target as HTMLElement).closest<HTMLElement>(SELECTOR);
    if (!el || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    drag = { el, startX: ev.clientX, startY: ev.clientY, moving: false, ghost: null, over: null, halfWidth: 0, halfHeight: 0, pointerX: ev.clientX, pointerY: ev.clientY, scroller: null, frame: 0 };
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
      drag.scroller = scrollParent(drag.el);
      const d = drag;
      d.frame = requestAnimationFrame(() => autoScroll(d));
    }
    const x = Math.max(0, Math.min(window.innerWidth - drag.halfWidth * 2, ev.clientX - drag.halfWidth));
    (drag.ghost as HTMLElement).style.transform = `translate(${x}px,${ev.clientY - drag.halfHeight}px)`;
    drag.pointerX = ev.clientX;
    drag.pointerY = ev.clientY;
    updateOver(drag);
  });

  const finish = (ev: PointerEvent, cancelled: boolean): void => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moving) {
      if (!cancelled) handlers.onTap(refOf(d.el));
      return;
    }
    cancelAnimationFrame(d.frame);
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
