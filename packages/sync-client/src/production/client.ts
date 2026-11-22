// The production client: the state the authority sequences, shown from this device's cache first and
// kept current, and the requests that change it, each sent under one key until it is answered.
import { PRODUCTION_REFUSALS, isProductionState } from "@manent/sync-protocol";
import type {
  ControlKind,
  ImportLockRequest,
  IssueFile,
  IssueRequest,
  IssueResponse,
  LayoutRequest,
  LockAnchorRecord,
  LockRequest,
  PagesRequest,
  ProductionRefusal,
  ProductionRefusalBody,
  ProductionState,
  RecallRequest,
  VersionContent,
} from "@manent/sync-protocol";
import { backoffDelayMs } from "../link/backoff.ts";
import { createSubscribable } from "../outbox/subscribable.ts";
import { ACK_TIMEOUT_MS } from "../ports/defaults.ts";
import type { Clock, DocStatus, Subscribable } from "../ports/ports.ts";
import { ConnectError } from "../ports/ports.ts";
import type { DocEvent, DocHandle } from "../session/doc-handle.ts";
import { isFields } from "../upstream/events.ts";
import { isVersionContent } from "./cache.ts";
import type { CachedProduction, ProductionCache } from "./cache.ts";
import type { ProductionTransport } from "./transport.ts";

/** `offline`: no answer within ACK_TIMEOUT_MS; `body` is the refusal's, null when offline. */
export type RequestOutcome<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: ProductionRefusal | "offline";
      body: ProductionRefusalBody | null;
    };

/** A request as the caller gives it: the client adds the document, and a key unless the caller holds one (Keyed). */
type Keyed<R> = Omit<R, "docId">;
type Unkeyed<R> = Omit<R, "docId" | "key">;
type Answered<T> = Promise<RequestOutcome<T>>;

interface OfflineIssue {
  byName: string;
  name: string;
  active: string;
}

/**
 * Every mutating request but `issue` and `recall` waits until the document is
 * synced; every request is tried again under the same key while the server
 * cannot be reached, for up to ACK_TIMEOUT_MS.
 */
export interface ProductionClient {
  /** Read from the cache first, then kept current; null while nothing is known. */
  current(): Subscribable<CachedProduction | null>;
  /** This device's changes not yet acknowledged; Issue and Recall are disabled while it is above 0. */
  waiting(): Subscribable<number>;
  /** Set once per issue made while this device was offline with changes waiting; cleared by `dismiss`. */
  issuedWhileOffline(): Subscribable<OfflineIssue | null>;
  dismiss(): void;
  lock(request: Unkeyed<LockRequest>): Answered<ProductionState>;
  pages(request: Unkeyed<PagesRequest>): Answered<ProductionState>;
  layout(request: Unkeyed<LayoutRequest>): Answered<ProductionState>;
  unlock(): Answered<ProductionState>;
  end(): Answered<ProductionState>;
  /** The import record holds the key, so a retry from another tab or a later session sends the same one. */
  importLock(request: Keyed<ImportLockRequest>): Answered<ProductionState>;
  /** The screen holds the key, so a second press retries the same issue. */
  issue(request: Keyed<IssueRequest>): Answered<IssueResponse>;
  recall(request: Keyed<RecallRequest>): Answered<IssueResponse>;
  /** The issued file's PDF bytes. */
  file(issueId: string, file: IssueFile): Answered<Uint8Array>;
  dispose(): void;
}

interface ProductionOptions {
  docId: string;
  handle: DocHandle;
  transport: ProductionTransport;
  cache: ProductionCache;
  random: { bytes(n: number): Uint8Array };
  clock: Clock;
}

type Answer = Awaited<ReturnType<ProductionTransport["post"]>>;
/** The value a body holds; null for a body that does not read as one. */
type Read<T> = (body: unknown) => T | null;
type Settable<T> = Subscribable<T> & { set(value: T): void };
type Subscribed = Extract<DocEvent, { type: "subscribed" }>;

/** A subscription made with changes waiting: when this device was last synced, and the state it held then. */
interface Reconnection {
  since: number | null;
  before: ProductionState | null;
}

/** The CONTROL kinds after which the state is asked again. */
const PRODUCTION_KINDS: readonly ControlKind[] = Object.freeze([
  "revision_issued",
  "revision_recalled",
  "lock_anchors_changed",
  "layout_changed",
]);

const isString = (value: unknown): value is string => typeof value === "string";

/** Null for a body naming no refusal this build knows; `issued` is null wherever it does not read. */
function readRefusal(body: unknown): ProductionRefusalBody | null {
  if (!isFields(body)) return null;
  const error = PRODUCTION_REFUSALS.find((refusal) => refusal === body.error);
  if (error === undefined) return null;
  if (!isFields(body.issued)) return { error, issued: null };
  const { name, byName, issuedAt, nextName } = body.issued;
  return isString(name) &&
    isString(byName) &&
    typeof issuedAt === "number" &&
    isString(nextName)
    ? { error, issued: { name, byName, issuedAt, nextName } }
    : { error, issued: null };
}

