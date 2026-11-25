// A map at a document's root whose values are plain JSON, as the index documents keep them.
import type { YMapEvent } from "yjs";
import { ORIGIN_LOAD, ORIGIN_REMOTE, yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";

/** One root map of a document. Structurally a settings key-value map, with `delete` and `entries`. */
export interface JsonMapView {
  /** Null for an absent key. */
  get(key: string): unknown;
  /**
   * One transaction, under `origin` when given. A value that is not JSON (undefined, a function, NaN, an object with a
   * prototype) is a TypeError, and so is a key, object key or string holding a lone surrogate.
   */
  set(key: string, value: unknown, origin?: string): void;
  delete(key: string, origin?: string): void;
  /** Ascending. */
  keys(): readonly string[];
  /** Every entry, keys in ascending order. */
  entries(): Readonly<Record<string, unknown>>;
  /** Told the keys a transaction changed, ascending; "remote" for an update applied with ORIGIN_REMOTE or ORIGIN_LOAD. */
  subscribe(
    listener: (keys: readonly string[], origin: "local" | "remote") => void,
  ): () => void;
}

const notJson = (what: string): TypeError =>
  new TypeError(`a map value must be JSON, not ${what}`);

// Yjs would encode a lone surrogate as U+FFFD, so other replicas would read different text.
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** `text`, or a TypeError when it holds a lone surrogate. */
function wellFormed(text: string): string {
  if (!LONE_SURROGATE.test(text)) return text;
  throw new TypeError(
    `a map string must be well-formed UTF-16, not ${JSON.stringify(text)}`,
  );
}

/** A copy of `value` holding only JSON; throws a TypeError naming the first part that is not. */
function copyJson(value: unknown, within: readonly object[]): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return wellFormed(value);
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throw notJson(String(value));
  }
  if (typeof value !== "object") throw notJson(typeof value);
  if (within.includes(value)) throw notJson("a cycle");
  const inner = [...within, value];
  if (Array.isArray(value)) return value.map((item) => copyJson(item, inner));
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw notJson(Object.prototype.toString.call(value));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      // Yjs's decoder drops this key, so another replica would read the object without it
      if (key === "__proto__") throw notJson("a __proto__ key");
      return [wellFormed(key), copyJson(item, inner)];
    }),
  );
}

/** The root map `name` of `doc`; what `set` is given is stored as a plain JSON copy. */
export function jsonMap(doc: CrdtDoc, name: string): JsonMapView {
  const ydoc = yDocOf(doc);
  const map = ydoc.getMap<unknown>(name);
  const keys = (): string[] => [...map.keys()].toSorted();
  return {
    get: (key) => map.get(key) ?? null,
    set(key, value, origin) {
      const at = wellFormed(key);
      const json = copyJson(value, []);
      ydoc.transact(() => map.set(at, json), origin);
    },
    delete(key, origin) {
      ydoc.transact(() => map.delete(key), origin);
    },
    keys,
    entries: () => Object.fromEntries(keys().map((key) => [key, map.get(key)])),
    subscribe(listener) {
      const observer = (event: YMapEvent<unknown>): void => {
        const { origin } = event.transaction;
        listener(
          [...event.keysChanged].toSorted(),
          origin === ORIGIN_REMOTE || origin === ORIGIN_LOAD
            ? "remote"
            : "local",
        );
      };
      map.observe(observer);
      return () => map.unobserve(observer);
    },
  };
}
