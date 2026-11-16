import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createGame } from "../../src/engine/game.ts";
import { tiles } from "../../src/engine/tiles.ts";

async function readSavedGame(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ board: number; history: string[]; score: number }>(
        (resolve, reject) => {
          const request = indexedDB.open("lettergeddon", 1);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction("games", "readonly");
            const read = tx.objectStore("games").get("active");
            tx.oncomplete = () => {
              db.close();
              resolve({
                board: read.result.board.filter(Boolean).length,
                history: read.result.history.map(
                  (move: { kind: string }) => move.kind,
                ),
                score: read.result.players[0].score,
              });
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          };
          request.onerror = () => reject(request.error);
        },
      ),
  );
}

test("a stale window cannot overwrite a completed turn when revealing its rack", async ({
  page,
  context,
}) => {
  const game = createGame(
    ["Ada", "Ben"],
    { expirationTurns: 3, recovery: true },
    123,
  );
  const pool = tiles(3);
  game.players[0].rack = [..."CATREIS"].map((letter) => ({
    destroyed: false,
    tile: pool.splice(
      pool.findIndex((tile) => tile.letter === letter),
      1,
    )[0],
  }));
  game.players[1].rack = pool
    .splice(0, 7)
    .map((tile) => ({ destroyed: false, tile }));
  game.bag = pool;

  await page.goto("/");
  await expect(page.getByRole("button", { name: /New game/ })).toBeEnabled();
  await page.evaluate(
    (game) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("lettergeddon", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("games", "readwrite");
          tx.objectStore("games").put(game, "active");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
        request.onerror = () => reject(request.error);
      }),
    game,
  );
  await page.reload();
  await page.getByRole("button", { name: "Continue game" }).click();
  await page.getByRole("button", { name: "Reveal my rack" }).click();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();

  // Merely opening another window must not steal the first window's write token.
  const stale = await context.newPage();
  await stale.goto("/");
  await stale.getByRole("button", { name: "Continue game" }).click();
  await expect(
    stale.getByRole("button", { name: "Reveal my rack" }),
  ).toBeVisible();

  for (let index = 0; index < 3; index++) {
    await page.getByTestId(`rack-tile-${index}`).focus();
    await page.keyboard.press("Enter");
    await page.getByLabel("Board coordinate").fill(["H8", "I8", "J8"][index]);
    await page.getByRole("button", { name: "Place tile", exact: true }).click();
  }
  await page.getByRole("button", { name: "Submit word", exact: true }).click();
  await expect(page.getByText("10 points.")).toBeVisible();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  const completed = { board: 3, history: ["play"], score: 10 };
  expect(await readSavedGame(page)).toEqual(completed);

  await stale.getByRole("button", { name: "Reveal my rack" }).click();
  await expect(
    stale.getByRole("button", { name: "Reload latest game" }),
  ).toBeVisible();
  await expect(stale.locator(".rack-tile")).toHaveCount(0);
  expect(await readSavedGame(page)).toEqual(completed);

  // No remaining action on the locked view can enqueue a stale overwrite.
  await expect(
    stale.getByRole("button", { name: /Pass this turn/ }),
  ).toHaveCount(0);
  await stale.getByRole("button", { name: "Reload latest game" }).click();
  await stale.getByRole("button", { name: "Continue game" }).click();
  await expect(stale.getByText("10 points.")).toBeVisible();
  expect(await readSavedGame(page)).toEqual(completed);
});
