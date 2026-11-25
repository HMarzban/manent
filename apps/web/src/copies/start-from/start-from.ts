// Start a … from this…: starts a new film, series episode or stage play linked to its source.
import { jsonMap, scriptBody, writeSource } from "@manent/crdt";
import type { SourceEntry } from "@manent/crdt";
import { randomBlockId } from "@manent/schema";
import type { BlockJSON, FormatId, IdSource } from "@manent/schema";
import { paperForRegion } from "@manent/settings";
import { indexDocId } from "@manent/sync-protocol";
import { COPIES_WORDS, LIBRARY_WORDS } from "@manent/ui";
import type { StartFromTarget } from "@manent/ui";
import { firstBlock } from "../../editor-host/first-block.ts";
import type { PersonServices, ProjectKind } from "../../services/ports.ts";
import { readWorkspace } from "../../services/sync/index-entries.ts";
import { copyDocument } from "../copy-document.ts";
import { chaptersToHeadings, copyViewBlocks } from "./blocks.ts";
import { readSourceContent } from "./read-source.ts";
import { rememberSource } from "./source-cache.ts";

interface TargetSpec {
  readonly kind: ProjectKind;
  readonly format: FormatId;
}

const TARGET_SPECS: Readonly<Record<StartFromTarget, TargetSpec>> =
  Object.freeze({
    film: { kind: "film", format: "screenplay" },
    episode: { kind: "series", format: "screenplay" },
    stage_play: { kind: "stage_play", format: "stage_play" },
  });

const ALLOWED_TARGETS: Readonly<
  Partial<Record<ProjectKind, readonly StartFromTarget[]>>
> = Object.freeze({
  film: ["episode", "stage_play"],
  series: ["film", "stage_play"],
  stage_play: ["film", "episode"],
  book: ["film", "stage_play"],
});

/** True when `sourceKind` supports starting a new project of `target`. */
function isStartFromSupported(
  sourceKind: ProjectKind | null,
  target: StartFromTarget,
): boolean {
  return (
    sourceKind !== null &&
    (ALLOWED_TARGETS[sourceKind]?.includes(target) ?? false)
  );
}

interface SourcePlace {
  workspaceId: string;
  sourceKind: ProjectKind;
  signedIn: boolean;
}

/** Finds the writable workspace and project kind holding `docId`; null when absent or not writable. */
async function writablePlaceOf(
  services: PersonServices,
  docId: string,
): Promise<SourcePlace | null> {
  const me = await services.api.me();
  const signedIn = me.ok;
  const listed = me.ok ? me.me.workspaces.map((w) => w.id) : [];
  for (const workspaceId of new Set([...listed, services.userId])) {
    const wsDocId = indexDocId("workspace", workspaceId);
    const handle = await services.openHandle(wsDocId);
    try {
      const { side, link, neverSynced } = handle.status.get();
      if (
        side.includes("access_removed") ||
        side.includes("deleted") ||
        side.includes("view_only") ||
        side.includes("read_only")
      )
        continue;
      const doc = handle.doc();
      const index = readWorkspace({
        projects: jsonMap(doc, "projects"),
        documents: jsonMap(doc, "documents"),
      });
      const entry = index.documents.get(docId);
      const project =
        entry === undefined ? undefined : index.projects.get(entry.projectId);
      if (entry === undefined || project === undefined) continue;
      if (signedIn && link === "online" && !neverSynced) {
        const wsRole = await services.api.role(wsDocId);
        if (wsRole !== "owner" && wsRole !== "edit") return null;
      }
      return { workspaceId, sourceKind: project.kind, signedIn };
    } finally {
      await handle.close();
    }
  }
  return null;
}

/** Records `source` in the new project's index and caches it for Beside and Open beside. */
async function recordProjectSource(
  services: Pick<PersonServices, "openHandle">,
  projectId: string,
  copyDocId: string,
  source: SourceEntry,
): Promise<void> {
  const index = await services.openHandle(indexDocId("project", projectId));
  try {
    writeSource(index.doc(), copyDocId, source);
  } finally {
    await index.close();
  }
  rememberSource(copyDocId, source);
}

type StartFromResult =
  | {
      readonly ok: true;
      readonly projectId: string;
      readonly docId: string;
      readonly sourceDocId: string;
      readonly sourceTitle: string;
      readonly fromBook: boolean;
      readonly chapterCount: number;
      readonly firstChapterId: string | null;
    }
  | {
      readonly ok: false;
      readonly reason: "refused";
      readonly sourceTitle: string;
    };

