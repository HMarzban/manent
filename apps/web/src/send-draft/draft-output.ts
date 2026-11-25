// Draft What encoding, @manent/revisions asterisks comparison, page slicing and file generation.
import { SCHEMA_VERSION } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import {
  changedLineSet,
  compareDocs,
  compareModeOf,
  markedLines,
  selectSides,
} from "@manent/revisions";
import type { Pagination } from "@manent/pagination";
import { PRODUCTION_OUTPUTS_WORDS } from "@manent/ui";
import {
  liveEditor,
  liveFrontPages,
  liveFurniture,
} from "../editor-host/live-editor.ts";
import { liveProduction } from "../editor-host/production.ts";
import { docOfContent } from "../history/content-doc.ts";
import type { HistorySource } from "../history/source.ts";
import { loadPdfFonts } from "../send/pdf-fonts.ts";
import { engineOf } from "../send/print-pages.ts";
import { fileName, save } from "../send/script-file.ts";
import type { ExportFileType } from "../send/script-file.ts";
import { sidesSelectionFor } from "../send/sides-file.tsx";
import type { Environment } from "../services/ports.ts";

export type DraftWhatId =
  | "whole_script"
  | "pages"
  | "scenes"
  | "revised_pages"
  | "sides_scenes"
  | "full_draft"
  | "changed_pages";

export interface WhatSelection {
  readonly id: DraftWhatId;
  readonly firstPage: number;
  readonly lastPage: number;
  readonly firstScene: number;
  readonly lastScene: number;
}

const EMPTY_AUTHORS = new Map<string, string>();
const EMPTY_LINES: ReadonlyMap<string, readonly number[]> = new Map();

export function encodeWhat(sel: WhatSelection): string {
  if (sel.id === "pages") return `pages:${sel.firstPage}-${sel.lastPage}`;
  if (sel.id === "scenes") return `scenes:${sel.firstScene}-${sel.lastScene}`;
  return sel.id;
}

export function parseWhat(
  raw: string,
  defaults: { pageCount: number; sceneCount: number },
): WhatSelection {
  const base: WhatSelection = {
    id: "whole_script",
    firstPage: 1,
    lastPage: Math.max(1, defaults.pageCount),
    firstScene: 1,
    lastScene: Math.max(1, defaults.sceneCount),
  };
  if (
    raw === "whole_script" ||
    raw === "full_draft" ||
    raw === "changed_pages" ||
    raw === "revised_pages" ||
    raw === "sides_scenes"
  )
    return { ...base, id: raw };
  const pageMatch = /^pages:(\d+)-(\d+)$/.exec(raw);
  if (pageMatch !== null)
    return {
      ...base,
      id: "pages",
      firstPage: Math.max(1, Number(pageMatch[1])),
      lastPage: Math.max(1, Number(pageMatch[2])),
    };
  const sceneMatch = /^scenes:(\d+)-(\d+)$/.exec(raw);
  if (sceneMatch !== null)
    return {
      ...base,
      id: "scenes",
      firstScene: Math.max(1, Number(sceneMatch[1])),
      lastScene: Math.max(1, Number(sceneMatch[2])),
    };
  return base;
}

export function countScenes(p: Pagination): number {
  let scenes = 0;
  for (const block of p.blocks)
    if (block.type === "scene_heading" || block.type === "slug") scenes += 1;
  return scenes;
}

/** Loads `baselineVersionId` from History and computes changed line numbers per block against the open editor. */
export async function computeChangedLines(
  history: HistorySource,
  docId: string,
  baselineVersionId: string,
  pagination: Pagination,
): Promise<ReadonlyMap<string, readonly number[]> | null> {
  const editor = liveEditor(docId);
  if (editor === null) return null;
  const content = await history.content(docId, {
    versionId: baselineVersionId,
  });
  if (content === null) return null;
  const olderDoc = docOfContent(content);
  if (olderDoc === null) return null;
  const newerDoc: DocJSON = editor.view.state.doc.toJSON();
  const { mode } = compareModeOf(content, {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: pagination.engineVersion,
  });
  const comparison = compareDocs(olderDoc, newerDoc, { mode });
  return changedLineSet(comparison, pagination);
}

interface DraftPdfRevision {
  readonly header: string;
  readonly marks: readonly { y: number; text: string }[];
  readonly tint: readonly [number, number, number] | null;
}

/** Marks for `pageIndex`, with empty header and null tint per Send draft specification. */
function revisionDecorForPage(
  pagination: Pagination,
  pageIndex: number,
  changedLines: ReadonlyMap<string, readonly number[]>,
): DraftPdfRevision | null {
  if (changedLines.size === 0) return null;
  const engine = engineOf(pagination);
  const laid = engine.layoutPage(pagination, pageIndex);
  const marks = markedLines(laid, changedLines, EMPTY_AUTHORS).map((line) => ({
    y: line.y,
    text: "*",
  }));
  if (marks.length === 0) return null;
  return { header: "", tint: null, marks };
}

function pageMatchesRange(
  label: string,
  index: number,
  low: number,
  high: number,
): boolean {
  const numeric = /^[A-Z]*(\d+)/.exec(label);
  const value = numeric === null ? index + 1 : Number(numeric[1]);
  return value >= low && value <= high;
}

function sceneBlockIdsInRange(
  p: Pagination,
  low: number,
  high: number,
): ReadonlySet<string> {
  const ids = new Set<string>();
  let sceneIndex = 0;
  for (const block of p.blocks) {
    if (block.type === "scene_heading" || block.type === "slug")
      sceneIndex += 1;
    if (sceneIndex >= low && sceneIndex <= high) ids.add(block.id);
  }
  return ids;
}

