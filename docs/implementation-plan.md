# Lettergeddon — MVP Implementation Plan

**Status:** Ready for implementation  
**Platform:** Mobile-first web application  
**Primary target:** iPhone Safari  
**Players:** Two, local pass-and-play  
**Reference repository:** https://github.com/willjobs/tile-theory  
**Implementation approach:** New, independent repository

---

## 1. Project overview

Lettergeddon is a Scrabble-inspired word game in which players must use their letter tiles before they expire.

Every tile has a configurable lifespan, measured in the number of turns its owner has to play it. When a tile expires, it explodes, permanently destroying its position on the player's rack.

Players can optionally recover destroyed positions by playing every tile currently in their rack.

The game otherwise follows traditional English Scrabble rules, including letter distribution, word placement, scoring, and endgame scoring.

### Primary goals

1. Create an enjoyable, fully playable two-player word game.
2. Make tile expiration and rack destruction the defining strategic mechanic.
3. Support configurable tile lifespan and optional rack recovery.
4. Fit gameplay within a single iPhone screen without document scrolling.
5. Reuse the proven interaction patterns from Tile Theory.
6. Work offline and preserve games between browser sessions.
7. Provide a polished visual experience using the approved handcrafted tabletop aesthetic.

### Non-goals

Do not implement online multiplayer, computer opponents, accounts, leaderboards, achievements, special power-ups, alternate board sizes, or monetization.

Do not replicate Tile Theory's hidden bonus mechanics, deduction tools, notes, or tap-to-place system.

---

## 2. Technical architecture

### 2.1 Technology stack

Use the same general stack as Tile Theory:

- React and TypeScript
- Vite
- CSS with responsive layouts
- IndexedDB for saved games
- Service worker/PWA for offline functionality
- Vitest for unit and engine tests
- Playwright for browser and mobile-viewport tests
- GitHub Pages for deployment

Do not introduce a backend for the MVP.

### 2.2 Reference implementation

Study the following Tile Theory files before starting:

| File | What to learn or reuse |
|---|---|
| `src/useTileDrag.tsx` | Pointer handling, touch dragging, ghost tiles, hit-testing, board edge panning |
| `src/components/GameBoard.tsx` | Board rendering, responsive grid, enlarged mode |
| `src/App.tsx` | Gameplay layout, rack controls, turn transitions |
| `src/styles.css` | Viewport sizing and responsive breakpoints |
| `src/controller.ts` | Separation of game actions from React components |
| `src/engine/rules.ts` | Existing word placement and validation patterns |
| `src/engine/dictionary.ts` | Dictionary lookup |
| `src/storage/game-store.ts` | IndexedDB persistence |
| `docs/mobile-board/README.md` | Mobile layout measurements and test requirements |
| `docs/window-layout/README.md` | One-window layout decisions |

Reuse patterns and appropriate utilities, but create an independent codebase.

**Important:** Verify that the existing dictionary and any reused assets are appropriately licensed. Do not assume that every asset can be republished.

### 2.3 Suggested project structure

```text
Lettergeddon/
├── public/
│   ├── icons/
│   ├── textures/
│   └── manifest.webmanifest
├── src/
│   ├── components/
│   │   ├── GameBoard.tsx
│   │   ├── Tile.tsx
│   │   ├── TileRack.tsx
│   │   ├── GameHeader.tsx
│   │   ├── GameControls.tsx
│   │   ├── GameSetup.tsx
│   │   ├── TurnResults.tsx
│   │   ├── TurnHandoff.tsx
│   │   └── GameOver.tsx
│   ├── engine/
│   │   ├── types.ts
│   │   ├── game.ts
│   │   ├── rules.ts
│   │   ├── scoring.ts
│   │   ├── expiration.ts
│   │   ├── dictionary.ts
│   │   └── tiles.ts
│   ├── storage/
│   │   └── game-store.ts
│   ├── hooks/
│   │   └── useTileDrag.tsx
│   ├── styles/
│   ├── App.tsx
│   └── main.tsx
└── tests/
    ├── engine/
    └── e2e/
```

