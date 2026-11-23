// A project written as one zip on the device: each of its scripts as it is now, with its notes and import record, and
// the data of each named draft this device or a reachable server holds.
import {
  IMPORT_MAP,
  IMPORT_RECORD_KEY,
  NOTES_MAP,
  jsonMap,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { parseImportRecord, writeArchive } from "@manent/formats";
import type {
  ArchiveDocument,
  ArchiveDraft,
  ScriptForExport,
} from "@manent/formats";
import { FORMATS, isScriptNote } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { DocHandle, SideState, ViewHandle } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { LIBRARY_WORDS } from "@manent/ui";
import type { HistoryRow } from "../history/history-rows.ts";
import type { HistorySource } from "../history/source.ts";
import { fileName } from "../send/script-file.ts";
import type { WrittenFile } from "../send/script-file.ts";
import type { PersonServices } from "../services/ports.ts";
import { readWorkspace } from "../services/sync/index-entries.ts";

/** What the archive is read with: the person's indexes and scripts, and history's drafts. */
type ArchiveServices = Pick<PersonServices, "api" | "userId" | "openHandle"> & {
  history: Pick<HistorySource, "rows" | "content">;
};

/** A project as its workspace's index lists it: its title and its scripts, oldest first. */
interface ListedProject {
  title: string;
  scripts: readonly { docId: string; title: string }[];
}

/** The project whose index entry lists `docId`, among the person's workspaces and their own desk; null when none does. */
async function projectOf(
  services: ArchiveServices,
  docId: string,
): Promise<ListedProject | null> {
  const me = await services.api.me();
  const listed = me.ok ? me.me.workspaces.map((w) => w.id) : [];
  for (const workspaceId of new Set([...listed, services.userId])) {
    const handle = await services.openHandle(
      indexDocId("workspace", workspaceId),
    );
    try {
      const doc = handle.doc();
      const index = readWorkspace({
        projects: jsonMap(doc, "projects"),
        documents: jsonMap(doc, "documents"),
      });
      const projectId = index.documents.get(docId)?.projectId;
      const project =
        projectId === undefined ? undefined : index.projects.get(projectId);
      if (project === undefined) continue;
      const scripts = [...index.documents]
        .filter(
          ([, entry]) =>
            entry.projectId === projectId &&
            entry.kind === "script" &&
            entry.trashedAt === null,
        )
        .toSorted(
          ([a, x], [b, y]) => x.createdAt - y.createdAt || a.localeCompare(b),
        )
        .map(([id, entry]) => ({
          docId: id,
          title:
            entry.title === "" ? LIBRARY_WORDS.untitledScript : entry.title,
        }));
      return { title: project.title, scripts };
    } finally {
      await handle.close();
    }
  }
  return null;
}

/**
 * Where a script can be read whole from: its document, once caught up with the server or kept on the device while
 * offline; its reader's blocks, for a person who may only read it; not yet; or nowhere.
 */
type Reading =
  | { kind: "doc" }
  | { kind: "view"; blocks: readonly BlockJSON[] }
  | { kind: "waiting" }
  | { kind: "unreadable" };

/** The sides whose script is read through the handle's reader. */
const READER_SIDES: readonly SideState[] = ["read_only", "view_only"];

function readingOf(handle: DocHandle): Reading {
  const status = handle.status.get();
  if (status.side.some((side) => !READER_SIDES.includes(side)))
    return { kind: "unreadable" };
  const view = handle.readOnly.get();
  if (view !== null) {
    const { live, link } = view.status.get();
    if (live) return { kind: "view", blocks: view.blocks.get() };
    return { kind: link === "offline" ? "unreadable" : "waiting" };
  }
  // the reader is set after the side that calls for it
  if (status.side.length > 0) return { kind: "waiting" };
  if (status.docSync === "synced") return { kind: "doc" };
  if (status.link !== "offline") return { kind: "waiting" };
  // a record never synced with nothing waiting holds none of the script: it was never fetched to this device
  return {
    kind: status.neverSynced && status.waiting === 0 ? "unreadable" : "doc",
  };
}

/** Settles once `handle`'s script can be read whole, or cannot be. */
function settledReading(
  handle: DocHandle,
): Promise<Exclude<Reading, { kind: "waiting" }>> {
  return new Promise((resolve) => {
    const stops: (() => void)[] = [];
    let watched: ViewHandle | null = null;
    const check = (): void => {
      const view = handle.readOnly.get();
      if (view !== null && view !== watched) {
        watched = view;
        stops.push(view.status.subscribe(check));
      }
      const reading = readingOf(handle);
      if (reading.kind === "waiting") return;
      for (const stop of stops.splice(0)) stop();
      resolve(reading);
    };
    stops.push(
      handle.status.subscribe(check),
      handle.readOnly.subscribe(check),
    );
    check();
  });
}

/** A script's document as it stands: its blocks, notes and import record. */
function contentOf(
  doc: CrdtDoc,
): Pick<ScriptForExport, "blocks" | "notes" | "record"> {
  return {
    blocks: (scriptBody(doc).materialize().content ?? []).flatMap(
      (section) => section.content ?? [],
    ),
    notes: Object.entries(jsonMap(doc, NOTES_MAP).entries()).flatMap(
      ([id, note]) => (isScriptNote(note) ? [{ id, note }] : []),
    ),
    record: parseImportRecord(jsonMap(doc, IMPORT_MAP).get(IMPORT_RECORD_KEY)),
  };
}

/**
 * The script `docId` as it is now, read whole: its blocks, notes and import record, out of production. A reader holds
 * blocks only, so a script the person may only read has no notes and no import record. Rejects when the device
 * cannot read it whole: never fetched while offline, or refused by the server.
 */
async function scriptOf(
  services: ArchiveServices,
  docId: string,
  title: string,
): Promise<ScriptForExport> {
  const handle = await services.openHandle(docId);
  try {
    const reading = await settledReading(handle);
    if (reading.kind === "unreadable")
      throw new Error(`${docId} cannot be read whole on this device`);
    const stored = handle.settings.get()["script.format"];
    return {
      title,
      // with no format of its own a script is a screenplay, the setting's default and the first format
      format: FORMATS.find((id) => id === stored) ?? FORMATS[0],
      ...(reading.kind === "view"
        ? { blocks: [...reading.blocks], notes: [], record: null }
        : contentOf(handle.doc())),
      production: null,
    };
  } finally {
    await handle.close();
  }
}

/** History's rows of `docId` once they are no longer loading: the device's, and the server's while it can be reached. */
function listedRows(
  history: ArchiveServices["history"],
  docId: string,
): Promise<readonly HistoryRow[]> {
  const listed = history.rows(docId);
  const settled = (): readonly HistoryRow[] | null => {
    const { rows, state } = listed.get();
    return state.kind === "loading" ? null : rows;
  };
  return new Promise((resolve) => {
    const shown = settled();
    if (shown !== null) {
      resolve(shown);
      return;
    }
    const stop = listed.subscribe(() => {
      const rows = settled();
      if (rows === null) return;
      stop();
      resolve(rows);
    });
  });
}

/** Each named draft of `docId` whose content this tab, the device or a reachable server holds; the others are left out. */
async function draftsOf(
  history: ArchiveServices["history"],
  docId: string,
): Promise<ArchiveDraft[]> {
  const drafts: ArchiveDraft[] = [];
  for (const { item } of await listedRows(history, docId)) {
    if (item.kind !== "named" || item.name === null) continue;
    const content = await history.content(docId, { versionId: item.id });
    if (content !== null)
      drafts.push({
        versionId: item.id,
        name: item.name,
        json: JSON.stringify(content),
      });
  }
  return drafts;
}

/**
 * The archive of the project holding `docId`, named `{project title}.zip`, read one script at a time. Rejects when no
 * index of the person's lists the document, or a script cannot be opened or read whole: an archive never holds a
 * script as an empty file.
 */
export async function writeProjectArchive(
  services: ArchiveServices,
  docId: string,
  now: () => number,
): Promise<WrittenFile> {
  const project = await projectOf(services, docId);
  if (project === null) throw new Error(`no index lists ${docId}`);
  const documents: ArchiveDocument[] = [];
  for (const script of project.scripts)
    documents.push({
      docId: script.docId,
      script: await scriptOf(services, script.docId, script.title),
      drafts: await draftsOf(services.history, script.docId),
    });
  const bytes = writeArchive({
    project: project.title,
    exportedAt: now(),
    documents,
  });
  return { bytes, name: fileName(project.title, ".zip") };
}
