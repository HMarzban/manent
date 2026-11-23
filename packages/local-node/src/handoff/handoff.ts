// The first sync of a document made on this device: its whole state, its versions and its production
// handed to the cloud once, under one key, after which the node relays it like any synced document.
import { updateMeta } from "@manent/crdt";
import {
  INDEX_KINDS,
  SYNCED_KINDS,
  adoptedWorkflowOf,
} from "@manent/server-core";
import type { AdoptedWorkflow, SyncService } from "@manent/server-core";
import type { Storage } from "@manent/storage";
import { ConnectError, HANDOFF_REFUSALS } from "@manent/sync-client";
import type { Clock, HandoffRefusal, Random } from "@manent/sync-client";
import { docIdV7, indexDocId } from "@manent/sync-protocol";
import type { AdoptResponse } from "@manent/sync-protocol";
import type { CloudApi, UpstreamFactory } from "../node/ports.ts";
import type { Handoff, NodeRecords } from "../records/ports.ts";
import type { RelayBridge } from "../relay/bridge.ts";

/** A hand-off the cloud could not take now is tried again after this, doubling up to the cap. */
const HANDOFF_RETRY_MS = 5_000;
const HANDOFF_RETRY_CAP_MS = 60_000;

/** The message every setting request held during a refused hand-off is answered with. */
const REFUSED_MESSAGE = "handoff_refused";
const HANDED_KINDS: readonly string[] = [...SYNCED_KINDS, ...INDEX_KINDS];

export interface Handover {
  /** Hands over, one at a time and oldest first, every document of that person that is still the node's own. */
  run(userId: string): Promise<void>;
  onDone(listener: (docId: string) => void): () => void;
}

type Outcome = "done" | "later" | "skipped";

/** The room's state now, and where the document lives. */
interface Snapshot {
  state: Uint8Array;
  kind: string;
  home: string;
  workspaceId: string | null;
}

function isRefusal(code: string): code is HandoffRefusal {
  return HANDOFF_REFUSALS.some((refusal) => refusal === code);
}

/**
 * Each step is safe to repeat, so a hand-off cut short anywhere starts again at the next run with
 * the key and snapshot it stored. A refused one goes back to the node's own authority and is never
 * tried again; one of a kind the cloud does not take is never started.
 */