This structure is illustrative, not mandatory. Prefer simple organization over unnecessary abstraction.

---

## 3. Game configuration

The New Game screen must support:

| Setting | Values | Default |
|---|---|---|
| Player 1 name | Text | Player 1 |
| Player 2 name | Text | Player 2 |
| Turns until explosion | Integer, 2–6 | 3 |
| Allow rack recovery | Boolean | Enabled |

These settings must be stored with the game and remain unchanged throughout that game.

Do not hardcode the expiration lifespan to three turns.

The game may internally describe recovery-enabled and recovery-disabled games as different modes, but the setup UI should use two independent configuration controls.

---

## 4. Core game state

### 4.1 Board

Represent a standard 15×15 board containing 225 squares.

Each square should track:

- Its index or row/column
- Letter tile, if occupied
- Letter or word multiplier
- Whether a tile is permanently placed

Use the standard Scrabble bonus-square arrangement.

### 4.2 Tiles

Each physical tile must have a unique ID.

Store:

```typescript
type Tile = {
  id: string;
  letter: string;
  value: number;
  isBlank: boolean;
  remainingTurns: number;
};
```

Additional fields may be used for blank-tile assignments or rendering.

**Critical rule:** The countdown belongs to the tile, not the rack position.

Moving or shuffling a tile must not affect its remaining lifespan.

### 4.3 Player rack

Each player's rack contains exactly seven positions.

Each position is either:

- Intact and occupied
- Intact and empty
- Destroyed

Keep seven visible positions regardless of capacity.

Do not simply decrease an abstract rack-capacity counter without recording which positions are destroyed.

### 4.4 Full game state

Track at minimum:

- Game ID and schema version
- Player names and scores
- Active player
- Turn number
- Board contents
- Each player's seven rack positions
- Remaining tile bag
- Game settings
- Pending placements
- Scoreless-turn counter
- Game phase
- Move history
- Previous turn results
- Game-ending reason and winner, when applicable

Use explicit game phases, such as:

```text
setup
playing
turn-results
handoff
game-over
```

The engine should contain no UI-specific animation state.

All game rules should be deterministic given the current state and an action. Allow a seeded random number generator for testing tile draws.

---

## 5. Tile expiration mechanics

### 5.1 Tile lifespan

A tile drawn after a player's turn begins with the configured number of turns remaining.

For a three-turn game:

| Event | Remaining turns |
|---|---:|
| Tile drawn | 3 |
| First owner turn completed without playing tile | 2 |
| Second owner turn completed without playing tile | 1 |
| Third owner turn completed without playing tile | Explodes |

Only the owner's turns affect their tiles.

A tile does not age during the opponent's turn.

### 5.2 Explosion

When a tile's remaining lifespan reaches zero:

1. Remove the tile from the player's rack.
2. Destroy the rack position it occupied.
3. Permanently remove the tile from the game.
4. Decrease the player's rack capacity by one.
5. Record the explosion in the turn results.

Multiple tiles can explode simultaneously.

Do not limit the number of explosions in a single turn.

Exploded tiles must not return to the bag and must not incur a second score penalty.

### 5.3 Placement timing

Only tiles remaining in the rack after a completed turn age.

A tile successfully played onto the board is safe and no longer has a countdown.

A tile temporarily staged on the board but returned before submission remains subject to expiration.

Invalid move submissions do not consume a turn and do not age tiles.

### 5.4 Destroyed rack positions

Destroyed positions:

- Remain visible.
- Cannot hold tiles.
- Cannot accept dragged tiles.
- Are not refilled.
- Stay in the same location when the player shuffles their rack.

Intact tiles may be rearranged between surviving positions.

The engine must prevent any action that accidentally moves a tile into a destroyed position.

---

## 6. Rack recovery

When recovery is enabled, playing every tile currently held in the rack restores exactly one destroyed position.

