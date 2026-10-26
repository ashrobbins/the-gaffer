import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(path, 'utf8');

describe('installable app', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
    name: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };

  it('has a manifest that opens full screen from the home screen', () => {
    expect(manifest.name).toBe('The Gaffer');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./');
  });

  it('has the icons the manifest names, including one that suits round and squircle masks', () => {
    for (const icon of manifest.icons) expect(existsSync(`public/${icon.src}`)).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
    expect(existsSync('public/icons/apple-touch-icon.png')).toBe(true);
  });

  it('links the manifest and icons from the page', () => {
    const html = read('index.html');
    expect(html).toContain('rel="manifest" href="manifest.webmanifest"');
    expect(html).toContain('apple-touch-icon');
  });

  it('keeps the font on the device instead of fetching it, so it works offline', () => {
    expect(read('index.html')).not.toContain('fonts.googleapis.com');
    expect(read('src/main.ts')).toContain('@fontsource/barlow-condensed');
  });

  it('has a service worker the build can fill in with the files to store', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain('__PRECACHE__');
    expect(sw).toContain('__VERSION__');
    expect(read('src/main.ts')).toContain("register('./sw.js')");
  });
});
