import type { Action, Game, Settings, TurnResult } from "./types.ts";
import { tiles, shuffle } from "./tiles.ts";
import { validateMove } from "./rules.ts";

export const capacity = (game: Game, player: number) =>
  game.players[player].rack.filter((s) => !s.destroyed).length;
export const rackValue = (game: Game, player: number) =>
  game.players[player].rack.reduce((n, s) => n + (s.tile?.value || 0), 0);
function refill(game: Game, player: number) {
  for (const slot of game.players[player].rack)
    if (!slot.destroyed && !slot.tile && game.bag.length) {
      slot.tile = {
        ...game.bag.pop()!,
        remainingTurns: game.settings.expirationTurns,
      };
    }
}
export function createGame(
  names = ["Player 1", "Player 2"],
  settings: Settings = { expirationTurns: 3, recovery: true },
  seed = 1,
): Game {
  if (
    !Number.isInteger(settings.expirationTurns) ||
    settings.expirationTurns < 2 ||
    settings.expirationTurns > 6 ||
    typeof settings.recovery !== "boolean"
  )
    throw Error("Choose a lifespan from 2 to 6 turns.");
  const game: Game = {
    id: `lettergeddon-${seed}-${Date.now()}`,
    schema: 1,
    dictionary: "letterpress-cc0-v1",
    settings: { ...settings },
    rng: seed >>> 0,
    players: [0, 1].map((i) => ({
      name: names[i]?.trim().slice(0, 32) || `Player ${i + 1}`,
      score: 0,
      rack: Array.from({ length: 7 }, () => ({ destroyed: false, tile: null })),
    })),
    active: 0,
    turn: 1,
    board: Array(225).fill(null),
    bag: tiles(settings.expirationTurns),
    exploded: [],
    pending: [],
    scoreless: 0,
    phase: "playing",
    history: [],
    lastResult: null,
    ending: null,
  };
  shuffle(game.bag, game);
  refill(game, 0);
  refill(game, 1);
  return game;
}
function settle(game: Game, reason: "rack-out" | "stalled", outgoing: number) {
  const values = [rackValue(game, 0), rackValue(game, 1)];
  const adjustments = values.map((v) => -v);
  if (reason === "rack-out") adjustments[outgoing] += values[1 - outgoing];
  game.players.forEach((p, i) => (p.score += adjustments[i]));
  const [a, b] = game.players.map((p) => p.score);
  game.ending = { reason, adjustments, winner: a === b ? null : a > b ? 0 : 1 };
}
/** Every action works on a clone; throwing leaves the caller's entire state untouched. */
export function applyAction(
  source: Game,
  action: Action,
  dictionary: ReadonlySet<string> = new Set(),
): Game {
  const game = structuredClone(source);
  if (action.type === "advance") {
    if (game.phase !== "turn-results") throw Error("Finish this turn first.");
    game.phase = game.ending ? "game-over" : "handoff";
    return game;
  }
  if (action.type === "reveal") {
    if (game.phase !== "handoff") throw Error("The rack is already revealed.");
    game.phase = "playing";
    return game;
  }
  if (game.phase !== "playing" || game.ending)
    throw Error("Reveal your rack before playing.");
  const rack = game.players[game.active].rack;
  if (action.type === "stage") {
    const { placement } = action;
    if (!rack.some((s) => s.tile?.id === placement.id))
      throw Error("Use a tile from your rack.");
    if (
      !Number.isInteger(placement.at) ||
      placement.at < 0 ||
      placement.at > 224 ||
      game.board[placement.at] ||
      game.pending.some((p) => p.id !== placement.id && p.at === placement.at)
    )
      throw Error("Choose an empty board square.");
    const tile = rack.find((s) => s.tile?.id === placement.id)!.tile!;
    if (tile.isBlank && !/^[A-Z]$/.test(placement.blankAs || ""))
      throw Error("Choose a letter for the blank.");
    game.pending = [
      ...game.pending.filter((p) => p.id !== placement.id),
      { ...placement },
    ];
    return game;
  }
  if (action.type === "recall") {
    game.pending = action.id
      ? game.pending.filter((p) => p.id !== action.id)
      : [];
    return game;
  }
  if (action.type === "reorder") {
    const from = rack.findIndex((s) => s.tile?.id === action.id);
    if (
      from < 0 ||
      !Number.isInteger(action.slot) ||
      !rack[action.slot] ||
      rack[action.slot].destroyed
    )
      throw Error("Choose an intact rack position.");
    if (
      game.pending.some(
        (p) => p.id === rack[action.slot].tile?.id && p.id !== action.id,
      )
    )
      throw Error("That tile is staged on the board.");
    [rack[from].tile, rack[action.slot].tile] = [
      rack[action.slot].tile,
      rack[from].tile,
    ];
    game.pending = game.pending.filter((p) => p.id !== action.id);
    return game;
  }
  if (action.type === "shuffle") {
    const intact = rack.filter((s) => !s.destroyed);
    const held = intact.map((s) => s.tile);
    shuffle(held, game);
    intact.forEach((s, i) => (s.tile = held[i]));
    return game;
  }
  if (action.type !== "play" && game.pending.length)
    throw Error("Recall your staged tiles first.");
  const active = game.active;
  const result: TurnResult = {
    turn: game.turn,
    player: active,
    kind: action.type,
    points: 0,
    words: [],
    placements: [],
    exchanged: 0,
    exploded: [],
    restored: [],
    capacityBefore: capacity(game, active),
    capacityAfter: 0,
    scores: [],
  };
  const startingCount = rack.filter((s) => s.tile).length;
  const fresh = new Set<string>();
  if (action.type === "play") {
    const validated = validateMove(game, game.pending, dictionary);
    result.words = validated.words;
    result.points = validated.points;
    result.placements = game.pending.map((p) => ({
      at: p.at,
      tile: validated.board[p.at]!,
    }));
    game.board = validated.board;
    game.players[active].score += result.points;
    const played = new Set(game.pending.map((p) => p.id));
    for (const slot of rack)
      if (slot.tile && played.has(slot.tile.id)) slot.tile = null;
    if (
      startingCount > 0 &&
      played.size === startingCount &&
      game.settings.recovery
    ) {
      const broken = rack.findIndex((s) => s.destroyed);
      if (broken >= 0) {
        rack[broken].destroyed = false;
        result.restored.push(broken);
      }
    }
  } else if (action.type === "exchange") {
    if (game.bag.length < 7)
      throw Error("Exchanges require at least seven tiles in the bag.");
    if (
      !action.ids.length ||
      new Set(action.ids).size !== action.ids.length ||
      action.ids.some((id) => !rack.some((s) => s.tile?.id === id))
    )
      throw Error("Select one or more tiles from your rack.");
    const returned = [];
    for (const slot of rack)
      if (slot.tile && action.ids.includes(slot.tile.id)) {
        returned.push({
          ...slot.tile,
          remainingTurns: game.settings.expirationTurns,
        });
        slot.tile = {
          ...game.bag.pop()!,
          remainingTurns: game.settings.expirationTurns,
        };
        fresh.add(slot.tile.id);
      }
    game.bag.push(...returned);
    shuffle(game.bag, game);
    result.exchanged = returned.length;
  }
  for (const [i, slot] of rack.entries())
    if (slot.tile && !fresh.has(slot.tile.id)) {
      slot.tile.remainingTurns--;
      if (slot.tile.remainingTurns === 0) {
        game.exploded.push(slot.tile);
        slot.tile = null;
        slot.destroyed = true;
        result.exploded.push(i);
      }
    }
  game.pending = [];
  game.scoreless = result.points === 0 ? game.scoreless + 1 : 0;
  if (capacity(game, active) === 0)
    game.ending = {
      reason: "elimination",
      winner: 1 - active,
      adjustments: [0, 0],
    };
  else {
    refill(game, active);
    if (action.type === "play" && !game.bag.length && !rack.some((s) => s.tile))
      settle(game, "rack-out", active);
    else if (game.scoreless >= 6) settle(game, "stalled", active);
  }
  result.capacityAfter = capacity(game, active);
  result.scores = game.players.map((p) => p.score);
  game.history.push(result);
  game.lastResult = result;
  game.phase = "turn-results";
  game.turn++;
  game.active = 1 - active;
  return game;
}
