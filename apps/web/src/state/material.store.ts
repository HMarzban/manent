// The script's writers' material: what each open script's alternates and cuts hold, moving a scene, and what the
// material commands know.
import type { CommandContext } from "@manent/commands";
import { createStore } from "zustand";
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
}

const store = createStore<{ docs: Readonly<Record<string, Followed>> }>()(
  () => ({ docs: {} }),
);

const followed = (docId: string): Followed | null =>
  store.getState().docs[docId] ?? null;

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
      : { alternates: material.alternatesOf(), cuts: EMPTY_MATERIAL.cuts };
  },
  moveScene: () => ({ ok: false as const, reason: "not_found" as const }),
  get(docId: string) {
    const material = followed(docId);
    return {
      caretInSpeech: material?.caretInSpeech ?? false,
      alternates: material?.alternates ?? 0,
      selection: false,
      cuts: 0,
    };
  },
  subscribe: (listener: () => void) => store.subscribe(() => listener()),
  follow(docId: string, material: Followed) {
    const before = followed(docId);
    if (
      before?.caretInSpeech === material.caretInSpeech &&
      before?.alternates === material.alternates &&
      before?.alternatesOf === material.alternatesOf
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
