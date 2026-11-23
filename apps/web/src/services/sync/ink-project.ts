// A game project made from an Ink source: one Ink document holding the source's blocks.
import type { BlockJSON } from "@manent/schema";
import type { CreateResult, LibraryIndex } from "../ports.ts";

/** Rejects with a RangeError: no Ink project is made yet. */
export function createInkProject(
  _library: LibraryIndex,
  _workspaceId: string,
  _input: { readonly title: string; readonly blocks: readonly BlockJSON[] },
): Promise<CreateResult> {
  return Promise.reject(
    new RangeError("an ink project cannot be made in this build"),
  );
}