const readState: Read<ProductionState> = (body) =>
  isProductionState(body) ? body : null;

/** The issue is read from the state's own list, to the depth `isProductionState` checks. */
const readIssueResponse: Read<IssueResponse> = (body) => {
  if (!isFields(body) || !isProductionState(body.state)) return null;
  const issueId = isFields(body.issue) ? body.issue.issueId : null;
  const issue = body.state.issues.find((held) => held.issueId === issueId);
  return issue === undefined ? null : { state: body.state, issue };
};

const readContent: Read<VersionContent> = (body) =>
  isFields(body) && isVersionContent(body.content) ? body.content : null;

const readBytes: Read<Uint8Array> = (body) =>
  body instanceof Uint8Array ? body : null;

/** Null for an answer this build cannot read, which is asked again as an unreachable server is. */
async function answerOf<T>(
  ask: () => Promise<Answer>,
  read: Read<T>,
): Promise<RequestOutcome<T> | null> {
  const answer = await ask().catch((error: unknown) => {
    if (error instanceof ConnectError) return null;
    throw error;
  });
  if (answer === null) return null;
  if (answer.status === 200) {
    const value = read(answer.body);
    return value === null ? null : { ok: true, value };
  }
  const body = readRefusal(answer.body);
  return body === null ? null : { ok: false, code: body.error, body };
}

/** An anchor table as one string, its fields in a fixed order, so that two tables compare by content. */
const tableKey = (table: readonly LockAnchorRecord[]): string =>
  JSON.stringify(
    table.map((a) => [
      a.level,
      a.order,
      a.label,
      a.blockId,
      a.offset,
      a.quote,
      a.fallbackIds,
      a.source,
    ]),
  );

/** A subscription telling another revision or anchor table than the one held; anchors told as a hash are not compared. */
function isStale(event: Subscribed, held: CachedProduction | null): boolean {
  if (held === null) return true;
  const setId = held.state.sets.at(-1)?.setId ?? null;
  if ((event.revision?.setId ?? null) !== setId) return true;
  const { lockAnchors } = event;
  return (
    lockAnchors !== null &&
    tableKey(lockAnchors) !== tableKey(held.state.anchors)
  );
}

/** The newest issue in `state` that the state held at the reconnection lacks, made after this device was last synced. */
function issuedSince(
  at: Reconnection,
  state: ProductionState,
): OfflineIssue | null {
  const issue = state.issues.find((held) => held.kind === "issue");
  const set = state.sets.find((held) => held.setId === issue?.setId);
  const active = state.sets.at(-1);
  if (issue === undefined || set === undefined || active === undefined)
    return null;
  if (at.before === null || (at.since !== null && issue.issuedAt <= at.since))
    return null;
  if (at.before.issues.some((held) => held.issueId === issue.issueId))
    return null;
  return { byName: issue.issuedByName, name: set.name, active: active.name };
}

class ProductionSession {
  readonly current: Settable<CachedProduction | null> =
    createSubscribable(null);
  readonly waiting: Settable<number>;
  readonly offlineIssue: Settable<OfflineIssue | null> =
    createSubscribable(null);
  private readonly options: ProductionOptions;
  private readonly syncWaits = new Set<() => void>();
  private readonly stops: (() => void)[];
  /** `clock.now()` when the document was last seen synced: the handle does not carry DocMeta's. */
  private lastSyncedAt: number | null;
  private reconnection: Reconnection | null = null;
  private asking = false;
  private askAgain = false;
  private disposed = false;
  private writes: Promise<boolean> = Promise.resolve(false);

  constructor(options: ProductionOptions) {
    this.options = options;
    const { status } = options.handle;
    this.waiting = createSubscribable(status.get().waiting);
    this.lastSyncedAt = status.get().synced ? options.clock.now() : null;
    this.stops = [
      status.subscribe((value) => this.statusChanged(value)),
      options.handle.on((event) => this.heard(event)),
    ];
    void this.start();
  }

  async mutate(path: string, request: object): Answered<ProductionState> {
    await this.synced();
    const key = this.options.random.bytes(16).toHex();
    const body = { docId: this.options.docId, key, ...request };
    const outcome = await this.post(path, body, readState);
    // an answer is never shown: a retried key answers the state as at its commit, whatever came since
    if (outcome.ok) void this.refresh();
    return outcome;
  }

  async issue(path: string, request: object): Answered<IssueResponse> {
    const body = { docId: this.options.docId, ...request };
    const outcome = await this.post(path, body, readIssueResponse);
    if (outcome.ok) void this.refresh();
    return outcome;
  }

  dispose(): void {
    this.disposed = true;
    for (const stop of this.stops) stop();
    for (const release of this.syncWaits) release();
  }

  private async start(): Promise<void> {
    const { cache, docId } = this.options;
    // a cache that cannot be read has nothing to show; the server's state follows
    const held = await cache.read(docId).catch(() => null);
    if (this.current.get() === null) this.current.set(held);
    await this.refresh();
  }

  private statusChanged(status: DocStatus): void {
    this.waiting.set(status.waiting);
    if (status.synced) this.lastSyncedAt = this.options.clock.now();
  }

