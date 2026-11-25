// What the server records of a version: what it changed since the one before it and who wrote it,
// how a list shows it, and the newest version each summary is made against.
import { compareDocs } from "@manent/revisions";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type {
  DocFile,
  VersionPageRow,
  VersionRow,
  VersionSummary,
} from "@manent/storage";
import type {
  HttpErrorCode,
  VersionContent,
  VersionItem,
  VersionPosition,
} from "@manent/sync-protocol";
import type { Clock, SyncService } from "../sync/ports.ts";
import { isStorageError } from "../sync/storage-error.ts";
import {
  carryAuthors,
  contentOfDoc,
  materializeVersion,
  soleAuthor,
} from "./content.ts";
import type { LocksAt } from "./content.ts";
import {
  carryRundownAuthors,
  isContentUnchanged,
  summarizeRundownVersion,
} from "./rundown-summary.ts";
import { writeSnapshot } from "./snapshot.ts";

const docOf = (blocks: readonly BlockJSON[]): DocJSON => ({
  type: "doc",
  content: [{ type: "section", content: [...blocks] }],
});
const union = (...lists: readonly string[][]): string[] => [
  ...new Set(lists.flat()),
];

/** What `content` changed since `previous` (null: empty document), dispatching rundown versions via `compareRundowns`. */
export function summaryOf(
  previous: VersionContent | null,
  content: VersionContent,
  authorIds: string[],
): VersionSummary {
  if (content.rundown !== undefined)
    return summarizeRundownVersion(previous, content, authorIds);
  const changed = compareDocs(
    docOf(previous?.blocks ?? []),
    docOf(content.blocks),
  ).entries.filter((entry) => entry.kind !== "unchanged" || entry.moved);
  const sceneIds = union(
    changed.flatMap((entry) => (entry.sceneId === null ? [] : [entry.sceneId])),
  );
  return { authorIds, blockIds: changed.map((e) => e.id), sceneIds };
}

/** Who wrote the log rows after `from` up to `to` in one generation; else `createdByUserId` alone. */
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
    throughSeq: to.seq,
  });
  return union(rows.map((row) => row.userId));
}

/** `into`'s summary with `from`'s joined: each list a union, `into`'s entries first. */
export const joinSummaries = (
  into: VersionSummary | null,
  from: VersionSummary,
): VersionSummary => ({
  authorIds: union(into?.authorIds ?? [], from.authorIds),
  blockIds: union(into?.blockIds ?? [], from.blockIds),
  sceneIds: union(into?.sceneIds ?? [], from.sceneIds),
});

export const positionOf = ({
  generation,
  seq,
}: VersionRow): VersionPosition | null =>
  generation === null || seq === null ? null : { generation, seq };

const formatVersionItem = (
  row: VersionRow,
  engineVersion: number | null,
  summary: VersionSummary | null,
): VersionItem => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  createdByUserId: row.createdByUserId,
  createdAt: row.createdAt,
  onDevice: row.deviceId !== null,
  position: positionOf(row),
  engineVersion,
  summary:
    summary === null
      ? null
      : {
          authorUserIds: summary.authorIds,
          changes: summary.blockIds.length,
          scenes: summary.sceneIds.length,
        },
});

/** A pre-joined page row as a list shows it, avoiding per-row summary/snapshot/document queries. */
export function itemOfPageRow(
  row: VersionPageRow,
  docEngineVersion: number | null,
): VersionItem {
  const snapshotEngine = row.snapshotRef !== null ? row.engineVersion : null;
  const engineVersion =
    snapshotEngine ?? (positionOf(row) === null ? null : docEngineVersion);
  return formatVersionItem(row, engineVersion, row.summary);
}

/** A version as a list shows it: its summary counted, its engine version that of its snapshot, else of the document. */
export function itemOf(file: DocFile, row: VersionRow): VersionItem {
  const summary = file.history.summary(row.id);
  const engineVersion =
    file.history.snapshotOf(row.id)?.engineVersion ??
    (positionOf(row) === null
      ? null
      : (file.log.get(row.docId)?.engineVersion ?? null));
  return formatVersionItem(row, engineVersion, summary);
}

export interface NewestVersion {
  id: string;
  position: VersionPosition | null;
  content: VersionContent | null;
}

export interface Recording {
  carry: boolean;
  snapshot: boolean;
  key: string | null;
  authorIds?: string[];
}

export type Recorded =
  { ok: true; item: VersionItem | null } | { ok: false; code: HttpErrorCode };

export interface Recorder {
  previousOf(file: DocFile, docId: string): NewestVersion | null;
  record(
    file: DocFile,
    version: VersionRow,
    base: VersionContent,
    how: Recording,
    previous: NewestVersion | null,
  ): { item: VersionItem; newest: NewestVersion };
  recordAlone(
    file: DocFile,
    version: VersionRow,
    base: VersionContent,
    how: Recording,
  ): { ok: true; item: VersionItem } | { ok: false; code: HttpErrorCode };
  atHead(
    file: DocFile,
    made: Pick<VersionRow, "docId" | "kind" | "name" | "createdByUserId">,
    how: Recording & { onlyWhenNew: boolean },
  ): Promise<Recorded>;
  forget(docId: string): void;
}

