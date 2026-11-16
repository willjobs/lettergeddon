export interface Tile {
  id: string;
  letter: string;
  value: number;
  isBlank: boolean;
  remainingTurns: number;
}
export interface Slot {
  destroyed: boolean;
  tile: Tile | null;
}
export interface Player {
  name: string;
  score: number;
  rack: Slot[];
}
export interface Placement {
  id: string;
  at: number;
  blankAs?: string;
}
export interface Placed extends Tile {
  blankAs?: string;
  turn: number;
}
export interface Settings {
  expirationTurns: number;
  recovery: boolean;
}
export interface WordScore {
  word: string;
  cells: number[];
  score: number;
}
export interface TurnResult {
  turn: number;
  player: number;
  kind: "play" | "pass" | "exchange";
  points: number;
  words: WordScore[];
  placements: { at: number; tile: Placed }[];
  exchanged: number;
  exploded: number[];
  restored: number[];
  capacityBefore: number;
  capacityAfter: number;
  scores: number[];
}
export interface Ending {
  reason: "elimination" | "rack-out" | "stalled";
  winner: number | null;
  adjustments: number[];
}
export interface Game {
  id: string;
  schema: 1;
  dictionary: "letterpress-cc0-v1";
  settings: Settings;
  rng: number;
  players: Player[];
  active: number;
  turn: number;
  board: (Placed | null)[];
  bag: Tile[];
  exploded: Tile[];
  pending: Placement[];
  scoreless: number;
  phase: "playing" | "turn-results" | "handoff" | "game-over";
  history: TurnResult[];
  lastResult: TurnResult | null;
  ending: Ending | null;
}
export type Action =
  | { type: "stage"; placement: Placement }
  | { type: "recall"; id?: string }
  | { type: "reorder"; id: string; slot: number }
  | { type: "shuffle" }
  | { type: "play" }
  | { type: "pass" }
  | { type: "exchange"; ids: string[] }
  | { type: "advance" }
  | { type: "reveal" };
