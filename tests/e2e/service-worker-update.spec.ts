import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("a worker update precaches fresh HTML and launches the new version offline", async ({
  page,
  context,
}) => {
  const directory = mkdtempSync(join(tmpdir(), "lettergeddon-worker-update-"));
  const dist = join(directory, "dist");
  const helper = resolve("scripts/build-sw.mjs");
  const requests: string[] = [];

  // Exercise the production generator against two static releases. Fresh HTTP
  // caching matches Pages hosting and must not contaminate the second precache.
  function release(version: number) {
    mkdirSync(dist, { recursive: true });
    rmSync(join(dist, "assets"), { recursive: true, force: true });
    mkdirSync(join(dist, "assets"));
    writeFileSync(
      join(dist, "index.html"),
      `<!doctype html><html><body><main id="version">Version ${version} shell</main>
<script src="./assets/version-${version}.js"></script>
<script>navigator.serviceWorker.register('./sw.js')</script></body></html>`,
    );
    writeFileSync(
      join(dist, "assets", `version-${version}.js`),
      `document.getElementById('version').textContent='Version ${version} ready';`,
    );
    execFileSync(process.execPath, [helper], { cwd: directory });
  }

  release(1);
  const server = createServer((request, response) => {
    const pathname = new URL(request.url!, "http://localhost").pathname;
    requests.push(pathname);
    // sw.js is revalidated, while the previously loaded document stays fresh in
    // Chromium's HTTP cache during the simulated deployment.
    response.setHeader(
      "Cache-Control",
      pathname === "/sw.js" ? "no-cache" : "public, max-age=600",
    );
    response.setHeader(
      "Content-Type",
      pathname.endsWith(".js") ? "application/javascript" : "text/html",
    );
    try {
      response.end(
        readFileSync(
          join(dist, pathname === "/" ? "index.html" : pathname.slice(1)),
        ),
      );
    } catch {
      response.statusCode = 404;
      response.end("Not found");
    }
  });

  try {
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await page.goto(origin);
    await expect(page.locator("#version")).toHaveText("Version 1 ready");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);

    release(2);
    const newWorkerPromise = context.waitForEvent("serviceworker");
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration!.update();
    });
    const newWorker = await newWorkerPromise;
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return registration?.waiting?.state;
        }),
      )
      .toBe("installed");

    // This assertion fails with default-cache precaching: the cache containing
    // version-2.js instead holds Version 1 HTML from the fresh HTTP cache.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          for (const key of await caches.keys()) {
            const cache = await caches.open(key);
            if (await cache.match("./assets/version-2.js")) {
              return (await cache.match("./"))?.text();
            }
          }
          return null;
        }),
      )
      .toContain("Version 2 shell");
    expect(
      requests.filter((pathname) => pathname === "/").length,
    ).toBeGreaterThanOrEqual(3);

    // Let the waiting worker activate naturally, then remove the separate HTTP
    // cache so an accidentally retained old script cannot hide a broken update.
    await page.close();
    await expect
      .poll(() => newWorker.evaluate("self.registration.active?.state"))
      .toBe("activated");
    const reopened = await context.newPage();
    const session = await context.newCDPSession(reopened);
    await session.send("Network.clearBrowserCache");
    await context.setOffline(true);
    await reopened.goto(origin);
    await expect(reopened.locator("#version")).toHaveText("Version 2 ready");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    rmSync(directory, { recursive: true, force: true });
  }
});
