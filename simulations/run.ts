import { SIMULATION_CONFIGS } from "./harness.ts";
import { createGame, applyAction } from "../src/engine/game.ts";
import { assertInvariants } from "../src/engine/invariants.ts";
import { findPlay, dictionary } from "./policy.ts";
import type { Action } from "../src/engine/types.ts";
const reports = [];
for (const config of SIMULATION_CONFIGS) {
  const report = {
    ...config,
    games: 0,
    plays: 0,
    exchanges: 0,
    passes: 0,
    explosions: 0,
    recoveries: 0,
    maxTurns: 0,
    endings: {} as Record<string, number>,
  };
  for (let seed = 1; seed <= 12; seed++) {
    let actionName = "initialize";
    let actionTurn = 1;
    try {
      let game = createGame(undefined, config, seed);
      const step = (action: Action) => {
        actionName = action.type;
        actionTurn = game.turn;
        const next = applyAction(game, action, dictionary);
        assertInvariants(next);
        game = next;
      };
      assertInvariants(game);
      while (!game.ending) {
        actionName = "choose action";
        actionTurn = game.turn;
        if (game.history.length >= 250)
          throw Error("Game exceeded the 250-turn limit");
        const inactive = JSON.stringify(game.players[1 - game.active].rack);
        const placements = findPlay(game);
        if (placements) {
          for (const placement of placements)
            step({ type: "stage", placement });
          step({ type: "play" });
          report.plays++;
        } else if (game.bag.length >= 7 && game.history.length % 3 !== 0) {
          const ids = game.players[game.active].rack.flatMap((slot) =>
            slot.tile ? [slot.tile.id] : [],
          );
          step({ type: "exchange", ids });
          report.exchanges++;
        } else {
          step({ type: "pass" });
          report.passes++;
        }
        if (JSON.stringify(game.players[game.active].rack) !== inactive)
          throw Error("Inactive rack aged");
        report.explosions += game.lastResult!.exploded.length;
        report.recoveries += game.lastResult!.restored.length;
        step({ type: "advance" });
        if (!game.ending) step({ type: "reveal" });
      }
      report.games++;
      report.maxTurns = Math.max(report.maxTurns, game.history.length);
      report.endings[game.ending.reason] =
        (report.endings[game.ending.reason] || 0) + 1;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Simulation failed: expiration=${config.expirationTurns}, recovery=${config.recovery}, seed=${seed}, turn=${actionTurn}, action=${actionName}: ${detail}`,
        { cause: error },
      );
    }
  }
  reports.push(report);
  console.log(JSON.stringify(report));
}
if (process.argv.includes("--report")) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    new URL("../docs/simulation-results.json", import.meta.url),
    JSON.stringify(reports, null, 2) + "\n",
  );
}
