import { describe, it, expect } from "vitest";
import { applyAction, capacity, createGame } from "../../src/engine/game.ts";
import { assertInvariants, restoreGame } from "../../src/engine/invariants.ts";
import { tiles } from "../../src/engine/tiles.ts";
import { PREMIUMS } from "../../src/engine/board.ts";
import { validateMove } from "../../src/engine/rules.ts";
import type { Game, Placement } from "../../src/engine/types.ts";
const dictionary = new Set([
  "AT",
  "CAT",
  "CATS",
  "TO",
  "TOO",
  "DOG",
  "DOGS",
  "IT",
  "IN",
  "IS",
  "RAIN",
  "RETAINS",
  "AA",
  "STAINER",
  "TAR",
  "CAR",
  "ART",
]);
function fixture(letters = "CATREIS", lifespan = 3, recovery = true): Game {
  const g = createGame(undefined, { expirationTurns: lifespan, recovery }, 100);
  const pool = tiles(lifespan);
  g.players[0].rack = Array.from({ length: 7 }, (_, i) => {
    const letter = letters[i];
    const idx = pool.findIndex(
      (t) => t.letter === (letter === "?" ? "" : letter),
    );
    return { destroyed: false, tile: letter ? pool.splice(idx, 1)[0] : null };
  });
  g.players[1].rack = pool
    .splice(0, 7)
    .map((tile) => ({ destroyed: false, tile }));
  g.bag = pool;
  return g;
}
function stage(g: Game, word: string, start = 112, step = 1) {
  let game = g;
  const held = game.players[game.active].rack.flatMap((s) =>
    s.tile ? [s.tile] : [],
  );
  for (const [i, letter] of [...word].entries()) {
    const idx = held.findIndex((t) => t.letter === letter);
    const tile = held.splice(
      idx < 0 ? held.findIndex((t) => t.isBlank) : idx,
      1,
    )[0];
    game = applyAction(game, {
      type: "stage",
      placement: {
        id: tile.id,
        at: start + i * step,
        ...(tile.isBlank ? { blankAs: letter } : {}),
      },
    });
  }
  return game;
}
const next = (g: Game) =>
  applyAction(applyAction(g, { type: "advance" }), { type: "reveal" });
const play = (g: Game, word: string, start = 112, step = 1) =>
  applyAction(stage(g, word, start, step), { type: "play" }, dictionary);
