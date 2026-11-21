// What the server records of a version: what it changed since the one before it and who wrote it,
// how a list shows it, and the newest version each summary is made against.
import { compareDocs } from "@manent/revisions";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { DocFile, VersionRow, VersionSummary } from "@manent/storage";
import { VERSION_KINDS } from "@manent/sync-protocol";
import type {
  HttpErrorCode,
  VersionContent,
  VersionItem,
  VersionPosition,
  VersionResponse,
} from "@manent/sync-protocol";
import type { Clock, SyncService } from "../sync/ports.ts";
import {
  carryAuthors,
  contentOfDoc,
  materializeVersion,
  soleAuthor,
} from "./content.ts";
import type { LocksAt } from "./content.ts";
import { writeSnapshot } from "./snapshot.ts";

const docOf = (blocks: readonly BlockJSON[]): DocJSON => ({
  type: "doc",
  content: [{ type: "section", content: [...blocks] }],
});

/** Distinct, in the order first seen. */
const union = (...lists: readonly string[][]): string[] => [
  ...new Set(lists.flat()),
];

/**
 * The blocks `content` changed since `previous` (null: an empty document), a moved block among
 * them, and their scenes.
 */
export function summaryOf(
  previous: VersionContent | null,
  content: VersionContent,
  authorIds: string[],
): VersionSummary {
  const changed = compareDocs(
    docOf(previous?.blocks ?? []),
    docOf(content.blocks),
  ).entries.filter((entry) => entry.kind !== "unchanged" || entry.moved);
  return {
    authorIds,
    blockIds: changed.map((entry) => entry.id),
    sceneIds: union(
      changed.flatMap((entry) =>
        entry.sceneId === null ? [] : [entry.sceneId],
      ),
    ),
  };
}

/**
 * Who wrote the log rows after `from` up to `to` when both are positions in one generation;
 * otherwise `createdByUserId` alone.
 */
export function summaryAuthors(
  file: DocFile,
  docId: string,
  from: VersionPosition | null,
  to: VersionPosition | null,
  createdByUserId: string,
): string[] {
  if (from === null || to === null || from.generation !== to.generation)
    return [createdByUserId];
  const { rows } = file.log.tail(docId, to.generation, from.seq, {
    quarantine: false,
  });
  return union(
    rows.filter((row) => row.seq <= to.seq).map((row) => row.userId),
  );
}

/** `into`'s summary with `from`'s joined: each list a union, `into`'s entries first. */
export function joinSummaries(
  into: VersionSummary | null,
  from: VersionSummary,
): VersionSummary {
  return {
    authorIds: union(into?.authorIds ?? [], from.authorIds),
    blockIds: union(into?.blockIds ?? [], from.blockIds),
    sceneIds: union(into?.sceneIds ?? [], from.sceneIds),
  };
}

export const positionOf = ({
  generation,
  seq,
}: VersionRow): VersionPosition | null =>
  generation === null || seq === null ? null : { generation, seq };

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

function readPosition(value: unknown): VersionPosition | null {
  if (!isFields(value)) return null;
  const { generation, seq } = value;
  return isCount(generation) && isCount(seq) ? { generation, seq } : null;
}

function readSummary(value: unknown): VersionItem["summary"] | null {
  if (!isFields(value)) return null;
  const { authorUserIds, changes, scenes } = value;
  if (!Array.isArray(authorUserIds) || !isCount(changes) || !isCount(scenes))
    return null;
  const ids = authorUserIds.filter((id) => typeof id === "string");
  return ids.length === authorUserIds.length
    ? { authorUserIds: ids, changes, scenes }
    : null;
}

/** A stored request's answer read back; null for text this service did not write. */
export function readStoredResponse(text: string): VersionResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // stored text that is not JSON is no answer: the caller refuses the retry like a damaged one
    return null;
  }
  const item = isFields(parsed) ? parsed.version : null;
  if (!isFields(item)) return null;
  const { id, kind, name, createdByUserId, createdAt, onDevice } = item;
  const known = VERSION_KINDS.find((member) => member === kind);
  if (typeof id !== "string" || known === undefined) return null;
  if (name !== null && typeof name !== "string") return null;
  if (typeof createdByUserId !== "string" || !isCount(createdAt)) return null;
  if (typeof onDevice !== "boolean") return null;
  const position = item.position === null ? null : readPosition(item.position);
  const summary = item.summary === null ? null : readSummary(item.summary);
  const { engineVersion } = item;
  if (engineVersion !== null && !isCount(engineVersion)) return null;
  if ((position === null) !== (item.position === null)) return null;
  if ((summary === null) !== (item.summary === null)) return null;
  const version = { id, kind: known, name, createdByUserId, createdAt };
  return {
    version: { ...version, onDevice, position, engineVersion, summary },
  };
}

/** A version as a list shows it: its summary counted, its engine version that of its snapshot, else of the document. */
export function itemOf(file: DocFile, row: VersionRow): VersionItem {
  const position = positionOf(row);
  const summary = file.history.summary(row.id);
  const engineVersion =
    file.history.snapshotOf(row.id)?.engineVersion ??
    (position === null
      ? null
      : (file.log.get(row.docId)?.engineVersion ?? null));
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    onDevice: row.deviceId !== null,
    position,
    engineVersion,
    summary:
      summary === null
        ? null
        : {
            authorUserIds: summary.authorIds,
            changes: summary.blockIds.length,
            scenes: summary.sceneIds.length,
          },
  };
}

/** The newest version of a document and its content: the previous side of the next summary. */
export interface NewestVersion {
  id: string;
  position: VersionPosition | null;
  content: VersionContent;
}

