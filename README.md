# Lettergeddon

A mobile-first, two-player pass-and-play word game. Build words before your
letter tiles expire and destroy their rack positions. Built with React,
TypeScript, Vite, IndexedDB, and an offline service worker. No backend or accounts.

## Run locally

Requires Node.js 24 or newer.

```sh
npm ci
npm run dev
```

For the production app and offline behavior:

```sh
npm run build
npm run preview
```

Service workers are enabled only in the production build. Serve over HTTPS or
localhost; opening `index.html` directly does not support modules or offline saves.

## Validate

```sh
npm run lint
npm test
npm run simulate -- --report
npm run build
npm run test:e2e
```

The Playwright config uses `/usr/bin/chromium` in this workspace. On another
machine, run `npx playwright install chromium` and
`CHROMIUM_PATH=bundled npm run test:e2e`, or set `CHROMIUM_PATH` to your browser.
`npm run format` formats the source and test files.

## Game rules

- Standard English tile distribution, 15 × 15 board premiums, connected placement,
  crossword validation, blank assignment, scoring, and seven-tile bonus.
- Configure tile expiration from 2–6 owner turns and independently enable recovery.
- Timers belong to physical tiles. Only retained tiles age at turn completion.
  New draws and exchange replacements start with the full lifespan.
- Each rack always has seven tracked positions. Expiration destroys the occupied
  position; shuffling never moves broken positions or resets tile timers.
- With recovery enabled, playing every tile held restores the leftmost broken
  position, at most once per turn.
- Exchanges draw from the pre-exchange bag before returning old tiles. At least
  seven bag tiles are required.
- Zero rack capacity means elimination, regardless of score. Otherwise, going out
  with an empty bag or six scoreless turns settles the game normally. Explosions
  that empty a rack on a pass do not count as going out.

The full supplied specification is in [docs/implementation-plan.md](docs/implementation-plan.md).

## Structure and guarantees

`src/engine/` is independent of React. `applyAction` clones its input and validates
before committing, so rejected actions cannot change the original state. Seeded
shuffling makes gameplay reproducible. Invariants account for every physical tile
in the bag, racks, board, or exploded inventory and reconcile scores and board
contents with move history.

`src/hooks/useTileDrag.tsx` handles mouse/touch pointer capture, finger-offset ghost
tiles, drop hit-testing, cancellation, and internal edge panning. Touch placement
uses dragging; keyboard users can focus a tile and enter a board coordinate.
Tile faces reserve separate space for the letter and its point value. Rings and
fractures show tile age; exact turns remaining are available in accessible
descriptions without adding another visible number.

`src/storage/game-store.ts` serializes IndexedDB writes and uses an atomic revision
check to reject stale writes from another tab. Conflicted tabs lock their private
UI until reloaded and can export their unsaved draft. It validates schema and
inventory on load, preserves damaged data for export, and reports storage errors
without resetting a game. Results and handoff phases are persisted. Reloading an
exposed playing phase returns to handoff before showing private tiles.

The production build precaches all assets and the entire dictionary. Cache
versions derive from built content. A new worker waits until the previous app is
closed, avoiding mixed-version assets in an active game. Precache requests bypass fresh HTTP caches so updates never mix an old document
with new hashed assets. Static cache matching
ignores `Vary` so module requests work offline on servers that add `Vary: Origin`.

## Verification

The committed [simulation report](docs/simulation-results.json) covers 72 complete
games: 12 seeds for each combination of two-, three-, and five-turn expiration,
with recovery on and off. The simulation policy proposes dictionary words and
uses the production validator for every play. It is a bounded test policy, not a
computer-opponent feature or an exhaustive balance study. Every completed action
checks invariants and confirms that the inactive rack did not age.

Unit tests cover expiration, atomic validation, recovery, exchange ordering,
scoring, blanks, conventional endings, elimination, and save validation.
Playwright covers mouse and touch dragging, keyboard placement, zoom edge panning,
results and handoff privacy, persistence, offline reload and word submission,
damaged saves, cross-tab conflicts, two-version offline updates, full game flow,
keyboard focus, blank edits, undo, setup reachability, and fresh/occupied board layouts at all six planned
viewport sizes. Captures are in `docs/game-*.png`.

**Release limitation:** a physical iPhone Safari test still needs to be performed.
Chromium mobile emulation does not establish physical Safari compatibility.

The independent review and implemented fixes are recorded in
[docs/review-notes.md](docs/review-notes.md).

## GitHub Pages

The workflow at `.github/workflows/pages.yml` checks the app, simulates games,
builds, runs browser tests, and publishes `dist/` from `main`. Relative Vite asset
paths and service-worker scope support `/lettergeddon/` project hosting.

In repository **Settings → Pages**, choose **GitHub Actions** as the build source.
The environment must allow Pages deployments. The workflow's deploy job uses
`pages: write` and `id-token: write`; it does not alter the repository audience.

## Licensing

The application code is MIT licensed. See [LICENSE](LICENSE).
The bundled Letterpress word list is CC0 and includes US, UK, Australian, and
historical forms; it is not an official tournament dictionary. See
[public/data/DICTIONARY_LICENSE.md](public/data/DICTIONARY_LICENSE.md) and the
included CC0 text for provenance and hashes.

Tile Theory was studied for layout, pointer interaction, viewport, and persistence
patterns. The drag hook is adapted under its MIT license, retained at
[docs/TILE_THEORY_LICENSE.txt](docs/TILE_THEORY_LICENSE.txt). Lettergeddon's game
engine and tabletop graphics are independently implemented. No Tile Theory
illustrations or proprietary artwork were copied.