### Requirements

- The move must be valid and successfully submitted.
- Every tile held at the beginning of the turn must be played.
- At least one tile must be played.
- Restore at most one slot per turn.
- Capacity can never exceed seven.
- Recover the leftmost destroyed rack position.
- Recovery is disabled entirely when the configuration toggle is off.

### Examples

| Starting rack | Tiles played | Recovery |
|---|---:|---|
| 7 occupied slots | 7 | No additional slot |
| 6 occupied slots, 1 destroyed | 6 | Restore 1 |
| 5 occupied slots, 2 destroyed | 5 | Restore 1 |
| 2 occupied slots, 5 destroyed | 2 | Restore 1 |
| 5 available slots, 2 occupied because bag is empty | 2 | Restore 1 |
| 4 occupied slots | 3 | None |

A rack clear does not automatically award the standard 50-point bingo bonus.

Only playing seven tiles earns that bonus.

If the player clears their rack while the bag is empty, apply the normal game-ending rules after resolving the move.

---

## 7. Word placement and scoring

Implement conventional Scrabble rules.

### Placement

- The first word must cover the center square.
- All newly placed tiles must form one horizontal or vertical line.
- New words must connect to existing words after the opening move.
- All newly formed perpendicular words must be valid.
- Players may extend existing words and build parallel words.
- Blank tiles may represent any letter but always score zero.
- A blank's assigned letter remains fixed once submitted.

### Scoring

- Standard English letter point values.
- Standard double/triple letter and word squares.
- Multipliers apply only when a square receives a new tile.
- Score all valid words formed by a move.
- Award +50 points when seven tiles are played.

Do not change scoring based on remaining tile lifespan.

### Dictionary

Use a locally bundled, legally usable English word list.

Validate all words before accepting a move.

The MVP should use automatic validation rather than player challenges.

Invalid words should produce a concise explanation and leave the turn unchanged.

### Word placement integrity

The engine must reject moves that:

- Place tiles on occupied squares
- Create gaps not filled by existing board tiles
- Form disconnected words
- Use tiles not owned by the active player
- Use more tiles than are available
- Produce invalid crosswords
- Violate the current game's board rules

All validity checks must occur in the engine, not just the UI.

---

## 8. Exchanges, passing, and turn processing

### 8.1 Exchanging tiles

Use conventional Scrabble exchange eligibility: at least seven tiles must remain in the bag.

During an exchange:

1. The player selects one or more tiles.
2. The selected tiles are removed from the rack.
3. Draw the same number of replacements from the pre-exchange bag.
4. Return the exchanged tiles to the bag and reshuffle.
5. Give replacement tiles the full configured lifespan.
6. Age all retained tiles.
7. Resolve explosions among retained tiles.
8. Refill any surviving empty rack positions, as appropriate.
9. End the turn without scoring points.

Replacement tiles must not immediately age on the turn they were acquired.

The bag must conserve tiles correctly: exchanges must never duplicate or lose tiles.

### 8.2 Passing

Passing consumes a turn and scores zero points.

All retained tiles age normally.

Tiles may explode after a pass.

### 8.3 Turn-processing sequence

For a successfully submitted word:

1. Validate placement and words.
2. Calculate and award points.
3. Remove played tiles from the rack.
4. Check for rack-clear recovery.
5. Restore one slot if eligible.
6. Age retained tiles.
7. Resolve explosions.
8. Check for elimination.
9. Refill intact rack positions.
10. Check conventional game-ending conditions.
11. Save the new game state.
12. Display the turn-results screen.

The engine must treat this as one atomic transaction. A failed action must not partially modify game state.

For exchanges, apply the exchange-specific ordering above; do not accidentally age replacement tiles.

---

## 9. Game ending

### 9.1 Elimination

If a player's rack capacity becomes zero, that player immediately loses.

The other player wins regardless of score.

### 9.2 Conventional endgame

