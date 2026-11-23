// A project written as one zip on the device: each of its scripts as it is now, with its notes and import record, and
// the data of each named draft this device or a reachable server holds.
import {
  IMPORT_MAP,
  IMPORT_RECORD_KEY,
  NOTES_MAP,
  jsonMap,
  scriptBody,
} from "@manent/crdt";
import { parseImportRecord, writeArchive } from "@manent/formats";
import type {
  ArchiveDocument,
  ArchiveDraft,
  ScriptForExport,
} from "@manent/formats";
import { FORMATS, isScriptNote } from "@manent/schema";
import type { DocHandle, DocStatus } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { LIBRARY_WORDS } from "@manent/ui";
import type { HistoryRow } from "../history/history-rows.ts";
import type { HistorySource } from "../history/source.ts";
import { fileName } from "../send/script-file.ts";
import type { WrittenFile } from "../send/script-file.ts";
import type { PersonServices } from "../services/ports.ts";
import { readWorkspace } from "../services/sync/index-entries.ts";

/** A project as its workspace's index lists it: its title and its scripts, oldest first. */
interface ListedProject {
  title: string;
  scripts: readonly { docId: string; title: string }[];
}

/** The project whose index entry lists `docId`, among the person's workspaces and their own desk; null when none does. */
async function projectOf(
  services: PersonServices,
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

/** The handle has caught up with the server, or cannot now: the link is offline, or the server refused the document. */
const isCaughtUp = (status: DocStatus): boolean =>
  status.docSync === "synced" ||
  status.link === "offline" ||
  status.side.length > 0;

/** Settles once `handle` has caught up, so that a script the device was still fetching is written whole. */
function caughtUp(handle: DocHandle): Promise<void> {
  return new Promise((resolve) => {
    if (isCaughtUp(handle.status.get())) {
      resolve();
      return;
    }
    const stop = handle.status.subscribe((status) => {
      if (!isCaughtUp(status)) return;
      stop();
      resolve();
    });
  });
}

/** The script `docId` as it is now, as the device holds it once caught up: its blocks, notes and import record, out of production. */
async function scriptOf(
  services: PersonServices,
  docId: string,
  title: string,
): Promise<ScriptForExport> {
  const handle = await services.openHandle(docId);
  try {
    await caughtUp(handle);
    const doc = handle.doc();
    const stored = handle.settings.get()["script.format"];
    return {
      title,
      // with no format of its own a script is a screenplay, the setting's default and the first format
      format: FORMATS.find((id) => id === stored) ?? FORMATS[0],
      blocks: (scriptBody(doc).materialize().content ?? []).flatMap(
        (section) => section.content ?? [],
      ),
      notes: Object.entries(jsonMap(doc, NOTES_MAP).entries()).flatMap(
        ([id, note]) => (isScriptNote(note) ? [{ id, note }] : []),
      ),
      record: parseImportRecord(
        jsonMap(doc, IMPORT_MAP).get(IMPORT_RECORD_KEY),
      ),
      production: null,
    };
  } finally {
    await handle.close();
  }
}

/** History's rows of `docId` once they are no longer loading: the device's, and the server's while it can be reached. */
function listedRows(
  history: HistorySource,
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
  history: HistorySource,
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
 * index of the person's lists the document, or a script cannot be opened.
 */
export async function writeProjectArchive(
  services: PersonServices,
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