const pass = (g: Game) => applyAction(g, { type: "pass" });
function emptyBag(g: Game) {
  // Controlled boundary fixture: account for all removed tiles as expired.
  g.exploded.push(...g.bag.map((t) => ({ ...t, remainingTurns: 0 })));
  g.bag = [];
  return g;
}
describe("inventory and turn lifetime", () => {
  it("creates exactly 100 unique standard English tiles and seven slots each", () => {
    const g = createGame();
    assertInvariants(g);
    expect(g.bag).toHaveLength(86);
    expect(tiles(3).filter((t) => t.isBlank)).toHaveLength(2);
    expect(tiles(3).filter((t) => t.letter === "E")).toHaveLength(12);
    expect(g.players.every((p) => p.rack.length === 7)).toBe(true);
  });
  it.each([2, 3, 5, 6])(
    "expires after %i owner turns and never on the other turn",
    (life) => {
      let g = fixture("CATREIS", life);
      const initial = g.players[0].rack.map((s) => s.tile!.id);
      for (let i = 0; i < life; i++) {
        if (g.ending) break;
        const opponent = structuredClone(g.players[1].rack);
        g = pass(g);
        expect(g.players[1].rack).toEqual(opponent);
        if (i === life - 1) {
          expect(capacity(g, 0)).toBe(0);
          expect(g.ending?.reason).toBe("elimination");
          break;
        }
        expect(g.players[0].rack[0].tile?.remainingTurns).toBe(life - i - 1);
        g = next(g);
        g = applyAction(g, {
          type: "exchange",
          ids: g.players[1].rack.map((s) => s.tile!.id),
        });
        g = next(g);
        // Positive moves normally reset this; prevent stall while testing the 5/6-turn timer in isolation.
        g.scoreless = 0;
      }
      if (life <= 3)
        expect(g.exploded.map((t) => t.id)).toEqual(
          expect.arrayContaining(initial),
        );
    },
  );
  it("ages retained tiles, leaves played tiles safe, gives fresh draws full life", () => {
    const g = play(fixture(), "CAT");
    expect(
      g.players[0].rack.slice(0, 3).every((s) => s.tile?.remainingTurns === 3),
    ).toBe(true);
    expect(
      g.players[0].rack.slice(3).every((s) => s.tile?.remainingTurns === 2),
    ).toBe(true);
    expect(g.exploded).toHaveLength(0);
    assertInvariants(g);
  });
  it("an invalid submission is atomic and does not age tiles", () => {
    const g = stage(fixture(), "CAT", 0);
    const before = structuredClone(g);
    expect(() => applyAction(g, { type: "play" }, dictionary)).toThrow(
      /center/,
    );
    expect(g).toEqual(before);
  });
  it("shuffle keeps timers attached to tiles and destroyed slots fixed", () => {
    const g = fixture();
    const removed = g.players[0].rack[2].tile!;
    g.exploded.push({ ...removed, remainingTurns: 0 });
    g.players[0].rack[2] = { destroyed: true, tile: null };
    g.players[0].rack[0].tile!.remainingTurns = 1;
    const timers = Object.fromEntries(
      g.players[0].rack.flatMap((s) =>
        s.tile ? [[s.tile.id, s.tile.remainingTurns]] : [],
      ),
    );
    const after = applyAction(g, { type: "shuffle" });
    expect(after.players[0].rack[2].destroyed).toBe(true);
    for (const s of after.players[0].rack)
      if (s.tile) expect(s.tile.remainingTurns).toBe(timers[s.tile.id]);
    assertInvariants(after);
  });
  it("does not accept a tile in a destroyed position", () => {
    const g = fixture();
    g.players[0].rack[1].destroyed = true;
    g.players[0].rack[1].tile = null;
    expect(() =>
      applyAction(g, {
        type: "reorder",
        id: g.players[0].rack[0].tile!.id,
        slot: 1,
      }),
    ).toThrow(/intact/);
  });
});
describe("recovery", () => {
  it.each([true, false])(
    "rack clear repairs leftmost slot only when enabled=%s",
    (recovery) => {
      const g = fixture("CAT", 3, recovery);
      g.players[0].rack[3].destroyed = true;
      g.players[0].rack[5].destroyed = true;
      const after = play(g, "CAT");
      expect(after.lastResult?.restored).toEqual(recovery ? [3] : []);
      expect(after.players[0].rack[5].destroyed).toBe(true);
      expect(after.lastResult!.points).toBe(10);
      expect(capacity(after, 0)).toBe(recovery ? 6 : 5);
    },
  );
  it("partial clears do not recover and a full intact rack never exceeds seven", () => {
    const g = fixture("CATS");
    g.players[0].rack[5].destroyed = true;
    expect(play(g, "CAT").lastResult!.restored).toEqual([]);
    const full = play(fixture("RETAINS"), "RETAINS", 109);
    expect(capacity(full, 0)).toBe(7);
    expect(full.lastResult!.points).toBe(64);
  });
  it("a reduced rack clear does not earn bingo", () => {
    const g = fixture("AT");
    g.players[0].rack[2].destroyed = true;
    expect(play(g, "AT").lastResult!.points).toBe(4);
  });
});
describe("exchanges and endings", () => {
  it("draws before returning, resets replacements, ages retained tiles, conserves inventory", () => {
    const g = fixture();
    const old = g.players[0].rack[0].tile!.id;
    const after = applyAction(g, { type: "exchange", ids: [old] });
    expect(after.players[0].rack[0].tile!.id).not.toBe(old);
    expect(after.bag.some((t) => t.id === old)).toBe(true);
    expect(after.players[0].rack[0].tile!.remainingTurns).toBe(3);
    expect(after.players[0].rack[1].tile!.remainingTurns).toBe(2);
    assertInvariants(after);
  });
  it("all retained expired tiles explode during an exchange but replacements do not", () => {
    const g = fixture();
    g.players[0].rack.forEach((s) => (s.tile!.remainingTurns = 1));
    const after = applyAction(g, {
      type: "exchange",
      ids: [g.players[0].rack[0].tile!.id],
    });
    expect(after.lastResult!.exploded).toHaveLength(6);
    expect(capacity(after, 0)).toBe(1);
    assertInvariants(after);
  });
  it("rejects invalid exchange selections and fewer than seven bag tiles atomically", () => {
    const g = fixture();
    expect(() =>
      applyAction(g, { type: "exchange", ids: ["foreign"] }),
    ).toThrow();
    g.bag = g.bag.slice(0, 6);
    const copy = structuredClone(g);
    expect(() =>
      applyAction(g, {
        type: "exchange",
        ids: [g.players[0].rack[0].tile!.id],
      }),
    ).toThrow(/seven/);
    expect(g).toEqual(copy);
  });
  it("does not end just because the bag is empty", () => {
    const g = emptyBag(fixture());
    expect(pass(g).ending).toBeNull();
  });
  it("exploding the last held tile on a pass is not a rack-out when intact slots survive", () => {
    const g = emptyBag(fixture("A"));
    g.players[0].rack[0].tile!.remainingTurns = 1;
    const after = pass(g);
    expect(after.ending).toBeNull();
    expect(capacity(after, 0)).toBe(6);
    assertInvariants(after);
  });
  it("last slot destruction overrides score and conventional settlement", () => {
    const g = emptyBag(fixture("A"));
    g.players[0].rack.forEach((s, i) => {
      s.destroyed = i > 0;
      if (s.tile) s.tile.remainingTurns = 1;
    });
    const after = pass(g);
    expect(after.ending).toEqual({
      reason: "elimination",
      winner: 1,
      adjustments: [0, 0],
    });
    expect(after.players[0].score).toBe(0);
  });
  it("rack-out settles only remaining rack values, restores one slot before ending", () => {
    const g = emptyBag(fixture("AT"));
    g.players[0].rack[2].destroyed = true;
    const penalty = g.players[1].rack.reduce((n, s) => n + s.tile!.value, 0);
    const after = play(g, "AT");
    expect(after.ending?.reason).toBe("rack-out");
    expect(after.players[0].score).toBe(4 + penalty);
    expect(after.players[1].score).toBe(-penalty);
    expect(after.lastResult?.restored).toEqual([2]);
  });
  it("six scoreless turns settle rack penalties and support a tie", () => {
    let g = emptyBag(fixture("AT", 6));
    for (let i = 0; i < 6; i++) {
      g = pass(g);
      if (i < 5) g = next(g);
    }
    expect(g.ending?.reason).toBe("stalled");
    expect(g.players[0].score).toBe(-2);
    expect(g.players[1].score).toBe(
      -g.players[1].rack.reduce((n, s) => n + (s.tile?.value || 0), 0),
    );
    let tie = emptyBag(fixture("A", 6));
    tie.players[0].rack.forEach((s) => (s.tile = null));
    tie.players[1].rack.forEach((s) => (s.tile = null));
    // Empty intact racks cannot go out by passing; six scoreless turns settle a tie.
    for (let i = 0; i < 6; i++) {
      tie = pass(tie);
      if (i < 5) tie = next(tie);
    }
    expect(tie.ending?.winner).toBeNull();
    expect(tie.ending?.reason).toBe("stalled");
  });
  it("results and handoff must advance explicitly and never allow early actions", () => {
    let g = pass(fixture());
    expect(g.phase).toBe("turn-results");
    expect(() => pass(g)).toThrow();
    g = applyAction(g, { type: "advance" });
    expect(g.phase).toBe("handoff");
    expect(() => pass(g)).toThrow();
    g = applyAction(g, { type: "reveal" });
    expect(g.phase).toBe("playing");
  });
});
describe("standard placement and scores", () => {
  it("has the conventional premium counts including center DW", () => {
    expect(PREMIUMS[112]).toBe("DW");
    for (const [p, n] of [
      ["TW", 8],
      ["DW", 17],
      ["TL", 12],
      ["DL", 24],
    ] as const)
      expect(PREMIUMS.filter((s) => s === p)).toHaveLength(n);
  });
  it("scores opening word and reuses no premiums on extensions", () => {
    let g = play(fixture("CAT"), "CAT");
    expect(g.lastResult!.points).toBe(10);
    g = next(g);
    const pool = [
      ...g.bag,
      ...g.players[1].rack.flatMap((s) => (s.tile ? [s.tile] : [])),
    ];
    const idx = pool.findIndex((t) => t.letter === "S");
    g.players[1].rack = Array.from({ length: 7 }, (_, i) => ({
      destroyed: false,
      tile: i === 0 ? pool.splice(idx, 1)[0] : null,
    }));
    g.bag = pool;
    g = applyAction(g, {
      type: "stage",
      placement: { id: g.players[1].rack[0].tile!.id, at: 115 },
    });
    g = applyAction(g, { type: "play" }, dictionary);
    expect(g.lastResult!.points).toBe(6);
    assertInvariants(g);
  });
  it("validates perpendicular words and scores both axes", () => {
    const g = fixture("CAT");
    g.board[97] = { ...tiles(3).find((t) => t.letter === "A")!, turn: 1 };
    // CAT crosses the existing A to form AC, which is absent from the fixture dictionary.
    const staged = stage(g, "CAT");
    expect(() => applyAction(staged, { type: "play" }, dictionary)).toThrow(
      /AC/,
    );
    const after = applyAction(
      staged,
      { type: "play" },
      new Set([...dictionary, "AC"]),
    );
    expect(after.lastResult!.words.map((w) => w.word)).toContain("AC");
  });
  it("rejects gaps, diagonals, disconnected and occupied placement, duplicate or foreign tiles", () => {
    const g = fixture();
    const ids = g.players[0].rack.map((s) => s.tile!.id);
    const p = (positions: number[]): Placement[] =>
      positions.map((at, i) => ({ at, id: ids[i] }));
    expect(() => validateMove(g, p([112, 114]), dictionary)).toThrow(/gaps/);
    expect(() => validateMove(g, p([112, 128]), dictionary)).toThrow(
      /row or column/,
    );
    expect(() =>
      validateMove(
        g,
        [
          { at: 112, id: ids[0] },
          { at: 113, id: ids[0] },
        ],
        dictionary,
      ),
    ).toThrow(/once/);
    expect(() =>
      validateMove(g, [{ at: 112, id: "foreign" }], dictionary),
    ).toThrow(/rack/);
    const after = play(g, "CAT");
    expect(() =>
      validateMove(
        after,
        [{ at: 112, id: after.players[1].rack[0].tile!.id }],
        dictionary,
      ),
    ).toThrow(/occupied/);
    expect(() =>
      validateMove(
        after,
        [{ at: 0, id: after.players[1].rack[0].tile!.id }],
        dictionary,
      ),
    ).toThrow(/Connect/);
  });
  it("blank assignment scores zero and stays fixed on the board", () => {
    const g = fixture("?T");
    expect(() =>
      applyAction(g, {
        type: "stage",
        placement: { id: g.players[0].rack[0].tile!.id, at: 112 },
      }),
    ).toThrow(/letter/);
    const after = play(g, "AT");
    expect(after.lastResult!.points).toBe(2);
    expect(after.board[112]?.blankAs).toBe("A");
    expect(after.board[112]?.value).toBe(0);
    assertInvariants(after);
  });
  it("rejects damaged and incompatible saves without silently resetting", () => {
    const g = play(fixture(), "CAT");
    expect(restoreGame(g)).toEqual(g);
    for (const mutate of [
      (x: Game) => (x.schema = 2 as 1),
      (x: Game) => x.bag.push(x.bag[0]),
      (x: Game) => x.players[0].score++,
      (x: Game) => (x.board[112] = null),
    ]) {
      const bad = structuredClone(g);
      mutate(bad);
      expect(() => restoreGame(bad)).toThrow(/Export/);
    }
  });
  it("rejects malformed history and missing result screens before rendering", () => {
    const game = play(fixture(), "CAT");
    for (const mutate of [
      (g: Game) => {
        g.lastResult = null;
      },
      (g: Game) => {
        Reflect.set(g.history[0], "words", null);
      },
      (g: Game) => {
        Reflect.set(g.history[0].words[0], "cells", "invalid");
      },
      (g: Game) => {
        g.history[0].points++;
      },
      (g: Game) => {
        g.active = 0;
      },
    ]) {
      const damaged = structuredClone(game);
      mutate(damaged);
      expect(() => restoreGame(damaged)).toThrow(/Export/);
    }
  });
});
