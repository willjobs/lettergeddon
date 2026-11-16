import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type {
  Action,
  Game,
  Placement,
  Settings,
  Tile,
} from "./engine/types.ts";
import { createGame, applyAction, capacity } from "./engine/game.ts";
import { loadDictionary } from "./engine/dictionary.ts";
import { coord } from "./engine/board.ts";
import {
  loadGame,
  saveGame,
  readRawSave,
  downloadSave,
  SaveConflictError,
} from "./storage/game-store.ts";
import { useTileDrag } from "./hooks/useTileDrag.tsx";
import { TileFace, tileDescription } from "./components/Tile.tsx";
import { GameBoard } from "./components/GameBoard.tsx";
import { GameSetup } from "./components/GameSetup.tsx";
import { Dialog } from "./components/Dialog.tsx";

function Brand() {
  return (
    <h1 className="brand" aria-label="Lettergeddon">
      <span>Letter</span>
      <span className="brand-burst">geddon</span>
      <sup>™</sup>
    </h1>
  );
}
function Icon({ kind }: { kind: "shuffle" | "undo" | "recall" | "zoom" }) {
  const paths = {
    shuffle:
      "M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4",
    undo: "M8 7H3V2m0 5c5-6 17-3 17 5v7",
    recall: "M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6",
    zoom: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
function Help() {
  return (
    <div className="prose">
      <p>
        Build connected words on a 15 × 15 board. Your first word must cover the
        center star. Drag tiles from your rack, then submit. Enlarge the board
        for precise placement.
      </p>
      <h3>Tile expiration</h3>
      <p>
        Each tile ages after its owner’s turn. The number and ring show how many
        turns remain. At zero, the tile explodes and destroys its rack slot.
      </p>
      <h3>Rack recovery</h3>
      <p>
        When recovery is enabled, playing every tile you held at the start of
        your turn repairs the leftmost broken slot. Only a seven-tile play earns
        the 50-point bonus.
      </p>
      <h3>Scoring</h3>
      <p>
        DL / TL multiply a new tile’s value. DW / TW multiply its word. All new
        crosswords must be valid. Blanks can stand for any letter and score
        zero.
      </p>
      <h3>Exchanges and game endings</h3>
      <p>
        Exchange requires seven tiles in the bag. Replacements get fresh timers;
        retained tiles age. Passing also ages your tiles. Losing every slot
        means elimination. Otherwise, play continues until someone goes out with
        an empty bag or six scoreless turns occur. Remaining tile values are
        deducted; going out also earns your opponent’s remaining values.
      </p>
      <h3>Keyboard controls</h3>
      <p>
        Tab to a rack tile or staged tile and press Enter or Space. Enter a
        coordinate such as H8 to place it, or return a staged tile to the rack.
        Touch and mouse placement use dragging only.
      </p>
      <p className="fine-print">
        The bundled CC0 Letterpress word list includes regional and historical
        words and is not an official tournament dictionary.{" "}
        <a href="data/DICTIONARY_LICENSE.md" target="_blank" rel="noreferrer">
          Word list & license
        </a>
        .{" "}
        <a href="THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">
          Code & third-party notices
        </a>
        .
      </p>
    </div>
  );
}

export default function App() {
  const [game, setGame] = useState<Game | null>(null);
  const [screen, setScreen] = useState<"home" | "setup" | "game">("home");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [storageConflict, setStorageConflict] = useState(false);
  const conflictRef = useRef(false);
  const lastDraft = useRef<Game | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [modal, setModal] = useState<
    | "help"
    | "more"
    | "history"
    | "exchange"
    | "new"
    | "keyboard"
    | "blank"
    | null
  >(null);
  const [zoom, setZoom] = useState(false);
  const [exchange, setExchange] = useState<string[]>([]);
  const [keyboardTile, setKeyboardTile] = useState<Tile | null>(null);
  const [blankPlacement, setBlankPlacement] = useState<Placement | null>(null);
  const [coordinate, setCoordinate] = useState("");
  const [letter, setLetter] = useState("A");
  const revision = useRef(0);
  const undo = useRef<Game[]>([]);
  function persist(next: Game) {
    if (conflictRef.current) return;
    lastDraft.current = next;
    const rev = ++revision.current;
    setSaved(false);
    void saveGame(next)
      .then(() => {
        if (rev === revision.current) {
          setSaved(true);
          setWarning("");
        }
      })
      .catch((cause: unknown) => {
        if (cause instanceof SaveConflictError) {
          conflictRef.current = true;
          setStorageConflict(true);
          setSaved(false);
          setGame(null);
          setScreen("home");
          setModal(null);
          undo.current = [];
          setWarning(
            "This game changed in another tab. Reload to continue the latest saved game. You can export this tab’s unsaved draft first.",
          );
          return;
        }
        if (rev === revision.current)
          setWarning(
            "Saving is unavailable. Keep this window open or export your game before leaving.",
          );
      });
  }
  useEffect(() => {
    let live = true;
    void loadGame()
      .then((stored) => {
        if (!live) return;
        if (stored) {
          const safe =
            stored.phase === "playing"
              ? { ...stored, phase: "handoff" as const }
              : stored;
          setGame(safe);
          setSaved(true);
        }
      })
      .catch((e: Error) => {
        if (live) {
          setWarning(e.message);
          setSaveBlocked(true);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    void loadDictionary().catch(() => {});
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const resize = () =>
      document.documentElement.style.setProperty(
        "--app-height",
        `${window.visualViewport?.height || window.innerHeight}px`,
      );
    resize();
    window.visualViewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      live = false;
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.visualViewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);
  const visible = screen === "game" && game?.phase === "playing";
  const enabled = !!visible && !modal && !busy;
  const activeRack = visible ? game!.players[game!.active].rack : [];
  const canDrop = (id: string, at: number) =>
    !!game &&
    !game.board[at] &&
    !game.pending.some((p) => p.id !== id && p.at === at);
  function commit(action: Action) {
    if (!game || busyRef.current || conflictRef.current) return;
    try {
      const next = applyAction(game, action);
      if (
        action.type === "stage" ||
        action.type === "recall" ||
        action.type === "reorder" ||
        action.type === "shuffle"
      )
        undo.current.push(game);
      setGame(next);
      persist(next);
      setError("");
      if (["pass", "exchange", "advance", "reveal"].includes(action.type)) {
        undo.current = [];
        setZoom(false);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function drop(id: string, at: number) {
    const tile = activeRack.find((s) => s.tile?.id === id)?.tile;
    if (!tile) return;
    const previous = game?.pending.find((p) => p.id === id);
    if (tile.isBlank && !previous?.blankAs) {
      setBlankPlacement({ id, at });
      setLetter("A");
      setModal("blank");
    } else
      commit({
        type: "stage",
        placement: {
          id,
          at,
          ...(previous?.blankAs ? { blankAs: previous.blankAs } : {}),
        },
      });
  }
  const drag = useTileDrag({
    enabled,
    canDrop,
    isStaged: (id) => !!game?.pending.some((p) => p.id === id),
    onDrop: drop,
    canRackDrop: (id, slot) =>
      !!activeRack[slot] &&
      !activeRack[slot].destroyed &&
      (!activeRack[slot].tile ||
        activeRack[slot].tile?.id === id ||
        !game?.pending.some((p) => p.id === activeRack[slot].tile?.id)),
    onRecall: (id, slot) => commit({ type: "reorder", id, slot }),
  });
  const onDrag = (e: PointerEvent<HTMLButtonElement>, tile: Tile) =>
    drag.begin(e, {
      id: tile.id,
      letter:
        game?.pending.find((p) => p.id === tile.id)?.blankAs ||
        tile.letter ||
        "◇",
      value: tile.value,
      blank: tile.isBlank,
    });
  const onKeyboard = (e: KeyboardEvent<HTMLButtonElement>, tile: Tile) => {
    if (!enabled || !["Enter", " "].includes(e.key)) return;
    e.preventDefault();
    setKeyboardTile(tile);
    setCoordinate("");
    setLetter(game?.pending.find((p) => p.id === tile.id)?.blankAs || "A");
    setModal("keyboard");
  };
  async function submit() {
    if (!game || busyRef.current || conflictRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const dict = await loadDictionary();
      if (conflictRef.current) return;
      const next = applyAction(game, { type: "play" }, dict);
      setGame(next);
      persist(next);
      undo.current = [];
      setZoom(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function start(names: string[], settings: Settings) {
    if (conflictRef.current) return;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const next = createGame(names, settings, seed);
    setGame(next);
    persist(next);
    setScreen("game");
    setModal(null);
    setZoom(false);
    setError("");
    undo.current = [];
  }
  function undoPlacement() {
    if (!game) return;
    const next = undo.current.pop() ?? {
      ...game,
      pending: game.pending.slice(0, -1),
    };
    setGame(next);
    persist(next);
    setError("");
  }
  const openNew = () => {
    if (game || saveBlocked) setModal("new");
    else setScreen("setup");
  };
  async function exportGame() {
    try {
      downloadSave(
        (storageConflict ? lastDraft.current : game) || (await readRawSave()),
      );
    } catch {
      setError("The saved data could not be exported.");
    }
  }
  const last = game?.lastResult;
  const highest = game?.history
    .flatMap((m) => m.words.map((w) => ({ ...w, player: m.player })))
    .sort((a, b) => b.score - a.score)[0];
  return (
    <main className={`app ${screen === "game" ? "in-game" : "cover"}`}>
      <header className="masthead">
        <Brand />
        <button
          className="help-button"
          aria-label="How to play"
          onClick={() => setModal("help")}
        >
          i
        </button>
      </header>
      {warning && (
        <aside className="warning" role="alert">
          {warning}
          {storageConflict && (
            <button onClick={() => window.location.reload()}>
              Reload latest game
            </button>
          )}
          <button onClick={() => void exportGame()}>Export save</button>
        </aside>
      )}
      {screen === "home" && (
        <div className="home-layout">
          <section className="game-menu" aria-labelledby="menu-heading">
            <h2 id="menu-heading">A word game with expiring tiles</h2>
            <p className="menu-description">
              Build connected words. Unplayed tiles count down after each of
              your turns. At zero, a tile explodes and destroys its rack slot.
            </p>
            <div className="menu-actions">
              {game && (
                <button
                  className="primary wide"
                  onClick={() => {
                    setScreen("game");
                    setError("");
                  }}
                >
                  Continue game
                </button>
              )}
              <button
                className={game ? "wide" : "primary wide"}
                disabled={loading || storageConflict}
                onClick={openNew}
              >
                {loading ? "Loading saved game…" : "New game"}
              </button>
              <button
                className="text-button wide"
                onClick={() => setModal("help")}
              >
                How to play
              </button>
            </div>
            <figure className="expiration-example">
              <figcaption>Tile lifespan: a three-turn example</figcaption>
              <div className="expiration-stages">
                {[3, 2, 1].map((remainingTurns) => (
                  <div className="expiration-stage" key={remainingTurns}>
                    <div className="example-tile" aria-hidden="true">
                      <TileFace
                        tile={{
                          id: `example-${remainingTurns}`,
                          letter: "E",
                          value: 1,
                          isBlank: false,
                          remainingTurns,
                        }}
                        lifespan={3}
                      />
                    </div>
                    <span>
                      {remainingTurns} {remainingTurns === 1 ? "turn" : "turns"}{" "}
                      left
                    </span>
                  </div>
                ))}
                <div className="expiration-stage">
                  <div className="example-tile" aria-hidden="true">
                    <span className="broken-slot" />
                  </div>
                  <span>Slot destroyed</span>
                </div>
              </div>
            </figure>
            <p className="menu-note">
              Two players sharing this device. Games save in this browser.
            </p>
          </section>
        </div>
      )}
      {screen === "setup" && (
        <div className="setup-layout">
          <GameSetup onStart={start} onBack={() => setScreen("home")} />
        </div>
      )}
      {screen === "game" && game && (
        <>
          {game.phase === "playing" && (
            <div className="game-layout">
              <div className="score-panels">
                {game.players.map((p, i) => (
                  <section
                    key={i}
                    className={`score-panel ${game.active === i ? "active" : ""}`}
                    aria-label={`${p.name}, ${p.score} points${game.active === i ? ", your turn" : ""}`}
                  >
                    <span className="player-badge">{i + 1}</span>
                    <div>
                      <strong>{p.name}</strong>
                      <small>
                        {game.active === i ? "Your turn" : "Points"}
                      </small>
                    </div>
                    <b>{p.score}</b>
                  </section>
                ))}
              </div>
              <div className="board-tools">
                <span>
                  Turn {game.turn} <i>·</i> {game.bag.length} tiles in bag
                </span>
                <div>
                  <button onClick={() => setModal("more")} disabled={busy}>
                    ••• <span>More</span>
                  </button>
                  <button
                    className="green-button"
                    aria-pressed={zoom}
                    onClick={() => setZoom(!zoom)}
                  >
                    <Icon kind="zoom" />
                    {zoom ? "Fit board" : "Enlarge"}
                  </button>
                </div>
              </div>
              <GameBoard
                game={game}
                enlarged={zoom}
                onDrag={onDrag}
                onKeyboard={onKeyboard}
                dragId={drag.tile?.id || null}
                dropTarget={
                  drag.target?.kind === "board" ? drag.target.at : null
                }
                dropValid={!!drag.target?.valid}
              />
              <div className="rack-area">
                <div className="rack-meta">
                  <span>{game.players[game.active].name}’s rack</span>
                  <span>
                    {capacity(game, game.active)} / 7 slots <i>·</i>{" "}
                    {game.settings.expirationTurns}-turn tiles
                  </span>
                </div>
                <div
                  className="rack"
                  role="group"
                  aria-label="Your seven-position tile rack"
                >
                  {activeRack.map((slot, i) => {
                    const staged =
                      slot.tile &&
                      game.pending.some((p) => p.id === slot.tile!.id);
                    return (
                      <div
                        key={i}
                        data-rack-slot={i}
                        className={`rack-slot ${slot.destroyed ? "destroyed" : ""} ${drag.target?.kind === "rack" && drag.target.at === i ? (drag.target.valid ? "rack-target" : "rack-invalid") : ""}`}
                      >
                        {slot.destroyed ? (
                          <span
                            role="img"
                            aria-label={`Rack position ${i + 1}, destroyed`}
                            className="broken-slot"
                          >
                            <span />
                          </span>
                        ) : slot.tile && !staged ? (
                          <button
                            disabled={busy}
                            draggable={false}
                            data-testid={`rack-tile-${i}`}
                            data-tile-id={slot.tile.id}
                            className={`rack-tile ${drag.tile?.id === slot.tile.id ? "drag-origin" : ""}`}
                            aria-label={`Position ${i + 1}, ${tileDescription(slot.tile, game.settings.expirationTurns)}`}
                            onPointerDown={(e) => onDrag(e, slot.tile!)}
                            onKeyDown={(e) => onKeyboard(e, slot.tile!)}
                          >
                            <TileFace
                              tile={slot.tile}
                              lifespan={game.settings.expirationTurns}
                            />
                          </button>
                        ) : (
                          <span
                            className="empty-slot"
                            aria-label={`Position ${i + 1}, ${staged ? "tile staged" : "empty"}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="game-feedback" role="status">
                {error ||
                  (game.pending.length
                    ? `${game.pending.length} ${game.pending.length === 1 ? "tile" : "tiles"} placed.`
                    : "Drag tiles onto the board.")}
              </div>
              <div className="action-toolbar">
                <button
                  disabled={!enabled}
                  onClick={() => commit({ type: "shuffle" })}
                >
                  <Icon kind="shuffle" />
                  <span>Shuffle</span>
                </button>
                <button
                  className="primary submit"
                  disabled={!enabled || !game.pending.length}
                  onClick={() => void submit()}
                >
                  {busy ? "Checking…" : "Submit word"}
                </button>
                <button
                  disabled={
                    !enabled || (!undo.current.length && !game.pending.length)
                  }
                  onClick={undoPlacement}
                >
                  <Icon kind="undo" />
                  <span>Undo</span>
                </button>
                <button
                  disabled={!enabled || !game.pending.length}
                  onClick={() => commit({ type: "recall" })}
                >
                  <Icon kind="recall" />
                  <span>Recall</span>
                </button>
              </div>
            </div>
          )}
          {game.phase === "turn-results" && last && (
            <section className="flow-card panel results">
              <p className="phase-label">Turn {last.turn} complete</p>
              <h2>
                {game.players[last.player].name}{" "}
                {last.kind === "play"
                  ? `scored ${last.points} points.`
                  : last.kind === "exchange"
                    ? `exchanged ${last.exchanged} ${last.exchanged === 1 ? "tile" : "tiles"}.`
                    : "passed this turn."}
              </h2>
              {last.words.length > 0 && (
                <div className="word-results">
                  {last.words.map((w, i) => (
                    <span key={i}>
                      {w.word} <b>+{w.score}</b>
                    </span>
                  ))}
                  {last.placements.length === 7 && (
                    <span>
                      Bingo <b>+50</b>
                    </span>
                  )}
                </div>
              )}
              <div className="result-rack" aria-hidden="true">
                {Array.from({ length: 7 }, (_, i) => (
                  <span
                    key={`${last.turn}-${i}`}
                    className={
                      last.exploded.includes(i)
                        ? "explosion"
                        : last.restored.includes(i)
                          ? "repair"
                          : ""
                    }
                  >
                    {last.exploded.includes(i)
                      ? "✷"
                      : last.restored.includes(i)
                        ? "✦"
                        : "·"}
                  </span>
                ))}
              </div>
              <div className="result-stats">
                <div>
                  <b>{last.exploded.length}</b>
                  <span>Tiles exploded</span>
                </div>
                <div>
                  <b>{last.restored.length}</b>
                  <span>Slots restored</span>
                </div>
                <div>
                  <b>
                    {last.capacityBefore} → {last.capacityAfter}
                  </b>
                  <span>Rack slots</span>
                </div>
              </div>
              <p className="total-score">
                Total score <strong>{game.players[last.player].score}</strong>
              </p>
              <button
                className="primary wide"
                onClick={() => commit({ type: "advance" })}
              >
                {game.ending ? "See final results" : "Pass the device"}{" "}
                <span aria-hidden="true">→</span>
              </button>
            </section>
          )}
          {game.phase === "handoff" && (
            <section className="flow-card handoff panel">
              <h2>{game.players[game.active].name}’s turn</h2>
              <p>Pass the device before revealing the rack.</p>
              <button
                className="primary wide"
                onClick={() => commit({ type: "reveal" })}
              >
                Reveal my rack <span aria-hidden="true">→</span>
              </button>
            </section>
          )}
          {game.phase === "game-over" && game.ending && (
            <section className="flow-card panel game-over">
              <p className="phase-label">Game over</p>
              <h2>
                {game.ending.winner === null ? (
                  "It’s a tie."
                ) : (
                  <>{game.players[game.ending.winner].name} wins.</>
                )}
              </h2>
              <p>
                {game.ending.reason === "elimination"
                  ? "A rack was completely destroyed."
                  : game.ending.reason === "rack-out"
                    ? "The bag is empty and the last tile has been played."
                    : "Six consecutive scoreless turns ended the game."}
              </p>
              <div className="final-scores">
                {game.players.map((p, i) => (
                  <div key={i}>
                    <span>{p.name}</span>
                    <b>{p.score}</b>
                    <small>
                      {game.ending!.adjustments[i] >= 0 ? "+" : ""}
                      {game.ending!.adjustments[i]} final adjustment
                    </small>
                  </div>
                ))}
              </div>
              <dl className="game-summary">
                <div>
                  <dt>Highest-scoring word</dt>
                  <dd>
                    {highest
                      ? `${highest.word} · ${highest.score} points`
                      : "No words played"}
                  </dd>
                </div>
                <div>
                  <dt>Total turns</dt>
                  <dd>{game.history.length}</dd>
                </div>
                {game.players.map((p, i) => (
                  <div key={i}>
                    <dt>{p.name}</dt>
                    <dd>
                      {game.history
                        .filter((m) => m.player === i)
                        .reduce((n, m) => n + m.exploded.length, 0)}{" "}
                      exploded ·{" "}
                      {game.history
                        .filter((m) => m.player === i)
                        .reduce((n, m) => n + m.restored.length, 0)}{" "}
                      restored
                    </dd>
                  </div>
                ))}
              </dl>
              <button
                className="primary wide"
                onClick={() => setScreen("setup")}
              >
                New game
              </button>
              <button
                className="text-button wide"
                onClick={() => setScreen("home")}
              >
                Return home
              </button>
            </section>
          )}
        </>
      )}
      {screen === "game" && game && (
        <footer className="app-footer">
          <span>
            {(online ? "" : "Offline · ") +
              (saved ? "Saved on this device" : "Saving…")}
          </span>
          <span>Recovery {game.settings.recovery ? "on" : "off"}</span>
        </footer>
      )}
      {modal === "help" && (
        <Dialog title="How to play" onClose={() => setModal(null)}>
          <Help />
        </Dialog>
      )}
      {modal === "more" && (
        <Dialog title="More" onClose={() => setModal(null)}>
          <div className="menu-buttons">
            <button
              disabled={!!game?.pending.length || !game || game.bag.length < 7}
              onClick={() => {
                setExchange([]);
                setModal("exchange");
              }}
            >
              Exchange tiles <span>↔</span>
            </button>
            <button
              disabled={!!game?.pending.length}
              onClick={() => {
                setModal(null);
                commit({ type: "pass" });
              }}
            >
              Pass this turn <span>→</span>
            </button>
            {game && game.bag.length < 7 && (
              <p className="fine-print">
                At least 7 tiles must remain in the bag to exchange.
              </p>
            )}
            {!!game?.pending.length && (
              <p className="fine-print">
                Recall your staged tiles to pass or exchange.
              </p>
            )}
            <button onClick={() => setModal("help")}>
              Rules & help <span>i</span>
            </button>
            <button onClick={() => setModal("history")}>
              Game history <span>≡</span>
            </button>
            <button onClick={() => void exportGame()}>
              Export saved game <span>↓</span>
            </button>
            <button onClick={() => setModal("new")}>
              New game <span>↗</span>
            </button>
            <button
              onClick={() => {
                setModal(null);
                if (game) {
                  const safe = { ...game, phase: "handoff" as const };
                  setGame(safe);
                  persist(safe);
                }
                setScreen("home");
              }}
            >
              Return home <span>⌂</span>
            </button>
          </div>
        </Dialog>
      )}
      {modal === "history" && (
        <Dialog title="Game history" onClose={() => setModal(null)}>
          <ol className="history">
            {game?.history.map((m) => (
              <li key={m.turn}>
                <span>
                  Turn {m.turn} · {game.players[m.player].name}
                </span>
                <strong>
                  {m.kind === "play"
                    ? m.words.map((w) => w.word).join(" · ")
                    : m.kind === "pass"
                      ? "Passed"
                      : `Exchanged ${m.exchanged} tiles`}
                </strong>
                <span>
                  +{m.points} points · {m.exploded.length} exploded ·{" "}
                  {m.restored.length} restored
                </span>
              </li>
            ))}
          </ol>
          {!game?.history.length && <p>No turns completed yet.</p>}
          <button onClick={() => setModal("more")}>Back to More</button>
        </Dialog>
      )}
      {modal === "exchange" && (
        <Dialog title="Exchange tiles" onClose={() => setModal(null)}>
          <p>Select tiles to exchange.</p>
          <div className="exchange-tiles">
            {activeRack
              .flatMap((s) => (s.tile ? [s.tile] : []))
              .map((t) => (
                <button
                  key={t.id}
                  aria-label={tileDescription(
                    t,
                    game!.settings.expirationTurns,
                  )}
                  aria-pressed={exchange.includes(t.id)}
                  onClick={() =>
                    setExchange((ids) =>
                      ids.includes(t.id)
                        ? ids.filter((id) => id !== t.id)
                        : [...ids, t.id],
                    )
                  }
                >
                  <TileFace
                    tile={t}
                    lifespan={game!.settings.expirationTurns}
                  />
                </button>
              ))}
          </div>
          <button
            className="primary wide"
            disabled={!exchange.length}
            onClick={() => {
              commit({ type: "exchange", ids: exchange });
              setModal(null);
            }}
          >
            Exchange {exchange.length || ""}{" "}
            {exchange.length === 1 ? "tile" : "tiles"}
          </button>
        </Dialog>
      )}
      {modal === "new" && (
        <Dialog title="Start a new game?" onClose={() => setModal(null)}>
          <p>
            {saveBlocked
              ? "A saved game could not be opened. Export it before replacing it."
              : "Starting a new game replaces the game saved on this device."}
          </p>
          <button className="wide" onClick={() => void exportGame()}>
            Export current save
          </button>
          <button
            className="primary wide"
            onClick={() => {
              setSaveBlocked(false);
              setWarning("");
              setModal(null);
              setScreen("setup");
            }}
          >
            Set up a new game
          </button>
        </Dialog>
      )}
      {modal === "blank" && blankPlacement && (
        <Dialog
          title="Choose a letter for the blank"
          onClose={() => {
            setModal(null);
            setBlankPlacement(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commit({
                type: "stage",
                placement: { ...blankPlacement, blankAs: letter },
              });
              setModal(null);
              setBlankPlacement(null);
            }}
          >
            <label>
              Blank represents
              <select
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
              >
                {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <p>A blank always scores zero.</p>
            <button className="primary wide">
              Place {letter} at {coord(blankPlacement.at)}
            </button>
          </form>
        </Dialog>
      )}
      {modal === "keyboard" && keyboardTile && (
        <Dialog
          title="Place a tile with the keyboard"
          returnFocus={() =>
            document.querySelector<HTMLElement>(
              `[data-tile-id="${keyboardTile.id}"]`,
            )
          }
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const match = /^([A-O])(1[0-5]|[1-9])$/i.exec(coordinate.trim());
              if (!match) {
                setError("Enter a coordinate from A1 to O15.");
                return;
              }
              const at =
                (Number(match[2]) - 1) * 15 +
                match[1].toUpperCase().charCodeAt(0) -
                65;
              commit({
                type: "stage",
                placement: {
                  id: keyboardTile.id,
                  at,
                  ...(keyboardTile.isBlank
                    ? {
                        blankAs: letter,
                      }
                    : {}),
                },
              });
              if (canDrop(keyboardTile.id, at)) setModal(null);
            }}
          >
            <label>
              Board coordinate
              <input
                autoFocus
                value={coordinate}
                onChange={(e) => setCoordinate(e.target.value)}
                placeholder="H8"
                maxLength={3}
              />
            </label>
            {keyboardTile.isBlank && (
              <label>
                Blank letter
                <select
                  value={letter}
                  onChange={(e) => setLetter(e.target.value)}
                >
                  {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
            {error && <p role="alert">{error}</p>}
            <button className="primary wide">Place tile</button>
            {game?.pending.some((p) => p.id === keyboardTile.id) && (
              <button
                type="button"
                className="wide"
                onClick={() => {
                  commit({ type: "recall", id: keyboardTile.id });
                  setModal(null);
                }}
              >
                Return to rack
              </button>
            )}
          </form>
        </Dialog>
      )}
      {drag.overlay}
    </main>
  );
}
