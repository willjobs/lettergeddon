import type { Game, Tile } from "./types.ts";

export const INVENTORY: Record<string, [number, number]> = {
  A: [9, 1],
  B: [2, 3],
  C: [2, 3],
  D: [4, 2],
  E: [12, 1],
  F: [2, 4],
  G: [3, 2],
  H: [2, 4],
  I: [9, 1],
  J: [1, 8],
  K: [1, 5],
  L: [4, 1],
  M: [2, 3],
  N: [6, 1],
  O: [8, 1],
  P: [2, 3],
  Q: [1, 10],
  R: [6, 1],
  S: [4, 1],
  T: [6, 1],
  U: [4, 1],
  V: [2, 4],
  W: [2, 4],
  X: [1, 8],
  Y: [2, 4],
  Z: [1, 10],
  "": [2, 0],
};
export function tiles(lifespan: number): Tile[] {
  return Object.entries(INVENTORY).flatMap(([letter, [count, value]]) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${letter || "blank"}-${i}`,
      letter,
      value,
      isBlank: letter === "",
      remainingTurns: lifespan,
    })),
  );
}
export function random(game: Pick<Game, "rng">): number {
  game.rng = (Math.imul(game.rng, 1664525) + 1013904223) >>> 0;
  return game.rng / 4294967296;
}
export function shuffle<T>(items: T[], game: Pick<Game, "rng">): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random(game) * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}
export const face = (tile: Tile & { blankAs?: string }) =>
  tile.isBlank ? tile.blankAs || "◇" : tile.letter;
