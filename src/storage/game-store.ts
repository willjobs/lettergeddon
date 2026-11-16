import type { Game } from "../engine/types.ts";
import { restoreGame } from "../engine/invariants.ts";

const ACTIVE_KEY = "active";
const REVISION_KEY = "active-revision";

export class SaveConflictError extends Error {
  constructor() {
    super(
      "This game changed in another window. Reload the latest game before continuing.",
    );
    this.name = "SaveConflictError";
  }
}

const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lettergeddon", 1);
    let settled = false;
    request.onupgradeneeded = () => {
      if (settled) {
        request.transaction?.abort();
        return;
      }
      if (!request.result.objectStoreNames.contains("games")) {
        request.result.createObjectStore("games");
      }
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      settled = true;
      reject(request.error);
    };
    request.onblocked = () => {
      settled = true;
      reject(
        new Error(
          "Saved games are blocked by another window. Close other game windows and retry.",
        ),
      );
    };
  });

// Legacy saves have no revision key. Only tokens written by this store establish
// a revision; the Game at 'active' retains its original schema and export format.
const revisionOf = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
let expectedRevision: string | null = null;
let hasLoaded = false;
let conflicted = false;
let writes: Promise<unknown> = Promise.resolve();

async function readSnapshot(): Promise<{
  raw: unknown;
  revision: string | null;
}> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("games", "readonly");
      const store = tx.objectStore("games");
      const gameRequest = store.get(ACTIVE_KEY);
      const revisionRequest = store.get(REVISION_KEY);
      tx.oncomplete = () =>
        resolve({
          raw: gameRequest.result,
          revision: revisionOf(revisionRequest.result),
        });
      tx.onabort = () =>
        reject(tx.error || new Error("Saved game read was interrupted."));
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function saveGame(game: Game): Promise<void> {
  const snapshot = structuredClone(game);
  const job = writes
    .catch(() => {})
    .then(async () => {
      if (conflicted) throw new SaveConflictError();
      const db = await open();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("games", "readwrite");
          const store = tx.objectStore("games");
          const revisionRequest = store.get(REVISION_KEY);
          // Also protect callers that try to save before ever loading an existing
          // legacy game: an absent revision is not permission to overwrite it.
          const gameRequest = store.get(ACTIVE_KEY);
          let conflict: SaveConflictError | null = null;
          let nextRevision: string | null = null;
          gameRequest.onsuccess = () => {
            const diskRevision = revisionOf(revisionRequest.result);
            if (
              diskRevision !== expectedRevision ||
              (!hasLoaded && gameRequest.result !== undefined)
            ) {
              conflicted = true;
              conflict = new SaveConflictError();
              tx.abort();
              return;
            }
            nextRevision = crypto.randomUUID();
            store.put(snapshot, ACTIVE_KEY);
            store.put(nextRevision, REVISION_KEY);
          };
          tx.oncomplete = () => {
            expectedRevision = nextRevision;
            hasLoaded = true;
            resolve();
          };
          tx.onabort = () =>
            reject(
              conflict ||
                tx.error ||
                new Error("Saved game write was interrupted."),
            );
          tx.onerror = () => reject(conflict || tx.error);
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
  return (await readSnapshot()).raw;
}

export async function loadGame(): Promise<Game | null> {
  await writes.catch(() => {});
  const { raw, revision } = await readSnapshot();
  // Capture the matching token even for a corrupt Game so an explicit New Game
  // can replace it. A conflicted tab, however, never regains write authority.
  if (!conflicted) {
    expectedRevision = revision;
    hasLoaded = true;
  }
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