export function createHandover(options: {
  storage: Storage;
  records: NodeRecords;
  cloud: CloudApi;
  relay: RelayBridge;
  /** The person's upstream store takes the adopted state as already synced. */
  upstream: UpstreamFactory;
  service: SyncService;
  tokenOf: (userId: string) => string | null;
  clock: Clock;
  random: Random;
  /** `workspaceId`: what the window's POST /api/docs named, which the node keeps with the placement. */
  snapshot(docId: string): Snapshot;
}): Handover {
  const { storage, records, cloud, relay, service, clock } = options;
  const listeners = new Set<(docId: string) => void>();
  const runs = new Map<string, Promise<void>>();
  const retries = new Map<string, { delayMs: number; cancel: () => void }>();

  /** The person's documents the node is still the authority for, or is handing over, oldest first. */
  function ownDocuments(userId: string): string[] {
    const { directory } = storage;
    const found: { docId: string; createdAt: number }[] = [];
    for (const home of directory.homes())
      for (const docId of directory.documentsIn(home)) {
        const place = directory.placeOf(docId);
        if (place === null || !HANDED_KINDS.includes(place.kind)) continue;
        if (directory.roleOf(docId, userId)?.role !== "owner") continue;
        if (directory.tombstoneOf(docId) !== null) continue;
        if (records.docState(docId)?.state === "synced") continue;
        if (records.handoff(docId)?.refused != null) continue;
        const createdAt = storage.open(home).log.get(docId)?.createdAt ?? 0;
        found.push({ docId, createdAt });
      }
    return found
      .toSorted(
        (a, b) => a.createdAt - b.createdAt || (a.docId < b.docId ? -1 : 1),
      )
      .map(({ docId }) => docId);
  }

  /** A key and the room's full state, kept once: a hand-off started before keeps its own. */
  function kept(docId: string, from: Handoff | Snapshot): Handoff {
    if ("key" in from) return from;
    const { state, kind, home, workspaceId } = from;
    const startedAt = clock.now();
    const key = docIdV7(startedAt, options.random.bytes(10));
    const made = { docId, key, kind, home, workspaceId, startedAt };
    records.startHandoff({ ...made, snapshot: state, refused: null });
    const handoff = records.handoff(docId);
    if (handoff === null)
      throw new RangeError(`no hand-off of ${docId} was kept`);
    return handoff;
  }

  /** From here pushes and settings go to the relay, which holds them until the cloud has the document. */
  function started(
    userId: string,
    docId: string,
    from: Handoff | Snapshot,
  ): Handoff {
    const handoff = kept(docId, from);
    if (records.docState(docId) === null) {
      records.setDocState(docId, userId, "handing_off", 0);
      service.modeChanged(docId);
    }
    return handoff;
  }

  /** The document is the node's own again, and every request held for it is answered. */
  function refused(docId: string, code: HandoffRefusal): void {
    records.refuseHandoff(docId, code);
    service.modeChanged(docId);
    relay.refuseHeld(docId, REFUSED_MESSAGE);
  }

  /** The person's upstream document holds the adopted state as synced, so none of it is fetched again. */
  async function keptSynced(
    userId: string,
    handoff: Handoff,
    body: AdoptResponse,
  ): Promise<void> {
    const { docId, snapshot } = handoff;
    const clocks = new Map<number, number>();
    for (const { clientId, toClock } of updateMeta(snapshot))
      clocks.set(clientId, Math.max(clocks.get(clientId) ?? 0, toClock));
    const store = options.upstream.store(userId);
    await store.create({
      docId,
      generation: body.generation,
      lastServerSeq: body.adoptedSeq,
      clientIds: [...clocks.keys()],
      ackedClocks: Object.fromEntries(
        [...clocks].map(([clientId, next]) => [String(clientId), next]),
      ),
      neverSynced: false,
      create: null,
      parked: null,
      recovering: null,
      lastDeviceVersionAt: 0,
      lastSyncedAt: clock.now(),
      moving: null,
    });
    await store.checkpoint(docId, snapshot, 0, true);
  }

  /** Synced at the cloud's generation, and relayed from here: the relay's reconcile sends what came after the snapshot. */
  async function finished(
    userId: string,
    handoff: Handoff,
    body: AdoptResponse,
  ): Promise<void> {
    const { docId } = handoff;
    await keptSynced(userId, handoff, body);
    records.finishHandoff(docId, body.generation);
    await relay.open(userId, docId);
    for (const listener of listeners) listener(docId);
  }

  /** What the node recorded as the document's authority; nothing changes it once the hand-off has started. */
  function workflowOf(docId: string): AdoptedWorkflow {
    const place = storage.directory.placeOf(docId);
    if (place === null) throw new RangeError(`the node holds no ${docId}`);
    return adoptedWorkflowOf(storage.open(place.home), docId);
  }

  /** A workspace's script waits until its workspace's index has reached the cloud. */
  function waitsForIndex(workspaceId: string | null): boolean {
    if (workspaceId === null) return false;
    const index = indexDocId("workspace", workspaceId);
    return records.docState(index)?.state !== "synced";
  }

  async function handOver(
    userId: string,
    token: string,
    docId: string,
  ): Promise<Outcome> {
    const from = records.handoff(docId) ?? options.snapshot(docId);
    if (waitsForIndex(from.workspaceId)) return "later";
    const handoff = started(userId, docId, from);
    const { key, kind, home, workspaceId, snapshot } = handoff;
    const request = {
      key,
      docId,
      kind,
      home,
      workspaceId,
      state: snapshot.toBase64(),
      ...workflowOf(docId),
    };
    let answer;
    try {
      answer = await cloud.adopt(token, request);
    } catch (error) {
      if (!(error instanceof ConnectError)) throw error;
      return "later";
    }
    if (answer.ok) {
      await finished(userId, handoff, answer.body);
      return "done";
    }
    const { code } = answer;
    if (isRefusal(code)) {
      refused(docId, code);
      return "skipped";
    }
    if (code !== "unsupported_kind") return "later";
    // the cloud does not take this kind: the document stays the node's own, and nothing is said
    records.removeDoc(docId);
    service.modeChanged(docId);
    return "skipped";
  }

  /** Another run after a wait that doubles each time nothing could be handed over, and starts again after one that could. */
  function retryLater(userId: string): void {
    const delayMs = Math.min(
      (retries.get(userId)?.delayMs ?? HANDOFF_RETRY_MS / 2) * 2,
      HANDOFF_RETRY_CAP_MS,
    );
    const cancel = clock.schedule(() => {
      retries.set(userId, { delayMs, cancel: () => {} });
      run(userId).catch(() => {
        // a retry cut short resumes from the key and snapshot it stored, at the person's next run
      });
    }, delayMs);
    retries.set(userId, { delayMs, cancel });
  }

  async function handOverAll(userId: string): Promise<void> {
    retries.get(userId)?.cancel();
    const token = options.tokenOf(userId);
    if (token === null) return;
    for (const docId of ownDocuments(userId)) {
      if ((await handOver(userId, token, docId)) !== "later") continue;
      return retryLater(userId);
    }
    retries.delete(userId);
  }

  /** One run per person at a time: one asked for meanwhile goes round again once that one ends. */
  function run(userId: string): Promise<void> {
    const running = runs.get(userId);
    if (running !== undefined) return running.then(() => run(userId));
    const going = handOverAll(userId).finally(() => runs.delete(userId));
    runs.set(userId, going);
    return going;
  }

  return {
    run,
    onDone(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
