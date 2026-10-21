# The Gaffer

A retro pixel-art football management game for the browser.

- `docs/spec.md` has the game rules agreed during design.
- `docs/mockup.html` is the clickable design mock-up (open it in a browser).
- `src/engine/` is the game engine: plain TypeScript with no screens, tested with Vitest.
- `src/ui/` is the interface (vanilla TypeScript, no framework) and `src/game.ts` and `src/storage.ts` are the saved game and where it is kept (IndexedDB, on the device only).

```bash
npm install
npm test          # run the engine tests
npm run dev       # start the dev server
npm run typecheck
```

## Installing and offline play

The game is a PWA. Open it in a browser and use "Add to Home Screen" (or the install button in Chrome and Edge). After the first visit everything is stored on the device by a service worker, so it runs with no connection. Saves live in IndexedDB on the device only.

- `public/sw.js` is the service worker. `vite build` fills in the list of files to store and a version, so a new build replaces the old store on the next visit.
- `node scripts/make-icons.mjs` redraws the icons in `public/icons`.
- To try the offline build: `npm run build && npm run preview`, open it, wait a moment, stop the server and reload.
