import type { Game } from "./types.ts";
import { tiles } from "./tiles.ts";
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(`Invalid game: ${message}`);
}
export function assertInvariants(game: Game): void {
  check(
    game.schema === 1 && game.dictionary === "letterpress-cc0-v1",
    "unsupported save version",
  );
  check(
    Number.isInteger(game.settings.expirationTurns) &&
      game.settings.expirationTurns >= 2 &&
      game.settings.expirationTurns <= 6 &&
      typeof game.settings.recovery === "boolean",
    "settings",
  );
  check(game.players.length === 2 && [0, 1].includes(game.active), "players");
  check(
    ["playing", "turn-results", "handoff", "game-over"].includes(game.phase),
    "phase",
  );
  check(game.phase !== "game-over" || game.ending, "missing ending");
  check(
    !game.ending || ["turn-results", "game-over"].includes(game.phase),
    "ending phase",
  );
  check(
    Number.isInteger(game.turn) && game.turn === game.history.length + 1,
    "turn history",
  );
  check(game.active === game.history.length % 2, "active player sequence");
  check(
    JSON.stringify(game.lastResult) ===
      JSON.stringify(game.history.at(-1) ?? null),
    "latest turn result",
  );
  check(
    game.phase !== "turn-results" || game.lastResult,
    "missing turn result",
  );
  check(
    Number.isInteger(game.rng) && game.rng >= 0 && game.rng <= 4294967295,
    "random state",
  );
  check(
    game.board.length === 225 &&
      Number.isInteger(game.scoreless) &&
      game.scoreless >= 0 &&
      game.scoreless <= 6,
    "board or scoreless count",
  );
  for (const player of game.players) {
    check(
      typeof player.name === "string" &&
        player.name.length <= 32 &&
        Number.isInteger(player.score),
      "player details",
    );
    check(player.rack.length === 7, "seven rack slots required");
    for (const slot of player.rack) {
      check(
        typeof slot.destroyed === "boolean" && !(slot.destroyed && slot.tile),
        "destroyed slot occupied",
      );
      if (slot.tile)
        check(
          Number.isInteger(slot.tile.remainingTurns) &&
            slot.tile.remainingTurns > 0 &&
            slot.tile.remainingTurns <= game.settings.expirationTurns,
          "tile timer",
        );
    }
  }
  const originals = new Map(
    tiles(game.settings.expirationTurns).map((t) => [t.id, t]),
  );
  const current = [
    ...game.bag,
    ...game.exploded,
    ...game.players.flatMap((p) =>
      p.rack.flatMap((s) => (s.tile ? [s.tile] : [])),
    ),
    ...game.board.filter((t) => t !== null),
  ];
  check(
    current.length === 100 && new Set(current.map((t) => t.id)).size === 100,
    "tile conservation",
  );
  for (const tile of current) {
    const original = originals.get(tile.id);
    check(
      original &&
        original.letter === tile.letter &&
        original.value === tile.value &&
        original.isBlank === tile.isBlank,
      "tile identity",
    );
  }
  check(
    game.exploded.every((t) => t.remainingTurns === 0),
    "exploded tile timer",
  );
  const reconstructed = Array(225).fill(null);
  const scores = [0, 0];
  let scoreless = 0;
  for (const [i, move] of game.history.entries()) {
    check(
      move.turn === i + 1 &&
        move.player === i % 2 &&
        ["play", "pass", "exchange"].includes(move.kind),
      "move sequence",
    );
    check(
      Array.isArray(move.words) &&
        move.words.every(
          (word) =>
            /^[A-Z]{2,15}$/.test(word.word) &&
            Number.isInteger(word.score) &&
            word.score >= 0 &&
            Array.isArray(word.cells) &&
            word.cells.length === word.word.length &&
            word.cells.every(
              (at) => Number.isInteger(at) && at >= 0 && at < 225,
            ),
        ),
      "word results",
    );
    check(
      Array.isArray(move.placements) &&
        move.placements.length <= 7 &&
        Number.isInteger(move.exchanged) &&
        move.exchanged >= 0 &&
        move.exchanged <= 7 &&
        Array.isArray(move.scores) &&
        move.scores.length === 2 &&
        move.scores.every(Number.isInteger),
      "turn result details",
    );
    check(
      move.kind === "play"
        ? move.placements.length > 0 &&
            move.words.length > 0 &&
            move.exchanged === 0 &&
            move.points ===
              move.words.reduce((total, word) => total + word.score, 0) +
                (move.placements.length === 7 ? 50 : 0)
        : move.placements.length === 0 &&
            move.words.length === 0 &&
            move.points === 0 &&
            (move.kind === "exchange"
              ? move.exchanged > 0
              : move.exchanged === 0),
      "turn result accounting",
    );
    check(
      Number.isInteger(move.points) &&
        move.points >= 0 &&
        move.exploded.every((s) => Number.isInteger(s) && s >= 0 && s < 7),
      "move result",
    );
    check(
      move.restored.length <= 1 &&
        move.restored.every((s) => Number.isInteger(s) && s >= 0 && s < 7),
      "recovery result",
    );
    check(
      Number.isInteger(move.capacityBefore) &&
        move.capacityBefore > 0 &&
        move.capacityBefore <= 7 &&
        Number.isInteger(move.capacityAfter) &&
        move.capacityAfter >= 0 &&
        move.capacityAfter <= 7 &&
        move.capacityAfter ===
          move.capacityBefore - move.exploded.length + move.restored.length,
      "capacity result",
    );
    scores[move.player] += move.points;
    scoreless = move.points === 0 ? scoreless + 1 : 0;
    for (const p of move.placements) {
      check(
        Number.isInteger(p.at) &&
          p.at >= 0 &&
          p.at < 225 &&
          !reconstructed[p.at] &&
          p.tile.turn === move.turn,
        "historical placement",
      );
      reconstructed[p.at] = p.tile;
    }
  }
  if (game.ending) {
    check(
      ["elimination", "rack-out", "stalled"].includes(game.ending.reason) &&
        [0, 1, null].includes(game.ending.winner),
      "ending",
    );
    check(
      game.ending.adjustments.length === 2 &&
        game.ending.adjustments.every(Number.isInteger),
      "score adjustments",
    );
    game.ending.adjustments.forEach((n, i) => (scores[i] += n));
  }
  check(
    scores.every((n, i) => n === game.players[i].score) &&
      scoreless === game.scoreless,
    "score accounting",
  );
  check(
    JSON.stringify(reconstructed) === JSON.stringify(game.board),
    "board history",
  );
  for (const tile of game.board)
    if (tile?.isBlank)
      check(/^[A-Z]$/.test(tile.blankAs || ""), "blank assignment");
  const stagedIds = new Set<string>();
  const stagedCells = new Set<number>();
  check(
    game.phase === "playing" ||
      game.phase === "handoff" ||
      !game.pending.length,
    "unresolved staging",
  );
  for (const p of game.pending) {
    check(
      Number.isInteger(p.at) &&
        p.at >= 0 &&
        p.at < 225 &&
        !game.board[p.at] &&
        !stagedIds.has(p.id) &&
        !stagedCells.has(p.at),
      "pending placement",
    );
    const tile = game.players[game.active].rack.find(
      (s) => s.tile?.id === p.id,
    )?.tile;
    check(tile, "unowned pending tile");
    if (tile.isBlank) check(/^[A-Z]$/.test(p.blankAs || ""), "pending blank");
    stagedIds.add(p.id);
    stagedCells.add(p.at);
  }
}
export function restoreGame(raw: unknown): Game {
  try {
    const game = raw as Game;
    assertInvariants(game);
    return structuredClone(game);
  } catch {
    throw Error(
      "This save is damaged or uses an unsupported version. Export it before starting a new game.",
    );
  }
}
