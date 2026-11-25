// Client-side comparison between an earlier sent draft and the current sent draft, plus block text lookup.
import {
  DEFAULT_LAYOUT_SETTINGS,
  ENGINE_VERSION,
  engineFor,
  pageSizePx,
  profileFromSettings,
  readLayoutSettings,
  toLockTable,
} from "@manent/pagination";
import type { Engine, PageProfile } from "@manent/pagination";
import {
  changedLineSet,
  compareDocs,
  compareModeOf,
  markedLines,
} from "@manent/revisions";
import type { Comparison } from "@manent/revisions";
import { SCHEMA_VERSION, blocksOf } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { VersionContent } from "@manent/sync-protocol";
import { docOfContent } from "../history/content-doc.ts";

export interface ReaderComparison {
  readonly baseline: DocJSON;
  readonly comparison: Comparison;
  readonly pages: readonly string[];
}

const EMPTY_AUTHORS: ReadonlyMap<string, string> = new Map();

function engineOf(content: VersionContent): Engine | null {
  return (
    engineFor(content.engineVersion ?? ENGINE_VERSION) ??
    engineFor(ENGINE_VERSION)
  );
}

function profileOf(
  content: VersionContent,
  engine: Engine,
): PageProfile | null {
  const settings = {
    ...readLayoutSettings((key) => content.settings[key]),
    scenesNumbered: content.locks !== null,
  };
  return (
    profileFromSettings(engine, settings) ??
    profileFromSettings(engine, {
      ...settings,
      format: DEFAULT_LAYOUT_SETTINGS.format,
    })
  );
}

/** Unscaled width in CSS pixels of one page of `content`; null when the engine or profile is unavailable. */
export function draftPageWidthPx(content: VersionContent): number | null {
  const engine = engineOf(content);
  if (engine === null) return null;
  const profile = profileOf(content, engine);
  return profile === null ? null : pageSizePx(profile).width;
}

/**
 * Compares `earlier` against `current` and lists the ordered, deduplicated page labels of `current` that changed.
 * Null when either version's blocks fail schema validation or no layout engine is available.
 */
export function compareDrafts(
  earlier: VersionContent,
  current: VersionContent,
): ReaderComparison | null {
  const olderDoc = docOfContent(earlier);
  const newerDoc = docOfContent(current);
  if (olderDoc === null || newerDoc === null) return null;
  const engine = engineOf(current);
  if (engine === null) return null;
  const profile = profileOf(current, engine);
  if (profile === null) return null;
  const { mode } = compareModeOf(earlier, {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: engine.version,
  });
  const comparison = compareDocs(olderDoc, newerDoc, { mode });
  const pagination = engine.paginate(
    engine.toLayoutBlocks(blocksOf(newerDoc)),
    profile,
    toLockTable(current.locks ?? []),
  );
  const changed = changedLineSet(comparison, pagination);
  const labels: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < pagination.pages.length; i++) {
    const laidOut = engine.layoutPage(pagination, i);
    if (markedLines(laidOut, changed, EMPTY_AUTHORS).length === 0) continue;
    const label = pagination.pages[i]!.label;
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return { baseline: olderDoc, comparison, pages: labels };
}

/**
 * The ordered, deduplicated page labels of `current` that changed relative to `earlier`.
 * Null when either version's blocks fail schema validation or no layout engine is available.
 */
export function changedPageLabels(
  earlier: VersionContent,
  current: VersionContent,
): string[] | null {
  const result = compareDrafts(earlier, current);
  return result === null ? null : [...result.pages];
}

function textOfBlock(block: BlockJSON): string {
  if (block.content === undefined) return "";
  return block.content.map((node) => node.text ?? "").join("");
}

/** Plain text of block `blockId` inside `content`; null when not found or schema-invalid. */
export function blockTextOf(
  content: VersionContent,
  blockId: string,
): string | null {
  const doc = docOfContent(content);
  if (doc === null) return null;
  for (const section of doc.content ?? []) {
    for (const block of section.content ?? []) {
      if (block.attrs?.id === blockId) return textOfBlock(block);
    }
  }
  return null;
}
