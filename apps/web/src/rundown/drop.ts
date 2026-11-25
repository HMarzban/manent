// Handles dropping Manent script links (/s/<id>) and import files onto a rundown grid without triggering window drop.
import { NOTES_MAP, jsonMap, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { randomBlockId } from "@manent/schema";
import type { IdSource } from "@manent/schema";
import { paperForRegion } from "@manent/settings";
import { indexDocId } from "@manent/sync-protocol";
import { LIBRARY_WORDS, RUNDOWN_WORDS } from "@manent/ui";
import { domXml } from "../import/dom-xml.ts";
import { readImportFiles } from "../import/file-picker.ts";
import type { ImportFile } from "../import/open-files.ts";
import { IMPORTABLE_EXTENSIONS, importReaders } from "../import/readers.ts";
import type { PersonServices, ProjectKind } from "../services/ports.ts";
import { readWorkspace } from "../services/sync/index-entries.ts";
import type {
  DocumentEntry,
  WorkspaceEntries,
} from "../services/sync/index-entries.ts";
import { MSG_DROP_ADDED, appendScriptRow } from "./rows-from-script.ts";
import type { GroupedUndoStep } from "./rows-from-script.ts";
import { getRundownView } from "./rundown-view-store.ts";

/** The row created by the most recent drop on a rundown, targeted by "Split into rows by slug". */
export interface DroppedRowTarget {
  readonly rowId: string;
  readonly storyDocId: string;
  readonly storyTitle: string;
}

/** Shared context for drop operations on one open rundown. */
export interface RundownDropContext {
  readonly services: PersonServices;
  readonly rundownDocId: string;
  readonly now: () => number;
  readonly ids?: IdSource;
  readonly onDropped?: (target: DroppedRowTarget) => void;
  readonly onStep?: (step: GroupedUndoStep) => void;
}

interface IndexedPlace {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly kind: ProjectKind;
  readonly entry: DocumentEntry | null;
}

const SCRIPT_PATH = /^\/s\/([^/?#\s]+)\/?$/;

/** Parses a `/s/<id>` Manent script link from `text/uri-list` or plain text; returns the docId or null. */
export function parseDroppedScriptLink(raw: string): string | null {
  const line = raw
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry !== "" && !entry.startsWith("#"));
  if (line === undefined) return null;
  let path = line;
  if (!path.startsWith("/")) {
    try {
      path = new URL(line).pathname;
    } catch {
      return null;
    }
  }
  const matched = SCRIPT_PATH.exec(path);
  if (matched === null) return null;
  try {
    const decoded = decodeURIComponent(matched[1]!);
    return decoded === "" || decoded.includes("/") ? null : decoded;
  } catch {
    return null;
  }
}

/** Finds the rundown screen's grid-area container (distinct from `[data-region="page"]` and `[data-beside]`). */
export function findRundownPageArea(doc: Document): HTMLElement | null {
  for (const el of doc.querySelectorAll<HTMLElement>("div")) {
    const area = el.style.getPropertyValue("grid-area").trim();
    if (
      (area === "page" || area.startsWith("page ")) &&
      !el.hasAttribute("data-region") &&
      !el.hasAttribute("data-beside")
    )
      return el;
  }
  return null;
}

async function workspaceIdsFor(services: PersonServices): Promise<string[]> {
  const me = await services.api.me().catch(() => null);
  const listed = me !== null && me.ok ? me.me.workspaces.map((w) => w.id) : [];
  return [...new Set([...listed, services.userId])];
}

async function withWorkspaceIndex<T>(
  services: PersonServices,
  workspaceId: string,
  run: (doc: CrdtDoc, index: WorkspaceEntries) => T,
): Promise<T | null> {
  const handle = await services
    .openHandle(indexDocId("workspace", workspaceId))
    .catch(() => null);
  if (handle === null) return null;
  try {
    const doc = handle.doc();
    const index = readWorkspace({
      projects: jsonMap(doc, "projects"),
      documents: jsonMap(doc, "documents"),
    });
    return run(doc, index);
  } finally {
    await handle.close();
  }
}

async function findIndexEntry(
  services: PersonServices,
  docId: string,
): Promise<IndexedPlace | null> {
  for (const workspaceId of await workspaceIdsFor(services)) {
    const found = await withWorkspaceIndex(
      services,
      workspaceId,
      (_doc, index) => {
        const entry = index.documents.get(docId);
        const project =
          entry === undefined ? undefined : index.projects.get(entry.projectId);
        if (entry === undefined || project === undefined) return null;
        return {
          workspaceId,
          projectId: entry.projectId,
          projectTitle: project.title,
          kind: project.kind,
          entry,
        };
      },
    );
    if (found !== null) return found;
  }
  return null;
}

async function resolveRundownPlace(
  services: PersonServices,
  rundownDocId: string,
): Promise<IndexedPlace | null> {
  const indexed = await findIndexEntry(services, rundownDocId);
  if (indexed !== null) return indexed;
  const projectId = services.library.documentProject(rundownDocId).get();
  if (projectId === null) return null;
  const workspaces = await workspaceIdsFor(services);
  return {
    workspaceId: workspaces[0] ?? services.userId,
    projectId,
    projectTitle: getRundownView(rundownDocId)?.projectTitle ?? "",
    kind: services.library.documentKind(rundownDocId).get() ?? "show",
    entry: null,
  };
}

const pushDropNotice = (
  ctx: RundownDropContext,
  kind: "refused" | "added",
  text: string,
): void =>
  ctx.services.messages.push({
    id: kind === "added" ? MSG_DROP_ADDED : "rundown.drop.refused",
    text,
    lifetime: kind === "added" ? "reverse" : "brief",
    ownWork: false,
    actions:
      kind === "added"
        ? (["rundown.splitBySlug", "edit.undo"] as const).map((commandId) => ({
            label: ctx.services.commands.state(commandId).label,
            commandId,
          }))
        : [],
  });

/** Drops a Manent `/s/<id>` script link onto the rundown, enforcing same-project and script-kind checks. */
export async function dropScriptLink(
  ctx: RundownDropContext,
  storyDocId: string,
  rawLabel: string,
  afterRowId: string | null,
): Promise<DroppedRowTarget | null> {
  const { services, rundownDocId } = ctx;
  if (storyDocId === rundownDocId) {
    pushDropNotice(ctx, "refused", RUNDOWN_WORDS.cannotAddFile(rawLabel));
    return null;
  }
  const [rundownPlace, storyIndexed] = await Promise.all([
    resolveRundownPlace(services, rundownDocId),
    findIndexEntry(services, storyDocId),
  ]);
  const docKind =
    storyIndexed?.entry?.kind ?? services.library.docKindOf(storyDocId).get();
  const storyTitle =
    storyIndexed?.entry?.title ??
    services.library.documentTitle(storyDocId).get() ??
    rawLabel;
  if (docKind !== "script") {
    pushDropNotice(ctx, "refused", RUNDOWN_WORDS.cannotAddFile(storyTitle));
    return null;
  }
  const storyProjectId =
    storyIndexed?.projectId ??
    services.library.documentProject(storyDocId).get();
  if (
    rundownPlace !== null &&
    storyProjectId !== null &&
    storyProjectId !== rundownPlace.projectId
  ) {
    const projectName =
      rundownPlace.projectTitle ||
      getRundownView(rundownDocId)?.projectTitle ||
      LIBRARY_WORDS.untitledScript;
    pushDropNotice(
      ctx,
      "refused",
      RUNDOWN_WORDS.cannotAddOtherProject(storyTitle, projectName),
    );
    return null;
  }
  if (storyIndexed !== null) {
    await withWorkspaceIndex(services, storyIndexed.workspaceId, (doc, idx) => {
      const entry = idx.documents.get(storyDocId);
      if (entry !== undefined && entry.rundownId !== rundownDocId)
        jsonMap(doc, "documents").set(storyDocId, {
          ...entry,
          rundownId: rundownDocId,
        });
    });
  }
  const rowId = await appendScriptRow({
    ...ctx,
    storyDocId,
    storyTitle,
    afterRowId,
  });
  const target: DroppedRowTarget = { rowId, storyDocId, storyTitle };
  ctx.onDropped?.(target);
  pushDropNotice(ctx, "added", RUNDOWN_WORDS.droppedScript(storyTitle));
  return target;
}

async function importOneFile(
  ctx: RundownDropContext,
  file: ImportFile,
  place: IndexedPlace | null,
  readers: ReturnType<typeof importReaders>,
  language: string,
  afterRowId: string | null,
): Promise<DroppedRowTarget | null> {
  const dot = file.name.lastIndexOf(".");
  const ext = dot < 0 ? "" : file.name.slice(dot).toLowerCase();
  const stem = dot <= 0 ? file.name : file.name.slice(0, dot);
  const reader = readers.find((row) => row.extension === ext);
  if (
    !IMPORTABLE_EXTENSIONS.includes(ext) ||
    reader === undefined ||
    "refuse" in reader ||
    place === null
  )
    return null;
  const formats = await import("@manent/formats");
  if (file.bytes.length > formats.IMPORT_LIMIT_BYTES) return null;
  const ids = ctx.ids ?? randomBlockId;
  const script = await reader.read(file.bytes, ids).catch(() => null);
  if (script === null) return null;
  const storyTitle = script.title ?? stem;
  const fallback = {
    type: "block" as const,
    attrs: { id: ids(), type: "slug", kind: null },
  };
  const blocks = script.blocks.length > 0 ? script.blocks : [fallback];
  const made = await ctx.services.library
    .addCopy(place.workspaceId, place.projectId, place.kind, storyTitle, {
      docKind: "script",
      airDate: null,
      rundownId: ctx.rundownDocId,
      start(handle) {
        scriptBody(handle.doc()).write((w) => w.insertBlocks(null, blocks));
        const notes = jsonMap(handle.doc(), NOTES_MAP);
        for (const { id, note } of script.notes) notes.set(id, note);
        handle.setSetting("script.format", "variety");
        handle.setSetting(
          "script.paper",
          script.paper ?? paperForRegion(language),
        );
      },
    })
    .catch(() => null);
  if (made === null) return null;
  const rowId = await appendScriptRow({
    ...ctx,
    storyDocId: made.docId,
    storyTitle,
    afterRowId,
  });
  return { rowId, storyDocId: made.docId, storyTitle };
}

/** Drops one or more files onto the rundown: importable files become new stories in this project and one row each. */
export async function dropImportFiles(
  ctx: RundownDropContext,
  files: readonly ImportFile[],
  language: string,
  afterRowId: string | null,
): Promise<readonly DroppedRowTarget[]> {
  const place = await resolveRundownPlace(ctx.services, ctx.rundownDocId);
  const readers = importReaders(domXml);
  const added: DroppedRowTarget[] = [];
  let cursorAfter = afterRowId;
  for (const file of files) {
    const target = await importOneFile(
      ctx,
      file,
      place,
      readers,
      language,
      cursorAfter,
    );
    if (target === null) {
      pushDropNotice(ctx, "refused", RUNDOWN_WORDS.cannotAddFile(file.name));
      continue;
    }
    cursorAfter = target.rowId;
    added.push(target);
    ctx.onDropped?.(target);
    pushDropNotice(ctx, "added", RUNDOWN_WORDS.droppedImport(file.name));
  }
  return added;
}

const DROP_TYPES = ["Files", "text/uri-list", "text/plain"] as const;

const onRundownDragOver = (event: DragEvent): void => {
  const transfer = event.dataTransfer;
  if (transfer === null || !DROP_TYPES.some((t) => transfer.types.includes(t)))
    return;
  event.preventDefault();
  event.stopPropagation();
  transfer.dropEffect = "copy";
};

/** Attaches dragover and drop listeners directly to `element` so drops stop propagation before the window drop. */
export function attachRundownDrop(
  element: HTMLElement,
  ctx: RundownDropContext,
  language: string,
): () => void {
  const onDrop = (event: DragEvent): void => {
    const transfer = event.dataTransfer;
    if (transfer === null) return;
    const hasFiles = transfer.files.length > 0;
    const raw =
      transfer.getData("text/uri-list") || transfer.getData("text/plain");
    if (!hasFiles && raw === "") return;
    event.preventDefault();
    event.stopPropagation();

    const view = getRundownView(ctx.rundownDocId);
    if (view !== undefined && view.access !== "edit") {
      if (view.access === "view_only")
        pushDropNotice(ctx, "refused", RUNDOWN_WORDS.needsEditRundowns);
      return;
    }
    const afterRowId =
      event.target instanceof Element
        ? (event.target.closest("[data-row-id]")?.getAttribute("data-row-id") ??
          null)
        : null;
    if (hasFiles) {
      void readImportFiles(transfer.files).then((files) =>
        dropImportFiles(ctx, files, language, afterRowId),
      );
      return;
    }
    const storyDocId = parseDroppedScriptLink(raw);
    if (storyDocId === null) {
      const label = raw.trim().split(/\r?\n/)[0] ?? "";
      pushDropNotice(ctx, "refused", RUNDOWN_WORDS.cannotAddFile(label));
      return;
    }
    void dropScriptLink(ctx, storyDocId, raw.trim(), afterRowId);
  };
  element.addEventListener("dragover", onRundownDragOver);
  element.addEventListener("drop", onDrop);
  return () => {
    element.removeEventListener("dragover", onRundownDragOver);
    element.removeEventListener("drop", onDrop);
  };
}
