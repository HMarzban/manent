// The keystroke guard: no interface store is written while the editor applies a change to the document.

export interface DispatchGuard {
  /** The editor calls `enter` and `leave` around each dispatch that changes the document. */
  enter(): void;
  leave(): void;
}

export interface Guard extends DispatchGuard {
  /** Called by a store before it writes: inside `enter`…`leave` the write counts as a violation. */
  check(storeName: string): void;
  violations(): number;
}

/** A guard that counts violations; the test flavour also throws `<store name> was written during an editor transaction`. `leave` without `enter` throws a RangeError. */
export function createGuard(options: {
  flavour: "production" | "test";
}): Guard {
  let depth = 0;
  let count = 0;
  return {
    enter() {
      depth++;
    },
    leave() {
      if (depth === 0)
        throw new RangeError("leave was called outside a transaction");
      depth--;
    },
    check(storeName) {
      if (depth === 0) return;
      count++;
      if (options.flavour === "test")
        throw new Error(
          `${storeName} was written during an editor transaction`,
        );
    },
    violations: () => count,
  };
}

let bound: Guard | null = null;

/** Gives the interface stores their guard; the composition root calls it once, before any store is written. */
export function bindGuard(guard: Guard): void {
  bound = guard;
}

/** What an interface store calls before each write. Throws when no guard is bound yet. */
export function guardWrite(storeName: string): void {
  if (bound === null)
    throw new Error(`${storeName} was written before a guard was bound`);
  bound.check(storeName);
}
