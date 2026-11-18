// Reads a subscribable value in a component.
import { useCallback, useSyncExternalStore } from "react";
import type { Subscribable } from "./subscribable.ts";

export function useSubscribable<T>(source: Subscribable<T>): T {
  const subscribe = useCallback(
    (notify: () => void) => source.subscribe(notify),
    [source],
  );
  return useSyncExternalStore(subscribe, () => source.get());
}