Do not end the game simply because the tile bag reaches zero.

After the bag is empty, continue until a player plays their final tile or the game reaches the standard scoreless-turn limit.

Use six consecutive scoreless turns as the stalled-game limit.

Exchanges and passes count as scoreless turns. A valid zero-point play also counts as scoreless.

### 9.3 Final scoring

On a conventional game ending:

- Subtract unplayed tile values from each player's score.
- When one player goes out, add the opponent's remaining tile values to that player's score.
- Exploded tiles are excluded from final rack-value penalties.
- If the game stalls, subtract the respective remaining rack values without an outgoing-player bonus.
- The highest adjusted score wins.
- Support a tie.

If a player is eliminated, elimination overrides point totals.

### 9.4 Zero-capacity edge cases

Evaluate elimination after explosions, before ordinary endgame settlement.

An empty but intact rack is not an eliminated rack.

A player who legally plays their last tile is not eliminated simply because they now hold no tiles.

---

## 10. Mobile UI implementation

### 10.1 Reference layout

Use Tile Theory's mobile layout as the primary structural reference.

Its documented responsive targets include:

| Viewport | Purpose |
|---|---|
| 393×635 | Primary Safari-sized phone |
| 390×667 | Standard mobile |
| 320×568 | Small phone |
| 844×390 | Phone landscape |
| 768×1024 | Tablet |
| 1440×900 | Desktop |

The primary gameplay view must fit without vertical document scrolling at supported standard mobile sizes.

Use the visual viewport and available height rather than assuming a fixed phone height.

At extremely small viewports or with substantially enlarged accessibility text, prioritize usability over forcing content to fit.

### 10.2 Screen arrangement

Portrait gameplay layout, from top to bottom:

1. Compact Lettergeddon header and help/menu access.
2. Both players' scores and current turn information.
3. Board controls, including Fit Board / Enlarge.
4. Main 15×15 board.
5. Seven-position rack.
6. Bottom action toolbar.

Primary actions:

- Shuffle
- Submit Word
- Undo
- Recall

Secondary actions in More:

- Exchange
- Pass
- Rules / Help
- Game history
- New Game

Do not include Tile Theory's Play/Notes toggle or deduction tools.

### 10.3 Board sizing

The board should consume nearly the full available phone width while retaining space for the rack and controls.

Preserve a square 15×15 grid, with correctly aligned coordinate labels and multipliers.

The layout must remain stable while tiles are moved or explosions animate.

No horizontal document overflow.

### 10.4 Board zoom

Implement:

**Fit Board:** Entire board visible.

**Enlarge:** Board zoomed for precise placement, with internal panning.

Preserve Tile Theory's enlarged-board edge-panning behavior during dragging.

Do not use browser page scrolling as the primary method of exploring the board.

Initial recommendation: do not automatically enlarge the board after every tile placement. Let the user explicitly choose zoom. This avoids unexpected view changes during drag-only interaction.

### 10.5 Drag-and-drop only

Adapt Tile Theory's `useTileDrag.tsx`.

Required behaviors:

- Drag from rack to board.
- Drag staged tiles between board squares.
- Drag staged tiles back into rack.
- Show a floating tile preview above the finger.
- Highlight the current valid drop location.
- Cancel invalid drops without changing state.
- Support mouse and touch pointers.
- Support board edge panning in enlarged mode.
- Prevent accidental page scrolling during an active drag.
- Cancel an active drag when a modal opens or a turn changes.

Explicitly remove:

- Tap-to-place
- Direction toggle
- Board placement cursor
- Direction arrows
- Tap-to-select tile placement

Buttons for actions such as Shuffle and Submit remain ordinary buttons.

### 10.6 Rack visuals

The rack is a defining visual component of Lettergeddon.

Maintain exactly seven visible rack positions.

Each occupied tile displays:

- Letter
- Point value
- Circular countdown ring
- Progressive cracking corresponding to remaining lifespan

