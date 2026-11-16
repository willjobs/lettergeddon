import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createGame, applyAction } from "../../src/engine/game.ts";
import { tiles } from "../../src/engine/tiles.ts";
import { assertInvariants } from "../../src/engine/invariants.ts";
import type { Game } from "../../src/engine/types.ts";
import { findPlay, dictionary } from "../../simulations/policy.ts";

function fixture(letters = "CATREIS", life = 3): Game {
  const game = createGame(
    ["Ada", "Ben"],
    { expirationTurns: life, recovery: true },
    123,
  );
  const pool = tiles(life);
  game.players[0].rack = [...letters].map((c) => ({
    destroyed: false,
    tile: pool.splice(
      pool.findIndex((t) => t.letter === (c === "?" ? "" : c)),
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
async function inject(page: Page, game = fixture()) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /New game/ })).toBeEnabled();
  await page.evaluate(async (game) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("lettergeddon", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("games");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("games", "readwrite");
        tx.objectStore("games").put(game, "active");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, game);
  await page.reload();
  await page.getByRole("button", { name: "Continue game" }).click();
  if (game.phase === "playing" || game.phase === "handoff")
    await page.getByRole("button", { name: "Reveal my rack" }).click();
}
async function drag(page: Page, source: string, target: string) {
  const from = await page.locator(source).boundingBox(),
    to = await page.locator(target).boundingBox();
  expect(from).toBeTruthy();
  expect(to).toBeTruthy();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
}
const board = (at: number) => `[data-board-square="${at}"]`;
const rack = (i: number) => `[data-testid="rack-tile-${i}"]`;
async function stageCat(page: Page) {
  for (let i = 0; i < 3; i++) await drag(page, rack(i), board(112 + i));
}

for (const [width, height] of [
  [393, 635],
  [390, 667],
  [320, 568],
  [844, 390],
  [768, 1024],
  [1440, 900],
]) {
  test(`game fits ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await inject(page);
    const m = await page.evaluate(() => {
      const b = document.querySelector(".board")!.getBoundingClientRect(),
        r = document.querySelector(".rack")!.getBoundingClientRect(),
        t = document.querySelector(".action-toolbar")!.getBoundingClientRect();
      return {
        w: innerWidth,
        h: innerHeight,
        docW: document.documentElement.scrollWidth,
        docH: document.documentElement.scrollHeight,
        b: { w: b.width, h: b.height, bottom: b.bottom, right: b.right },
        r: { y: r.y, right: r.right },
        t: { bottom: t.bottom },
      };
    });
    expect(m.docW).toBeLessThanOrEqual(width);
    expect(m.docH).toBeLessThanOrEqual(height);
    expect(Math.abs(m.b.w - m.b.h)).toBeLessThan(1);
    if (width < 640 || (height > 600 && width < 900))
      expect(m.b.bottom).toBeLessThanOrEqual(m.r.y);
    expect(m.t.bottom).toBeLessThanOrEqual(height);
    expect(await page.locator("[data-rack-slot]").count()).toBe(7);
    await stageCat(page);
    await expect(page.locator(".staged")).toHaveCount(3);
    await page.getByRole("button", { name: "Enlarge", exact: true }).click();
    await expect(page.locator(".board-viewport")).toHaveClass(/is-enlarged/);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeLessThanOrEqual(height);
    await page.getByRole("button", { name: "Fit board", exact: true }).click();
    if (width === 393) await page.screenshot({ path: "docs/game-mobile.png" });
    if (width === 1440)
      await page.screenshot({ path: "docs/game-desktop.png" });
  });
}
test("mouse drag, move, undo, recall, cancel invalid drops and no tap placement", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 635 });
  await inject(page);
  await page.locator(rack(0)).click();
  await page.locator(board(112)).click();
  await expect(page.locator(".staged")).toHaveCount(0);
  await drag(page, rack(0), board(112));
  await expect(page.locator(".staged")).toHaveCount(1);
  await drag(page, board(112), board(113));
  await expect(page.locator(board(113))).toHaveClass(/staged/);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(board(112))).toHaveClass(/staged/);
  await drag(page, rack(1), board(112));
  await expect(page.locator(".staged")).toHaveCount(1);
  await expect(page.locator(rack(1))).toBeVisible();
  await drag(page, board(112), '[data-rack-slot="0"]');
  await expect(page.locator(".staged")).toHaveCount(0);
  await stageCat(page);
  await page.getByRole("button", { name: "Recall", exact: true }).click();
  await expect(page.locator(".staged")).toHaveCount(0);
});
test("valid word, results, handoff privacy, refresh and reveal", async ({
  page,
}) => {
  await inject(page);
  await stageCat(page);
  await page.getByRole("button", { name: "Submit word", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ada scored 10 points." }),
  ).toBeVisible();
  await expect(page.getByText("10 points.")).toBeVisible();
  await expect(page.locator(".rack-tile")).toHaveCount(0);
  await page.getByRole("button", { name: "Pass the device" }).click();
  await expect(
    page.getByRole("button", { name: "Reveal my rack" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Continue game" }).click();
  await expect(page.locator(".rack-tile")).toHaveCount(0);
  await page.getByRole("button", { name: "How to play", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".rack-tile")).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Reveal my rack" }).click();
  await expect(page.getByText("Ben’s rack")).toBeVisible();
});
test("invalid word does not consume the turn, staged moves resume behind a privacy gate", async ({
  page,
}) => {
  await inject(page);
  await drag(page, rack(0), board(0));
  await page.getByRole("button", { name: "Submit word", exact: true }).click();
  await expect(page.getByText(/first word must cover/)).toBeVisible();
  await expect(page.getByText("Turn 1", { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Continue game" }).click();
  await expect(page.locator(".rack-tile")).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal my rack" }).click();
  await expect(page.locator(board(0))).toHaveClass(/staged/);
});
test("keyboard placement and blank assignment", async ({ page }) => {
  await inject(page, fixture("?ATREIS"));
  await page.locator(rack(0)).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Board coordinate").fill("H8");
  await page.getByLabel("Blank letter").selectOption("C");
  await page.getByRole("button", { name: "Place tile", exact: true }).click();
  await expect(page.locator(board(112))).toHaveAttribute(
    "aria-label",
    /C, 0 points, staged/,
  );
  await drag(page, rack(1), board(113));
  await drag(page, rack(2), board(114));
  await page.getByRole("button", { name: "Submit word", exact: true }).click();
  await expect(page.getByText("4 points.")).toBeVisible();
});
test("dragging a blank opens its letter choice", async ({ page }) => {
  await inject(page, fixture("?ATREIS"));
  await drag(page, rack(0), board(112));
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Blank represents").selectOption("C");
  await page.getByRole("button", { name: "Place C at H8" }).click();
  await expect(page.locator(board(112))).toHaveClass(/staged/);
});
test("exchange, shuffle, and pass preserve timer semantics", async ({
  page,
}) => {
  await inject(page);
  await page.getByRole("button", { name: /More/ }).click();
  await page.getByRole("button", { name: /Exchange tiles/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "C, 3 points, 3 of 3 turns remaining" })
    .click();
  await page
    .getByRole("button", { name: "Exchange 1 tile", exact: true })
    .click();
  await expect(page.getByText("exchanged 1 tile.")).toBeVisible();
  await expect(page.locator(".rack-tile")).toHaveCount(0);
  await page.getByRole("button", { name: "Pass the device" }).click();
  await page.getByRole("button", { name: "Reveal my rack" }).click();
  await page.getByRole("button", { name: /More/ }).click();
  await page.getByRole("button", { name: /Pass this turn/ }).click();
  await expect(page.getByText("passed this turn.")).toBeVisible();
});
test("touch dragging prevents page scroll", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 667 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await inject(page);
  const from = (await page.locator(rack(0)).boundingBox())!,
    to = (await page.locator(board(112)).boundingBox())!;
  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x + from.width / 2, y: from.y + from.height / 2 }],
  });
  for (let i = 1; i <= 12; i++)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x:
            from.x +
            from.width / 2 +
            ((to.x + to.width / 2 - from.x - from.width / 2) * i) / 12,
          y:
            from.y +
            from.height / 2 +
            ((to.y + to.height / 2 - from.y - from.height / 2) * i) / 12,
        },
      ],
    });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".staged")).toHaveCount(1);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await context.close();
});
test("zoom edge-pans internally during a drag", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 635 });
  await inject(page);
  await page.getByRole("button", { name: "Enlarge", exact: true }).click();
  const before = await page
      .locator(".board-viewport")
      .evaluate((e) => e.scrollLeft),
    vp = (await page.locator(".board-viewport").boundingBox())!,
    from = (await page.locator(rack(0)).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(vp.x + vp.width - 10, vp.y + vp.height / 2, {
    steps: 10,
  });
  await page.waitForTimeout(350);
  expect(
    await page.locator(".board-viewport").evaluate((e) => e.scrollLeft),
  ).toBeGreaterThan(before);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
  expect(await page.evaluate(() => scrollX + scrollY)).toBe(0);
});
test("destroyed slots reject drops and reduced motion disables animation", async ({
  page,
}) => {
  const g = fixture();
  g.exploded.push({ ...g.players[0].rack[1].tile!, remainingTurns: 0 });
  g.players[0].rack[1] = { destroyed: true, tile: null };
  await page.emulateMedia({ reducedMotion: "reduce" });
  await inject(page, g);
  await drag(page, rack(0), board(112));
  await drag(page, board(112), '[data-rack-slot="1"]');
  await expect(page.locator(board(112))).toHaveClass(/staged/);
  await expect(page.locator(".broken-slot")).toHaveCount(1);
  expect(
    await page
      .locator(".rack-tile")
      .first()
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
});
test("offline reload restores game and dictionary", async ({
  page,
  context,
}) => {
  await inject(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "Continue game" }).click();
  await page.getByRole("button", { name: "Reveal my rack" }).click();
  await stageCat(page);
  await page.getByRole("button", { name: "Submit word", exact: true }).click();
  await expect(page.getByText("10 points.")).toBeVisible();
});

let cachedHeavy: Game | null = null;
function heavyGame(): Game {
  if (cachedHeavy) return cachedHeavy;
  let game = createGame(
    ["Ada", "Ben"],
    { expirationTurns: 6, recovery: true },
    2,
  );
  for (let turn = 0; turn < 48 && !game.ending; turn++) {
    const play = findPlay(game);
    if (play) {
      for (const placement of play)
        game = applyAction(game, { type: "stage", placement });
      game = applyAction(game, { type: "play" }, dictionary);
    } else game = applyAction(game, { type: "pass" });
    if (!game.ending) {
      game = applyAction(game, { type: "advance" });
      game = applyAction(game, { type: "reveal" });
    }
  }
  assertInvariants(game);
  cachedHeavy = game;
  return game;
}
for (const [width, height] of [
  [393, 635],
  [390, 667],
  [320, 568],
  [844, 390],
  [768, 1024],
  [1440, 900],
]) {
  test(`occupied board fits ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const g = heavyGame();
    expect(g.ending).toBeNull();
    expect(g.board.filter(Boolean).length).toBeGreaterThan(40);
    await inject(page, g);
    expect(await page.locator(".cell.occupied").count()).toBeGreaterThan(40);
    const measurements = await page.evaluate(() => {
      const board = document.querySelector(".board")!.getBoundingClientRect(),
        rack = document.querySelector(".rack")!.getBoundingClientRect();
      return {
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
        bw: board.width,
        bh: board.height,
        bb: board.bottom,
        rt: rack.top,
        toolbar: document
          .querySelector(".action-toolbar")!
          .getBoundingClientRect().bottom,
      };
    });
    expect(measurements.w).toBeLessThanOrEqual(width);
    expect(measurements.h).toBeLessThanOrEqual(height);
    expect(Math.abs(measurements.bw - measurements.bh)).toBeLessThan(1);
    expect(measurements.toolbar).toBeLessThanOrEqual(height);
    if (width < 640 || (height > 600 && width < 900))
      expect(measurements.bb).toBeLessThanOrEqual(measurements.rt);
    if (width === 393)
      await page.screenshot({ path: "docs/game-occupied-mobile.png" });
  });
}
test("new-game settings, elimination, and final results form a complete flow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 635 });
  await page.goto("/");
  await page.getByRole("button", { name: /New game/ }).click();
  await page.getByLabel("Player 1", { exact: true }).fill("Ada");
  await page.getByLabel("Player 2", { exact: true }).fill("Ben");
  await page.locator("#lifespan").fill("2");
  await page.getByLabel("Allow rack recovery").uncheck();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await expect(page.getByText("Recovery off", { exact: true })).toBeVisible();
  await expect(page.locator(rack(0))).toHaveAttribute(
    "aria-label",
    /2 of 2 turns remaining/,
  );
  for (let turn = 0; turn < 3; turn++) {
    await page.getByRole("button", { name: /More/ }).click();
    await page.getByRole("button", { name: /Pass this turn/ }).click();
    if (turn < 2) {
      await page.getByRole("button", { name: "Pass the device" }).click();
      await page.getByRole("button", { name: "Reveal my rack" }).click();
    }
  }
  await expect(page.getByText("7", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "See final results" }).click();
  await expect(page.getByRole("heading", { name: "Ben wins." })).toBeVisible();
  await expect(
    page.getByText("A rack was completely destroyed."),
  ).toBeVisible();
  await expect(
    page.locator(".final-scores").getByText("Ben", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return home" }).click();
  await expect(
    page.getByRole("button", { name: "Continue game" }),
  ).toBeVisible();
});
test("damaged saves are retained and require explicit replacement", async ({
  page,
}) => {
  await inject(page);
  await page.evaluate(async () => {
    const req = indexedDB.open("lettergeddon", 1);
    await new Promise<void>((resolve) => {
      req.onsuccess = () => {
        const tx = req.result.transaction("games", "readwrite");
        tx.objectStore("games").put(
          { schema: 999, original: "keep this" },
          "active",
        );
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
      };
    });
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("damaged");
  await expect(page.getByRole("button", { name: "Continue game" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: /New game/ }).click();
  await expect(page.getByRole("dialog")).toContainText("could not be opened");
  await page.getByRole("button", { name: "Close dialog" }).click();
  expect(
    await page.evaluate(async () => {
      const req = indexedDB.open("lettergeddon", 1);
      return await new Promise((resolve) => {
        req.onsuccess = () => {
          const get = req.result
            .transaction("games")
            .objectStore("games")
            .get("active");
          get.onsuccess = () => {
            resolve(get.result);
            req.result.close();
          };
        };
      });
    }),
  ).toEqual({ schema: 999, original: "keep this" });
});
