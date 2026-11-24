// Sent-draft PDF rendering: lays out the draft with its own engine and passes the reader's watermark.
import { writePdf } from "@manent/formats";
import type { ScriptFontFiles } from "@manent/formats";
import {
  DEFAULT_LAYOUT_SETTINGS,
  ENGINE_VERSION,
  applyLayoutPatches,
  engineFor,
  paginate,
  profileFromSettings,
  readLayoutSettings,
} from "@manent/pagination";
import type { Engine, PageProfile, Pagination } from "@manent/pagination";
import { lockedPagination, productionLayout } from "@manent/revisions";
import { blocksOf, sectionize } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { VersionContent } from "@manent/sync-protocol";

function numbersOf(blocks: readonly BlockJSON[]): Map<string, string> {
  const numbers = new Map<string, string>();
  for (const block of blocks) {
    const id = block.attrs?.id;
    const num = block.attrs?.num;
    if (typeof id === "string" && typeof num === "string") numbers.set(id, num);
  }
  return numbers;
}

function paginationOf(
  content: VersionContent,
  engine: Engine,
  profile: PageProfile,
): Pagination {
  const flat = blocksOf(sectionize(content.blocks));
  if (content.locks === null)
    return paginate(engine.toLayoutBlocks(flat), profile);
  const blocks = applyLayoutPatches(
    engine.toLayoutBlocks(flat),
    productionLayout(flat, numbersOf(content.blocks)),
  );
  return lockedPagination(blocks, profile, content.locks, engine).pagination;
}

/**
 * Writes `content` to PDF bytes using `fonts`. `watermark` is null for a clean PDF or the
 * signed-in reader's name for a watermarked PDF.
 */
export async function renderDraftPdf(
  fonts: ScriptFontFiles,
  content: VersionContent,
  title: string,
  createdAt: number,
  watermark: string | null,
): Promise<
  | { ok: true; value: Uint8Array }
  | { ok: false; code: "engine_unavailable" | "bad_request" }
> {
  const engine = engineFor(content.engineVersion ?? ENGINE_VERSION);
  if (engine === null) return { ok: false, code: "engine_unavailable" };
  const settings = {
    ...readLayoutSettings((key) => content.settings[key]),
    scenesNumbered: content.locks !== null,
  };
  const profile =
    profileFromSettings(engine, settings) ??
    profileFromSettings(engine, {
      ...settings,
      format: DEFAULT_LAYOUT_SETTINGS.format,
    });
  if (profile === null) return { ok: false, code: "bad_request" };
  const pagination = paginationOf(content, engine, profile);
  const value = await writePdf(pagination, {
    fonts,
    title,
    createdAt,
    watermark,
  });
  return { ok: true, value };
}
