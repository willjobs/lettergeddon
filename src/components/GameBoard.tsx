import { useEffect, useRef } from "react";
import type { PointerEvent, KeyboardEvent } from "react";
import type { Game, Tile } from "../engine/types.ts";
import { coord, PREMIUMS } from "../engine/board.ts";
import { face } from "../engine/tiles.ts";
import { TileFace } from "./Tile.tsx";
export function GameBoard({
  game,
  enlarged,
  onDrag,
  onKeyboard,
  dropTarget,
  dropValid,
  dragId,
}: {
  game: Game;
  enlarged: boolean;
  onDrag: (e: PointerEvent<HTMLButtonElement>, tile: Tile) => void;
  onKeyboard: (e: KeyboardEvent<HTMLButtonElement>, tile: Tile) => void;
  dropTarget: number | null;
  dropValid: boolean;
  dragId: string | null;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enlarged || !viewport.current) return;
    const v = viewport.current;
    v.scrollLeft = (v.scrollWidth - v.clientWidth) / 2;
    v.scrollTop = (v.scrollHeight - v.clientHeight) / 2;
  }, [enlarged]);
  const rack = game.players[game.active].rack;
  return (
    <section className="board-area" aria-label="Playing board">
      <div
        ref={viewport}
        className={`board-viewport ${enlarged ? "is-enlarged" : ""}`}
        tabIndex={enlarged ? 0 : -1}
        aria-label={
          enlarged ? "Enlarged board. Swipe or scroll to pan." : "Entire board"
        }
      >
        <div className="board-surface">
          <div className="column-labels" aria-hidden="true">
            {"ABCDEFGHIJKLMNO".split("").map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="board-with-rows">
            <div className="row-labels" aria-hidden="true">
              {Array.from({ length: 15 }, (_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
            <div
              className="board"
              role="group"
              aria-label="15 by 15 word board"
            >
              {game.board.map((committed, at) => {
                const p = game.pending.find((p) => p.at === at);
                const held = p
                  ? rack.find((s) => s.tile?.id === p.id)?.tile
                  : null;
                const tile =
                  committed || (held ? { ...held, blankAs: p?.blankAs } : null);
                const premium = PREMIUMS[at];
                return (
                  <button
                    key={at}
                    data-board-square={at}
                    data-testid={`cell-${at}`}
                    data-tile-id={tile?.id}
                    draggable={false}
                    tabIndex={p ? 0 : -1}
                    aria-label={`${coord(at)}, ${tile ? `${face(tile)}, ${tile.value} points${p ? ", staged" : ""}` : `empty${premium ? ", " + premium : ""}`}`}
                    className={`cell bonus-${premium || "none"} ${tile ? "occupied" : ""} ${p ? "staged" : ""} ${tile?.id === dragId ? "drag-origin" : ""} ${at === dropTarget ? (dropValid ? "drop-target" : "drop-invalid") : ""}`}
                    onPointerDown={held ? (e) => onDrag(e, held) : undefined}
                    onKeyDown={held ? (e) => onKeyboard(e, held) : undefined}
                  >
                    {tile ? (
                      <TileFace
                        tile={tile}
                        lifespan={game.settings.expirationTurns}
                        board
                      />
                    ) : (
                      <span aria-hidden="true">
                        {at === 112 ? "✦" : premium}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