For a three-turn game, a new tile should have a complete ring and no cracking; an intermediate tile has a partially depleted ring and light cracking; a tile on its last turn has a nearly empty ring and prominent cracking.

For other configured lifespans, calculate ring progress proportionally and scale crack intensity as expiration approaches.

Cracks must be visible without relying on color.

A destroyed slot should look physically broken and unusable.

Recovery repairs an existing broken slot.

Do not replace destroyed positions with simple invisible gaps.

### 10.7 Accessibility

- Provide accessible descriptions for letter, point value, and exact remaining turns.
- Do not rely on color alone to communicate expiration.
- Respect reduced-motion preferences.
- Keep action targets approximately 44×44 CSS pixels or larger wherever feasible.
- Provide visible keyboard focus indicators.
- Maintain sufficient text contrast.
- Provide a non-drag keyboard-accessible tile-placement alternative without introducing the removed tap-to-place UI. This can be a focused keyboard interaction rather than a second touch-placement mode.

---

## 11. Visual design

### 11.1 Approved aesthetic

Use the third Modern Tabletop mockup as the visual reference.

Direction:

**Handcrafted tabletop with a restrained sense of danger and destruction.**

Materials and colors:

- Dark forest green
- Warm natural wood
- Brass accents
- Ivory/parchment
- Restrained orange highlights
- Subtle material texture and depth

The game should feel like a carefully designed physical board game, not a cheap arcade app or advertisement.

### 11.2 Visual priorities

1. Board legibility
2. Letter readability
3. Tile expiration state
4. Destroyed rack positions
5. Primary controls
6. Decorative details

Avoid elaborate background illustrations that compete with the board.

Do not reproduce Tile Theory's original colors.

### 11.3 Animations

**Explosion:** Tile fractures, briefly bursts into debris, and reveals a destroyed rack position.

**Recovery:** A destroyed position visibly repairs itself.

**Tile aging:** The ring and cracking appearance update at turn completion.

**Drag:** Smooth floating tile preview with an unobstructed drop target.

Use brief animations, generally under 600 ms.

Animations must never be required for the engine to progress or for a save to complete.

Respect `prefers-reduced-motion`.

---

## 12. Screen flows

### 12.1 Home

Display:

- Lettergeddon branding
- New Game
- Continue Game when a saved game exists
- How to Play

### 12.2 New Game

Collect names, lifespan, and recovery setting.

Explain the central mechanic concisely.

Do not require accounts.

### 12.3 Gameplay

Display the main board and rack.

Show scores, active player, turn number, and bag count.

Display normal validation feedback for invalid moves.

**Do not display warnings that a submitted move will cause tile explosions.**

Countdown rings and cracks already communicate the risk.

### 12.4 Turn results

After every completed turn, show a brief result screen containing:

- Player name
- Move points
- Updated total score
- Played word(s), if applicable
- Number of tiles exploded
- Number of slots restored
- Rack capacity change

For passes and exchanges, show an appropriate short result.

Do not reveal newly drawn tiles belonging to the next player.

The user must explicitly advance from results to handoff; do not automatically advance after a timer.

### 12.5 Handoff

Display a neutral screen identifying the next player.

Require the next player to press a button to reveal their rack.

Hide all private rack information until then.

Do not expose private information through modals, history, or back navigation.

### 12.6 Game over

Display:

- Winner or tie
- Reason the game ended
- Final adjusted scores
- Highest-scoring word
- Explosions per player
- Slots recovered per player
- Total turns

Offer New Game and Return Home.

---

## 13. Persistence and offline behavior

Adapt Tile Theory's IndexedDB storage approach.

### Requirements

- Autosave after every completed turn.
- Save the current phase, including results and handoff.
- Save pending moves when appropriate.
- Restore the complete board, rack positions, tile timers, and settings.
- Preserve game history.
- Restore the last saved game after browser restart.
- Work offline after successful initial caching.
- Ensure assets and dictionary are available offline.

### Important privacy detail

