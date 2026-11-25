// A fresh document built from another's content: the same blocks in even sections, every struct one client's.
import {
  RUNDOWN_COLUMNS_ROOT,
  RUNDOWN_FIELDS_ROOT,
  RUNDOWN_ROWS_ROOT,
  rejects,
  sectionize,
  validateDoc,
} from "@manent/schema";
import type { BlockJSON, SectionJSON } from "@manent/schema";
import * as Y from "yjs";
import { yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";
import { COMMENTS_DOC_MAPS } from "./index-maps.ts";
import { FRAGMENT_NAME, scriptDocFromJSON } from "./mapping.ts";
import {
  ALTERNATES_MAP,
  CUTS_MAP,
  IMPORT_MAP,
  NOTES_MAP,
  SCENE_PROGRESS_MAP,
  TITLE_PAGE_MAP,
} from "./script-maps.ts";
import { ORIGIN_SYSTEM } from "./settings.ts";
import { scriptBody } from "./writer.ts";

/** How a root holds its entries: a map by key, an array in order. */
type RootShape = "map" | "array";

/** A script's settings maps, overrides map, notes, import record, title page, writers' material and scene progress. */
const SCRIPT_ROOTS: Readonly<Record<string, RootShape>> = Object.freeze({
  settings: "map",
  settingsMeta: "map",
  revisedOverrides: "map",
  [NOTES_MAP]: "map",
  [IMPORT_MAP]: "map",
  [TITLE_PAGE_MAP]: "map",
  [ALTERNATES_MAP]: "map",
  [CUTS_MAP]: "map",
  [SCENE_PROGRESS_MAP]: "map",
});

/** A rundown's fields, its columns and its rows, each row a map of its own. */
const RUNDOWN_ROOTS: Readonly<Record<string, RootShape>> = Object.freeze({
  [RUNDOWN_FIELDS_ROOT]: "map",
  [RUNDOWN_COLUMNS_ROOT]: "array",
  [RUNDOWN_ROWS_ROOT]: "map",
});

/** A comments document's maps. */
const COMMENTS_ROOTS: Readonly<Record<string, RootShape>> = Object.freeze(
  Object.fromEntries(
    COMMENTS_DOC_MAPS.map((name): [string, RootShape] => [name, "map"]),
  ),
);

/** The roots a rebuild copies beside the body, by document kind; a kind without a line copies a script's. */
const COPIED_ROOTS: Readonly<
  Record<string, Readonly<Record<string, RootShape>>>
> = Object.freeze({
  script: SCRIPT_ROOTS,
  comments: COMMENTS_ROOTS,
  rundown: RUNDOWN_ROOTS,
});

/** The roots a rebuild of a script knows how to copy. */
export const ROOT_TYPE_NAMES: readonly string[] = Object.freeze([
  FRAGMENT_NAME,
  ...Object.keys(SCRIPT_ROOTS),
]);

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

/** A value as `built` may hold it: a nested map or array is copied whole, anything else is the stored JSON. */
const copyOf = (value: unknown): unknown =>
  value instanceof Y.AbstractType ? value.clone() : value;

/** Copies every root of `roots` into `built` in one transaction: a map's entries by ascending key, an array's items in order. */
function copyRoots(
  source: CrdtDoc,
  built: CrdtDoc,
  roots: Readonly<Record<string, RootShape>>,
): void {
  const from = yDocOf(source);
  const to = yDocOf(built);
  to.transact(() => {
    for (const [name, shape] of Object.entries(roots)) {
      if (shape === "array") {
        const items = from.getArray<unknown>(name).toArray().map(copyOf);
        to.getArray<unknown>(name).insert(0, items);
        continue;
      }
      const entries = from.getMap<unknown>(name);
      const target = to.getMap<unknown>(name);
      for (const key of [...entries.keys()].toSorted())
        target.set(key, copyOf(entries.get(key)));
    }
  }, ORIGIN_SYSTEM);
}

/**
 * A fresh document holding the source's blocks (IDs, attributes known and unknown, text and marks) redistributed with
 * sectionize into even sections, and the roots its kind copies (absent: a script's, the settings, settingsMeta,
 * revisedOverrides, notes, imported, titlePage, alternates, cuts and sceneProgress maps); every struct is the given
 * client's.
 */
export function rebuildDoc(
  source: CrdtDoc,
  options: { clientId: number; kind?: string },
): RebuildResult {
  const { kind } = options;
  const listed = kind !== undefined && Object.hasOwn(COPIED_ROOTS, kind);
  const roots = (listed ? COPIED_ROOTS[kind] : undefined) ?? SCRIPT_ROOTS;
  const known: readonly string[] = [FRAGMENT_NAME, ...Object.keys(roots)];
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
  copyRoots(source, built, roots);
  return { ok: true, doc: built };
}
