// What the editor reads of a script's production: its view of the state the authority sequences, and the script's
// shared overrides.
import { ORIGIN_REVIEW, revisedOverrides, scriptBody } from "@manent/crdt";
import type { ProductionPort, ProductionView } from "@manent/editor";
import {
  COLOUR_NAMES,
  NUMBERING_SCHEMES,
  baselineOf,
  idOf,
  issuedMarks,
} from "@manent/revisions";
import type { MarkMode, RevisionSource } from "@manent/revisions";
import type { BlockJSON } from "@manent/schema";
import type { CachedProduction, DocHandle } from "@manent/sync-client";
import { PRODUCTION_WORDS } from "@manent/ui";
import { colourOf } from "./state-facts.ts";

const WORDS: ProductionView["words"] = Object.freeze({
  lockTooltip: PRODUCTION_WORDS.lockTooltip,
  colourName: (colour) => COLOUR_NAMES[colour],
});

/** The blocks of the document as they are now, by id. */
export function blocksById(handle: DocHandle): Map<string, BlockJSON> {
  const doc = scriptBody(handle.doc()).materialize();
  return new Map(
    (doc.content ?? [])
      .flatMap((section) => section.content ?? [])
      .flatMap((block): [string, BlockJSON][] => {
        const id = idOf(block);
        return id === null ? [] : [[id, block]];
      }),
  );
}

/** The editor's view of `held`; null outside production and until the active revision's baseline is known. */
export function viewOf(
  held: CachedProduction | null,
  shown: { mode: MarkMode; tint: boolean; day: string },
  current: () => ReadonlyMap<string, BlockJSON>,
): ProductionView | null {
  if (held === null || held.baseline === null || !held.state.locked)
    return null;
  const { state, baseline } = held;
  const active = state.sets.at(-1);
  const colour = active === undefined ? null : colourOf(active.colour);
  if (active === undefined || colour === null) return null;
  const issued = state.sets.slice(0, -1).filter((set) => set.issuedOn !== null);
  const blocks = issued.length === 0 ? new Map() : current();
  const earlier = issued.flatMap((set): RevisionSource[] => {
    const setColour = colourOf(set.colour);
    if (setColour === null || set.issuedOn === null) return [];
    const { ordinal, name, mark, fullDraft } = set;
    const marks = issuedMarks(set.blocks, blocks);
    return [
      {
        ordinal,
        name,
        colour: setColour,
        mark,
        day: set.issuedOn,
        fullDraft,
        marks,
      },
    ];
  });
  return {
    setId: active.setId,
    records: state.anchors,
    numbering:
      NUMBERING_SCHEMES.find((scheme) => scheme === state.numbering) ??
      "suffix",
    issuedNumbers: new Map(
      state.sceneNumbers
        .filter((n) => !n.reserved)
        .map((n) => [n.blockId, n.num]),
    ),
    used: new Set(state.sceneNumbers.map((n) => n.num)),
    baseline: baselineOf(baseline.content.blocks),
    earlier,
    active: {
      ordinal: active.ordinal,
      name: active.name,
      colour,
      mark: active.mark,
      day: shown.day,
      fullDraft: active.fullDraft,
    },
    mode: shown.mode,
    tint: shown.tint,
    words: WORDS,
  };
}

/** The script's shared overrides, followed across a replaced document. */
export function overridesOf(handle: DocHandle): ProductionPort["overrides"] {
  return {
    get: (key) => revisedOverrides(handle.doc()).get(key),
    // an undo step like a review action's, so Undo takes a mark back
    set: (key, value) =>
      revisedOverrides(handle.doc()).set(key, value, ORIGIN_REVIEW),
    subscribe(listener) {
      let stop = revisedOverrides(handle.doc()).subscribe((keys) =>
        listener(keys),
      );
      const stopReplaced = handle.on((event) => {
        if (event.type !== "replaced") return;
        stop();
        stop = revisedOverrides(handle.doc()).subscribe((keys) =>
          listener(keys),
        );
      });
      return () => {
        stop();
        stopReplaced();
      };
    },
  };
}
