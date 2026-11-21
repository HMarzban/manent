// The seed driver: people replaying edits through the server's real socket seam and HTTP routes.
import {
  ORIGIN_REMOTE,
  createDoc,
  jsonMap,
  mergeUpdates,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { SeedDriverError, seedProject } from "@manent/demo";
import type { SeedCapability, SeedDriver, SeedSession } from "@manent/demo";
import { SCHEMA_VERSION, canonicalDoc } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import type {
  Clock,
  ManentServer,
  SessionStore,
  SyncService,
} from "@manent/server-core";
import type { Storage } from "@manent/storage";
import { docIdV7, indexDocId, workspaceHome } from "@manent/sync-protocol";
import { seedCapabilities } from "./capabilities.ts";
import { isFields, openSeamLink } from "./link.ts";
import type { SeamLink } from "./link.ts";
import { checkPassage, readServerScript } from "./page-meter.ts";
import { callRoute } from "./server.ts";
import type { SeedClock, SeedServer } from "./server.ts";

/** The running server, for the Tour's preparations and the simulated writers. */
export interface LiveTarget {
  server: ManentServer;
  sessions: SessionStore;
  storage: Storage;
  sync: SyncService;
  clock: Clock;
}

type Route = { method: "GET" | "POST"; path: string; body?: unknown };
type VersionRow = { id: string; kind: string; name: string | null };

/** What every action of the driver reaches the server with. */
interface Driving {
  readonly target: SeedServer | LiveTarget;
  readonly capabilities: ReadonlySet<SeedCapability>;
  /** A route as `userId`: the body of its 200 answer; any other answer is refused. */
  call(userId: string, route: Route): Promise<unknown>;
  /** The person's one socket, opened on first use. */
  link(userId: string): Promise<SeamLink>;
  bytes(count: number): Uint8Array;
  /** A Yjs client id: an unsigned 32-bit integer above 0. */
  clientId(): number;
  /** A request key: 32 lower-case hex characters. */
  key(): string;
  /** Runs the seed clock's due timers; nothing on the live server, whose timers run by themselves. */
  runDue(): Promise<void>;
}

const KEY_BYTES = 16;
const V7_RANDOM_BYTES = 10;
const UINT32 = 4_294_967_296;

const isSeedClock = (clock: Clock): clock is SeedClock =>
  "set" in clock && "runDue" in clock;

const hex = (byte: number): string => byte.toString(16).padStart(2, "0");

/** The body of a 200 answer; any other answer is refused, naming its status and code. */
async function readAnswer(response: Response, what: string): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 200) return body;
  const code = isFields(body) ? String(body.error) : "no code";
  throw new SeedDriverError("refused", `${what}: ${response.status} ${code}`);
}

function createDriving(
  target: SeedServer | LiveTarget,
  random: () => number,
): Driving {
  const tokens = new Map<string, string>();
  const links = new Map<string, Promise<SeamLink>>();
  const bytes = (count: number) =>
    Uint8Array.from({ length: count }, () => Math.floor(random() * 256));
  const tokenOf = (userId: string): string => {
    const token = tokens.get(userId) ?? target.sessions.issue(userId);
    tokens.set(userId, token);
    return token;
  };
  return {
    target,
    capabilities: seedCapabilities(target),
    async call(userId, route) {
      const answer = await callRoute(target.server, tokenOf(userId), route);
      return readAnswer(answer, `${route.method} ${route.path} as ${userId}`);
    },
    link(userId) {
      const link = links.get(userId) ?? openSeamLink(target, userId);
      links.set(userId, link);
      return link;
    },
    bytes,
    clientId: () => Math.floor(random() * (UINT32 - 1)) + 1,
    key: () => Array.from(bytes(KEY_BYTES), hex).join(""),
    async runDue() {
      if (isSeedClock(target.clock)) await target.clock.runDue();
    },
  };
}

/** The updates `fn` makes in `doc`, merged into one; null when it changes nothing. */
function changesOf(
  doc: CrdtDoc,
  fn: (doc: CrdtDoc) => void,
): Uint8Array | null {
  const made: Uint8Array[] = [];
  const stop = doc.subscribe((update) => made.push(update));
  try {
    fn(doc);
  } finally {
    stop();
  }
  return made.length === 0 ? null : mergeUpdates(made);
}

/** The document as it was before a device's held changes, kept as that device's `pre_merge` version. */
async function uploadBefore(
  d: Driving,
  at: { userId: string; docId: string },
  content: DocJSON,
): Promise<void> {
  const version = {
    id: docIdV7(d.target.clock.now(), d.bytes(V7_RANDOM_BYTES)),
    kind: "pre_merge",
    name: null,
    deviceId: `seed-${at.userId}`,
    content: canonicalDoc(content),
    schemaVersion: SCHEMA_VERSION,
  };
  const body = { docId: at.docId, version };
  await d.call(at.userId, {
    method: "POST",
    path: "/api/versions/upload",
    body,
  });
}

