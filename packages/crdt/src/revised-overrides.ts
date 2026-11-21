// The script's revisedOverrides map: a person's Mark revised and Clear revised, kept beside the text.
import type { YMapEvent } from "yjs";
import { ORIGIN_LOAD, ORIGIN_REMOTE, yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";

/** The overrides, by key; a stored value that is not a string reads as absent. */
export interface OverridesView {
  /** Null when the key has none, or what is stored is not a string. */
  get(key: string): string | null;
  /** One transaction of `origin`; null deletes the key. */
  set(key: string, value: string | null, origin: unknown): void;
  /** Every entry holding a string, keys in ascending order. */
  entries(): [string, string][];
  /** Told the keys a transaction changed, ascending; `remote` for an update applied with ORIGIN_REMOTE or ORIGIN_LOAD. */
  subscribe(
    listener: (keys: readonly string[], remote: boolean) => void,
  ): () => void;
}

export function revisedOverrides(doc: CrdtDoc): OverridesView {
  const ydoc = yDocOf(doc);
  const map = ydoc.getMap<unknown>("revisedOverrides");
  const get = (key: string): string | null => {
    const value = map.get(key);
    return typeof value === "string" ? value : null;
  };
  return {
    get,
    set(key, value, origin) {
      ydoc.transact(() => {
        if (value === null) map.delete(key);
        else map.set(key, value);
      }, origin);
    },
    entries: () =>
      [...map.keys()].toSorted().flatMap((key): [string, string][] => {
        const value = get(key);
        return value === null ? [] : [[key, value]];
      }),
    subscribe(listener) {
      const observer = (event: YMapEvent<unknown>): void => {
        const { origin } = event.transaction;
        listener(
          [...event.keysChanged].toSorted(),
          origin === ORIGIN_REMOTE || origin === ORIGIN_LOAD,
        );
      };
      map.observe(observer);
      return () => map.unobserve(observer);
    },
  };
}
