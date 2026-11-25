// Staged subscribable values for the prompter feed, comparing plain data and maps by content.
import { isSameValue } from "../outbox/subscribable.ts";
import type { Subscribable } from "../ports/ports.ts";

/** A subscribable whose next value can be staged before any listener runs, so coupled cells stay consistent. */
export interface Cell<T> {
  readonly view: Subscribable<T>;
  get(): T;
  /** Updates the held value when it differs, returning a notifier to invoke once sibling cells are staged. */
  stage(value: T): (() => void) | null;
}

export function createCell<T>(initial: T): Cell<T> {
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
      if (isSameValue(current, value)) return null;
      current = value;
      return () => {
        for (const listener of listeners) listener(value);
      };
    },
  };
}