/** A replica subscribed for editing; while offline it holds its changes and what it hears. */
async function openSession(
  d: Driving,
  userId: string,
  docId: string,
): Promise<SeedSession> {
  const link = await d.link(userId);
  const doc = createDoc({ clientId: d.clientId() });
  let held: Uint8Array[] | null = null;
  let heard: Uint8Array[] = [];
  let before: DocJSON | null = null;
  const { state } = await link.subscribe(docId, doc.clientId, (update) => {
    if (held === null) doc.applyUpdate(update, ORIGIN_REMOTE);
    else heard.push(update);
  });
  doc.applyUpdate(state, ORIGIN_REMOTE);
  return {
    doc,
    async change(fn) {
      const update = changesOf(doc, fn);
      if (update === null) return;
      if (held === null) await link.push(docId, update);
      else held.push(update);
    },
    set: (key, value) => link.set(docId, key, value),
    offline() {
      held ??= [];
      before ??= scriptBody(doc).materialize();
    },
    async online() {
      const updates = held ?? [];
      held = null;
      for (const update of heard) doc.applyUpdate(update, ORIGIN_REMOTE);
      heard = [];
      if (before !== null && d.capabilities.has("device_versions"))
        await uploadBefore(d, { userId, docId }, before);
      before = null;
      if (updates.length > 0) await link.push(docId, mergeUpdates(updates));
      return { sent: updates.length };
    },
    async close() {
      await link.unsubscribe(docId);
      doc.destroy();
      await d.runDue();
    },
  };
}

/** Every version of the document, newest first, page after page. */
async function listVersions(
  d: Driving,
  userId: string,
  docId: string,
): Promise<VersionRow[]> {
  const found: VersionRow[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ docId });
    if (cursor !== null) query.set("cursor", cursor);
    const path = `/api/versions?${query}`;
    const body = await d.call(userId, { method: "GET", path });
    if (!isFields(body) || !Array.isArray(body.versions))
      throw new SeedDriverError("unavailable", `${path} is not a list`);
    for (const item of body.versions)
      if (
        isFields(item) &&
        typeof item.id === "string" &&
        typeof item.kind === "string" &&
        (item.name === null || typeof item.name === "string")
      )
        found.push({ id: item.id, kind: item.kind, name: item.name });
    cursor = typeof body.next === "string" ? body.next : null;
  } while (cursor !== null);
  return found;
}

/**
 * A driver whose people act on `target` one answer at a time: every edit a push on their own
 * socket, every request a call to the server's routes. Ids, keys and client ids come from `random`.
 * Throws RangeError for a server whose capabilities were never probed.
 */
export function createSeedDriver(options: {
  target: SeedServer | LiveTarget;
  random: () => number;
}): SeedDriver {
  const { target } = options;
  const d = createDriving(target, options.random);
  const open = (userId: string, docId: string) => openSession(d, userId, docId);
  return {
    capabilities: d.capabilities,
    async setTime(at) {
      if (!isSeedClock(target.clock))
        throw new SeedDriverError("unavailable", "the live clock runs itself");
      target.clock.set(at);
      await d.runDue();
    },
    async workspace(ownerId, workspaceId, roles) {
      const docId = indexDocId("workspace", workspaceId);
      const body = { docId, kind: "index", home: workspaceHome(workspaceId) };
      await d.call(ownerId, { method: "POST", path: "/api/docs", body });
      for (const { userId, role, capabilities } of roles)
        target.storage.directory.setRole(docId, userId, role, capabilities);
    },
    async create(userId, doc) {
      // the route gives the script each role and capability held on the workspace's index
      await d.call(userId, { method: "POST", path: "/api/docs", body: doc });
    },
    async index(userId, workspaceId, { projects, documents, at }) {
      const session = await open(userId, indexDocId("workspace", workspaceId));
      await session.change((doc) => {
        for (const { projectId, title, kind } of projects)
          jsonMap(doc, "projects").set(projectId, {
            title,
            kind,
            createdAt: at,
            createdByUserId: userId,
          });
        for (const { docId, projectKey, title, kind } of documents)
          jsonMap(doc, "documents").set(docId, {
            projectId: seedProject(projectKey).projectId,
            title,
            kind,
            createdAt: at,
            editedAt: null,
            editedByUserId: null,
          });
      });
      await session.close();
    },
    open,
    async nameDraft(userId, docId, name) {
      const body = { docId, key: d.key(), name, fromVersionId: null };
      const path = "/api/versions/name";
      const answer = await d.call(userId, { method: "POST", path, body });
      const version = isFields(answer) ? answer.version : null;
      const versionId = isFields(version) ? version.id : null;
      if (typeof versionId !== "string")
        throw new SeedDriverError("unavailable", `${path} gave no version id`);
      return { versionId };
    },
    async restore(userId, docId, versionId, scope) {
      const body = { docId, key: d.key(), versionId, scope };
      await d.call(userId, {
        method: "POST",
        path: "/api/versions/restore",
        body,
      });
      await d.runDue();
    },
    versions: (userId, docId) => listVersions(d, userId, docId),
    production: null,
    async requestRebuild(docId) {
      throw new SeedDriverError("unavailable", `no rebuild of ${docId} yet`);
    },
    async check(docId, passage, firstBlockId) {
      const script = readServerScript(target.storage, docId);
      return checkPassage(script, passage, firstBlockId);
    },
  };
}