When reloading during a handoff, reopen the handoff screen—not the next player's exposed rack.

### Save compatibility

Include a schema version so future updates can migrate or explicitly reject incompatible saves.

Handle unavailable or corrupted local storage gracefully.

Do not silently erase a saved game.

---

## 14. Testing requirements

Write engine tests before building complex visual components.

### 14.1 Engine unit tests

At minimum, test:

| Test | Expected result |
|---|---|
| New game | Both racks start with seven intact positions |
| Tile aging | Only active player's retained tiles age |
| Fresh draw | Newly drawn tile receives full lifespan |
| Third expiration turn | Tile explodes after its third unplayed owner turn |
| Multiple expirations | All expired tiles explode |
| Rack destruction | Destroyed positions become unavailable |
| Shuffle | Tile age and broken positions stay unchanged |
| Rack clear | One slot restored when enabled |
| Recovery disabled | Rack clear restores nothing |
| Maximum capacity | Recovery never exceeds seven slots |
| Partial rack clear | No recovery |
| Exchange | Replacement tiles receive fresh timers |
| Retained exchange tiles | Continue aging |
| Exchange bag threshold | Exchange rejected with fewer than seven bag tiles |
| Pass | Retained tiles age |
| Invalid submission | No score, aging, or state change |
| Seven-tile bingo | Awards standard 50-point bonus |
| Reduced-capacity clear | Restores slot but does not award +50 |
| Blank tile | Zero points, valid letter assignment |
| Last slot destroyed | Immediate elimination |
| Empty bag | Does not independently end the game |
| Final tile played | Correct conventional ending |
| Stalled game | Ends after six scoreless turns |
| Final penalties | Only remaining rack letters are penalized |
| Tile conservation | No tile duplicated or accidentally discarded |

Also test normal word placement, crossword validation, multipliers, scoring, and tile-bag distribution.

### 14.2 Property/invariant tests

After every valid game action, verify:

- Exactly seven rack positions per player.
- No destroyed position contains a tile.
- No tile exists in multiple locations.
- No intact rack has more tiles than its available positions.
- Scores are updated consistently.
- Tile timers remain within allowed ranges.
- Every original tile is accounted for in exactly one location: bag, rack, board, or exploded/discarded.
- Completed turns do not leave unresolved staged placements.
- The inactive player's rack never ages.

### 14.3 Browser interaction tests

Using Playwright, cover:

- Touch drag from rack to board
- Mouse drag from rack to board
- Moving a staged tile
- Recalling a staged tile
- Invalid drop cancellation
- Dragging near board edges while zoomed
- Shuffling without resetting timers
- Drag prevention on destroyed rack positions
- Blank tile assignment
- Exchange selection
- Pass
- Turn-results display
- Handoff privacy
- Resume after refresh
- Offline reload
- Reduced-motion behavior

### 14.4 Responsive tests

At the target viewports, verify:

- No normal gameplay document scrolling.
- Board remains square.
- Board does not overlap the rack or controls.
- No controls are clipped.
- No unintended horizontal overflow.
- Tile rings and cracks are visible.
- All seven rack positions remain visible.
- Destroyed positions remain distinguishable.
- Enlarged board pans internally.

Test both a fresh board and a heavily occupied board.

At least one manual test should be completed on physical iPhone Safari before release.

---

## 15. Implementation phases

### Phase 1 — Repository and engine foundation

**Tasks**

- Create the independent repository.
- Configure React, TypeScript, Vite, tests, linting, and deployment.
- Define game types and state.
- Implement board, tile bag, player racks, and game initialization.
- Add deterministic test fixtures.

**Exit criteria**

A new game can be created entirely through engine calls, and all state invariants pass.

### Phase 2 — Standard word game

**Tasks**

- Implement word placement validation.
- Implement dictionary lookup.
- Implement scoring and blank tiles.
- Implement turn submission, exchanging, passing, and traditional endings.
- Add engine unit tests.

**Exit criteria**

