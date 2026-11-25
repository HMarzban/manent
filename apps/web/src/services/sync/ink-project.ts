// A game project made from an Ink source: one Ink document holding the source's blocks.
import { scriptBody, yXmlFragmentForBinding } from "@manent/crdt";
import { randomBlockId } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { CreateResult, LibraryIndex } from "../ports.ts";

/**
 * Creates a game project titled `input.title` holding one Ink document populated with `input.blocks`
 * (or one empty Ink line when `input.blocks` is empty); never removed as untouched.
 */
export function createInkProject(
  library: LibraryIndex,
  workspaceId: string,
  input: { readonly title: string; readonly blocks: readonly BlockJSON[] },
): Promise<CreateResult> {
  return library.addCopy(workspaceId, null, "game", input.title, {
    docKind: "ink",
    airDate: null,
    rundownId: null,
    start(handle) {
      const doc = handle.doc();
      if (yXmlFragmentForBinding(doc).length === 0) {
        const blocks: readonly BlockJSON[] =
          input.blocks.length > 0
            ? input.blocks
            : [
                {
                  type: "block",
                  attrs: { id: randomBlockId(), type: "ink_line" },
                },
              ];
        scriptBody(doc).write((w) => w.insertBlocks(null, blocks));
      }
      handle.setSetting("script.format", "ink");
    },
  });
}
