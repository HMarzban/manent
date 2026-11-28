// Small pure helpers used by createNodeCore to keep composition concise and modular.
import type {
  ManentServer,
  SessionStore,
  SyncService,
} from "@manent/server-core";
import type { UpstreamStatus } from "@manent/sync-client";
import type { ControlKind } from "@manent/sync-protocol";
import { readPerson } from "../auth/people.ts";
import type { NodeRecords, Person } from "../records/ports.ts";
import { nodeDocOf } from "../relay/follow.ts";
import type { Editor } from "../relay/mirror.ts";
import type { NodeCoreOptions } from "./ports.ts";

export function sendEditorControl(
  editors: readonly Editor[],
  docId: string,
  kind: ControlKind,
  data: Uint8Array,
  userId: string | null,
): void {
  for (const editor of editors)
    if (userId === null || editor.userId === userId)
      editor.control(docId, kind, data);
}

export function ownerIn(
  storage: NodeCoreOptions["storage"],
  docId: string,
  clientId: number,
): string | null {
  const place = storage.directory.placeOf(docId);
  if (place === null) return null;
  const ledger = storage.open(place.home).log.ledger(docId);
  return ledger.get(clientId)?.userId ?? null;
}

export function serviceOf(server: ManentServer): SyncService {
  if (server.sync === null) throw new TypeError("the node serves no documents");
  return server.sync;
}

export function snapshotForHandoff(
  storage: NodeCoreOptions["storage"],
  records: NodeRecords,
  docId: string,
): {
  state: Uint8Array;
  kind: string;
  home: string;
  workspaceId: string | null;
} {
  const place = storage.directory.placeOf(docId);
  const doc = nodeDocOf(storage, docId);
  if (place === null || doc === null)
    throw new RangeError(`the node holds no ${docId}`);
  const state = doc.encodeState();
  doc.destroy();
  const home =
    place.home.kind === "user" ? "user" : `${place.home.kind}:${place.home.id}`;
  return {
    state,
    kind: place.kind,
    home,
    workspaceId: records.workspaceOf(docId),
  };
}

export function currentSessionJson(records: NodeRecords): string | null {
  const current = records.current();
  const person = current === null ? null : records.person(current.userId);
  if (current === null || person === null) return null;
  const { userId, name } = person;
  return JSON.stringify({ token: current.nodeToken, userId, name });
}

export function resumeCloudPeople(options: {
  records: NodeRecords;
  onlyWantingCloud: boolean;
  choose: (person: Person) => void;
  handOver: (userId: string) => void;
}): void {
  for (const person of options.records.people()) {
    if (options.onlyWantingCloud && !person.wantsCloud) continue;
    if (person.wantsCloud && person.cloudToken === null) options.choose(person);
    else options.handOver(person.userId);
  }
}


export async function closeNodeParts(parts: {
  stopWake(): void;
  stopCloud(): void;
  stopHandover(): void;
  closeShell(): void;
  closeCallbacks: (() => void)[];
  stopComposed(): void;
  stopSearch?: () => void;
  stopPrompter?: () => void;
  shutdownService(): Promise<void>;
  closeRelay(): Promise<void>;
}): Promise<void> {
  parts.stopWake();
  parts.stopCloud();
  parts.stopHandover();
  parts.closeShell();
  for (const fn of parts.closeCallbacks.splice(0)) fn();
  parts.stopComposed();
  parts.stopSearch?.();
  parts.stopPrompter?.();
  await parts.shutdownService();
  await parts.closeRelay();
}

export function createNodeFetch(options: {
  records: NodeRecords;
  routes: (request: Request) => Promise<Response | null>;
  forward: (request: Request) => Promise<Response | null>;
  beforeFetch: (request: Request) => Promise<void>;
  workspaceNamed: (
    request: Request,
  ) => Promise<{ docId: string; workspaceId: string } | null>;
  serverFetch: ManentServer["fetch"];
  isOnline: () => boolean;
  sessions: SessionStore;
  handOver: (userId: string) => void;
}): ManentServer["fetch"] {
  return async (request, context) => {
    const handled =
      (await options.routes(request)) ?? (await options.forward(request));
    if (handled !== null) return handled;
    await options.beforeFetch(request);
    const named = await options.workspaceNamed(request);
    const answer = await options.serverFetch(request, context);
    if (named !== null && answer?.status === 200)
      options.records.setWorkspace(named.docId, named.workspaceId);
    handOverCreatedDoc({
      request,
      answer,
      online: options.isOnline(),
      sessions: options.sessions,
      records: options.records,
      handOver: options.handOver,
    });
    return answer;
  };
}

export function onDeviceStorageChange(options: {
  state: UpstreamStatus["device"];
  editors: readonly Editor[];
  afterDisk: Set<string>;
  statusOf: (docId: string) => UpstreamStatus;
  sendStatus: (docId: string, status: UpstreamStatus) => void;
  handOver: (userId: string) => void;
}): void {
  const held = new Set(options.editors.flatMap((e) => [...e.docs.keys()]));
  for (const docId of held) options.sendStatus(docId, options.statusOf(docId));
  if (options.state === "failing") return;
  for (const userId of options.afterDisk) options.handOver(userId);
  options.afterDisk.clear();
}

export function handOverCreatedDoc(options: {
  request: Request;
  answer: Response | null;
  online: boolean;
  sessions: SessionStore;
  records: NodeRecords;
  handOver: (userId: string) => void;
}): void {
  if (
    options.answer?.status !== 200 ||
    options.request.method !== "POST" ||
    !options.online ||
    new URL(options.request.url).pathname !== "/api/docs"
  )
    return;
  const person = readPerson(options.request, {
    sessions: options.sessions,
    records: options.records,
  });
  if (person?.wantsCloud === true && person.cloudToken !== null)
    options.handOver(person.userId);
}
