import type { Game } from "../engine/types.ts";
import { restoreGame } from "../engine/invariants.ts";
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lettergeddon", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("games");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
let writes: Promise<unknown> = Promise.resolve();
export function saveGame(game: Game): Promise<void> {
  const snapshot = structuredClone(game);
  const job = writes
    .catch(() => {})
    .then(async () => {
      const db = await open();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("games", "readwrite");
          tx.objectStore("games").put(snapshot, "active");
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    });
  writes = job;
  return job;
}
export async function readRawSave(): Promise<unknown> {
  await writes.catch(() => {});
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction("games").objectStore("games").get("active");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function loadGame(): Promise<Game | null> {
  const raw = await readRawSave();
  return raw === undefined ? null : restoreGame(raw);
}
export function downloadSave(raw: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "lettergeddon-save.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
