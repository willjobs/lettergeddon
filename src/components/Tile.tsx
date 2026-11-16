import type { CSSProperties } from "react";
import type { Tile as TileType } from "../engine/types.ts";
import { face } from "../engine/tiles.ts";
export const tileDescription = (tile: TileType, lifespan: number) =>
  `${tile.isBlank ? "Blank" : tile.letter}, ${tile.value} ${tile.value === 1 ? "point" : "points"}, ${tile.remainingTurns} of ${lifespan} turns remaining`;
export function TileFace({
  tile,
  lifespan,
  board = false,
}: {
  tile: TileType & { blankAs?: string };
  lifespan: number;
  board?: boolean;
}) {
  const progress = tile.remainingTurns / lifespan;
  const damage = 1 - progress;
  const ringColor =
    tile.remainingTurns === 1
      ? "#b83f22"
      : progress > 0.67
        ? "#a4bd61"
        : progress > 0.4
          ? "#e3ae24"
          : "#e16c20";
  return (
    <span
      className={`tile-face ${board ? "board-tile" : ""} ${tile.isBlank ? "blank-tile" : ""} ${damage > 0 ? "aged" : ""} ${tile.remainingTurns === 1 ? "last-turn" : ""}`}
      style={
        {
          "--life": `${(tile.remainingTurns / lifespan) * 100}%`,
          "--damage": damage,
          "--crack-opacity": damage === 0 ? 0 : 0.4 + damage * 0.6,
          "--ring-color": ringColor,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {!board && <span className="life-ring" />}
      <span className="cracks" />
      <span className="tile-mark">
        <span className="letter">{face(tile)}</span>
        <sup>{tile.value}</sup>
      </span>
    </span>
  );
}