  private heard(event: DocEvent): void {
    if (event.type === "control" && PRODUCTION_KINDS.includes(event.kind))
      void this.refresh();
    if (event.type !== "subscribed" || !isStale(event, this.current.get()))
      return;
    const waiting = this.options.handle.status.get().waiting > 0;
    const before = this.current.get()?.state ?? null;
    this.reconnection = waiting ? { since: this.lastSyncedAt, before } : null;
    void this.refresh();
  }

  /** Asks for the state once; an ask made meanwhile asks once more after. */
  private async refresh(): Promise<void> {
    if (this.asking) {
      this.askAgain = true;
      return;
    }
    this.asking = true;
    do {
      this.askAgain = false;
      const at = this.reconnection;
      const body = { docId: this.options.docId };
      const outcome = await this.post("/api/production/state", body, readState);
      if (!outcome.ok || !(await this.absorb(outcome.value))) continue;
      if (this.reconnection === at) this.reconnection = null;
      const issue = at === null ? null : issuedSince(at, outcome.value);
      if (issue !== null) this.offlineIssue.set(issue);
    } while (this.askAgain && !this.disposed);
    this.asking = false;
  }

  /** States are kept in the order they are absorbed; false for one that could not be shown. */
  private absorb(state: ProductionState): Promise<boolean> {
    this.writes = this.writes.then(() => this.keep(state));
    return this.writes;
  }

  /** Shows and caches the state with its active revision's baseline, in one write. */
  private async keep(state: ProductionState): Promise<boolean> {
    if (this.disposed) return false;
    const versionId = state.sets.at(-1)?.baselineVersionId ?? null;
    const held = this.current.get()?.baseline ?? null;
    let baseline = held?.versionId === versionId ? held : null;
    if (versionId !== null && baseline === null) {
      const { transport, docId } = this.options;
      const path = `/api/versions/content?${new URLSearchParams({ docId, versionId })}`;
      const fetched = await this.send(() => transport.get(path), readContent);
      // a state is never shown without its baseline, so no mark is drawn against another
      if (!fetched.ok || this.disposed) return false;
      baseline = { versionId, content: fetched.value };
    }
    const value = { state, baseline };
    this.current.set(value);
    // a cache that cannot be written still shows the state this session; the next one asks again
    await this.options.cache.write(this.options.docId, value).catch(() => {});
    return true;
  }

  private synced(): Promise<void> {
    const { status } = this.options.handle;
    if (status.get().synced) return Promise.resolve();
    return new Promise((resolve) => {
      const release = (): void => {
        stop();
        this.syncWaits.delete(release);
        resolve();
      };
      const stop = status.subscribe((value) => {
        if (value.synced) release();
      });
      this.syncWaits.add(release);
    });
  }

  post<T>(path: string, body: object, read: Read<T>): Answered<T> {
    return this.send(() => this.options.transport.post(path, body), read);
  }

  /** Asks until answered, waiting the link's backoff between tries, and answers offline at ACK_TIMEOUT_MS. */
  private async send<T>(
    ask: () => Promise<Answer>,
    read: Read<T>,
  ): Answered<T> {
    const { clock, random } = this.options;
    const deadline = Promise.withResolvers<null>();
    const cancel = clock.schedule(() => deadline.resolve(null), ACK_TIMEOUT_MS);
    const deadlineAt = clock.now() + ACK_TIMEOUT_MS;
    try {
      for (let attempt = 0; clock.now() < deadlineAt; attempt += 1) {
        if (this.disposed) break;
        const outcome = await Promise.race([
          answerOf(ask, read),
          deadline.promise,
        ]);
        if (outcome !== null) return outcome;
        const unit = random.bytes(4).reduce((n, byte) => n * 256 + byte, 0);
        const delayMs = backoffDelayMs(attempt, unit / 2 ** 32);
        const paused = new Promise<null>((resolve) =>
          clock.schedule(() => resolve(null), delayMs),
        );
        await Promise.race([paused, deadline.promise]);
      }
      return { ok: false, code: "offline", body: null };
    } finally {
      cancel();
    }
  }
}

export function createProductionClient(
  options: ProductionOptions,
): ProductionClient {
  const session = new ProductionSession(options);
  const { docId } = options;
  return {
    current: () => session.current,
    waiting: () => session.waiting,
    issuedWhileOffline: () => session.offlineIssue,
    dismiss: () => session.offlineIssue.set(null),
    lock: (request) => session.mutate("/api/production/lock", request),
    pages: (request) => session.mutate("/api/production/pages", request),
    layout: (request) => session.mutate("/api/production/layout", request),
    unlock: () => session.mutate("/api/production/unlock", {}),
    end: () => session.mutate("/api/production/end", {}),
    importLock: (request) => session.mutate("/api/production/import", request),
    issue: (request) => session.issue("/api/production/issue", request),
    recall: (request) => session.issue("/api/production/recall", request),
    file: (issueId, file) =>
      session.post("/api/production/file", { docId, issueId, file }, readBytes),
    dispose: () => session.dispose(),
  };
}
