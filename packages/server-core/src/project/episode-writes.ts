// Server-authoritative updates to a series episode's stage, page count, open comment count and lock state
// in its project index after production transitions, comment round changes and draft events.
import { readEpisodes, readProjectMap, writeEpisode } from "@manent/crdt";
import type { CrdtDoc, EpisodeEntry, OpenCount } from "@manent/crdt";
import {
  ENGINE_VERSION,
  applyLayoutPatches,
  engineFor,
  profileFromSettings,
  readLayoutSettings,
} from "@manent/pagination";
import {
  BEFORE_END_NAME,
  lockedPagination,
  productionLayout,
} from "@manent/revisions";
import { blocksOf, sectionize } from "@manent/schema";
import { resolveFollowed } from "@manent/settings";
import type { DocFile, Home, Storage } from "@manent/storage";
import { commentsDocId, indexDocId, isDocId } from "@manent/sync-protocol";
import type { RoundCounts, RoundOpenCount } from "../comments/ports.ts";
import { openVersion } from "../history/content.ts";
import { PRODUCTION_EXTRAS } from "../production/extras.ts";
import { isLocked } from "../production/state.ts";
import { SYSTEM_USER_ID } from "../rebuild/rebuilder.ts";
import type { SyncHooks, SyncService } from "../sync/ports.ts";

export interface EpisodeWritesOptions {
  readonly storage: Storage;
  readonly sync: () => SyncService;
  readonly log?: (error: unknown) => void;
}

export interface ProjectTarget {
  readonly home: Home;
  readonly file: DocFile;
  readonly indexId: string;
}

export interface EpisodeWrites {
  /** Updates an episode's newest-round open comment count when its comments document commits. */
  readonly roundCounts: RoundCounts;
  /** Watches committed production authority writes (lock, import lock, issue, recall, end) to update episodes. */
  readonly hooks: SyncHooks;
  /** Enqueues one serialised authority write updating `scriptDocId`'s episode in `target.indexId`. */
  update(
    target: ProjectTarget,
    scriptDocId: string,
    userId: string,
    buildNext: (
      indexDoc: CrdtDoc,
      current: EpisodeEntry,
    ) => EpisodeEntry | null,
  ): void;
  /** Server-held storage for resolving script targets and reading committed version or production rows. */
  readonly storage: Storage;
  /** Logs an unexpected error from an asynchronous or guarded callback. */
  readonly log: (error: unknown) => void;
}

type ProductionTransition =
  | { readonly kind: "end"; readonly userId: string }
  | {
      readonly kind: "revision";
      readonly stage: string;
      readonly versionId: string;
      readonly locked: boolean;
      readonly userId: string;
    };

/** Server-held project settings (`template` and `style` maps) read from the project index document. */
export function projectSettingsOf(
  indexDoc: CrdtDoc,
): Readonly<Record<string, unknown>> {
  const template = readProjectMap(indexDoc, "template");
  const style = readProjectMap(indexDoc, "style");
  const settings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    if (key !== "project.style" && key !== "project.ladder")
      settings[key] = value;
  }
  if (Object.hasOwn(style, "project.style"))
    settings["project.style"] = style["project.style"];
  return settings;
}

/** The version's page count laid out under frozen settings (when locked) or `resolveFollowed` (when unlocked). */
export function versionPageCount(
  file: DocFile,
  docId: string,
  versionId: string,
  projectSettings: Readonly<Record<string, unknown>>,
): number | null {
  const version = file.history.get(versionId);
  if (version === null || version.docId !== docId) return null;
  const content = openVersion(file, version, PRODUCTION_EXTRAS.locksAt);
  if (content === null) return null;
  const engineVersion =
    content.engineVersion ??
    file.log.get(docId)?.engineVersion ??
    ENGINE_VERSION;
  const engine = engineFor(engineVersion);
  if (engine === null) return null;
  const locked = content.locks !== null;
  const effective = locked
    ? content.settings
    : resolveFollowed(content.settings, projectSettings);
  const layout = readLayoutSettings((key) => effective[key]);
  const profile = profileFromSettings(engine, {
    ...layout,
    scenesNumbered: locked ? true : layout.scenesNumbered,
  });
  if (profile === null) return null;
  const flat = blocksOf(sectionize(content.blocks));
  if (locked && content.locks !== null) {
    const blocks = applyLayoutPatches(
      engine.toLayoutBlocks(flat),
      productionLayout(flat, new Map()),
    );
    return lockedPagination(blocks, profile, content.locks, engine).pagination
      .pages.length;
  }
  return engine.paginate(engine.toLayoutBlocks(flat), profile).pages.length;
}

