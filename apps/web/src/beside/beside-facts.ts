// The facts of each editor open beside the page, read by document from outside its frame.
import { useCallback, useSyncExternalStore } from "react";
import type { EditorFacts, FactsSelectors } from "../state/facts.store.ts";

const open = new Map<string, FactsSelectors>();
const listeners = new Set<() => void>();

const noop = (): void => {};

/** Makes `facts` the facts of the editor of `docId` beside the page, until the returned function is called. */
export function registerBesideFacts(
  docId: string,
  facts: FactsSelectors,
): () => void {
  open.set(docId, facts);
  for (const listener of listeners) listener();
  return () => {
    if (open.get(docId) !== facts) return;
    open.delete(docId);
    for (const listener of listeners) listener();
  };
}

/** The current value of `key` in the facts of the editor of `docId` beside the page; null while none holds it. */
export function useBesideFact<K extends keyof EditorFacts>(
  docId: string,
  key: K,
): EditorFacts[K] | null {
  const subscribe = useCallback(
    (listener: () => void) => {
      let stop = open.get(docId)?.subscribe(key, listener) ?? noop;
      // an editor opening or closing beside the page changes which facts are read
      const follow = (): void => {
        stop();
        stop = open.get(docId)?.subscribe(key, listener) ?? noop;
        listener();
      };
      listeners.add(follow);
      return () => {
        listeners.delete(follow);
        stop();
      };
    },
    [docId, key],
  );
  const read = (): EditorFacts[K] | null => open.get(docId)?.get(key) ?? null;
  return useSyncExternalStore(subscribe, read, read);
}
