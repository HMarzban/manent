// The history source, loaded apart from the entry the first time it is used: until it has loaded, every list is loading.
import type { Subscribable } from "@manent/ui";
import type { HistorySource } from "./source.ts";

type Rows = ReturnType<HistorySource["rows"]>;
type RowsValue = ReturnType<Rows["get"]>;

/** A source whose every call waits for `load`, asked once; `rows` answers the loading state until then, then follows the loaded source's. */
export function createLazySource(options: {
  load: () => Promise<HistorySource>;
  now: () => number;
}): HistorySource {
  let loaded: HistorySource | null = null;
  let loading: Promise<HistorySource> | null = null;
  const source = (): Promise<HistorySource> => {
    loading ??= options.load().then((real) => {
      loaded = real;
      return real;
    });
    return loading;
  };
  const lists = new Map<string, Subscribable<RowsValue>>();

  function rowsBefore(docId: string): Subscribable<RowsValue> {
    const waiting: RowsValue = {
      rows: [],
      state: { kind: "loading", sinceMs: options.now() },
      othersCanOpen: null,
    };
    return {
      get: () => loaded?.rows(docId).get() ?? waiting,
      subscribe(listener) {
        let stop: (() => void) | null = null;
        let left = false;
        void source().then((real) => {
          if (left) return;
          const rows = real.rows(docId);
          stop = rows.subscribe(listener);
          listener(rows.get());
        });
        return () => {
          left = true;
          stop?.();
        };
      },
    };
  }

  return {
    rows(docId) {
      // a list asked for before the load stays the one its readers hold
      const existing = lists.get(docId);
      if (existing !== undefined) return existing;
      if (loaded !== null) return loaded.rows(docId);
      const rows = rowsBefore(docId);
      lists.set(docId, rows);
      return rows;
    },
    more: (docId) => void source().then((real) => real.more(docId)),
    content: async (docId, at) => (await source()).content(docId, at),
    name: async (docId, name, fromVersionId) =>
      (await source()).name(docId, name, fromVersionId),
    save: async (docId) => (await source()).save(docId),
    restore: async (docId, versionId, scope) =>
      (await source()).restore(docId, versionId, scope),
    whoWrote: async (docId, blockId) =>
      (await source()).whoWrote(docId, blockId),
    sinceOpened: async (docId) => (await source()).sinceOpened(docId),
  };
}
