import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

/** After a build, tells the service worker every file to store, and stamps it with a version that changes whenever any file does. */
function precache(): Plugin {
  let outDir = 'dist';
  return {
    name: 'gaffer-precache',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const all = files(outDir).map((f) => relative(outDir, f).split('\\').join('/')).filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
      const hash = createHash('sha1');
      for (const f of all.sort()) hash.update(f).update(readFileSync(join(outDir, f)));
      const template = readFileSync(join(outDir, 'sw.js'), 'utf8');
      hash.update(template);
      const sw = template
        .replace('__VERSION__', hash.digest('hex').slice(0, 10))
        .replace('__PRECACHE__', JSON.stringify(['./', ...all], null, 2));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [precache()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