Two players can complete a conventional Scrabble-like game entirely through engine calls.

### Phase 3 — Lettergeddon mechanics

**Tasks**

- Implement configurable tile timers.
- Implement expiration and explosions.
- Implement permanent rack-position destruction.
- Implement optional slot recovery.
- Implement elimination.
- Add edge-case tests and invariants.

**Exit criteria**

The engine supports complete Lettergeddon games with different settings, and test cases cover expiration and recovery behavior.

### Phase 4 — Core user interface

**Tasks**

- Adapt Tile Theory's responsive board layout.
- Implement seven-position rack.
- Adapt touch and mouse dragging.
- Add zoom/panning.
- Add controls, score panels, and move validation.
- Remove all tap-to-place functionality.

**Exit criteria**

Two people can play a complete game in the browser using drag-and-drop.

### Phase 5 — Visual design and animation

**Tasks**

- Implement the approved tabletop aesthetic.
- Add ring and crack tile states.
- Add destroyed-slot visuals.
- Add explosion and recovery animations.
- Add reduced-motion support.
- Verify visual clarity at mobile sizes.

**Exit criteria**

The mechanic is visually understandable without color or advance warnings.

### Phase 6 — Full game experience

**Tasks**

- Implement home and setup screens.
- Implement results, handoff, and game-over screens.
- Implement autosaving and recovery.
- Add help/instructions.
- Enable offline functionality.

**Exit criteria**

A complete game survives closing and reopening the browser, including mid-game and during handoff.

### Phase 7 — QA and release

**Tasks**

- Run all automated tests.
- Test target viewport sizes.
- Test physical iPhone Safari.
- Fix interaction and layout bugs.
- Verify deployed offline support.
- Validate dictionary and asset licensing.
- Deploy the application.

**Exit criteria**

All release acceptance criteria are met.

---

## 16. Release acceptance criteria

The MVP is complete only when:

- [ ] Two local players can complete an entire game.
- [ ] Standard word placement and scoring work correctly.
- [ ] Players can choose 2–6 turns until expiration.
- [ ] Players can enable or disable rack recovery.
- [ ] Tiles age and explode at the correct times.
- [ ] Destroyed rack positions remain visibly broken.
- [ ] Rack clears restore exactly one slot when eligible.
- [ ] Exchanged tiles reset their countdowns.
- [ ] Only drag-and-drop placement is supported on touch devices.
- [ ] No placement arrows or direction controls appear.
- [ ] No advance explosion-warning messages appear.
- [ ] A brief results screen follows each turn.
- [ ] Handoff keeps both players' racks private.
- [ ] Main gameplay fits on supported iPhone screens without normal page scrolling.
- [ ] The chosen tabletop design is implemented.
- [ ] Ring and cracking states are legible without color.
- [ ] Games autosave and resume correctly.
- [ ] Offline gameplay works after initial load.
- [ ] Engine and responsive browser tests pass.
- [ ] Physical iPhone Safari has been tested.

---

## 17. Engineering guidance

Keep the game engine independent from the React UI. It should be possible to simulate an entire game without rendering components.

Use immutable or transactional state updates. A turn submission must either succeed completely or leave the previous game state unchanged.

Do not use animation callbacks to implement game rules. Compute the resulting state first, persist it, and animate the transition separately.

Reuse Tile Theory's proven layout and drag patterns wherever practical, but do not carry over obsolete deduction or tap-placement logic.

Prefer focused, understandable components and pure functions over elaborate abstractions.

Do not add new gameplay rules or features without explicit approval.

### Recommended delivery checkpoints

Request a review after:

1. Standard rules and game state are working.
2. Explosion and recovery tests pass.
3. The mobile gameplay screen is functional.
4. The visual design is implemented.
5. Full game flow and offline persistence pass QA.

The primary success criterion is not just that Lettergeddon works. It should feel like a polished, tactile word game whose expiration mechanic is immediately understandable and strategically meaningful.
