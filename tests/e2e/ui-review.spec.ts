import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { applyAction, createGame } from "../../src/engine/game.ts";
import { tiles } from "../../src/engine/tiles.ts";
import { assertInvariants } from "../../src/engine/invariants.ts";
import type { Game } from "../../src/engine/types.ts";

function fixture(letters = "CATREIS"): Game {
  const game = createGame(
    ["Ada", "Ben"],
    { expirationTurns: 3, recovery: true },
    123,
  );
  const pool = tiles(3);
  game.players[0].rack = [...letters].map((letter) => ({
    destroyed: false,
    tile: pool.splice(
      pool.findIndex((tile) => tile.letter === (letter === "?" ? "" : letter)),
      1,
    )[0],
  }));
  game.players[1].rack = pool
    .splice(0, 7)
    .map((tile) => ({ destroyed: false, tile }));
  game.bag = pool;
  assertInvariants(game);
  return game;
}

async function inject(
  page: Page,
  game = fixture(),
  reveal = true,
): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /New game/ })).toBeEnabled();
  await page.evaluate(async (game) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("lettergeddon", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("games");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("games", "readwrite");
        transaction.objectStore("games").put(game, "active");
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      };
    });
  }, game);
  await page.reload();
  await page.getByRole("button", { name: "Continue game" }).click();
  if (reveal)
    await page.getByRole("button", { name: "Reveal my rack" }).click();
}

async function drag(page: Page, source: string, target: string): Promise<void> {
  const from = (await page.locator(source).boundingBox())!;
  const to = (await page.locator(target).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
}

for (const [width, height] of [
  [1280, 720],
  [1024, 768],
  [900, 650],
  [844, 390],
  [320, 568],
]) {
  test(`setup controls stay reachable at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: /New game/ }).click();
    await page.getByLabel("Player 1", { exact: true }).fill("Ada");
    const start = page.getByRole("button", { name: /Let the letters fly/ });
    await start.scrollIntoViewIfNeeded();
    const measurements = await start.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const footer = document
        .querySelector(".app-footer")!
        .getBoundingClientRect();
      const centerElement = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
      return {
        buttonBottom: box.bottom,
        footerTop: footer.top,
        centerIsButton: button.contains(centerElement),
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    expect(measurements.buttonBottom).toBeLessThanOrEqual(
      measurements.footerTop,
    );
    expect(measurements.centerIsButton).toBe(true);
    expect(measurements.documentWidth).toBeLessThanOrEqual(width);
    await start.click();
    await expect(
      page.getByRole("group", { name: "Your seven-position tile rack" }),
    ).toBeVisible();
  });
}

test("Undo restores a manually rearranged rack", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 635 });
  await inject(page);
  const original = await page
    .locator(".rack-tile")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("data-tile-id")),
    );
  await drag(page, '[data-testid="rack-tile-0"]', '[data-rack-slot="1"]');
  await expect(page.locator('[data-testid="rack-tile-0"]')).toHaveAttribute(
    "aria-label",
    /A, 1 point/,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(
    await page
      .locator(".rack-tile")
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute("data-tile-id")),
      ),
  ).toEqual(original);
});

test("keyboard placement follows its tile and edits a staged blank assignment", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 635 });
  const game = fixture("?ATREIS");
  const id = game.players[0].rack[0].tile!.id;
  await inject(page, game);
  await page.locator(`[data-tile-id="${id}"]`).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Board coordinate").fill("H8");
  await page.getByLabel("Blank letter").selectOption("C");
  await page.getByRole("button", { name: "Place tile", exact: true }).click();
  const staged = page.locator('[data-board-square="112"]');
  await expect(staged).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Blank letter")).toHaveValue("C");
  await page.getByLabel("Board coordinate").fill("I8");
  await page.getByLabel("Blank letter").selectOption("D");
  await page.getByRole("button", { name: "Place tile", exact: true }).click();
  const moved = page.locator('[data-board-square="113"]');
  await expect(moved).toHaveAttribute("aria-label", /D, 0 points, staged/);
  await expect(moved).toBeFocused();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Return to rack", exact: true })
    .click();
  await expect(page.locator(`.rack-tile[data-tile-id="${id}"]`)).toBeFocused();
});

test("small premium labels maintain at least 4.5:1 contrast", async ({
  page,
}) => {
  await inject(page);
  const ratios = await page
    .locator(".cell.bonus-DL, .cell.bonus-DW")
    .evaluateAll((cells) => {
      const luminance = (color: string): number => {
        const channels = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4;
          });
        return (
          channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        );
      };
      return cells.map((cell) => {
        const style = getComputedStyle(cell);
        const text = luminance(style.color),
          background = luminance(style.backgroundColor);
        return (
          (Math.max(text, background) + 0.05) /
          (Math.min(text, background) + 0.05)
        );
      });
    });
  expect(ratios.length).toBeGreaterThan(0);
  expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
});

test("zoom keeps coordinate gutters visible and aligned while panning", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 635 });
  await inject(page);
  await page.getByRole("button", { name: "Enlarge", exact: true }).click();
  for (let pan = 0; pan < 2; pan++) {
    const geometry = await page
      .locator(".board-viewport")
      .evaluate((viewport) => {
        const frame = viewport.getBoundingClientRect();
        const columns = viewport
          .querySelector(".column-labels")!
          .getBoundingClientRect();
        const rows = viewport
          .querySelector(".row-labels")!
          .getBoundingClientRect();
        const columnH = viewport
          .querySelector(".column-labels span:nth-child(8)")!
          .getBoundingClientRect();
        const row8 = viewport
          .querySelector(".row-labels span:nth-child(8)")!
          .getBoundingClientRect();
        const center = viewport
          .querySelector('[data-board-square="112"]')!
          .getBoundingClientRect();
        return {
          top: frame.top,
          left: frame.left,
          columnTop: columns.top,
          rowLeft: rows.left,
          columnOffset: Math.abs(
            columnH.x + columnH.width / 2 - center.x - center.width / 2,
          ),
          rowOffset: Math.abs(
            row8.y + row8.height / 2 - center.y - center.height / 2,
          ),
        };
      });
    expect(Math.abs(geometry.columnTop - geometry.top)).toBeLessThan(1);
    expect(Math.abs(geometry.rowLeft - geometry.left)).toBeLessThan(1);
    expect(geometry.columnOffset).toBeLessThan(3);
    expect(geometry.rowOffset).toBeLessThan(3);
    await page.locator(".board-viewport").evaluate((viewport) => {
      viewport.scrollLeft += 60;
      viewport.scrollTop += 60;
    });
  }
});

test("handoff wraps supported unbroken player names without horizontal scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  let game = fixture();
  game.players[1].name = "W".repeat(32);
  game = applyAction(applyAction(game, { type: "pass" }), { type: "advance" });
  await inject(page, game, false);
  await expect(
    page.getByRole("button", { name: "Reveal my rack" }),
  ).toBeVisible();
  const card = await page
    .locator(".handoff")
    .evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
  expect(card.scrollWidth).toBeLessThanOrEqual(card.width);
});
