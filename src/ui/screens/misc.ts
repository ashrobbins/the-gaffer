/** Match day. It is never in the navigation: the only way here is the "Go to match" button on HQ. */
export function renderMatchDay(): string {
  return `<div class="box"><h2>Match day <small>coming soon</small></h2>
    <p class="note" style="margin-bottom:14px">The pre-match team talk, kick-off and live commentary are still being built.</p>
    <div class="row2"><button class="btn ghost" data-act="back-to-hq" type="button">Back to HQ</button></div>
  </div>`;
}
