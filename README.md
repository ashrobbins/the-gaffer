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
