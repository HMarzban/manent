// Serialised demo reseed handling and upstream session recovery: removes rooms, closes upstream clients, wipes storage, clears stale tokens and refreshes search.
import type { SyncService } from "@manent/server-core";
import type { Storage } from "@manent/storage";
import type { NodeRecords, Person } from "../records/ports.ts";
import type { RelayBridge } from "../relay/bridge.ts";
import type { CloudApi, UpstreamFactory } from "./ports.ts";

export interface ReseedCloudSessions {
  chosen(person: Person): void;
  reauthenticate(userId: string): Promise<string | null>;
  invalidate(): void;
}

export interface ReseedController {
  readonly active: boolean;
  wait(): Promise<void>;
  run(seedId: string): Promise<void>;
  check(): Promise<void>;
  reauthenticate(userId: string): Promise<string | null>;
}

/** Wraps `upstream` to notify `onConnected` on each online transition, report reachability, and re-authenticate on `sign_in`. */
export function watchUpstream(options: {
  upstream: UpstreamFactory;
  records: Pick<NodeRecords, "person">;
  reauthenticate: (userId: string) => Promise<string | null>;
  onConnected: (userId: string) => void;
  onReachability?: (reachable: boolean) => void;
}): UpstreamFactory {
  return {
    create(userId, token) {
      const client = options.upstream.create(userId, token);
      let online = false;
      let tried = false;
      let needsSignIn = false;
      client.link.subscribe((facts) => {
        const now = facts.state === "online";
        if (now) {
          options.onReachability?.(true);
          if (!online) options.onConnected(userId);
        } else if (
          facts.state === "connecting" ||
          facts.state === "authenticating"
        ) {
          tried = true;
        } else if (
          facts.state === "offline" &&
          facts.issue === "none" &&
          (online || tried)
        ) {
          tried = false;
          options.onReachability?.(false);
        }
        online = now;
        const signIn = facts.issue === "sign_in";
        if (
          signIn &&
          !needsSignIn &&
          options.records.person(userId)?.wantsCloud
        ) {
          void options.reauthenticate(userId).then((fresh) => {
            if (fresh !== null) client.retryNow();
          });
        }
        needsSignIn = signIn;
      });
      return client;
    },
    store: (userId) => options.upstream.store(userId),
  };
}

/** Deduplicates and serialises demo reseeds so concurrent subscribes and mirrors wait for an active wipe to finish. */
export function createReseed(options: {
  storage: Storage;
  records: NodeRecords;
  cloud: Pick<CloudApi, "demo">;
  relay: Pick<RelayBridge, "close">;
  service: Pick<SyncService, "removed">;
  sessions: ReseedCloudSessions;
  wipe: () => Promise<void>;
  onWiped: () => void;
}): ReseedController {
  const { storage, records, cloud, relay, service, sessions } = options;
  let inFlight: Promise<void> | null = null;
  let queuedSeed: string | null = null;

  async function perform(seedId: string): Promise<void> {
    if (records.demoDismissed() || records.seedId() === seedId) return;
    const { directory } = storage;
    const docIds: string[] = [];
    for (const home of directory.homes())
      for (const docId of directory.documentsIn(home)) {
        docIds.push(docId);
        service.removed(docId);
      }
    await relay.close();
    await options.wipe();
    for (const docId of docIds) records.removeDoc(docId);
    sessions.invalidate();
    records.setSeedId(seedId);
    const current = records.current();
    const person = current === null ? null : records.person(current.userId);
    if (person !== null) sessions.chosen(person);
    options.onWiped();
  }

  function run(seedId: string): Promise<void> {
    if (inFlight !== null) {
      queuedSeed = seedId;
      return inFlight;
    }
    const work = (async () => {
      let next: string | null = seedId;
      while (next !== null) {
        const target: string = next;
        queuedSeed = null;
        await perform(target);
        const queued: string | null = queuedSeed;
        next = queued !== null && queued !== target ? queued : null;
      }
    })();
    const tracked = work.finally(() => {
      if (inFlight === tracked) inFlight = null;
    });
    inFlight = tracked;
    return tracked;
  }

  async function wait(): Promise<void> {
    if (inFlight === null) return;
    await inFlight.catch(() => {
      // a reseed that could not finish cleared inFlight; callers continue with current state
    });
  }

  async function check(): Promise<void> {
    await wait();
    if (records.demoDismissed()) return;
    let seedId: string | null;
    try {
      ({ seedId } = await cloud.demo());
    } catch {
      // the cloud went away again: its seed is read at the next connection
      return;
    }
    const stored = records.seedId();
    if (seedId === null || seedId === stored) return;
    if (stored === null) return records.setSeedId(seedId);
    await run(seedId);
  }

  return {
    get active() {
      return inFlight !== null;
    },
    wait,
    run,
    check,
    async reauthenticate(userId) {
      await check();
      return sessions.reauthenticate(userId);
    },
  };
}
