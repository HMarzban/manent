// Report CSV/PDF builders and Animation Pickup lines CSV builder, lazy-loaded by Export file types.
import type { Paper } from "@manent/pagination";
import {
  characterReportRows,
  locationReportRows,
  pickupLineRows,
  sceneReportRows,
} from "@manent/revisions";
import { WRITING_TOOLS_WORDS, formatCount } from "@manent/ui";
import { archiveSource } from "../archive/archive-source.ts";
import { livePagination } from "../editor-host/live-editor.ts";
import type { HistoryRow } from "../history/history-rows.ts";
import { fileName } from "../send/script-file.ts";
import type { ExportWork, WrittenFile } from "../send/script-file.ts";
import { productionContextActions } from "../state/production-context.store.ts";

const HISTORY_WAIT_MS = 3_000;

async function fetchFontBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`the font file ${url} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function paperOf(work: ExportWork): Paper {
  return work.pages?.profile.paper ?? "letter";
}

function isRecordDraftName(name: string | null): boolean {
  if (name === null) return false;
  const normalized = name.trim().toLowerCase();
  return normalized === "record" || normalized.startsWith("record ");
}

async function readHistoryRows(docId: string): Promise<readonly HistoryRow[]> {
  const services = archiveSource.get();
  if (services === null) return [];
  const sub = services.history.rows(docId);
  const current = sub.get();
  if (current.state.kind !== "loading") return current.rows;
  return await new Promise<readonly HistoryRow[]>((resolve) => {
    let settled = false;
    const finish = (rows: readonly HistoryRow[]): void => {
      if (settled) return;
      settled = true;
      stop();
      clearTimeout(timer);
      resolve(rows);
    };
    const stop = sub.subscribe(() => {
      const next = sub.get();
      if (next.state.kind !== "loading") finish(next.rows);
    });
    const timer = setTimeout(() => finish(sub.get().rows), HISTORY_WAIT_MS);
  });
}

async function findRecordDraft(
  docId: string,
): Promise<{ versionId: string; draftName: string } | null> {
  const rows = await readHistoryRows(docId);
  const match = rows.find((row) => isRecordDraftName(row.item.name));
  if (match === undefined) return null;
  const draftName = match.item.name?.trim() || match.title;
  return { versionId: match.item.id, draftName };
}

const CHARACTER_COLUMNS = [
  { header: WRITING_TOOLS_WORDS.reportColName, weight: 2.4 },
  {
    header: WRITING_TOOLS_WORDS.reportColSpeeches,
    weight: 1.1,
    align: "right" as const,
  },
  {
    header: WRITING_TOOLS_WORDS.reportColDialogueWords,
    weight: 1.5,
    align: "right" as const,
  },
  {
    header: WRITING_TOOLS_WORDS.reportColScenes,
    weight: 1,
    align: "right" as const,
  },
  {
    header: WRITING_TOOLS_WORDS.reportColFirstPage,
    weight: 1.1,
    align: "right" as const,
  },
] as const;

const SCENE_COLUMNS = [
  { header: WRITING_TOOLS_WORDS.reportColNumber, weight: 0.9 },
  { header: WRITING_TOOLS_WORDS.reportColHeading, weight: 3.2 },
  {
    header: WRITING_TOOLS_WORDS.reportColPage,
    weight: 0.8,
    align: "right" as const,
  },
  {
    header: WRITING_TOOLS_WORDS.reportColLength,
    weight: 1.1,
    align: "right" as const,
  },
  { header: WRITING_TOOLS_WORDS.reportColCharacters, weight: 2.5 },
] as const;

const LOCATION_COLUMNS = [
  { header: WRITING_TOOLS_WORDS.reportColLocation, weight: 3.2 },
  { header: WRITING_TOOLS_WORDS.reportColInteriorOrExterior, weight: 2.2 },
  {
    header: WRITING_TOOLS_WORDS.reportColScenes,
    weight: 0.9,
    align: "right" as const,
  },
  { header: WRITING_TOOLS_WORDS.reportColPages, weight: 1.8 },
] as const;

const PICKUP_HEADERS = [
  WRITING_TOOLS_WORDS.pickupColCharacter,
  WRITING_TOOLS_WORDS.pickupColLine,
  WRITING_TOOLS_WORDS.pickupColPage,
] as const;

export async function writeCharacterReportCsv(
  work: ExportWork,
): Promise<WrittenFile> {
  const { pages, title, docId } = work;
  if (pages === null) throw new TypeError(`no pages for ${docId}`);
  const { writeCsvBytes } = await import("@manent/formats");
  const rows = characterReportRows(pages).map((row) => [
    row.name,
    String(row.speeches),
    String(row.words),
    String(row.scenes),
    row.firstPage,
  ]);
  const bytes = writeCsvBytes(
    CHARACTER_COLUMNS.map((col) => col.header),
    rows,
  );
  return { bytes, name: fileName(title, " character report.csv") };
}

export async function writeCharacterReportPdf(
  work: ExportWork,
): Promise<WrittenFile> {
  const { pages, title, docId, now } = work;
  if (pages === null) throw new TypeError(`no pages for ${docId}`);
  const [{ loadPdfFonts }, { writeReportPdf }] = await Promise.all([
    import("../send/pdf-fonts.ts"),
    import("@manent/formats"),
  ]);
  const fonts = await loadPdfFonts(fetchFontBytes);
  const rows = characterReportRows(pages).map((row) => [
    row.name,
    formatCount(row.speeches),
    formatCount(row.words),
    formatCount(row.scenes),
    row.firstPage,
  ]);
  const bytes = await writeReportPdf({
    title,
    heading: WRITING_TOOLS_WORDS.reportHeadingCharacters(title),
    columns: CHARACTER_COLUMNS,
    rows,
    paper: paperOf(work),
    fonts,
    createdAt: now(),
  });
  return { bytes, name: fileName(title, " character report.pdf") };
}

export async function writeSceneReportCsv(
  work: ExportWork,
): Promise<WrittenFile> {
  const { pages, title, docId } = work;
  if (pages === null) throw new TypeError(`no pages for ${docId}`);
  const { writeCsvBytes } = await import("@manent/formats");
  const locked = productionContextActions.get(docId)?.locked === true;
  const rows = sceneReportRows(pages, { locked }).map((row) => [
    row.number,
    row.heading,
    row.page,
    row.length,
    row.characters,
  ]);
  const bytes = writeCsvBytes(
    SCENE_COLUMNS.map((col) => col.header),
    rows,
  );
  return { bytes, name: fileName(title, " scene report.csv") };
}

export async function writeSceneReportPdf(
  work: ExportWork,
): Promise<WrittenFile> {
  const { pages, title, docId, now } = work;
  if (pages === null) throw new TypeError(`no pages for ${docId}`);
  const [{ loadPdfFonts }, { writeReportPdf }] = await Promise.all([
    import("../send/pdf-fonts.ts"),
    import("@manent/formats"),
  ]);
  const fonts = await loadPdfFonts(fetchFontBytes);
  const locked = productionContextActions.get(docId)?.locked === true;
  const rows = sceneReportRows(pages, { locked }).map((row) => [
    row.number,
    row.heading,
    row.page,
    row.length,
    row.characters,
  ]);
  const bytes = await writeReportPdf({
    title,
    heading: WRITING_TOOLS_WORDS.reportHeadingScenes(title),
    columns: SCENE_COLUMNS,
    rows,
    paper: paperOf(work),
    fonts,
    createdAt: now(),
  });
  return { bytes, name: fileName(title, " scene report.pdf") };
}

export async function writeLocationReportCsv(
  work: ExportWork,
): Promise<WrittenFile> {
  const { pages, title, docId } = work;
  if (pages === null) throw new TypeError(`no pages for ${docId}`);
  const { writeCsvBytes } = await import("@manent/formats");
  const rows = locationReportRows(pages).map((row) => [
    row.location,
    row.interiorOrExterior,
    String(row.scenes),
    row.pages,
  ]);
  const bytes = writeCsvBytes(
    LOCATION_COLUMNS.map((col) => col.header),
    rows,
  );
  return { bytes, name: fileName(title, " location report.csv") };
}

export async function writeLocationReportPdf(
  work: ExportWork,
): Promise<WrittenFile> {
  const { pages, title, docId, now } = work;
  if (pages === null) throw new TypeError(`no pages for ${docId}`);
  const [{ loadPdfFonts }, { writeReportPdf }] = await Promise.all([
    import("../send/pdf-fonts.ts"),
    import("@manent/formats"),
  ]);
  const fonts = await loadPdfFonts(fetchFontBytes);
  const rows = locationReportRows(pages).map((row) => [
    row.location,
    row.interiorOrExterior,
    formatCount(row.scenes),
    row.pages,
  ]);
  const bytes = await writeReportPdf({
    title,
    heading: WRITING_TOOLS_WORDS.reportHeadingLocations(title),
    columns: LOCATION_COLUMNS,
    rows,
    paper: paperOf(work),
    fonts,
    createdAt: now(),
  });
  return { bytes, name: fileName(title, " location report.pdf") };
}

export async function pickupLinesLeftOut(work: {
  docId: string;
  title: string;
}): Promise<string | null> {
  const services = archiveSource.get();
  if (services === null) return WRITING_TOOLS_WORDS.pickupLinesNeedsRecord;
  const record = await findRecordDraft(work.docId);
  if (record === null) return WRITING_TOOLS_WORDS.pickupLinesNeedsRecord;
  const pages = livePagination(work.docId);
  if (pages === null) return null;
  const content = await services.history.content(work.docId, {
    versionId: record.versionId,
  });
  if (content === null) return WRITING_TOOLS_WORDS.pickupLinesNeedsRecord;
  const rows = pickupLineRows(pages, content.blocks);
  if (rows.length === 0)
    return WRITING_TOOLS_WORDS.pickupLinesNoneChanged(record.draftName);
  return null;
}

export async function writePickupLinesCsv(
  work: ExportWork,
): Promise<WrittenFile> {
  const { pages, title, docId } = work;
  if (pages === null) throw new TypeError(`no pages for ${docId}`);
  const services = archiveSource.get();
  if (services === null)
    throw new Error(WRITING_TOOLS_WORDS.pickupLinesNeedsRecord);
  const record = await findRecordDraft(docId);
  if (record === null)
    throw new Error(WRITING_TOOLS_WORDS.pickupLinesNeedsRecord);
  const content = await services.history.content(docId, {
    versionId: record.versionId,
  });
  if (content === null)
    throw new Error(WRITING_TOOLS_WORDS.pickupLinesNeedsRecord);
  const { writeCsvBytes } = await import("@manent/formats");
  const rows = pickupLineRows(pages, content.blocks).map((row) => [
    row.character,
    row.line,
    row.page,
  ]);
  const bytes = writeCsvBytes(PICKUP_HEADERS, rows);
  return { bytes, name: fileName(title, " pickup lines.csv") };
}
