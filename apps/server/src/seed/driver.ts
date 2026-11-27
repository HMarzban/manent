// The seed driver: people replaying edits through the server's real socket seam and HTTP routes.
import {
  ORIGIN_REMOTE,
  createDoc,
  jsonMap,
  mergeUpdates,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc, JsonMapView } from "@manent/crdt";
import { SEED_DOCS, SeedDriverError, seedProject } from "@manent/demo";
import type { SeedDriver, SeedSession, SeedWorkspaceId } from "@manent/demo";
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
import { createDriving, isSeedClock } from "./driving.ts";
import type { Driving } from "./driving.ts";
import { isFields } from "./link.ts";
import {
  checkPassage,
  createPageMeter,
  readServerScript,
} from "./page-meter.ts";
import { createCommentsDriver } from "./comments-driver.ts";
import { trashDocument } from "./folders.ts";
import { createPrivateCopiesDriver } from "./private-copies-driver.ts";
import { createProduction } from "./production-driver.ts";
import { createPrompterDriver } from "./prompter-driver.ts";
import { createRundownsDriver } from "./rundown-driver.ts";
import { createSeriesDriver } from "./series-driver.ts";
import { createSharingDriver } from "./sharing-driver.ts";
import { createStartFromDriver } from "./start-from-driver.ts";
import { createWritersMaterialDriver } from "./writers-material-driver.ts";
import type { SeedServer } from "./server.ts";

/** The running server, for the Tour's preparations and the simulated writers. */
export interface LiveTarget {
  server: ManentServer;
  sessions: SessionStore;
  storage: Storage;
  sync: SyncService;
  clock: Clock;
}

type VersionRow = { id: string; kind: string; name: string | null };

const V7_RANDOM_BYTES = 10;

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

/** The workspace whose index lists the seeded document `docId`; null for any other document, such as an index. */
function workspaceOf(docId: string): SeedWorkspaceId | null {
  const found = SEED_DOCS.find((d) => d.docId === docId);
  return found === undefined ? null : seedProject(found.projectKey).workspaceId;
}

/** Who last changed a document, and when. */
export interface Edit {
  userId: string;
  at: number;
}

/** Tells the driver that `userId` changed `docId` at `at`, as a session closes. */
type Edited = (userId: string, docId: string, at: number) => Promise<void>;

/** Sets the entry of `docId` in an index's `documents` to say `userId` edited it at `at`; false when it is missing or holds a later edit. */
export function setEdited(
  documents: JsonMapView,
  docId: string,
  { userId, at }: Edit,
): boolean {
  const entry = documents.get(docId);
  if (!isFields(entry)) return false;
  if (typeof entry.editedAt === "number" && entry.editedAt >= at) return false;
  documents.set(docId, { ...entry, editedAt: at, editedByUserId: userId });
  return true;
}

/**
 * Writes in the workspace's index who last edited each of `edits`' documents and when, as the app writes a person's
 * own changes, in one session as the index's owner; an entry holding a later edit, or missing, is left as it is.
 */
async function markEdited(
  d: Driving,
  workspaceId: SeedWorkspaceId,
  edits: ReadonlyMap<string, Edit>,
): Promise<void> {
  const indexId = indexDocId("workspace", workspaceId);
  const roles = d.target.storage.directory.rolesOf(indexId);
  const owner = roles.find((r) => r.role === "owner")?.userId;
  if (owner === undefined) return;
  // an index's own changes are no document's edit
  const index = await openSession(d, owner, indexId, async () => {});
  await index.change((doc) => {
    const documents = jsonMap(doc, "documents");
    for (const [docId, edit] of edits) setEdited(documents, docId, edit);
  });
  await index.close();
}

