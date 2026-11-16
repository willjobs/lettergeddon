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
      <p className="eyebrow">A little pressure. A lot of wordplay.</p>
      <h2>Make every letter count.</h2>
      <p>
        Build words before your tiles break. Every turn is a chance to score—and
        a little less time on the clock.
      </p>
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
          type="range"
          min="2"
          max="6"
          value={life}
          onChange={(e) => setLife(Number(e.target.value))}
        />
        <div className="range-labels" aria-hidden="true">
          <span>2 · Fast & fierce</span>
          <span>6 · Room to think</span>
        </div>
        <label className="toggle-setting">
          <span>
            <strong>Allow rack recovery</strong>
            <small>Play every tile you hold to repair one broken slot.</small>
          </span>
          <input
            type="checkbox"
            checked={recovery}
            onChange={(e) => setRecovery(e.target.checked)}
          />
        </label>
        <button className="primary wide" type="submit">
          Let the letters fly <span aria-hidden="true">↗</span>
        </button>
        <button className="text-button wide" type="button" onClick={onBack}>
          Back
        </button>
      </form>
    </section>
  );
}
