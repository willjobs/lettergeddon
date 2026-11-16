import type { Game, Placement, Placed, WordScore } from "./types.ts";
import { PREMIUMS, neighbors } from "./board.ts";
import { face } from "./tiles.ts";

export function wordRun(
  board: (Placed | null)[],
  at: number,
  step: number,
): number[] {
  const adjacent = (a: number, b: number) =>
    b >= 0 &&
    b < 225 &&
    (step === 15 || Math.floor(a / 15) === Math.floor(b / 15));
  let first = at;
  while (adjacent(first, first - step) && board[first - step]) first -= step;
  const cells: number[] = [];
  for (let n = first; adjacent(n - step, n) || n === first; n += step) {
    if (!board[n]) break;
    cells.push(n);
  }
  return cells;
}
export function validateMove(
  game: Game,
  placements: Placement[],
  dictionary: ReadonlySet<string>,
) {
  if (!placements.length || placements.length > 7)
    throw Error("Place one to seven tiles.");
  const board = [...game.board];
  const owned = game.players[game.active].rack.flatMap((s) =>
    s.tile ? [s.tile] : [],
  );
  const ids = new Set<string>();
  const positions = new Set<number>();
  for (const p of placements) {
    if (!Number.isInteger(p.at) || p.at < 0 || p.at >= 225)
      throw Error("Choose a square on the board.");
    if (ids.has(p.id) || positions.has(p.at))
      throw Error("Each tile and square can be used once.");
    const tile = owned.find((t) => t.id === p.id);
    if (!tile) throw Error("Use tiles from your rack.");
    if (board[p.at]) throw Error("That square is already occupied.");
    if (tile.isBlank && !/^[A-Z]$/.test(p.blankAs || ""))
      throw Error("Choose a letter for the blank.");
    ids.add(p.id);
    positions.add(p.at);
    board[p.at] = {
      ...tile,
      ...(tile.isBlank ? { blankAs: p.blankAs } : {}),
      turn: game.turn,
    };
  }
  const horizontal = placements.every(
    (p) => Math.floor(p.at / 15) === Math.floor(placements[0].at / 15),
  );
  const vertical = placements.every((p) => p.at % 15 === placements[0].at % 15);
  if (!horizontal && !vertical)
    throw Error("Place all new tiles in one row or column.");
  if (!game.board.some(Boolean)) {
    if (!positions.has(112))
      throw Error("Your first word must cover the center star, H8.");
  } else if (
    !placements.some((p) => neighbors(p.at).some((n) => game.board[n]))
  )
    throw Error("Connect to a word on the board.");
  const step = horizontal ? 1 : 15;
  const main = wordRun(board, placements[0].at, step);
  if (placements.length > 1 && placements.some((p) => !main.includes(p.at)))
    throw Error("Fill the gaps between your tiles.");
  const runs = new Map<string, number[]>();
  for (const p of placements)
    for (const axis of [1, 15]) {
      const cells = wordRun(board, p.at, axis);
      if (cells.length > 1) runs.set(cells.join(","), cells);
    }
  if (!runs.size) throw Error("Form a word of at least two letters.");
  const words: WordScore[] = [...runs.values()].map((cells) => {
    const word = cells.map((n) => face(board[n]!)).join("");
    if (!dictionary.has(word)) throw Error(`${word} is not in the dictionary.`);
    let sum = 0,
      multiplier = 1;
    for (const n of cells) {
      const premium = positions.has(n) ? PREMIUMS[n] : "";
      sum +=
        board[n]!.value * (premium === "DL" ? 2 : premium === "TL" ? 3 : 1);
      multiplier *= premium === "DW" ? 2 : premium === "TW" ? 3 : 1;
    }
    return { word, cells, score: sum * multiplier };
  });
  return {
    board,
    words,
    points:
      words.reduce((n, w) => n + w.score, 0) +
      (placements.length === 7 ? 50 : 0),
  };
}
