// A value that tells its listeners when it changes, compared by content.
import type { Subscribable } from "../ports/ports.ts";

/** `set` replaces the value and runs the listeners, in subscription order, only when it differs by content. */
export function createSubscribable<T>(
  initial: T,
): Subscribable<T> & { set(value: T): void } {
  let current = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(value) {
      if (isSameValue(current, value)) return;
      current = value;
      for (const listener of listeners) listener(value);
    },
  };
}

/** Plain values, arrays, maps and typed arrays, compared by content. */
export function isSameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;
  if (a instanceof Map || b instanceof Map)
    return a instanceof Map && b instanceof Map && isSameMap(a, b);
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b))
    return ArrayBuffer.isView(a) && ArrayBuffer.isView(b) && isSameView(a, b);
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

function isSameMap(
  a: ReadonlyMap<unknown, unknown>,
  b: ReadonlyMap<unknown, unknown>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a)
    if (!b.has(key) || !isSameValue(value, b.get(key))) return false;
  return true;
}

function isSameView(a: ArrayBufferView, b: ArrayBufferView): boolean {
  if (a.constructor !== b.constructor || a.byteLength !== b.byteLength)
    return false;
  const left = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const right = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return left.every((byte, index) => byte === right[index]);
}
