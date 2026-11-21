// What every format test shares: ids from a counter, the fixture files, and a re-read given the ids of the first read.
import { readFileSync } from "node:fs";
import type { BlockJSON, IdSource } from "@manent/schema";
import type { ImportedProduction, ImportedScript } from "../script/model.ts";

const FIXTURES = new URL("../../test/fixtures/", import.meta.url);

/** Block ids `blk_000000000001`, `blk_000000000002` …: a new sequence for each call. */
export function counter(): IdSource {
  let next = 0;
  return () => `blk_${String(++next).padStart(12, "0")}`;
}

/** The bytes of `path`, under the package's `test/fixtures/`. */
export function fixtureBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(path, FIXTURES)));
}

/** The text of `path`, under the package's `test/fixtures/`, as UTF-8. */
export function fixtureText(path: string): string {
  return readFileSync(new URL(path, FIXTURES), "utf8");
}

const blockId = (block: BlockJSON | undefined): string | null =>
  block?.attrs?.id ?? null;

function renamedProduction(
  production: ImportedProduction,
  id: (value: string) => string,
): ImportedProduction {
  return {
    ...production,
    anchors: production.anchors.map((at) => ({
      ...at,
      blockId: id(at.blockId),
    })),
    sceneNumbers: production.sceneNumbers.map((n) => ({
      ...n,
      blockId: id(n.blockId),
    })),
    sets: production.sets.map((set) => ({
      ...set,
      blocks: set.blocks.map((marked) => ({
        ...marked,
        blockId: id(marked.blockId),
      })),
    })),
  };
}

/**
 * `a` with its block, note and kept ids replaced, in order, by `b`'s, and every reference to them with them:
 * a re-read gives new ids, so it is compared with the first read through this.
 */
export function withSameIds(
  a: ImportedScript,
  b: ImportedScript,
): ImportedScript {
  const ids = new Map<string, string>();
  const pair = (from: string | null, to: string | null | undefined): void => {
    if (from !== null && typeof to === "string") ids.set(from, to);
  };
  a.blocks.forEach((block, i) => pair(blockId(block), blockId(b.blocks[i])));
  a.notes.forEach((note, i) => pair(note.id, b.notes[i]?.id));
  a.kept.forEach((item, i) => pair(item.id, b.kept[i]?.id));
  const id = (value: string): string => ids.get(value) ?? value;
  return {
    ...a,
    blocks: a.blocks.map((block) => {
      const own = blockId(block);
      return own === null
        ? block
        : { ...block, attrs: { ...block.attrs, id: id(own) } };
    }),
    notes: a.notes.map(({ id: noteId, note }) => ({
      id: id(noteId),
      note:
        note.anchor === null
          ? note
          : {
              ...note,
              anchor: { ...note.anchor, blockId: id(note.anchor.blockId) },
            },
    })),
    kept: a.kept.map((item) => ({
      ...item,
      id: id(item.id),
      of: item.of === null ? null : id(item.of),
    })),
    production: a.production && renamedProduction(a.production, id),
  };
}