interface Summarized {
  content: VersionContent;
  summary: VersionSummary;
}

function summarized(
  file: DocFile,
  version: VersionRow,
  base: VersionContent,
  how: Recording,
  previous: NewestVersion | null,
): Summarized {
  const { docId, createdByUserId: userId, createdAt } = version;
  const was = previous?.position ?? null;
  const position = positionOf(version);
  const authorIds =
    how.authorIds ?? summaryAuthors(file, docId, was, position, userId);
  const author = { userId: soleAuthor(authorIds, userId), at: createdAt };
  const before = previous?.content ?? null;
  const authors = !how.carry
    ? base.authors
    : base.rundown !== undefined
      ? carryRundownAuthors(base.rundown, before, author)
      : carryAuthors(before, base.blocks, author);
  const content = { ...base, authors };
  return { content, summary: summaryOf(before, content, authorIds) };
}

function write(
  file: DocFile,
  version: VersionRow,
  { content, summary }: Summarized,
  how: Recording,
): { item: VersionItem; newest: NewestVersion } {
  const { docId, id, createdByUserId: userId, createdAt } = version;
  const position = positionOf(version);
  file.versions.add(version);
  file.history.setSummary(id, summary);
  if (how.snapshot)
    file.history.setSnapshot(
      id,
      writeSnapshot(file, content),
      content.engineVersion,
    );
  else if (position !== null)
    file.checkpoints.pin(id, docId, position.generation, position.seq);
  const item = itemOf(file, version);
  if (how.key !== null)
    file.history.putRequest({
      docId,
      key: how.key,
      userId,
      result: JSON.stringify({ version: item }),
      createdAt,
    });
  return { item, newest: { id, position, content } };
}

const record: Recorder["record"] = (file, version, base, how, previous) =>
  write(file, version, summarized(file, version, base, how, previous), how);

const newestRow = (file: DocFile, docId: string): VersionRow | undefined =>
  file.history.page(docId, null, 1)[0];

interface AtHeadState {
  doc: VersionContent | null;
  previous: NewestVersion | null;
  written: { item: VersionItem; newest: NewestVersion } | null;
  raced: boolean;
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
    const row = newestRow(file, docId);
    if (row === undefined) return null;
    const { id } = row;
    const cached = newest.get(docId);
    if (cached?.id === id) return cached;
    try {
      const content = materializeVersion(file, row);
      if (content !== null) return { id, position: positionOf(row), content };
    } catch (error) {
      if (!isStorageError(error) || error.code !== "corrupt") throw error;
    }
    return { id, position: null, content: null };
  }

  function recordAlone(
    file: DocFile,
    version: VersionRow,
    base: VersionContent,
    how: Recording,
  ): ReturnType<Recorder["recordAlone"]> {
    const { docId } = version;
    try {
      const { item } = file.transaction(() =>
        record(file, version, base, how, previousOf(file, docId)),
      );
      return { ok: true, item };
    } catch (error) {
      if (!isStorageError(error)) throw error;
      return { ok: false, code: "busy" };
    } finally {
      newest.delete(docId);
    }
  }

  async function atHead(
    file: DocFile,
    made: Pick<VersionRow, "docId" | "kind" | "name" | "createdByUserId">,
    how: Recording & { onlyWhenNew: boolean },
  ): Promise<Recorded> {
    const { docId } = made;
    const id = ids();
    const state: AtHeadState = {
      doc: null,
      previous: null,
      written: null,
      raced: false,
    };
    const result = await options.sync().authorityWrite(docId, {
      userId: made.createdByUserId,
      origin: "system",
      edit(live) {
        const row = file.log.get(docId);
        if (row === null) throw new RangeError(`no document ${docId} here`);
        state.previous = previousOf(file, docId);
        state.doc = contentOfDoc(live, row, {});
        return { ok: true };
      },
      inTransaction(_file, at) {
        const head = { generation: at.generation, seq: at.before };
        const row = file.log.get(docId);
        const { doc, previous } = state;
        if (doc === null || row === null) return;
        state.raced = newestRow(file, docId)?.id !== previous?.id;
        const was = previous?.position ?? null;
        if (
          state.raced ||
          (how.onlyWhenNew &&
            was?.generation === head.generation &&
            was.seq >= head.seq)
        )
          return;
        const { schemaVersion, engineVersion } = row;
        const base = {
          ...doc,
          schemaVersion,
          engineVersion,
          locks: locksAt(file, docId, head),
        };
        const version = {
          ...made,
          id,
          ...head,
          createdAt: clock.now(),
          deviceId: null,
        };
        const change = summarized(file, version, base, how, previous);
        if (
          how.onlyWhenNew &&
          isContentUnchanged(previous, change.content, change.summary)
        )
          return;
        state.written = write(file, version, change, how);
      },
    });
    if (!result.ok || state.raced) {
      file.checkpoints.unpin([id]);
      return { ok: false, code: "busy" };
    }
    const kept = state.written?.newest ?? state.previous;
    if (kept !== null) newest.set(docId, kept);
    return { ok: true, item: state.written?.item ?? null };
  }

  return {
    previousOf,
    record,
    recordAlone,
    atHead,
    forget: (id) => newest.delete(id),
  };
}
