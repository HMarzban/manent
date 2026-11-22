// A fresh document built from another's content: the same blocks in even sections, every struct one client's.
import { rejects, sectionize, validateDoc } from "@manent/schema";
import type { BlockJSON, SectionJSON } from "@manent/schema";
import { yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";
import { FRAGMENT_NAME, scriptDocFromJSON } from "./mapping.ts";
import { IMPORT_MAP, NOTES_MAP } from "./script-maps.ts";
import { ORIGIN_SYSTEM } from "./settings.ts";
import { scriptBody } from "./writer.ts";

/** The settings maps, the overrides map, the notes and the import record, copied entry by entry. */
const COPIED_MAPS = [
  "settings",
  "settingsMeta",
  "revisedOverrides",
  NOTES_MAP,
  IMPORT_MAP,
] as const;

/** The roots a rebuild knows how to copy. */
export const ROOT_TYPE_NAMES = [FRAGMENT_NAME, ...COPIED_MAPS] as const;

export type RebuildResult =
  | { ok: true; doc: CrdtDoc }
  | { ok: false; code: "unknown_root" | "duplicate_ids" | "invalid" };

function hasDuplicateIds(blocks: readonly BlockJSON[]): boolean {
  const seen = new Set<string>();
  for (const block of blocks) {
    const id = block.attrs?.id;
    if (typeof id !== "string") continue;
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}

/** False inside a dual-dialogue run: at a right speech, or at a left one that continues the left before it. */
function maySectionStartAt(blocks: readonly BlockJSON[], at: number): boolean {
  const dual = blocks[at]?.attrs?.dual;
  if (dual === "right") return false;
  return dual !== "left" || blocks[at - 1]?.attrs?.dual !== "left";
}

/** sectionize's sections, each boundary inside a dual-dialogue run moved forward to the first block that may start one. */
function evenSections(blocks: readonly BlockJSON[]): SectionJSON[] {
  const cuts = new Set<number>();
  let end = 0;
  for (const section of sectionize(blocks).content ?? []) {
    end += (section.content ?? []).length;
    let cut = end;
    while (cut < blocks.length && !maySectionStartAt(blocks, cut)) cut++;
    cuts.add(cut);
  }
  const sections: SectionJSON[] = [];
  let start = 0;
  for (const cut of cuts) {
    sections.push({ type: "section", content: blocks.slice(start, cut) });
    start = cut;
  }
  return sections;
}

/** Sets every entry of the source's copied maps in `built`, keys in ascending order, in one transaction. */
function copyMaps(source: CrdtDoc, built: CrdtDoc): void {
  const from = yDocOf(source);
  const to = yDocOf(built);
  to.transact(() => {
    for (const name of COPIED_MAPS) {
      const entries: Record<string, unknown> = from.getMap(name).toJSON();
      const target = to.getMap<unknown>(name);
      for (const key of Object.keys(entries).toSorted())
        target.set(key, entries[key]);
    }
  }, ORIGIN_SYSTEM);
}

/**
 * A fresh document holding the source's blocks (IDs, attributes known and unknown, text and marks) redistributed with
 * sectionize into even sections, and the settings, settingsMeta, revisedOverrides, notes and imported maps; every struct is
 * the given client's.
 */
export function rebuildDoc(
  source: CrdtDoc,
  options: { clientId: number },
): RebuildResult {
  const known: readonly string[] = ROOT_TYPE_NAMES;
  if ([...yDocOf(source).share.keys()].some((name) => !known.includes(name)))
    return { ok: false, code: "unknown_root" };
  const body = scriptBody(source);
  const blocks = (body.materialize().content ?? []).flatMap(
    (section) => section.content ?? [],
  );
  if (hasDuplicateIds(blocks)) return { ok: false, code: "duplicate_ids" };
  if (rejects(validateDoc(body.materializeRaw())))
    return { ok: false, code: "invalid" };
  const built = scriptDocFromJSON(
    { type: "doc", content: evenSections(blocks) },
    { clientId: options.clientId },
  );
  copyMaps(source, built);
  return { ok: true, doc: built };
}
