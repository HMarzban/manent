// The Import group's lines: what a file brought in, then what is kept with the script but not shown.
import type { ImportRecord, KeptItem, KeptKind } from "@manent/formats";
import { COLOUR_NAMES } from "@manent/revisions";
import { IMPORT_WORDS, formatCount, formatDate, joinNames } from "@manent/ui";
import { summaryOf } from "./import-record.ts";

const KEPT = IMPORT_WORDS.kept;

/** The row a kept item is listed under, given the file's element names Manent lacks; null for a lock that could not be placed, which `unplaced` says. */
const LABELS: Readonly<
  Record<KeptKind, (item: KeptItem, elements: string) => string | null>
> = Object.freeze({
  title_page: () => KEPT.title_page,
  document_part: (item) => KEPT.document_part(item.name),
  paragraph_part: () => KEPT.paragraph_part,
  run_part: () => KEPT.run_part,
  element_type: (_item, elements) => KEPT.element_type(elements),
  scene_number: () => KEPT.scene_number,
  note_part: () => KEPT.note_part,
  boneyard: () => KEPT.boneyard,
  fountain_markup: () => KEPT.fountain_markup,
  unplaced_lock: () => null,
});

/** One row per label, in the order each first appears, with a count when it holds more than one item. */
function keptRows(kept: readonly KeptItem[]): string[] {
  const elements = joinNames([
    ...new Set(
      kept.filter((item) => item.kind === "element_type").map((i) => i.name),
    ),
  ]);
  const counts = new Map<string, number>();
  for (const item of kept) {
    const label = LABELS[item.kind](item, elements);
    if (label !== null) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts, ([label, n]) =>
    n > 1 ? `${label} (${formatCount(n)})` : label,
  );
}

/** The page labels of the kept locks that could not be placed, as the file wrote them. */
const unplacedLabels = (kept: readonly KeptItem[]): string[] =>
  kept.flatMap((item) => {
    if (item.kind !== "unplaced_lock" || typeof item.value === "string")
      return [];
    const label = item.value.attributes["PageNumber"];
    return label === undefined || label === "" ? [] : [label];
  });

/**
 * The Import group's lines in order: where the script came from, the summary as the message said it, what came in
 * locked, marked or changed, and, when anything is kept but not shown, the "Imported, not shown" title, its line and
 * one row per kind of kept item, then the script's notes.
 */
export function importRows(
  record: ImportRecord,
  notes: number,
): readonly string[] {
  const { production, kept } = record;
  const unplaced = unplacedLabels(kept);
  const rows = [
    IMPORT_WORDS.importedFrom(record.fileName, formatDate(record.importedAt)),
    summaryOf(record),
  ];
  if (production !== null && production.anchors.length > 0)
    rows.push(IMPORT_WORDS.lockedPages);
  if (record.overflowing.length > 0)
    rows.push(IMPORT_WORDS.overflowing(record.overflowing));
  if (unplaced.length > 0) rows.push(IMPORT_WORDS.unplaced(unplaced));
  if (production !== null && production.sets.length > 0)
    rows.push(
      IMPORT_WORDS.marks(
        production.sets.map((set) => COLOUR_NAMES[set.colour]),
      ),
    );
  if (record.coloursMapped > 0)
    rows.push(IMPORT_WORDS.colours(record.coloursMapped));
  if (record.lockKey !== null) rows.push(IMPORT_WORDS.lockWaiting);
  const keptList = keptRows(kept);
  if (keptList.length === 0 && notes === 0) return rows;
  const format =
    record.from === "fdx"
      ? IMPORT_WORDS.asFdx
      : IMPORT_WORDS.formatNames[record.from];
  rows.push(
    IMPORT_WORDS.notShownTitle,
    IMPORT_WORDS.notShownLine(format),
    ...keptList,
  );
  if (notes > 0) rows.push(IMPORT_WORDS.notesRow(notes));
  return rows;
}
