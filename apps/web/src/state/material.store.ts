// The script's writers' material: what each open script's alternates and cuts hold, moving a scene, and what the
// material commands know.
import type { CommandContext } from "@manent/commands";
import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import type { KeptCut } from "../material/cuts/script-cuts.ts";
import { EMPTY_MATERIAL } from "../send/what-options.ts";
import type { MaterialServices } from "../services/ports.ts";
import { guardWrite } from "./guard.ts";

/** What the open editor of a script tells of its material. */
interface Followed {
  caretInSpeech: boolean;
  /** The alternates of the speech the caret is in. */
  alternates: number;
  /** The JSON of the script's alternates map now, by alternate id. */
  alternatesOf(): Readonly<Record<string, unknown>>;
  /** The selection covers at least one block. */
  selection: boolean;
  /** Valid cuts in the script's cuts map, newest first. */
  cuts: readonly KeptCut[];
  /** The JSON of the script's cuts map now, by cut id. */
  cutsOf(): Readonly<Record<string, unknown>>;
}

const NO_CUTS: readonly KeptCut[] = Object.freeze([]);

const store = createStore<{ docs: Readonly<Record<string, Followed>> }>()(
  () => ({ docs: {} }),
);

const followed = (docId: string): Followed | null =>
  store.getState().docs[docId] ?? null;

/** The cuts of `docId`, newest first; empty when no editable script editor is open. */
export function useMaterialCuts(docId: string | null): readonly KeptCut[] {
  const read = (): readonly KeptCut[] =>
    docId === null ? NO_CUTS : (followed(docId)?.cuts ?? NO_CUTS);
  return useSyncExternalStore(store.subscribe, read, read);
}

/** How many cuts `docId` currently holds. */
export function useMaterialCutCount(docId: string | null): number {
  return useMaterialCuts(docId).length;
}

/**
 * A script reads as having no material until its editor follows it, and no scene is found to move. `get` is what a
 * command's context reads, and `subscribe`'s listener hears every change. `follow` is the open editor's: it is told
 * again whenever what it tells changes. `leave` forgets what an editor told once it is gone, unless another editor of
 * the script has told since.
 */
export const materialActions: MaterialServices & {
  get(docId: string): CommandContext["material"];
  subscribe(listener: () => void): () => void;
  follow(docId: string, material: Followed): void;
  leave(docId: string, alternatesOf: Followed["alternatesOf"]): void;
} = Object.freeze({
  materialSnapshotOf(docId: string) {
    const material = followed(docId);
    return material === null
      ? EMPTY_MATERIAL
      : { alternates: material.alternatesOf(), cuts: material.cutsOf() };
  },
  moveScene: () => ({ ok: false as const, reason: "not_found" as const }),
  get(docId: string) {
    const material = followed(docId);
    return {
      caretInSpeech: material?.caretInSpeech ?? false,
      alternates: material?.alternates ?? 0,
      selection: material?.selection ?? false,
      cuts: material?.cuts.length ?? 0,
    };
  },
  subscribe: (listener: () => void) => store.subscribe(() => listener()),
  follow(docId: string, material: Followed) {
    const before = followed(docId);
    if (
      before?.caretInSpeech === material.caretInSpeech &&
      before?.alternates === material.alternates &&
      before?.alternatesOf === material.alternatesOf &&
      before?.selection === material.selection &&
      before?.cuts === material.cuts &&
      before?.cutsOf === material.cutsOf
    )
      return;
    guardWrite("material");
    store.setState({ docs: { ...store.getState().docs, [docId]: material } });
  },
  leave(docId: string, alternatesOf: Followed["alternatesOf"]) {
    if (followed(docId)?.alternatesOf !== alternatesOf) return;
    guardWrite("material");
    const { [docId]: _gone, ...others } = store.getState().docs;
    store.setState({ docs: others });
  },
});
