// How a production request runs: a document's requests one at a time, a retry answered from its stored
// result, the checks, then one authority write committing the request's rows and result with its edit.
import { scriptSettings } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { formatRevisionDate } from "@manent/revisions";
import type { DocFile, Storage, VersionRow } from "@manent/storage";
import { isRequestKey } from "@manent/sync-protocol";
import type {
  Capability,
  ControlKind,
  HistoryControl,
  ProductionRefusal,
  VersionContent,
} from "@manent/sync-protocol";
import type { DraftEvents } from "../history/draft-events.ts";
import type { HistoryService } from "../history/service.ts";
import type { SettingRules, SyncService } from "../sync/ports.ts";
import { isProductionRefusal, refused } from "./outcome.ts";
import type { ProductionOutcome, ProductionRefused } from "./outcome.ts";
import type { RenderPdf } from "./ports.ts";

export interface ProductionOptions {
  storage: Storage;
  sync: () => SyncService;
  history: HistoryService;
  now: () => number;
  ids: () => string;
  names: (userId: string) => string;
  renderPdf: RenderPdf;
  rules: SettingRules;
  /** Told of each issue after its commit; absent, nobody is. */
  draftEvents?: DraftEvents;
  /** The settings of the project that holds the document, null for none; absent, no document has any. */
  projectSettings?: (docId: string) => Readonly<Record<string, unknown>> | null;
}

/** Where an authority write lands: `before` the head before it, `seq` its update's (null: it wrote nothing). */
export interface WriteAt {
  generation: number;
  before: number;
  seq: number | null;
}

export interface Position {
  generation: number;
  seq: number;
}

/** One kind of mutating request, made for one request and holding what its edit computes. */
export interface Mutation<T> {
  readonly docId: string;
  readonly key: string;
  readonly need: Capability;
  /** Sent after the commit, each with `{ v, headSeq }`, before `version_created` for each version kept. */
  readonly tells: readonly ControlKind[];
  /** The operation's own precondition on the stored state; null lets the write go ahead. */
  check(file: DocFile): ProductionRefused | null;
  /** At the write's turn, every push queued before it in: what the operation computes, and its edit of the script. */
  edit(
    doc: CrdtDoc,
    file: DocFile,
  ): { ok: true } | { ok: false; reason: ProductionRefusal };
  /** Inside the commit, `pos` the position its rows take: the rows; returns the versions it kept. */
  commit(file: DocFile, at: WriteAt, pos: Position): VersionRow[];
  /** Inside the commit, after `commit`: the answer, stored with the request. */
  answer(file: DocFile): T;
  /** A stored answer read back. */
  isAnswer(value: unknown): value is T;
  /** After the commit, before the answer; a retry answered from its stored result never reaches it. */
  afterCommit?(): void;
}

export interface Requests {
  /** The placed document's file, when `userId` holds a role on it. */
  open(
    userId: string,
    docId: string,
  ): { ok: true; file: DocFile } | ProductionRefused;
  mutate<T>(
    userId: string,
    mutation: Mutation<T>,
  ): Promise<ProductionOutcome<T>>;
  /** Inside a commit: a version of the document at `at`, holding `content` (null: the head). */
  keep(
    file: DocFile,
    made: {
      docId: string;
      userId: string;
      kind: "named" | "revision_issue";
      name: string;
      at: Position;
    },
    content: VersionContent | null,
  ): VersionRow;
}

// The setting every locked script holds, rewritten as it is so that a production write always appends.
const NUMBERING_KEY = "script.numbering";

/**
 * Rewrites the numbering setting with its own value and meta. Each anchor table must start at a
 * position of its own, so every production write appends an update, even one that changes no text.
 */
function advanceHead(doc: CrdtDoc, userId: string, now: number): void {
  const settings = scriptSettings(doc);
  const value = settings.entries()[NUMBERING_KEY] ?? null;
  const meta = settings.meta(NUMBERING_KEY) ?? {
    userId,
    setAt: now,
    replaced: null,
  };
  settings.set(NUMBERING_KEY, value, meta);
}

/** A calendar day written YYYY-MM-DD. */
export function isDay(value: string): boolean {
  try {
    formatRevisionDate(value);
    return true;
  } catch {
    // formatRevisionDate refuses only what is not a day
    return false;
  }
}

const encode = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(value));

function readStored(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // text this service did not write is no answer: the retry is refused as a bad request
    return null;
  }
}

