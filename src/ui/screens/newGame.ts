import { KIT_COLOURS, KIT_STYLES } from '../../engine/data/palette';
import type { Kit, KitStyle, NewClubOptions } from '../../engine/types';
import { DEFAULT_NEW_CLUB } from '../../engine/worldgen';
import { esc } from '../format';
import { crest, shirt } from '../sprites';

const STYLE_NAMES: Record<KitStyle, string> = { plain: 'Plain', hoops: 'Hoops', stripes: 'Stripes', sleeves: 'Sleeves' };
const MAX_NAME = 24;

export interface NewGameFormState {
  name: string;
  stadium: string;
  kit: Kit;
}

/** What is wrong with the form, or null if the club can be created. */
export function validateNewClub(s: NewGameFormState): string | null {
  if (s.name.trim().length === 0) return 'Give your club a name.';
  if (s.stadium.trim().length === 0) return 'Give your stadium a name.';
  if (s.kit.primary.toLowerCase() === s.kit.secondary.toLowerCase()) return 'Pick two different colours for your kit.';
  return null;
}

function swatches(key: 'primary' | 'secondary', kit: Kit): string {
  const buttons = KIT_COLOURS.map(
    (c) =>
      `<button type="button" class="sw" data-colour="${key}" data-value="${c}" aria-pressed="${kit[key].toLowerCase() === c}" aria-label="${c}" style="background:${c}"></button>`,
  ).join('');
  return `<div class="chips" style="margin-bottom:16px;gap:8px">${buttons}<input type="color" class="sw-in" data-colour="${key}" value="${kit[key]}" aria-label="Custom ${key} colour"></div>`;
}

/**
 * The first screen of a new game, and the only one shown until the club is created. It has no navigation: the
 * game starts when "Create club" is pressed. Typing does not redraw the form, so the cursor never jumps.
 */
export function mountNewGame(root: HTMLElement, onCreate: (club: NewClubOptions) => void): void {
  const state: NewGameFormState = {
    name: DEFAULT_NEW_CLUB.name,
    stadium: DEFAULT_NEW_CLUB.stadiumName,
    kit: { ...DEFAULT_NEW_CLUB.kit },
  };

  root.innerHTML = `
    <div class="grid g2" id="new-game">
      <div class="box"><h2>Create your club</h2>
        <label><span class="lab">Club name</span><input type="text" id="club-name" maxlength="${MAX_NAME}" value="${esc(state.name)}" autocomplete="off"></label>
        <label><span class="lab">Stadium name</span><input type="text" id="stadium-name" maxlength="${MAX_NAME}" value="${esc(state.stadium)}" autocomplete="off"></label>
        <span class="lab">Shirt style</span>
        <div class="kits" id="styles"></div>
        <span class="lab">Primary colour</span><div id="primary"></div>
        <span class="lab">Secondary colour</span><div id="secondary"></div>
      </div>
      <div class="grid" style="align-content:start">
        <div class="box"><h2>Your club <small>live preview</small></h2>
          <div class="row2" style="gap:22px;flex-wrap:nowrap">
            <div id="preview-shirt"></div>
            <div style="min-width:0">
              <div class="row2" style="gap:10px;flex-wrap:nowrap"><span id="preview-crest"></span><span class="big" style="font-size:13px;overflow-wrap:anywhere" id="preview-name"></span></div>
              <div class="dim" style="margin-top:8px">Home: <span class="gold" id="preview-stadium"></span> · 4,200 seats</div>
              <div class="dim">Kit: <span id="preview-style"></span></div>
            </div>
          </div>
        </div>
        <div class="box"><h2>Where you start</h2>
          <div class="stat"><span>League</span><span class="gold">Division Four</span></div>
          <div class="stat"><span>Clubs</span><span>20 per division, 4 divisions</span></div>
          <div class="stat"><span>Squad</span><span>18 players</span></div>
          <div class="stat"><span>Cash</span><span class="gold">£86,400</span></div>
        </div>
      </div>
    </div>
    <p class="note center" id="new-game-error" role="alert" style="color:var(--red);min-height:1.7em;margin-top:18px"></p>
    <div class="row2" style="justify-content:center;margin-top:6px"><button class="btn" id="create-club" type="button">Create club</button></div>`;

  const $ = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`) as T;
  const nameInput = $<HTMLInputElement>('club-name');
  const stadiumInput = $<HTMLInputElement>('stadium-name');
  const create = $<HTMLButtonElement>('create-club');

  const paint = (): void => {
    $('styles').innerHTML = KIT_STYLES.map(
      (style) =>
        `<button type="button" class="kit" data-style="${style}" aria-pressed="${state.kit.style === style}">${shirt({ ...state.kit, style }, 56)}<span>${STYLE_NAMES[style]}</span></button>`,
    ).join('');
    $('primary').innerHTML = swatches('primary', state.kit);
    $('secondary').innerHTML = swatches('secondary', state.kit);
    $('preview-shirt').innerHTML = shirt(state.kit, 110);
    $('preview-crest').innerHTML = crest(state.kit, 34);
    $('preview-name').textContent = (state.name.trim() || 'Your club').toUpperCase();
    $('preview-stadium').textContent = state.stadium.trim() || 'Your ground';
    $('preview-style').textContent = STYLE_NAMES[state.kit.style];
    const problem = validateNewClub(state);
    $('new-game-error').textContent = problem ?? '';
    create.disabled = problem !== null;
  };

  const submit = (): void => {
    if (validateNewClub(state) !== null) return;
    onCreate({ name: state.name.trim(), stadiumName: state.stadium.trim(), kit: { ...state.kit } });
  };

  nameInput.addEventListener('input', () => {
    state.name = nameInput.value;
    paint();
  });
  stadiumInput.addEventListener('input', () => {
    state.stadium = stadiumInput.value;
    paint();
  });
  for (const input of [nameInput, stadiumInput]) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const style = target.closest<HTMLElement>('[data-style]');
    if (style) {
      state.kit = { ...state.kit, style: style.dataset.style as KitStyle };
      paint();
      return;
    }
    const sw = target.closest<HTMLElement>('.sw');
    if (sw) {
      state.kit = { ...state.kit, [sw.dataset.colour as 'primary' | 'secondary']: sw.dataset.value as string };
      paint();
    }
  });
  root.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.classList.contains('sw-in')) {
      state.kit = { ...state.kit, [target.dataset.colour as 'primary' | 'secondary']: target.value };
      // Redraw everything except the colour inputs, so a drag across the picker is not interrupted.
      $('styles').innerHTML = KIT_STYLES.map(
        (style) =>
          `<button type="button" class="kit" data-style="${style}" aria-pressed="${state.kit.style === style}">${shirt({ ...state.kit, style }, 56)}<span>${STYLE_NAMES[style]}</span></button>`,
      ).join('');
      $('preview-shirt').innerHTML = shirt(state.kit, 110);
      $('preview-crest').innerHTML = crest(state.kit, 34);
      const problem = validateNewClub(state);
      $('new-game-error').textContent = problem ?? '';
      create.disabled = problem !== null;
    }
  });
  create.addEventListener('click', submit);
  paint();
  nameInput.focus();
}
