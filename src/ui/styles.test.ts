import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

describe('styles.css', () => {
  it('keeps hidden elements hidden even when a rule sets their display, which the sheet depends on', () => {
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  });

  it('removes the default page margin so the sticky header starts at the very top', () => {
    expect(css).toMatch(/html,\s*body\s*\{\s*margin:\s*0/);
  });
});