/** How a version is recorded. */
export interface Recording {
  /** Its authors carry from the version before it; else they are its content's own. */
  carry: boolean;
  /** It keeps a snapshot; else it stays a position, pinned. */
  snapshot: boolean;
  /** The request's idempotency key; null when nothing is asked twice. */
  key: string | null;
  /** By default, who wrote the log rows since the version before it. */
  authorIds?: string[];
}

/** A version recorded, or why not; its item is null when there was nothing to record. */
export type Recorded =
  { ok: true; item: VersionItem | null } | { ok: false; code: HttpErrorCode };

/** Versions recorded with their summaries, against each loaded room's newest version, kept in memory. */
export interface Recorder {
  /** The newest version and its content: from memory while it stays the newest, else materialised. */
  previousOf(file: DocFile, docId: string): NewestVersion | null;
  /**
   * In the caller's transaction: `version` holding `base`, its summary against the newest version
   * before it, its snapshot or its pin, and the request's answer. Carried authors give each
   * changed block the summary's one author, else the version's maker.
   */
  record(
    file: DocFile,
    version: VersionRow,
    base: VersionContent,
    how: Recording,
  ): { item: VersionItem; newest: NewestVersion };
  /**
   * A version at the head, recorded at its turn in the write queue by an authority write that
   * writes nothing. Its item is null when it waits for something new and the head is not past
   * the newest version's position; busy when the write could not be made.
   */
  atHead(
    file: DocFile,
    made: Pick<VersionRow, "docId" | "kind" | "name" | "createdByUserId">,
    how: Recording & { onlyWhenNew: boolean },
  ): Promise<Recorded>;
  /** After the commit that recorded it. */
  remember(docId: string, newest: NewestVersion): void;
  /** The room was unloaded. */
  forget(docId: string): void;
}

export function createRecorder(options: {
  sync: () => SyncService;
  clock: Clock;
  ids(): string;
  locksAt: LocksAt;
}): Recorder {
  const { clock, ids, locksAt } = options;
  const newest = new Map<string, NewestVersion>();

  function previousOf(file: DocFile, docId: string): NewestVersion | null {
    const [row] = file.history.page(docId, null, 1);
    if (row === undefined) return null;
    const cached = newest.get(docId);
    if (cached?.id === row.id) return cached;
    const content = materializeVersion(file, row);
    if (content === null) return null;
    const found = { id: row.id, position: positionOf(row), content };
    newest.set(docId, found);
    return found;
  }

  function record(
    file: DocFile,
    version: VersionRow,
    base: VersionContent,
    how: Recording,
  ): { item: VersionItem; newest: NewestVersion } {
    const { docId, id, createdByUserId: userId, createdAt } = version;
    const previous = previousOf(file, docId);
    const position = positionOf(version);
    const was = previous?.position ?? null;
    const authorIds =
      how.authorIds ?? summaryAuthors(file, docId, was, position, userId);
    const author = { userId: soleAuthor(authorIds, userId), at: createdAt };
    const before = previous?.content ?? null;
    const authors = how.carry
      ? carryAuthors(before, base.blocks, author)
      : base.authors;
    const content = { ...base, authors };
    file.versions.add(version);
    file.history.setSummary(id, summaryOf(before, content, authorIds));
    if (how.snapshot) {
      const ref = writeSnapshot(file, content);
      file.history.setSnapshot(id, ref, content.engineVersion);
    } else if (position !== null)
      file.checkpoints.pin(id, docId, position.generation, position.seq);
    const item = itemOf(file, version);
    if (how.key !== null) {
      const result = JSON.stringify({ version: item });
      file.history.putRequest({
        docId,
        key: how.key,
        userId,
        result,
        createdAt,
      });
    }
    return { item, newest: { id, position, content } };
  }

  async function atHead(
    file: DocFile,
    made: Pick<VersionRow, "docId" | "kind" | "name" | "createdByUserId">,
    how: Recording & { onlyWhenNew: boolean },
  ): Promise<Recorded> {
    const { docId } = made;
    const id = ids();
    const state: {
      doc: VersionContent | null;
      written: ReturnType<typeof record> | null;
    } = { doc: null, written: null };
    const result = await options.sync().authorityWrite(docId, {
      userId: made.createdByUserId,
      origin: "system",
      edit(doc) {
        const row = file.log.get(docId);
        if (row === null) throw new RangeError(`no document ${docId} here`);
        state.doc = contentOfDoc(doc, row, {});
        return { ok: true };
      },
      inTransaction(_file, at) {
        const head = { generation: at.generation, seq: at.before };
        const was = previousOf(file, docId)?.position ?? null;
        const row = file.log.get(docId);
        if (state.doc === null || row === null) return;
        const stale =
          was?.generation === head.generation && was.seq >= head.seq;
        if (how.onlyWhenNew && stale) return;
        const { schemaVersion, engineVersion } = row;
        const locks = locksAt(file, docId, head);
        const base = { ...state.doc, schemaVersion, engineVersion, locks };
        const createdAt = clock.now();
        const version = { ...made, id, ...head, createdAt, deviceId: null };
        state.written = record(file, version, base, how);
      },
    });
    if (!result.ok) {
      file.checkpoints.unpin([id]);
      return { ok: false, code: "busy" };
    }
    if (state.written === null) return { ok: true, item: null };
    newest.set(docId, state.written.newest);
    return { ok: true, item: state.written.item };
  }

  return {
    previousOf,
    record,
    atHead,
    remember: (docId, made) => newest.set(docId, made),
    forget: (docId) => newest.delete(docId),
  };
}
