// Whether anyone listens to a set of values.
import type { Subscribable } from "../ports/ports.ts";

/** Counts the listeners of every value it wraps; `changed` hears when the first comes and when the last goes. */
export interface Readers {
  counted<T>(source: Subscribable<T>): Subscribable<T>;
}

export function createReaders(changed: (reading: boolean) => void): Readers {
  let readers = 0;
  return {
    counted: (source) => ({
      get: () => source.get(),
      subscribe(listener) {
        const stop = source.subscribe(listener);
        readers += 1;
        if (readers === 1) changed(true);
        let left = false;
        return () => {
          if (left) return;
          left = true;
          stop();
          readers -= 1;
          if (readers === 0) changed(false);
        };
      },
    }),
  };
}
