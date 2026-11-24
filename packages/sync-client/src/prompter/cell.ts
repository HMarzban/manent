// Staged subscribable values for the prompter feed, comparing plain data and story maps by content.
import type { BlockJSON } from "@manent/schema";
import type { Subscribable } from "../ports/ports.ts";

/** A subscribable whose next value can be staged before any listener runs, so coupled cells stay consistent. */
export interface Cell<T> {
  readonly view: Subscribable<T>;
  get(): T;
  /** Updates the held value when it differs, returning a notifier to invoke once sibling cells are staged. */
  stage(value: T): (() => void) | null;
}

function isSameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.entries(a);
  const right = new Map(Object.entries(b));
  return (
    left.length === right.size &&
    left.every(
      ([key, value]) => right.has(key) && isSameValue(value, right.get(key)),
    )
  );
}

/** Deep equality over two story maps keyed by run-order entry id. */
export function isSameStories(
  a: ReadonlyMap<string, readonly BlockJSON[]>,
  b: ReadonlyMap<string, readonly BlockJSON[]>,
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, blocks] of a) {
    const other = b.get(key);
    if (other === undefined || !isSameValue(blocks, other)) return false;
  }
  return true;
}

export function createCell<T>(
  initial: T,
  same: (a: T, b: T) => boolean = isSameValue,
): Cell<T> {
  let current = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    view: {
      get: () => current,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    get: () => current,
    stage(value) {
      if (same(current, value)) return null;
      current = value;
      return () => {
        for (const listener of listeners) listener(value);
      };
    },
  };
}