/** Resolves a script's placed, non-tombstoned project index strictly from server-held directory state. */
export function projectTargetOf(
  storage: Storage,
  docId: string,
): ProjectTarget | null {
  if (!isDocId(docId) || storage.directory.tombstoneOf(docId) !== null)
    return null;
  const place = storage.directory.placeOf(docId);
  if (
    place === null ||
    place.kind !== "script" ||
    place.home.kind !== "project"
  )
    return null;
  const indexId = indexDocId("project", place.home.id);
  if (storage.directory.tombstoneOf(indexId) !== null) return null;
  const indexPlace = storage.directory.placeOf(indexId);
  if (
    indexPlace === null ||
    indexPlace.kind !== "index" ||
    indexPlace.home.kind !== "project" ||
    indexPlace.home.id !== place.home.id
  )
    return null;
  const file = storage.open(place.home);
  if (file.log.get(indexId) === null) return null;
  return { home: place.home, file, indexId };
}

const sameOpenCount = (a: OpenCount | null, b: OpenCount | null): boolean =>
  a === null
    ? b === null
    : b !== null && a.round === b.round && a.open === b.open;

const sameEpisodeState = (a: EpisodeEntry, b: EpisodeEntry): boolean =>
  a.stage === b.stage &&
  a.pages === b.pages &&
  a.locked === b.locked &&
  sameOpenCount(a.openCount, b.openCount);

function episodeByScript(
  indexDoc: CrdtDoc,
  scriptDocId: string,
): EpisodeEntry | null {
  for (const episode of readEpisodes(indexDoc).values())
    if (episode.docIds.script === scriptDocId) return episode;
  return null;
}

/** Resolves a comments document back to its placed, non-tombstoned script in the same project home. */
function scriptOfComments(storage: Storage, commentsId: string): string | null {
  if (
    !isDocId(commentsId) ||
    storage.directory.tombstoneOf(commentsId) !== null
  )
    return null;
  const place = storage.directory.placeOf(commentsId);
  if (
    place === null ||
    place.kind !== "comments" ||
    place.home.kind !== "project"
  )
    return null;
  const scriptId = storage.directory
    .documentsIn(place.home)
    .find((id) => commentsDocId(id) === commentsId);
  if (
    scriptId === undefined ||
    storage.directory.tombstoneOf(scriptId) !== null
  )
    return null;
  return storage.directory.placeOf(scriptId)?.kind === "script"
    ? scriptId
    : null;
}

function newestRound(rounds: readonly RoundOpenCount[]): RoundOpenCount | null {
  let newest: RoundOpenCount | null = null;
  for (const round of rounds) {
    if (
      newest === null ||
      round.createdAt > newest.createdAt ||
      (round.createdAt === newest.createdAt && round.roundId > newest.roundId)
    )
      newest = round;
  }
  return newest;
}