export function selectPageIndexes(
  docId: string,
  p: Pagination,
  what: WhatSelection,
  changedLines: ReadonlyMap<string, readonly number[]> | null,
): readonly number[] {
  if (what.id === "whole_script" || what.id === "full_draft")
    return p.pages.map((page) => page.index);
  if (what.id === "pages") {
    const low = Math.min(what.firstPage, what.lastPage);
    const high = Math.max(what.firstPage, what.lastPage);
    return p.pages
      .filter((page) => pageMatchesRange(page.label, page.index, low, high))
      .map((page) => page.index);
  }
  if (what.id === "scenes") {
    const low = Math.min(what.firstScene, what.lastScene);
    const high = Math.max(what.firstScene, what.lastScene);
    const blockIds = sceneBlockIdsInRange(p, low, high);
    const engine = engineOf(p);
    return p.pages
      .filter((page) =>
        engine
          .layoutPage(p, page.index)
          .lines.some(
            (line) => line.blockId !== null && blockIds.has(line.blockId),
          ),
      )
      .map((page) => page.index);
  }
  if (what.id === "revised_pages") {
    const revised = new Set(liveProduction(docId)?.revisedPages ?? []);
    return p.pages
      .filter((page) => revised.has(page.label))
      .map((page) => page.index);
  }
  if (what.id === "sides_scenes") {
    const choice = sidesSelectionFor(docId, p);
    return choice === null ? [] : selectSides(p, choice.ids).pages;
  }
  const activeLines = changedLines ?? EMPTY_LINES;
  const engine = engineOf(p);
  return p.pages
    .filter(
      (page) =>
        markedLines(
          engine.layoutPage(p, page.index),
          activeLines,
          EMPTY_AUTHORS,
        ).length > 0,
    )
    .map((page) => page.index);
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`the font file ${url} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function isoDay(at: number): string {
  const date = new Date(at);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DOWNLOAD_GAP_MS = 100;

function pauseBetweenDownloads(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, DOWNLOAD_GAP_MS);
  });
}

/** Generates and saves the sender's local copy for every chosen file type after a draft is sent. */
export async function downloadDraftFiles(options: {
  docId: string;
  title: string;
  draftName: string;
  pagination: Pagination;
  pageIndexes: readonly number[];
  selectedFileIds: readonly string[];
  offeredTypes: readonly ExportFileType[];
  changedLines: ReadonlyMap<string, readonly number[]> | null;
  watermarkRequired: boolean;
  watermarkName: string | null;
  now: Environment["now"];
}): Promise<void> {
  const {
    docId,
    title,
    draftName,
    pagination,
    pageIndexes,
    selectedFileIds,
    offeredTypes,
    changedLines,
    watermarkRequired,
    watermarkName,
    now,
  } = options;
  if (watermarkRequired && watermarkName === null) return;
  const front = liveFrontPages(docId) ?? [];
  const furniture = liveFurniture(docId);
  const labelTitle = `${title} — ${draftName}`;
  let savedCount = 0;

  const saveSequential = async (
    bytes: Uint8Array<ArrayBuffer>,
    name: string,
    mime: string,
  ): Promise<void> => {
    // Yield between back-to-back blob downloads so Firefox never stalls multi-file sends.
    if (savedCount > 0) await pauseBetweenDownloads();
    save(bytes, name, mime);
    savedCount += 1;
  };

  for (const id of selectedFileIds) {
    if (id === "pdf" || id === "pdf_asterisks") {
      const created = now();
      const [fonts, { writePdf }] = await Promise.all([
        loadPdfFonts(fetchBytes),
        import("@manent/formats"),
      ]);
      const decor =
        id === "pdf_asterisks" && changedLines !== null
          ? (pageIndex: number) =>
              revisionDecorForPage(pagination, pageIndex, changedLines)
          : undefined;
      const bytes = new Uint8Array(
        await writePdf(pagination, {
          fonts,
          front,
          pages: pageIndexes,
          title: labelTitle,
          createdAt: created,
          decor,
          watermark: watermarkName,
          header: furniture.header ?? null,
          footer: furniture.footer ?? null,
          dateFormat: furniture.dateFormat ?? null,
          revisionLabel: furniture.revisionLabel ?? null,
          day: furniture.day ?? isoDay(created),
          durationMs: furniture.durationMs,
        }),
      );
      const baseTitle =
        id === "pdf_asterisks"
          ? `${title} - ${draftName} (marked)`
          : `${title} - ${draftName}`;
      await saveSequential(
        bytes,
        fileName(baseTitle, ".pdf"),
        "application/pdf",
      );
      continue;
    }
    if (id === "sides") {
      const choice = sidesSelectionFor(docId, pagination);
      if (choice === null) continue;
      const { pages, pagination: struck } = selectSides(pagination, choice.ids);
      if (pages.length === 0) continue;
      const [fonts, { writePdf }] = await Promise.all([
        loadPdfFonts(fetchBytes),
        import("@manent/formats"),
      ]);
      const bytes = new Uint8Array(
        await writePdf(struck, {
          fonts,
          pages,
          title: labelTitle,
          createdAt: now(),
          watermark: watermarkName,
        }),
      );
      const name = fileName(
        PRODUCTION_OUTPUTS_WORDS.sidesFileName(
          labelTitle,
          choice.first.number,
          choice.last.number,
        ),
        ".pdf",
      );
      await saveSequential(bytes, name, "application/pdf");
      continue;
    }
    const type = offeredTypes.find((entry) => entry.id === id);
    if (type !== undefined) {
      const written = await type.write({
        docId,
        title: labelTitle,
        pages: pagination,
        now,
      });
      await saveSequential(written.bytes, written.name, type.mime);
    }
  }
  if (savedCount > 1) await pauseBetweenDownloads();
}
