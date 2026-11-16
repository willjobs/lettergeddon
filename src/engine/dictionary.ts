let loaded: Promise<ReadonlySet<string>> | null = null;
export function loadDictionary(): Promise<ReadonlySet<string>> {
  return (loaded ??= fetch(new URL("data/words.txt", document.baseURI))
    .then(async (response) => {
      if (!response.ok)
        throw Error("The word list could not load. Reconnect and try again.");
      const words = new Set<string>();
      const lines = (await response.text()).split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]) words.add(lines[i]);
        if (i % 8192 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      return words;
    })
    .catch((error) => {
      loaded = null;
      throw error;
    }));
}
