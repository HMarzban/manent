// The editor's facts, one primitive each: written by the bridge, published once per frame, read one key at a time.

import { mark } from "@manent/perf";
import type { Alignment, FirstLine } from "@manent/schema";
import { useContext, useMemo, useSyncExternalStore } from "react";
import { FactsContext } from "./bridge-contexts.ts";
import type { Guard } from "./guard.ts";

export interface EditorFacts {
  element: string | null;
  blockType: string | null;
  page: string | null;
  pageCount: number | null;
  scene: string | null;
  /** The caret's block, and the scene heading at or before it. */
  blockId: string | null;
  sceneId: string | null;
  /** The caret block's layout as the engine resolves it: indent and width in cells, space before in lines. */
  blockIndent: number | null;
  blockWidth: number | null;
  blockAlign: Alignment | null;
  blockSpaceBefore: number | null;
  /** The caret block's own spaceBefore attribute is not null (Space before shows checked). */
  blockSpaceBeforeSet: boolean | null;
  /** The caret block's opening-line style ("flush" or "drop_cap"); null for element default. */
  blockFirstLine: FirstLine | null;
  /** The page's text column, cells; null without pages (Ink). */
  columnCells: number | null;
  /** The caret page's revision name and its place in the pages; null outside production. */
  pageRevision: string | null;
  pageOrdinal: number | null;
  /** Active inline marks at the caret (bitmask over MARK_BIT). */
  marksMask: number;
  markColor: string | null;
  markHighlight: string | null;
  markLink: string | null;
  /** Total word count of the document, updated off the keystroke path. */
  wordCount: number | null;
  canUndo: boolean;
  canRedo: boolean;
  selectionEmpty: boolean;
  /** The selected text when the selection lies inside one element; "" otherwise. */
  selectedText: string;
  /** How many matches the Find bar's text has, and which of them the selection holds, from 1; null when none. */
  findCount: number;
  findCurrent: number | null;
}

export interface FactsWriter {
  /** Writes, at the next frame, only the keys whose value changed (`Object.is`). */
  publish(changed: Partial<EditorFacts>): void;
}

export interface FactsSelectors {
  get<K extends keyof EditorFacts>(key: K): EditorFacts[K];
  /** `listener` hears each new value of `key`; the returned function unsubscribes. */
  subscribe<K extends keyof EditorFacts>(
    key: K,
    listener: (value: EditorFacts[K]) => void,
  ): () => void;
}

type FactKey = keyof EditorFacts;
type FactValue = string | number | boolean | null;

// typed as both, so a fact that is not a primitive does not compile
const INITIAL_FACTS: EditorFacts & Readonly<Record<FactKey, FactValue>> =
  Object.freeze({
    element: null,
    blockType: null,
    page: null,
    pageCount: null,
    scene: null,
    blockId: null,
    sceneId: null,
    blockIndent: null,
    blockWidth: null,
    blockAlign: null,
    blockSpaceBefore: null,
    blockSpaceBeforeSet: null,
    blockFirstLine: null,
    columnCells: null,
    pageRevision: null,
    pageOrdinal: null,
    marksMask: 0,
    markColor: null,
    markHighlight: null,
    markLink: null,
    wordCount: null,
    canUndo: false,
    canRedo: false,
    selectionEmpty: false,
    selectedText: "",
    findCount: 0,
    findCurrent: null,
  });

const isFactKey = (key: string): key is FactKey =>
  Object.hasOwn(INITIAL_FACTS, key);

/** The facts of one editor. A frame's write is checked with `guard` under the name `facts`. */
export function createFactsStore(options: {
  guard: Guard;
  frame: (fn: () => void) => () => void;
}): { writer: FactsWriter; selectors: FactsSelectors } {
  let current: EditorFacts = INITIAL_FACTS;
  let pending: Partial<EditorFacts> = {};
  let requested = false;
  const listeners = new Map<FactKey, Set<() => void>>();

  const stage = <K extends FactKey>(key: K, value: EditorFacts[K]): void => {
    const latest = Object.hasOwn(pending, key) ? pending[key] : current[key];
    if (Object.is(value, latest)) return;
    pending[key] = value;
    if (requested) return;
    requested = true;
    options.frame(flush);
  };

  const flush = (): void => {
    requested = false;
    const staged = pending;
    pending = {};
    const next: EditorFacts = { ...current, ...staged };
    const changed = Object.keys(staged)
      .filter(isFactKey)
      .filter((key) => !Object.is(next[key], current[key]));
    if (changed.length === 0) return;
    mark("ui.facts.publish", () => {
      options.guard.check("facts");
      current = next;
      for (const key of changed)
        for (const listener of listeners.get(key) ?? []) listener();
    });
  };

  return {
    writer: {
      publish(changed) {
        for (const key of Object.keys(changed).filter(isFactKey)) {
          const value = changed[key];
          if (value !== undefined) stage(key, value);
        }
      },
    },
    selectors: {
      get: (key) => current[key],
      subscribe(key, listener) {
        const notify = () => listener(current[key]);
        const set = listeners.get(key) ?? new Set();
        listeners.set(key, set.add(notify));
        return () => {
          set.delete(notify);
        };
      },
    },
  };
}

/** One fact of the editor in the nearest `FactsContext`; the component re-renders only when that fact changes. */
export function useEditorFact<K extends keyof EditorFacts>(
  key: K,
): EditorFacts[K] {
  const facts = useContext(FactsContext);
  if (facts === null)
    throw new Error("useEditorFact is used outside a FactsContext");
  const subscribe = useMemo(
    () => (onChange: () => void) => facts.subscribe(key, onChange),
    [facts, key],
  );
  const read = () => facts.get(key);
  return useSyncExternalStore(subscribe, read, read);
}
