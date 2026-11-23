// The script's writers' material: what each open script's alternates and cuts hold, moving a scene, and what the
// material commands know.
import type { CommandContext } from "@manent/commands";
import { EMPTY_MATERIAL } from "../send/what-options.ts";
import type { MaterialServices } from "../services/ports.ts";

/**
 * Every script's material reads as empty, and no scene is found to move. `get` is what a command's context reads, and
 * `subscribe`'s listener hears every change.
 */
export const materialActions: MaterialServices & {
  get(docId: string): CommandContext["material"];
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  materialSnapshotOf: () => EMPTY_MATERIAL,
  moveScene: () => ({ ok: false as const, reason: "not_found" as const }),
  get: () => ({
    caretInSpeech: false,
    alternates: 0,
    selection: false,
    cuts: 0,
  }),
  subscribe: () => () => {},
});