/** Creates a film or stage play project from a book's chapters, recording `chapters` in `source`. */
async function startFromBook(
  services: PersonServices,
  options: {
    workspaceId: string;
    sourceDocId: string;
    sourceTitle: string;
    title: string;
    spec: TargetSpec;
    blocks: readonly BlockJSON[];
    settings: Readonly<Record<string, unknown>>;
    language: string;
    copiedAt: number;
    ids: IdSource;
  },
): Promise<Extract<StartFromResult, { ok: true }>> {
  const { workspaceId, sourceDocId, sourceTitle, title, spec } = options;
  const extracted = chaptersToHeadings(options.blocks, options.ids);
  const blocks =
    extracted.blocks.length > 0 ? extracted.blocks : [firstBlock(spec.format)];
  const paper =
    typeof options.settings["script.paper"] === "string"
      ? options.settings["script.paper"]
      : paperForRegion(options.language);
  const made = await services.library.addCopy(
    workspaceId,
    null,
    spec.kind,
    title,
    {
      docKind: "script",
      airDate: null,
      rundownId: null,
      start(handle) {
        scriptBody(handle.doc()).write((w) => w.insertBlocks(null, blocks));
        handle.setSetting("script.format", spec.format);
        handle.setSetting("script.paper", paper);
      },
    },
  );
  await recordProjectSource(services, made.projectId, made.docId, {
    docId: sourceDocId,
    versionId: null,
    copiedAt: options.copiedAt,
    chapters: extracted.chapters,
  });
  return {
    ok: true,
    projectId: made.projectId,
    docId: made.docId,
    sourceDocId,
    sourceTitle,
    fromBook: true,
    chapterCount: extracted.chapterCount,
    firstChapterId: extracted.firstChapterId,
  };
}

/** Creates a copy from server-projected viewer blocks only, never copying private notes, alternates or cuts. */
async function startFromView(
  services: PersonServices,
  options: {
    workspaceId: string;
    sourceDocId: string;
    sourceTitle: string;
    title: string;
    spec: TargetSpec;
    blocks: readonly BlockJSON[];
    language: string;
    copiedAt: number;
    ids: IdSource;
  },
): Promise<StartFromResult> {
  const { workspaceId, sourceDocId, sourceTitle, title, spec } = options;
  const blocks = copyViewBlocks(options.blocks, options.ids);
  if (blocks.length === 0) return { ok: false, reason: "refused", sourceTitle };
  const made = await services.library.addCopy(
    workspaceId,
    null,
    spec.kind,
    title,
    {
      docKind: "script",
      airDate: null,
      rundownId: null,
      start(handle) {
        scriptBody(handle.doc()).write((w) => w.insertBlocks(null, blocks));
        handle.setSetting("script.format", spec.format);
        handle.setSetting("script.paper", paperForRegion(options.language));
      },
    },
  );
  await recordProjectSource(services, made.projectId, made.docId, {
    docId: sourceDocId,
    versionId: null,
    copiedAt: options.copiedAt,
  });
  return {
    ok: true,
    projectId: made.projectId,
    docId: made.docId,
    sourceDocId,
    sourceTitle,
    fromBook: false,
    chapterCount: 0,
    firstChapterId: null,
  };
}

/**
 * Starts a new film, series episode or stage play from `sourceDocId`, enforcing server-authoritative read access on
 * the source and write access on the workspace. The source document is never modified.
 */
export async function startFrom(
  services: PersonServices,
  options: {
    docId: string;
    target: StartFromTarget;
    language: string;
    now: () => number;
    ids?: IdSource;
  },
): Promise<StartFromResult> {
  const { docId: sourceDocId, target, language, now } = options;
  const ids = options.ids ?? randomBlockId;
  const sourceTitle =
    services.library.documentTitle(sourceDocId).get() ??
    LIBRARY_WORDS.untitledScript;
  const title = COPIES_WORDS.startFromTitle(sourceTitle, target);
  const spec = TARGET_SPECS[target];
  try {
    const place = await writablePlaceOf(services, sourceDocId);
    if (place === null || !isStartFromSupported(place.sourceKind, target))
      return { ok: false, reason: "refused", sourceTitle };
    const content = await readSourceContent(
      services,
      sourceDocId,
      place.signedIn,
    );
    if (content === null) return { ok: false, reason: "refused", sourceTitle };
    const copiedAt = now();
    if (place.sourceKind === "book")
      return await startFromBook(services, {
        workspaceId: place.workspaceId,
        sourceDocId,
        sourceTitle,
        title,
        spec,
        blocks: content.blocks,
        settings: content.settings,
        language,
        copiedAt,
        ids,
      });
    if (content.access === "view")
      return await startFromView(services, {
        workspaceId: place.workspaceId,
        sourceDocId,
        sourceTitle,
        title,
        spec,
        blocks: content.blocks,
        language,
        copiedAt,
        ids,
      });
    const made = await copyDocument({
      source: { docId: sourceDocId, versionId: null },
      target: {
        workspaceId: place.workspaceId,
        projectId: null,
        kind: spec.kind,
        title,
        format: spec.format,
        entry: { rundownId: null },
      },
      library: services.library,
      history: services.history,
      open: (id) => services.openHandle(id),
      ids,
    });
    if (!made.ok) return { ok: false, reason: "refused", sourceTitle };
    rememberSource(made.docId, {
      docId: sourceDocId,
      versionId: null,
      copiedAt,
    });
    return {
      ok: true,
      projectId: made.projectId,
      docId: made.docId,
      sourceDocId,
      sourceTitle,
      fromBook: false,
      chapterCount: 0,
      firstChapterId: null,
    };
  } catch {
    // any refusal from sync, storage or workspace access surfaces as the refused message
    return { ok: false, reason: "refused", sourceTitle };
  }
}
