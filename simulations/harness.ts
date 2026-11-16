/** The six requested configurations; no expiration/recovery semantics are assumed. */
export interface SimulationConfig {
  expirationTurns: 2 | 3 | 5;
  recovery: boolean;
}

export const SIMULATION_CONFIGS: readonly SimulationConfig[] = [
  2, 3, 5,
].flatMap((expirationTurns) =>
  [false, true].map((recovery) => ({
    expirationTurns: expirationTurns as SimulationConfig["expirationTurns"],
    recovery,
  })),
);

export interface SimulationAdapter<State, Action> {
  create(config: SimulationConfig, seed: number): State;
  legalActions(state: State): readonly Action[];
  step(state: State, action: Action): State;
  isFinished(state: State): boolean;
  assertInvariants(state: State): void;
}

export interface SimulationResult {
  config: SimulationConfig;
  seed: number;
  turns: number;
}

/** Deterministic choices make any discovered failure reproducible. */
export function simulateGame<State, Action>(
  adapter: SimulationAdapter<State, Action>,
  config: SimulationConfig,
  seed: number,
  maxTurns = 1000,
): SimulationResult {
  let state = adapter.create(config, seed);
  let randomState = seed >>> 0;
  let turns = 0;
  const context = `expiration=${config.expirationTurns}, recovery=${config.recovery}, seed=${seed}`;
  adapter.assertInvariants(state);
  while (!adapter.isFinished(state)) {
    if (turns >= maxTurns)
      throw new Error(
        `Game did not finish after ${maxTurns} turns (${context}).`,
      );
    const actions = adapter.legalActions(state);
    if (!actions.length)
      throw new Error(`Soft lock at turn ${turns} (${context}).`);
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    state = adapter.step(state, actions[randomState % actions.length]);
    adapter.assertInvariants(state);
    turns += 1;
  }
  return { config, seed, turns };
}

export function simulateMatrix<State, Action>(
  adapter: SimulationAdapter<State, Action>,
  seeds: readonly number[],
  maxTurns = 1000,
): SimulationResult[] {
  return SIMULATION_CONFIGS.flatMap((config) =>
    seeds.map((seed) => simulateGame(adapter, config, seed, maxTurns)),
  );
}
