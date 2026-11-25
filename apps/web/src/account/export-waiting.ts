// Sequential export of every waiting script for the sign-out guard, through Export's default file type.
import { scriptBody, titlePage } from "@manent/crdt";
import {
  engineFor,
  profileFromSettings,
  readLayoutSettings,
} from "@manent/pagination";
import type { Pagination } from "@manent/pagination";
import { FORMATS, blockText, blocksOf } from "@manent/schema";
import type { FormatId } from "@manent/schema";
import { indexDocId } from "@manent/sync-protocol";
import type { DocKind } from "@manent/sync-protocol";
import { LIBRARY_WORDS } from "@manent/ui";
import { typesOffered } from "../send/file-types.ts";
import { fileName, save } from "../send/script-file.ts";
import type {
  PersonServices,
  WaitingDocumentSummary,
} from "../services/ports.ts";

export interface WaitingScript {
  readonly docId: string;
  readonly title: string;
  readonly docKind: DocKind;
}

export type ExportWaitingOutcome =
  | { readonly ok: true; readonly titles: readonly string[] }
  | { readonly ok: false; readonly failedTitle: string };

const DEFAULT_ENGINE_VERSION = 1;
const INK_MIME = "text/plain;charset=utf-8";

const formatOf = (value: unknown): FormatId =>
  FORMATS.find((known) => known === value) ?? "screenplay";

async function inspectUnknownDoc(
  services: PersonServices,
  docId: string,
): Promise<WaitingScript | null> {
  try {
    const handle = await services.openHandle(docId);
    try {
      const doc = handle.doc();
      const flat = blocksOf(scriptBody(doc).materialize());
      if (flat.length === 0) return null;
      const tpTitle = titlePage(doc).get("title").trim();
      const known = services.library.documentTitle(docId).get();
      const title =
        known !== null && known !== ""
          ? known
          : tpTitle !== ""
            ? tpTitle
            : LIBRARY_WORDS.untitledScript;
      const format = handle.settings.get()["script.format"];
      return {
        docId,
        title,
        docKind: format === "ink" ? "ink" : "script",
      };
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

/** Resolves waiting documents down to exportable scripts, including scripts in unopened workspaces offline. */
export async function resolveWaitingScripts(
  services: PersonServices,
  waiting: readonly WaitingDocumentSummary[],
): Promise<WaitingScript[]> {
  const { liveEditor } = await import("../editor-host/live-editor.ts");
  const privateIndexId = indexDocId("user", services.userId);
  const scripts: WaitingScript[] = [];
  for (const { docId, waiting: count } of waiting) {
    if (count <= 0 || docId === privateIndexId) continue;
    const kind = services.library.docKindOf(docId).get();
    const knownTitle = services.library.documentTitle(docId).get();
    if (kind === "script" || kind === "ink") {
      scripts.push({
        docId,
        title: knownTitle ?? LIBRARY_WORDS.untitledScript,
        docKind: kind,
      });
    } else if (kind !== null) {
      continue;
    } else if (knownTitle !== null || liveEditor(docId) !== null) {
      scripts.push({
        docId,
        title: knownTitle ?? LIBRARY_WORDS.untitledScript,
        docKind: "script",
      });
    } else {
      const found = await inspectUnknownDoc(services, docId);
      if (found !== null) scripts.push(found);
    }
  }
  return scripts;
}

async function paginateFromHandle(
  services: PersonServices,
  docId: string,
): Promise<{
  pages: Pagination | null;
  format: FormatId;
  inkText: string | null;
}> {
  const handle = await services.openHandle(docId);
  try {
    const store = services.openScriptStore(docId);
    const settings = handle.settings.get();
    const readSetting = (key: string): unknown =>
      store.get(key as Parameters<typeof store.get>[0]) ?? settings[key];
    const layout = readLayoutSettings(readSetting);
    const format = formatOf(layout.format);
    const flat = blocksOf(scriptBody(handle.doc()).materialize());
    if (format === "ink") {
      return {
        pages: null,
        format,
        inkText: flat.map(blockText).join("\n"),
      };
    }
    const engine = engineFor(DEFAULT_ENGINE_VERSION);
    const profile =
      engine === null
        ? null
        : profileFromSettings(engine, { ...layout, scenesNumbered: false });
    if (engine === null || profile === null)
      return { pages: null, format, inkText: null };
    const pages = engine.paginate(engine.toLayoutBlocks(flat), profile);
    return { pages, format, inkText: null };
  } finally {
    await handle.close();
  }
}

async function exportOneScript(
  services: PersonServices,
  script: WaitingScript,
  now: () => number,
): Promise<void> {
  const { docId, title, docKind } = script;
  const { livePagination } = await import("../editor-host/live-editor.ts");
  const openPages = livePagination(docId);
  const openFormat = formatOf(
    services.openScriptStore(docId).get("script.format"),
  );
  let pages: Pagination | null = openPages;
  let format: FormatId = openFormat;
  let inkText: string | null = null;

  if (pages === null) {
    const loaded = await paginateFromHandle(services, docId);
    pages = loaded.pages;
    format = loaded.format;
    inkText = loaded.inkText;
  }

  const effectiveKind: DocKind = format === "ink" ? "ink" : docKind;
  const [defaultType] = typesOffered("export", {
    docKind: effectiveKind,
    format,
    locked: false,
  });

  if (defaultType !== undefined) {
    const written = await defaultType.write({ docId, title, pages, now });
    save(written.bytes, written.name, defaultType.mime);
    return;
  }

  if (effectiveKind === "ink" && inkText !== null) {
    const bytes = new Uint8Array(new TextEncoder().encode(inkText));
    save(bytes, fileName(title, ".ink"), INK_MIME);
    return;
  }

  throw new Error(`no export file type for ${docId}`);
}

/** Exports each waiting script sequentially through Export's default file type, stopping on the first refusal. */
export async function exportWaitingScripts(
  services: PersonServices,
  scripts: readonly WaitingScript[],
  now: () => number,
): Promise<ExportWaitingOutcome> {
  const exported: string[] = [];
  for (const script of scripts) {
    try {
      await exportOneScript(services, script, now);
    } catch {
      return { ok: false, failedTitle: script.title };
    }
    exported.push(script.title);
    await Promise.resolve();
  }
  return { ok: true, titles: exported };
}
