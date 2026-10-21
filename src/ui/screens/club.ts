import { esc } from '../format';

export type ClubTab = 'stadium' | 'sponsors' | 'trophies';

export interface ClubScreenState {
  tab: ClubTab;
  /** True while the "are you sure?" step of resetting the game is showing. */
  confirmingReset: boolean;
}

const TABS: [ClubTab, string, readonly string[]][] = [
  ['stadium', 'Stadium', ['Capacity and average crowd', 'Gate income for home games', 'Build new stands']],
  ['sponsors', 'Sponsors', ['Four sponsor slots', 'Offers earned through achievements']],
  ['trophies', 'Trophies', ['A cabinet for every league title and cup win']],
];

/** The Club page: stadium, sponsors and trophies, with a quiet option at the very bottom to reset the game. */
export function renderClubScreen(state: ClubScreenState): string {
  const active = TABS.find(([id]) => id === state.tab) ?? TABS[0]!;
  const reset = state.confirmingReset
    ? `<div class="box warn" id="reset-confirm" role="alertdialog" aria-labelledby="reset-title">
        <h2 id="reset-title">Delete everything?</h2>
        <p class="note" style="margin-bottom:14px">This deletes your club, your players, your results and every other saved detail on this device. It cannot be undone.</p>
        <div class="row2"><button class="btn" data-act="reset-confirm" type="button" style="background:var(--red);color:#fff">Delete everything</button><button class="btn ghost" data-act="reset-cancel" type="button">Keep my game</button></div>
      </div>`
    : `<div class="row2" style="justify-content:center"><button class="subtle" data-act="reset" type="button">Reset game</button></div>`;

  return `<div class="seg" style="grid-template-columns:repeat(3,1fr)">${TABS.map(
    ([id, label]) => `<button data-club-tab="${id}" aria-pressed="${state.tab === id}" type="button">${label}</button>`,
  ).join('')}</div>
    <div class="box"><h2>${esc(active[1])} <small>coming soon</small></h2>
      <p class="note" style="margin-bottom:10px">This part of the Club page is still being built. It will have:</p>
      ${active[2].map((i) => `<div class="stat"><span>${esc(i)}</span></div>`).join('')}
    </div>
    <div style="margin-top:56px">${reset}</div>`;
}