/** `committed` is told after each commit of a request, before its answer. */
export function createRequests(
  options: ProductionOptions & { committed(docId: string): void },
): Requests {
  const { storage, now } = options;
  /** By document: the tail of its requests, which run one at a time. */
  const chains = new Map<string, Promise<void>>();

  function inChain<T>(docId: string, run: () => Promise<T>): Promise<T> {
    const before = chains.get(docId);
    const next = before === undefined ? run() : before.then(run);
    const tail = next.then(
      () => {},
      () => {},
    );
    chains.set(docId, tail);
    void tail.then(() => {
      if (chains.get(docId) === tail) chains.delete(docId);
    });
    return next;
  }

  function placed(docId: string): DocFile | null {
    const place = storage.directory.placeOf(docId);
    return place === null ? null : storage.open(place.home);
  }

  /** After the commit: the production kinds, then each version kept, to every editor and viewer. */
  function tell(
    file: DocFile,
    userId: string,
    { docId, tells }: { docId: string; tells: readonly ControlKind[] },
    kept: readonly VersionRow[],
  ): void {
    const sync = options.sync();
    const headSeq = file.log.get(docId)?.headSeq ?? 0;
    for (const kind of tells)
      sync.broadcast(docId, kind, encode({ v: 1, headSeq }));
    for (const version of kept) {
      const control: HistoryControl = {
        kind: "version_created",
        versionId: version.id,
        userId,
        at: now(),
        name: version.name,
        versionAt: version.createdAt,
        scene: null,
        beforeVersionId: null,
      };
      sync.broadcast(docId, "version_created", encode(control));
    }
  }

  async function write<T>(
    file: DocFile,
    userId: string,
    mutation: Mutation<T>,
  ): Promise<ProductionOutcome<T>> {
    const { docId, key } = mutation;
    const made: { answer: T; kept: VersionRow[] }[] = [];
    const result = await options.sync().authorityWrite(docId, {
      userId,
      origin: "system",
      edit(doc) {
        let wrote = false;
        const stop = doc.subscribe(() => {
          wrote = true;
        });
        try {
          const edited = mutation.edit(doc, file);
          if (edited.ok && !wrote) advanceHead(doc, userId, now());
          return edited;
        } finally {
          stop();
        }
      },
      inTransaction(inFile, at) {
        const pos = { generation: at.generation, seq: at.seq ?? at.before };
        const kept = mutation.commit(inFile, at, pos);
        const answer = mutation.answer(inFile);
        inFile.production.putRequest({
          docId,
          key,
          userId,
          status: 200,
          result: JSON.stringify(answer),
          createdAt: now(),
        });
        made.push({ answer, kept });
      },
    });
    if (!result.ok)
      return result.code === "refused" && isProductionRefusal(result.reason)
        ? refused(result.reason)
        : refused("busy");
    const [done] = made;
    if (done === undefined) return refused("busy");
    options.committed(docId);
    mutation.afterCommit?.();
    tell(file, userId, mutation, done.kept);
    return { ok: true, value: done.answer };
  }

  async function attempt<T>(
    userId: string,
    mutation: Mutation<T>,
  ): Promise<ProductionOutcome<T>> {
    const { docId, key } = mutation;
    const file = placed(docId);
    if (file === null) return refused("not_found");
    const stored = file.production.request(docId, key);
    if (stored !== null) {
      const answer =
        stored.userId === userId ? readStored(stored.result) : null;
      return mutation.isAnswer(answer)
        ? { ok: true, value: answer }
        : refused("bad_request");
    }
    if (storage.directory.tombstoneOf(docId) !== null)
      return refused("not_found");
    const capabilities = options.sync().access.capabilitiesOf(userId, docId);
    if (capabilities === null || !capabilities.includes(mutation.need))
      return refused("forbidden");
    return mutation.check(file) ?? (await write(file, userId, mutation));
  }

  return {
    open(userId, docId) {
      const file = placed(docId);
      if (file === null || storage.directory.tombstoneOf(docId) !== null)
        return refused("not_found");
      return options.sync().access.capabilitiesOf(userId, docId) === null
        ? refused("forbidden")
        : { ok: true, file };
    },
    mutate(userId, mutation) {
      if (!isRequestKey(mutation.key))
        return Promise.resolve(refused("bad_request"));
      return inChain(mutation.docId, () => attempt(userId, mutation));
    },
    keep(file, { docId, userId, kind, name, at }, content) {
      const version: VersionRow = {
        id: options.ids(),
        docId,
        generation: at.generation,
        seq: at.seq,
        kind,
        name,
        createdByUserId: userId,
        createdAt: now(),
        deviceId: null,
      };
      options.history.keep(file, version, content ?? undefined);
      return version;
    },
  };
}
