// A value that says when it changes: the shape every port hands the interface.

export interface Subscribable<T> {
  get(): T;
  subscribe(listener: (value: T) => void): () => void;
}

/** A value held in memory; `set` notifies only when `equals` (`Object.is` by default) says the value changed. */
export function createValue<T>(
  initial: T,
  equals: (a: T, b: T) => boolean = Object.is,
): Subscribable<T> & { set(value: T): void } {
  let current = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(value) {
      if (equals(current, value)) return;
      current = value;
      for (const listener of listeners) listener(value);
    },
  };
}
