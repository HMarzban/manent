// Finding and watching the outline document linked to a series episode or a film/stage play.
import { readEpisodes } from "@manent/crdt";
import type { CrdtDoc, EpisodeEntry } from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import type { PersonServices, ProjectKind } from "../services/ports.ts";
import { storageOfServices } from "../services/api-cache.ts";
import { createDeviceMemory } from "../services/sync/device-memory.ts";
import { readWorkspace } from "../services/sync/index-entries.ts";
import { liveMap } from "../services/sync/private-index.ts";

export interface OutlineLinkState {
  readonly outlineDocId: string | null;
  readonly projectKind: ProjectKind | null;
  readonly hasEpisode: boolean;
  readonly canCreate: boolean;
}

export interface ScriptPlace {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly projectKind: ProjectKind;
  readonly scriptTitle: string;
  readonly workspaceHandle: DocHandle;
}

const OUTLINE_PROJECT_KINDS: ReadonlySet<ProjectKind> = new Set([
  "series",
  "film",
  "stage_play",
]);

const DEFAULT_LINK: OutlineLinkState = Object.freeze({
  outlineDocId: null,
  projectKind: null,
  hasEpisode: false,
  canCreate: false,
});

// Cache keyed by scriptDocId for synchronous Open beside choices, plus reverse lookup for Beside's header title.
const linkByScript = new Map<string, OutlineLinkState>();
const scriptByOutline = new Map<string, string>();
const linkListeners = new Set<() => void>();

const tellLinks = (): void => {
  for (const listener of linkListeners) listener();
};

export function supportsOutline(kind: ProjectKind | null): boolean {
  return kind !== null && OUTLINE_PROJECT_KINDS.has(kind);
}

/** Cached outline link for `scriptDocId`, populated as the script opens and updated live. */
export function cachedOutlineLink(scriptDocId: string): OutlineLinkState {
  return linkByScript.get(scriptDocId) ?? DEFAULT_LINK;
}

/** The script whose outline `outlineDocId` is, when known in this session. */
export function scriptDocIdOfOutline(outlineDocId: string): string | null {
  return scriptByOutline.get(outlineDocId) ?? null;
}

export function subscribeOutlineLinks(listener: () => void): () => void {
  linkListeners.add(listener);
  return () => {
    linkListeners.delete(listener);
  };
}

export function recordOutlineLink(
  scriptDocId: string,
  next: OutlineLinkState,
): void {
  const prev = linkByScript.get(scriptDocId);
  if (next.outlineDocId !== null)
    scriptByOutline.set(next.outlineDocId, scriptDocId);
  if (
    prev !== undefined &&
    prev.outlineDocId === next.outlineDocId &&
    prev.projectKind === next.projectKind &&
    prev.hasEpisode === next.hasEpisode &&
    prev.canCreate === next.canCreate
  )
    return;
  linkByScript.set(scriptDocId, next);
  tellLinks();
}

/** Clears cached link state (for tests). */
export function clearOutlineLinkCache(): void {
  linkByScript.clear();
  scriptByOutline.clear();
}

export function isHandleWritable(handle: DocHandle): boolean {
  const { side } = handle.status.get();
  return (
    !side.includes("read_only") &&
    !side.includes("view_only") &&
    !side.includes("access_removed")
  );
}

function readWorkspaceEntries(handle: DocHandle) {
  return readWorkspace({
    projects: liveMap(handle, "projects"),
    documents: liveMap(handle, "documents"),
  });
}

export function findEpisodeForScript(
  doc: CrdtDoc,
  scriptDocId: string,
): EpisodeEntry | null {
  for (const episode of readEpisodes(doc).values()) {
    if (episode.docIds.script === scriptDocId) return episode;
  }
  return null;
}

function findProjectOutlineId(
  workspaceHandle: DocHandle,
  projectId: string,
): string | null {
  const { documents } = readWorkspaceEntries(workspaceHandle);
  for (const [docId, entry] of documents) {
    if (
      entry.projectId === projectId &&
      entry.kind === "outline" &&
      entry.trashedAt === null
    )
      return docId;
  }
  return null;
}

function initialWorkspaceCandidates(
  services: PersonServices,
  given?: readonly string[],
): readonly string[] {
  if (given !== undefined && given.length > 0) {
    return [...new Set([...given, services.userId])];
  }
  const cached = createDeviceMemory({
    local: storageOfServices(services),
    session: null,
  }).workspaces(services.userId);
  if (cached !== null && cached.length > 0) {
    return [...new Set([...cached.map((w) => w.id), services.userId])];
  }
  return [];
}

async function searchWorkspaces(
  services: PersonServices,
  scriptDocId: string,
  candidates: readonly string[],
  searched: Set<string>,
): Promise<ScriptPlace | null> {
  for (const workspaceId of candidates) {
    if (searched.has(workspaceId)) continue;
    searched.add(workspaceId);
    let handle: DocHandle;
    try {
      handle = await services.openHandle(indexDocId("workspace", workspaceId));
    } catch {
      // skip an index that cannot open in this session
      continue;
    }
    const entries = readWorkspaceEntries(handle);
    const doc = entries.documents.get(scriptDocId);
    const project =
      doc === undefined ? undefined : entries.projects.get(doc.projectId);
    if (doc !== undefined && project !== undefined) {
      return {
        workspaceId,
        projectId: doc.projectId,
        projectKind: project.kind,
        scriptTitle: doc.title,
        workspaceHandle: handle,
      };
    }
    void handle.close();
  }
  return null;
}