/** Each workspace's index told of the edits in `edits` of its own documents; documents no index lists are left out. */
async function writeEdits(
  d: Driving,
  edits: ReadonlyMap<string, Edit>,
): Promise<void> {
  const byWorkspace = new Map<SeedWorkspaceId, Map<string, Edit>>();
  for (const [docId, edit] of edits) {
    const workspaceId = workspaceOf(docId);
    if (workspaceId === null) continue;
    const own = byWorkspace.get(workspaceId) ?? new Map<string, Edit>();
    byWorkspace.set(workspaceId, own.set(docId, edit));
  }
  for (const [workspaceId, own] of byWorkspace)
    await markEdited(d, workspaceId, own);
}

/** A replica subscribed for editing; while offline it holds its changes and what it hears. Closing it tells `edited` of its last change. */
async function openSession(
  d: Driving,
  userId: string,
  docId: string,
  edited: Edited,
): Promise<SeedSession> {
  if (
    docId === indexDocId("user", userId) &&
    d.target.storage.directory.placeOf(docId) === null
  ) {
    await d.call(userId, {
      method: "POST",
      path: "/api/docs",
      body: { docId, kind: "index", home: "user" },
    });
  }
  const link = await d.link(userId);
  const doc = createDoc({ clientId: d.clientId() });
  let held: Uint8Array[] | null = null;
  let heard: Uint8Array[] = [];
  let before: DocJSON | null = null;
  let editedAt: number | null = null;
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
      editedAt = d.target.clock.now();
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
      if (editedAt !== null) await edited(userId, docId, editedAt);
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
 * On the live server each session's last edit is written in its workspace's index as it closes; on
 * a seed server, whose indexes nobody reads before the seed is whole, it is held until `writeEdits`,
 * so that the indexes do not gain a version for every session. Throws RangeError for a server whose
 * capabilities were never probed.
 */
export function createSeedDriver(options: {
  target: SeedServer | LiveTarget;
  random: () => number;
}): SeedDriver & { writeEdits(): Promise<void> } {
  const { target } = options;
  const d = createDriving(target, options.random);
  const held = new Map<string, Edit>();
  const edited: Edited = isSeedClock(target.clock)
    ? async (userId, docId, at) => {
        if ((held.get(docId)?.at ?? -Infinity) < at)
          held.set(docId, { userId, at });
      }
    : (userId, docId, at) => writeEdits(d, new Map([[docId, { userId, at }]]));
  const open = (userId: string, docId: string) =>
    openSession(d, userId, docId, edited);
  return {
    async writeEdits() {
      await writeEdits(d, held);
      held.clear();
    },
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
      // the route gives the script each role and capability held on the workspace's index; omit workspaceId for private docs
      const body =
        doc.workspaceId === null
          ? { docId: doc.docId, kind: doc.kind, home: doc.home }
          : doc;
      await d.call(userId, { method: "POST", path: "/api/docs", body });
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
            airDate: null,
            rundownId: null,
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
    production: d.capabilities.has("production") ? createProduction(d) : null,
    async requestRebuild(docId) {
      target.sync.requestRebuild(docId);
      await d.runDue();
    },
    async check(docId, passage, firstBlockId) {
      const script = readServerScript(target.storage, docId);
      return checkPassage(script, passage, firstBlockId);
    },
    meter: createPageMeter(),
    comments: d.capabilities.has("comments") ? createCommentsDriver(d) : null,
    writersMaterial: d.capabilities.has("writers_material")
      ? createWritersMaterialDriver(d)
      : null,
    sharing: d.capabilities.has("sharing") ? createSharingDriver(d) : null,
    series: d.capabilities.has("series") ? createSeriesDriver(d) : null,
    privateCopies: d.capabilities.has("private_copies")
      ? createPrivateCopiesDriver(d)
      : null,
    startFrom: d.capabilities.has("start_from")
      ? createStartFromDriver(d)
      : null,
    rundowns: d.capabilities.has("rundowns") ? createRundownsDriver(d) : null,
    prompter: d.capabilities.has("prompter") ? createPrompterDriver(d) : null,
    trash: (userId, docId, at) => trashDocument(d, userId, docId, at),
  };
}
