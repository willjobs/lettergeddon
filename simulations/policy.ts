import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateMove } from "../src/engine/rules.ts";
import { neighbors } from "../src/engine/board.ts";
import type { Game, Placement } from "../src/engine/types.ts";

export const dictionary = new Set(
  readFileSync(
    fileURLToPath(new URL("../public/data/words.txt", import.meta.url)),
    "utf8",
  )
    .trim()
    .split(/\r?\n/),
);
// A bounded simulation policy, not an opponent feature. It proposes real dictionary
// words at board anchors and asks the production validator to check every cross.
const byLetter = new Map<string, string[]>();
for (const word of dictionary)
  if (word.length <= 4)
    for (const letter of new Set(word)) {
      const list = byLetter.get(letter) || [];
      list.push(word);
      byLetter.set(letter, list);
    }
export function findPlay(game: Game): Placement[] | null {
  const rack = game.players[game.active].rack.flatMap((s) =>
    s.tile ? [s.tile] : [],
  );
  const anchors = game.board.some(Boolean)
    ? game.board.flatMap((tile, at) => (tile ? [at] : [])).slice(-18)
    : [112];
  let attempts = 0;
  for (const anchor of anchors) {
    const letter = game.board[anchor]?.blankAs || game.board[anchor]?.letter;
    const candidates = letter
      ? byLetter.get(letter) || []
      : [...dictionary].filter((w) => w.length <= rack.length && w.length <= 4);
    for (const word of candidates) {
      // Cheap multiset filter before exploring positions.
      const available = rack.map((t) => t.letter);
      let blanks = rack.filter((t) => t.isBlank).length;
      let possible = true;
      const letters = word.split("");
      if (letter) letters.splice(letters.indexOf(letter), 1);
      for (const c of letters) {
        const i = available.indexOf(c);
        if (i >= 0) available.splice(i, 1);
        else if (blanks) blanks--;
        else {
          possible = false;
          break;
        }
      }
      // A conservative policy limits candidates to letters supplied by this anchor
      // and rack. The engine remains the authority for placement legality.
      if (!possible) continue;
      for (const step of [1, 15])
        for (let offset = 0; offset < word.length; offset++) {
          if (letter && word[offset] !== letter) continue;
          const start = anchor - offset * step,
            end = start + (word.length - 1) * step;
          if (
            start < 0 ||
            end > 224 ||
            (step === 1 && Math.floor(start / 15) !== Math.floor(end / 15))
          )
            continue;
          const held = [...rack];
          const placements: Placement[] = [];
          let valid = true;
          for (let i = 0; i < word.length; i++) {
            const at = start + i * step,
              existing = game.board[at];
            if (existing) {
              if ((existing.blankAs || existing.letter) !== word[i]) {
                valid = false;
                break;
              }
              continue;
            }
            let idx = held.findIndex((t) => t.letter === word[i]);
            if (idx < 0) idx = held.findIndex((t) => t.isBlank);
            if (idx < 0) {
              valid = false;
              break;
            }
            const tile = held.splice(idx, 1)[0];
            placements.push({
              id: tile.id,
              at,
              ...(tile.isBlank ? { blankAs: word[i] } : {}),
            });
          }
          if (!valid || !placements.length) continue;
          if (++attempts > 4500) return null;
          try {
            validateMove(game, placements, dictionary);
            return placements;
          } catch {
            /* try next legal candidate */
          }
        }
    }
  }
  // Try one-tile parallel extensions as well.
  for (const [at, cell] of game.board.entries())
    if (!cell && neighbors(at).some((n) => game.board[n]))
      for (const tile of rack) {
        const p = [
          { id: tile.id, at, ...(tile.isBlank ? { blankAs: "S" } : {}) },
        ];
        try {
          validateMove(game, p, dictionary);
          return p;
        } catch {
          /* next */
        }
      }
  return null;
}