/**
 * Finds the workspace and project whose index lists `scriptDocId`. Searches cached workspaces first and falls back to
 * `services.api.me()` when not found. Closes every non-matching handle opened while searching; the caller is
 * responsible for closing `place.workspaceHandle` when done.
 */
export async function findScriptPlace(
  services: PersonServices,
  scriptDocId: string,
  givenWorkspaces?: readonly string[],
): Promise<ScriptPlace | null> {
  const searched = new Set<string>();
  const initial = initialWorkspaceCandidates(services, givenWorkspaces);
  const hit = await searchWorkspaces(services, scriptDocId, initial, searched);
  if (hit !== null) return hit;
  const me = await services.api.me();
  const listed = me.ok ? me.me.workspaces.map((w) => w.id) : [];
  const fresh = [...new Set([...listed, services.userId])];
  return searchWorkspaces(services, scriptDocId, fresh, searched);
}

export async function resolveExistingOutline(
  services: PersonServices,
  place: ScriptPlace,
  scriptDocId: string,
): Promise<{ outlineDocId: string | null; hasEpisode: boolean }> {
  if (place.projectKind === "series") {
    const projectIndex = services.projectIndex(place.projectId);
    try {
      const handle = await projectIndex.handle();
      const episode = findEpisodeForScript(handle.doc(), scriptDocId);
      return {
        outlineDocId: episode?.docIds.outline ?? null,
        hasEpisode: episode !== null,
      };
    } finally {
      void projectIndex.close();
    }
  }
  if (place.projectKind === "film" || place.projectKind === "stage_play") {
    return {
      outlineDocId: findProjectOutlineId(
        place.workspaceHandle,
        place.projectId,
      ),
      hasEpisode: true,
    };
  }
  return { outlineDocId: null, hasEpisode: false };
}

/** Resolves the existing outline doc id for `scriptDocId` without mutating any index. */
export async function resolveOutlineDocId(
  services: PersonServices,
  scriptDocId: string,
): Promise<string | null> {
  const cached = linkByScript.get(scriptDocId)?.outlineDocId;
  if (cached !== undefined && cached !== null) return cached;
  const place = await findScriptPlace(services, scriptDocId);
  if (place === null) return null;
  try {
    const resolved = await resolveExistingOutline(services, place, scriptDocId);
    if (resolved.outlineDocId !== null)
      scriptByOutline.set(resolved.outlineDocId, scriptDocId);
    return resolved.outlineDocId;
  } finally {
    void place.workspaceHandle.close();
  }
}

/**
 * Watches the workspace and project index for `scriptDocId`'s outline link and write permission, updating the link
 * cache and calling `onChange` whenever the outline link changes. Returns a disposer that closes all opened handles.
 */
export function watchOutlineLink(options: {
  services: PersonServices;
  scriptDocId: string;
  canWrite: () => boolean;
  onChange: (state: OutlineLinkState) => void;
  onRecheck?: (recheck: () => void) => void;
}): () => void {
  const { services, scriptDocId, canWrite, onChange, onRecheck } = options;
  let stopped = false;
  const stops: (() => void)[] = [];

  const publish = (state: OutlineLinkState): void => {
    if (stopped) return;
    recordOutlineLink(scriptDocId, state);
    onChange(state);
  };

  void (async () => {
    const place = await findScriptPlace(services, scriptDocId);
    if (place === null) {
      publish(DEFAULT_LINK);
      return;
    }
    if (stopped || !supportsOutline(place.projectKind)) {
      void place.workspaceHandle.close();
      publish(DEFAULT_LINK);
      return;
    }
    stops.push(() => void place.workspaceHandle.close());
    if (place.projectKind === "series") {
      const projectIndex = services.projectIndex(place.projectId);
      const projectHandle = await projectIndex.handle();
      if (stopped) {
        void projectIndex.close();
        return;
      }
      stops.push(() => void projectIndex.close());
      const read = (): void => {
        const ep = findEpisodeForScript(projectHandle.doc(), scriptDocId);
        const hasEpisode = ep !== null;
        publish({
          outlineDocId: ep?.docIds.outline ?? null,
          projectKind: "series",
          hasEpisode,
          canCreate:
            hasEpisode && canWrite() && isHandleWritable(projectHandle),
        });
      };
      onRecheck?.(read);
      read();
      stops.push(liveMap(projectHandle, "episodes").subscribe(read));
      stops.push(projectHandle.status.subscribe(read));
      stops.push(
        projectHandle.on((event) => {
          if (event.type === "replaced") read();
        }),
      );
    } else {
      const read = (): void => {
        const outlineDocId = findProjectOutlineId(
          place.workspaceHandle,
          place.projectId,
        );
        publish({
          outlineDocId,
          projectKind: place.projectKind,
          hasEpisode: true,
          canCreate: canWrite() && isHandleWritable(place.workspaceHandle),
        });
      };
      onRecheck?.(read);
      read();
      stops.push(liveMap(place.workspaceHandle, "documents").subscribe(read));
      stops.push(place.workspaceHandle.status.subscribe(read));
    }
  })().catch(() => {
    // sync unavailable; treat outline as absent
    publish(DEFAULT_LINK);
  });

  return () => {
    stopped = true;
    for (const stop of stops) stop();
  };
}
