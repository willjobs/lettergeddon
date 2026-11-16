# UI and copy review

A dedicated subagent reviewed all screen copy and the rendered home page after
feedback that the landing page looked and read like generated marketing content.
The implementation owner reviewed the recommendations, selected the changes
below, and inspected the desktop and phone renders. The reviewer then checked
the revision and found no remaining material copy issue before publication.

## Findings accepted

The previous page used a marketing hero rather than a game menu: a large
contrasting slogan, a second invitation card, repeated eyebrows, a feature
triplet, and decorative footer copy. These elements repeated vague promises
without explaining the game.

Several phrases also implied a real-time clock. Lettergeddon counts owner turns,
so “Bad timing,” “The clock is ticking,” “Fast & fierce,” and “Room to think” were
misleading as well as unnecessary.

## Implemented direction

- Replace the two-column hero with a compact, single-column game menu.
- Describe the actual rule: unplayed tiles count down after their owner's turns;
  at zero they explode and destroy a rack slot.
- Put Continue game, New game, and How to play directly below that explanation.
- Replace the decorative WORDS tiles with a labeled E-tile example showing three,
  two, and one turns remaining, then a destroyed slot. All E tiles score one.
- Make setup a form headed New game, with numeric lifespan endpoints, explicit
  owner-turn guidance, the existing recovery setting, and a Start game button.
- Use literal titles for More, Game history, Exchange tiles, blank assignment,
  handoff, and game over. Use “scored” for points and factual empty-state text.
- Remove promotional footer lines, forced marketing line breaks, and obsolete
  hero styling. Keep functional save/recovery status during play.
- Clarify that staged tiles are placed, rather than claiming they are ready for
  submission before validation; explain the seven-tile bag requirement beside a
  disabled Exchange action.

The logo, palette, tabletop materials, and actual gameplay controls remain suited
to the supplied mockup. They did not need a separate redesign. The review did not
call for another tagline or changes to game rules.

## Verification

The production build and lint pass. Existing browser flows were updated for
renamed controls and result text. All gameplay flows passed; the setup
reachability checks also passed at five constrained sizes after accounting for
the deliberately removed non-game footer. Desktop and phone home/setup captures
are stored as `docs/home-*.png` and `docs/setup-*.png`.
