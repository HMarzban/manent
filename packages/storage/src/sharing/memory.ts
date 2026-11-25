// The sharing tables kept in memory, for the in-memory driver.
import type {
  DocDirectory,
  DraftLinkRow,
  DraftOpenRow,
  DraftOpenStats,
  DraftSendRow,
  GroupGrant,
  ReaderReadRow,
  ShareLinkRow,
  ShareLinkStore,
  SharingStore,
} from "../ports/index.ts";

const pairKey = (a: string, b: string): string => JSON.stringify([a, b]);

/** One document file's sharing rows. Values are replaced, never changed in place. */
export interface SharingTables {
  sends: DraftSendRow[];
  opens: DraftOpenRow[];
  /** By docId and userId. */
  reads: Map<string, ReaderReadRow>;
}

/** A copy that a transaction may change without touching `tables`. */
export function copySharingTables(
  tables: SharingTables | undefined,
): SharingTables {
  return {
    sends: [...(tables?.sends ?? [])],
    opens: [...(tables?.opens ?? [])],
    reads: new Map(tables?.reads),
  };
}

// As SQLite orders `sent_at DESC, id DESC`.
const newestFirst = (a: DraftSendRow, b: DraftSendRow) =>
  b.sentAt - a.sentAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** The store over `read` and `write`, which give the file's tables as one transaction sees them. */
export function createMemorySharing(options: {
  read: () => SharingTables;
  write: <T>(op: (tables: SharingTables) => T) => T;
}): SharingStore {
  const { read, write } = options;
  const sendsOf = (docId: string) =>
    read()
      .sends.filter((s) => s.docId === docId)
      .toSorted(newestFirst)
      .map((s) => structuredClone(s));
  const opensOf = (sendId: string) =>
    read().opens.filter((o) => o.sendId === sendId);
  return {
    addSend: (send) => write((t) => t.sends.push(structuredClone(send))),
    sendOf(sendId) {
      const send = read().sends.find((s) => s.id === sendId);
      return send === undefined ? null : structuredClone(send);
    },
    sendsOf,
    newestSendTo: (docId, groupId) =>
      sendsOf(docId).find((s) => s.groupIds.includes(groupId)) ?? null,
    addOpen: (open) => write((t) => t.opens.push({ ...open })),
    openersOf: (sendId) =>
      [...new Set(opensOf(sendId).flatMap((o) => o.userId ?? []))].toSorted(),
    openCount: (sendId) => opensOf(sendId).length,
    openStatsOf(sendIds) {
      const wanted = new Set(sendIds);
      const bySend = new Map<
        string,
        { openers: Set<string>; totalOpens: number }
      >();
      for (const open of read().opens) {
        if (!wanted.has(open.sendId)) continue;
        let entry = bySend.get(open.sendId);
        if (entry === undefined) {
          entry = { openers: new Set(), totalOpens: 0 };
          bySend.set(open.sendId, entry);
        }
        entry.totalOpens += 1;
        if (open.userId !== null) entry.openers.add(open.userId);
      }
      const result = new Map<string, DraftOpenStats>();
      for (const [sendId, entry] of bySend) {
        result.set(sendId, {
          openers: [...entry.openers].toSorted(),
          totalOpens: entry.totalOpens,
        });
      }
      return result;
    },
    putRead: (row) =>
      write(
        (t) => void t.reads.set(pairKey(row.docId, row.userId), { ...row }),
      ),
    readOf(docId, userId) {
      const row = read().reads.get(pairKey(docId, userId));
      return row === undefined
        ? null
        : { versionId: row.versionId, readAt: row.readAt };
    },
  };
}

/** The control file's sharing rows; the roles themselves are the directory's. */
export interface ShareLinkTables {
  /** By docId and userId; a role holder with none came from `own`. */
  sources: Map<string, string>;
  /** By docId and userId. */
  lastActive: Map<string, number>;
  /** By docId and groupId. */
  groupGrants: Map<string, GroupGrant & { docId: string }>;
  /** By id. */
  shareLinks: Map<string, ShareLinkRow>;
  /** By id. */
  draftLinks: Map<string, DraftLinkRow>;
}

