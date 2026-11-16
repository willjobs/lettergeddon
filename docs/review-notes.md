# Independent review and fixes

Four parallel reviews covered rules/engine correctness, asynchronous state and
storage, UI/accessibility, and delivery/offline behavior. The implementation owner
inspected the findings and independently reproduced the significant failures
before selecting fixes. No normal legal-game scoring or expiration defect was
found in this review.

## Highest priority: data loss and offline startup

- **Stale-tab overwrite:** two tabs could load the same game; one submitted CAT,
  then the other erased that move by passing with an old snapshot. Saves now
  atomically compare a revision token and write the Game and new token in one
  IndexedDB transaction. A mismatched tab cannot write again until reloaded. The
  UI hides its private game, offers reload, and preserves its draft for export.
  Opening a tab no longer writes a redundant handoff snapshot.
- **Mixed-version offline cache:** a new worker could precache HTTP-cached old
  HTML beside newly hashed JavaScript. Precache requests now use `cache: reload`.
  The regression exercises two real generated workers, fresh HTTP caching,
  natural activation, HTTP-cache removal, and offline startup of the new release.

## Correctness and usability fixes

- Reject restored endings whose winner, reason, rack penalties, or historical
  score snapshots disagree with the actual final state.
- Restore the entire transient game snapshot for Undo, including rack arrangement
  and shuffle state, rather than pending placements alone.
- Initialize a staged blank's keyboard selector from its assigned letter and
  honor an edited selection.
- Restore keyboard focus to the moved tile after its old button disappears.
- Keep setup controls reachable using bounded internal scrolling at short laptop
  and landscape sizes; the footer previously intercepted the Start button.
- Increase small DL/DW label contrast above 4.5:1, keep coordinates visible and
  aligned while zoomed, and wrap long unbroken player names.
- Include third-party MIT notices in the deployed assets and link them from Help.
- Remove the unconditional offline-readiness claim before caching completes.

## Test improvements selected

Timer tests now require expiration at the expected owner turn for every lifespan
from 2 through 6, using legal opponent scoring turns. Simulations validate staged
actions and phase transitions as well as completed turns; failures include the
configuration, seed, turn, and action.

Browser regressions cover cross-tab conflict/reload, two-release offline updates,
Undo of a rack swap, keyboard blank editing/focus, premium contrast, zoom gutters,
long names, and setup reachability at five additional constrained sizes.

## Scope decisions

These changes address reproduced failures and inexpensive usability fixes.
Broad component extraction and a stronger simulation opponent were not necessary
to resolve the reviewed issues. The simulation policy remains deliberately
bounded. A physical iPhone Safari smoke test remains a release verification item;
Chromium emulation does not replace it.
