import { useState } from "react";
import type { Settings } from "../engine/types.ts";
export function GameSetup({
  onStart,
  onBack,
}: {
  onStart: (names: string[], settings: Settings) => void;
  onBack: () => void;
}) {
  const [life, setLife] = useState(3);
  const [recovery, setRecovery] = useState(true);
  return (
    <section className="setup-card panel">
      <h2>New game</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          onStart([String(data.get("p1")), String(data.get("p2"))], {
            expirationTurns: life,
            recovery,
          });
        }}
      >
        <div className="name-fields">
          <label>
            Player 1
            <input name="p1" maxLength={32} defaultValue="Player 1" required />
          </label>
          <label>
            Player 2
            <input name="p2" maxLength={32} defaultValue="Player 2" required />
          </label>
        </div>
        <label className="setting-label" htmlFor="lifespan">
          Turns until explosion <strong>{life} turns</strong>
        </label>
        <input
          id="lifespan"
          aria-describedby="lifespan-help"
          type="range"
          min="2"
          max="6"
          value={life}
          onChange={(e) => setLife(Number(e.target.value))}
        />
        <div className="range-labels" aria-hidden="true">
          <span>2 turns</span>
          <span>6 turns</span>
        </div>
        <p className="setting-help" id="lifespan-help">
          Only your turns count toward your tiles’ lifespan.
        </p>
        <label className="toggle-setting">
          <span>
            <strong>Allow rack recovery</strong>
            <small>
              Play every tile in your rack in one move to repair one destroyed
              slot.
            </small>
          </span>
          <input
            type="checkbox"
            checked={recovery}
            onChange={(e) => setRecovery(e.target.checked)}
          />
        </label>
        <button className="primary wide" type="submit">
          Start game
        </button>
        <button className="text-button wide" type="button" onClick={onBack}>
          Back
        </button>
      </form>
    </section>
  );
}