/** Identifies a production transition committed at `pos` strictly from server-held storage rows. */
function productionTransitionAt(
  file: DocFile,
  docId: string,
  pos: { generation: number; seq: number },
): ProductionTransition | null {
  const prod = file.production.get(docId);
  if (prod === null) return null;
  if (prod.endedAt !== null) {
    const endVersion = file.versions
      .list(docId)
      .find(
        (v) =>
          v.name === BEFORE_END_NAME &&
          v.generation === pos.generation &&
          v.seq === pos.seq - 1,
      );
    return endVersion === undefined
      ? null
      : { kind: "end", userId: endVersion.createdByUserId };
  }
  for (const issue of file.production.issues(docId)) {
    const version = file.history.get(issue.versionId);
    if (
      version === null ||
      version.docId !== docId ||
      version.generation !== pos.generation ||
      version.seq !== pos.seq
    )
      continue;
    const set = file.production.sets(docId).find((s) => s.id === issue.setId);
    if (set === undefined) return null;
    return {
      kind: "revision",
      stage: set.name,
      versionId: issue.versionId,
      locked: isLocked(file, docId),
      userId: issue.issuedByUserId,
    };
  }
  const sets = file.production.sets(docId);
  const set0 = sets.find((s) => s.ordinal === 0);
  if (set0 === undefined || set0.issuedVersionId === null) return null;
  const white = file.history.get(set0.issuedVersionId);
  if (
    white === null ||
    white.docId !== docId ||
    white.generation !== pos.generation ||
    white.seq !== pos.seq
  )
    return null;
  const lastIssued =
    sets
      .filter((s) => s.issuedAt !== null && s.issuedVersionId !== null)
      .at(-1) ?? set0;
  return {
    kind: "revision",
    stage: lastIssued.name,
    versionId: lastIssued.issuedVersionId ?? set0.issuedVersionId,
    locked: isLocked(file, docId),
    userId: prod.lockedByUserId,
  };
}

/**
 * Server-authoritative writer for episode `stage`, `pages`, `openCount` and `locked` in each project's index.
 * Every access and target decision reads server-held storage and serialises updates per project index.
 */
export function createEpisodeWrites(
  options: EpisodeWritesOptions,
): EpisodeWrites {
  const { storage, sync } = options;
  const log = options.log ?? (() => {});
  const chains = new Map<string, Promise<void>>();

  function enqueue(indexId: string, run: () => Promise<void>): void {
    const before = chains.get(indexId);
    const next = (before === undefined ? run() : before.then(run)).catch(
      (error: unknown) => {
        log(error);
      },
    );
    chains.set(indexId, next);
    void next.then(() => {
      if (chains.get(indexId) === next) chains.delete(indexId);
    });
  }

  function update(
    target: ProjectTarget,
    scriptDocId: string,
    userId: string,
    buildNext: (
      indexDoc: CrdtDoc,
      current: EpisodeEntry,
    ) => EpisodeEntry | null,
  ): void {
    enqueue(target.indexId, async () => {
      if (
        storage.directory.tombstoneOf(target.indexId) !== null ||
        target.file.log.get(target.indexId) === null
      )
        return;
      await sync().authorityWrite(target.indexId, {
        userId,
        origin: "system",
        edit(indexDoc) {
          const current = episodeByScript(indexDoc, scriptDocId);
          if (current === null) return { ok: false, reason: "no_episode" };
          const next = buildNext(indexDoc, current);
          if (next === null || sameEpisodeState(current, next))
            return { ok: false, reason: "unchanged" };
          writeEpisode(indexDoc, next);
          return { ok: true };
        },
        inTransaction() {},
      });
    });
  }

  return {
    storage,
    log,
    update,
    roundCounts: {
      counted(commentsId, rounds) {
        const scriptId = scriptOfComments(storage, commentsId);
        if (scriptId === null) return;
        const target = projectTargetOf(storage, scriptId);
        if (target === null) return;
        const newest = newestRound(rounds);
        const openCount: OpenCount | null =
          newest === null ? null : { round: newest.name, open: newest.open };
        update(target, scriptId, SYSTEM_USER_ID, (_indexDoc, ep) => ({
          ...ep,
          openCount,
        }));
      },
    },
    hooks: {
      committed({ room, sender, seq }) {
        if (
          sender !== null ||
          room.kind !== "script" ||
          room.home.kind !== "project"
        )
          return;
        const target = projectTargetOf(storage, room.docId);
        if (target === null) return;
        const transition = productionTransitionAt(target.file, room.docId, {
          generation: room.row.generation,
          seq,
        });
        if (transition === null) return;
        if (transition.kind === "end") {
          update(target, room.docId, transition.userId, (_indexDoc, ep) =>
            ep.locked ? { ...ep, locked: false } : null,
          );
          return;
        }
        update(target, room.docId, transition.userId, (indexDoc, ep) => {
          const pages = versionPageCount(
            target.file,
            room.docId,
            transition.versionId,
            projectSettingsOf(indexDoc),
          );
          return {
            ...ep,
            stage: transition.stage,
            pages,
            locked: transition.locked,
          };
        });
      },
    },
  };
}
