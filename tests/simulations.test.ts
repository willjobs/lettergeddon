import { test } from "vitest";
import assert from "node:assert/strict";
import {
  simulateGame,
  simulateMatrix,
  SIMULATION_CONFIGS,
} from "../simulations/harness.ts";
import type { SimulationAdapter } from "../simulations/harness.ts";

// A deliberately tiny fixture checks the harness, not Lettergeddon's rules.
const fixture: SimulationAdapter<number, number> = {
  create: () => 0,
  legalActions: () => [1, 2],
  step: (state, action) => state + action,
  isFinished: (state) => state >= 10,
  assertInvariants: (state) => assert.ok(state >= 0),
};

test("matrix covers expiration 2/3/5 with recovery on and off", () => {
  assert.equal(
    new Set(SIMULATION_CONFIGS.map((config) => JSON.stringify(config))).size,
    6,
  );
  assert.deepEqual(
    [...new Set(SIMULATION_CONFIGS.map((config) => config.expirationTurns))],
    [2, 3, 5],
  );
  assert.equal(simulateMatrix(fixture, [1, 2, 3]).length, 18);
});

test("same seed reproduces a simulation", () => {
  assert.deepEqual(
    simulateGame(fixture, SIMULATION_CONFIGS[0], 123),
    simulateGame(fixture, SIMULATION_CONFIGS[0], 123),
  );
});

test("nonterminal states with no legal actions are reported as soft locks", () => {
  assert.throws(
    () =>
      simulateGame(
        { ...fixture, legalActions: () => [] },
        SIMULATION_CONFIGS[0],
        42,
      ),
    /Soft lock.*seed=42/,
  );
});

test("nonterminating games fail with their reproduction parameters", () => {
  assert.throws(
    () =>
      simulateGame(
        { ...fixture, step: (state) => state },
        SIMULATION_CONFIGS[0],
        42,
        10,
      ),
    /did not finish.*seed=42/,
  );
});

test("invariants are checked after every action", () => {
  assert.throws(
    () =>
      simulateGame({ ...fixture, step: () => -1 }, SIMULATION_CONFIGS[0], 42),
    assert.AssertionError,
  );
});
