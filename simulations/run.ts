import { SIMULATION_CONFIGS } from "./harness.ts";
import { createGame, applyAction } from "../src/engine/game.ts";
import { assertInvariants } from "../src/engine/invariants.ts";
import { findPlay, dictionary } from "./policy.ts";
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
    let game = createGame(undefined, config, seed);
    assertInvariants(game);
    while (!game.ending) {
      if (game.history.length >= 250)
        throw Error(`Unfinished game ${JSON.stringify(config)} seed=${seed}`);
      const inactive = JSON.stringify(game.players[1 - game.active].rack);
      const p = findPlay(game);
      if (p) {
        for (const placement of p)
          game = applyAction(game, { type: "stage", placement });
        game = applyAction(game, { type: "play" }, dictionary);
        report.plays++;
      } else if (game.bag.length >= 7 && game.history.length % 3 !== 0) {
        const ids = game.players[game.active].rack.flatMap((s) =>
          s.tile ? [s.tile.id] : [],
        );
        game = applyAction(game, { type: "exchange", ids });
        report.exchanges++;
      } else {
        game = applyAction(game, { type: "pass" });
        report.passes++;
      }
      assertInvariants(game);
      if (JSON.stringify(game.players[game.active].rack) !== inactive)
        throw Error("Inactive rack aged");
      report.explosions += game.lastResult!.exploded.length;
      report.recoveries += game.lastResult!.restored.length;
      if (!game.ending) {
        game = applyAction(game, { type: "advance" });
        game = applyAction(game, { type: "reveal" });
      }
    }
    report.games++;
    report.maxTurns = Math.max(report.maxTurns, game.history.length);
    report.endings[game.ending.reason] =
      (report.endings[game.ending.reason] || 0) + 1;
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
