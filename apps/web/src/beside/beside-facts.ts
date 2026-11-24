// The facts of each editor open beside the page, read by document from outside its frame.
import { useCallback, useSyncExternalStore } from "react";
import type { EditorFacts, FactsSelectors } from "../state/facts.store.ts";

/** Non-editor beside panels can register arbitrary fact keys beyond `EditorFacts`. */
export interface CustomBesideFacts {
  get(key: string): unknown;
  subscribe(key: string, listener: () => void): () => void;
}

type StoredFacts = FactsSelectors | CustomBesideFacts;

const open = new Map<string, StoredFacts>();
const listeners = new Set<() => void>();

const noop = (): void => {};

const readKey = (source: StoredFacts, key: string): unknown =>
  (source as CustomBesideFacts).get(key);

const subscribeKey = (
  source: StoredFacts,
  key: string,
  listener: () => void,
): (() => void) => (source as CustomBesideFacts).subscribe(key, listener);

/** Makes `facts` the facts of the editor of `docId` beside the page, until the returned function is called. */
export function registerBesideFacts(
  docId: string,
  facts: StoredFacts,
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
): EditorFacts[K] | null;
export function useBesideFact(docId: string, key: string): unknown;
export function useBesideFact(docId: string, key: string): unknown {
  const subscribe = useCallback(
    (listener: () => void) => {
      const current = open.get(docId);
      let stop =
        current === undefined ? noop : subscribeKey(current, key, listener);
      // an editor opening or closing beside the page changes which facts are read
      const follow = (): void => {
        stop();
        const next = open.get(docId);
        stop = next === undefined ? noop : subscribeKey(next, key, listener);
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
  const read = (): unknown => {
    const source = open.get(docId);
    return source === undefined ? null : readKey(source, key);
  };
  return useSyncExternalStore(subscribe, read, read);
}
