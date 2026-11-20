// What an issue records of each block its revision marked, and how those marks read back once it is issued.
import { engineFor } from "@manent/pagination";
import type { Pagination } from "@manent/pagination";
import { blocksOf } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { canonicalBlocksOf } from "../compare/align.ts";
import type { BlockEntry } from "../compare/align.ts";
import { compareDocs } from "../compare/comparison.ts";
import { baselineOf, contentHash, markBlock, removedMarks } from "./marks.ts";
import type { Baseline, BlockMark, Override } from "./marks.ts";
import type { BlockChange, SetBlockRecord } from "./model.ts";
import { blockMarkedLines } from "./page-marks.ts";

function changeOf(
  entry: BlockEntry,
  baseline: Baseline,
  visible: ReadonlySet<string>,
): BlockChange {
  if (entry.kind === "added") return "added";
  if (!baseline.visible.has(entry.id) && visible.has(entry.id)) return "shown";
  if (entry.moved && entry.kind === "unchanged") return "moved";
  return "changed";
}

function rangesOf(
  mark: BlockMark,
): Pick<SetBlockRecord, "inserted" | "deletedAt"> {
  if (mark.kind === "whole") return { inserted: [], deletedAt: [] };
  return {
    inserted: mark.inserted.map(([from, to]) => [from, to]),
    deletedAt: [...mark.deletedAt],
  };
}

/**
 * Every block of `issued` marked against `baseline` (compareDocs for added,
 * removed and moved; markBlock for each), with the label of the page of `p`,
 * the issued script's pagination, its first marked line is on. A removed
 * block is labelled with the page of its deletion point, or the last page
 * when no block is left to mark. RangeError for a marked block `p` does not
 * hold, or a pagination whose engine this build does not carry.
 */
export function issueBlocks(
  baseline: DocJSON,
  issued: DocJSON,
  p: Pagination,
  overrides: (blockId: string) => Override | null,
): SetBlockRecord[] {
  const engine = engineFor(p.engineVersion);
  if (engine === null)
    throw new RangeError(
      `this build carries no layout engine ${p.engineVersion}`,
    );
  const base = baselineOf(canonicalBlocksOf(baseline));
  const visible = baselineOf(canonicalBlocksOf(issued)).visible;
  const flat = blocksOf(issued);
  const indexOf = new Map<string, number>();
  p.blocks.forEach((block, i) => {
    if (!indexOf.has(block.id)) indexOf.set(block.id, i);
  });
  const labelOf = (id: string, mark: BlockMark): string => {
    const index = indexOf.get(id);
    if (index === undefined)
      throw new RangeError(
        `a marked block must be in the pagination, not ${id}`,
      );
    const [line] = blockMarkedLines(p, index, mark);
    const offset =
      line === undefined ? 0 : engine.lineStartsOf(p, index)[line]!;
    return p.pages[engine.pageOf(p, index, offset)]!.label;
  };
  const records: SetBlockRecord[] = [];
  for (const entry of compareDocs(baseline, issued).entries) {
    const { id, older, newer } = entry;
    if (newer === null) {
      if (older === null) continue;
      const [point] = removedMarks(base, flat, [id]);
      records.push({
        blockId: id,
        pageLabel:
          point === undefined ? p.pages.at(-1)!.label : labelOf(...point),
        change: "removed",
        hash: contentHash(older),
        inserted: [],
        deletedAt: [],
      });
      continue;
    }
    const mark = markBlock(base.blocks.get(id) ?? null, newer, {
      baseVisible: base.visible.has(id),
      visible: visible.has(id),
      moved: entry.moved,
      override: overrides(id),
    });
    if (mark === null) continue;
    records.push({
      blockId: id,
      pageLabel: labelOf(id, mark),
      change: changeOf(entry, base, visible),
      hash: contentHash(newer),
      ...rangesOf(mark),
    });
  }
  return records;
}

/** The marks of an issued revision on the current blocks: its ranges where a block still hashes as at issue, else the whole block. */
export function issuedMarks(
  blocks: readonly SetBlockRecord[],
  current: ReadonlyMap<string, BlockJSON>,
): Map<string, BlockMark> {
  return new Map(
    blocks.map((record): [string, BlockMark] => {
      const block = current.get(record.blockId);
      const kept =
        block !== undefined &&
        contentHash(block) === record.hash &&
        (record.inserted.length > 0 || record.deletedAt.length > 0);
      return [
        record.blockId,
        kept
          ? {
              kind: "ranges",
              inserted: record.inserted,
              deletedAt: record.deletedAt,
            }
          : { kind: "whole" },
      ];
    }),
  );
}