export function createShareLinkTables(): ShareLinkTables {
  return {
    sources: new Map(),
    lastActive: new Map(),
    groupGrants: new Map(),
    shareLinks: new Map(),
    draftLinks: new Map(),
  };
}

const isSameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

const withOwnBytes = <T extends { tokenHash: Uint8Array }>(row: T): T => ({
  ...row,
  tokenHash: new Uint8Array(row.tokenHash),
});

// As SQLite orders `created_at, id`.
const oldestFirst = (a: ShareLinkRow, b: ShareLinkRow) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const byHash = <T extends { tokenHash: Uint8Array }>(
  rows: Map<string, T>,
  tokenHash: Uint8Array,
): T | null => {
  const row = [...rows.values()].find((r) =>
    isSameBytes(r.tokenHash, tokenHash),
  );
  return row === undefined ? null : withOwnBytes(row);
};

/** The store over the storage's tables; `commit` writes through whatever fault is armed, and `directory` holds the roles. */
export function createMemoryShareLinks(options: {
  now: () => number;
  read: () => ShareLinkTables;
  commit: <T>(apply: () => T) => T;
  directory: DocDirectory;
}): ShareLinkStore {
  const { now, read, commit, directory } = options;
  const sourceOf = (key: string) => read().sources.get(key) ?? "own";
  return {
    // The directory commits the role, then this store its source: two commits where SQLite makes one.
    grant(docId, userId, role, source) {
      const key = pairKey(docId, userId);
      const held = directory.roleOf(docId, userId);
      directory.setRole(docId, userId, role, held?.capabilities ?? []);
      commit(() => {
        read().sources.set(key, source);
        if (held === null) read().lastActive.delete(key);
      });
    },
    ungrant(docId, userId, source) {
      const key = pairKey(docId, userId);
      if (directory.roleOf(docId, userId) === null) return;
      if (sourceOf(key) !== source) return;
      directory.removeRole(docId, userId);
      commit(() => {
        read().sources.delete(key);
        read().lastActive.delete(key);
      });
    },
    grantsOf: (docId) =>
      directory.rolesOf(docId).map(({ userId, role }) => ({
        userId,
        role,
        source: sourceOf(pairKey(docId, userId)),
      })),
    markActive(docId, userId) {
      if (directory.roleOf(docId, userId) === null) return;
      commit(() => void read().lastActive.set(pairKey(docId, userId), now()));
    },
    lastActiveOf: (docId) =>
      directory.rolesOf(docId).map(({ userId }) => ({
        userId,
        lastActiveAt: read().lastActive.get(pairKey(docId, userId)) ?? null,
      })),
    grantGroup: (docId, groupId, role) =>
      commit(
        () =>
          void read().groupGrants.set(pairKey(docId, groupId), {
            docId,
            groupId,
            role,
          }),
      ),
    ungrantGroup: (docId, groupId) =>
      commit(() => void read().groupGrants.delete(pairKey(docId, groupId))),
    groupGrantsOf: (docId) =>
      [...read().groupGrants.values()]
        .filter((g) => g.docId === docId)
        .map(({ groupId, role }) => ({ groupId, role }))
        .toSorted((a, b) => (a.groupId < b.groupId ? -1 : 1)),
    addShareLink(link) {
      const row = { ...withOwnBytes(link), revokedAt: null, createdAt: now() };
      commit(() => void read().shareLinks.set(link.id, row));
    },
    revokeShareLink(id) {
      const row = read().shareLinks.get(id);
      if (row === undefined || row.revokedAt !== null) return;
      const revoked = { ...row, revokedAt: now() };
      commit(() => void read().shareLinks.set(id, revoked));
    },
    shareLinkOf: (tokenHash) => byHash(read().shareLinks, tokenHash),
    shareLinksOf: (docId) =>
      [...read().shareLinks.values()]
        .filter((l) => l.docId === docId)
        .toSorted(oldestFirst)
        .map(withOwnBytes),
    addDraftLink(link) {
      const row = { ...withOwnBytes(link), createdAt: now() };
      commit(() => void read().draftLinks.set(link.id, row));
    },
    draftLinkOf: (tokenHash) => byHash(read().draftLinks, tokenHash),
  };
}
