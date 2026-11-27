// MOS 2.8.5 / Autoscript WinPlus-IP bridge: strictly subscribes to PrompterFeedHub (zero CRDT reads).
import { diffMosRunningOrder, projectPrompterFeedToMos } from "@manent/formats";
import type { MosMessage, MosRunningOrder } from "@manent/formats";
import type { Storage } from "@manent/storage";
import { indexDocId } from "@manent/sync-protocol";
import type { PrompterFeed } from "@manent/sync-protocol";
import type { PrompterFeedHub } from "../prompter/subscribe.ts";
import type { Clock, SyncService } from "../sync/ports.ts";
import { resolvePinnedTarget } from "./allowlist.ts";
import type { DnsLookupFn } from "./allowlist.ts";
import { createMosConfigStore, resolveCheckConfig } from "./config.ts";
import type {
  MosConfigOutcome,
  MosRundownOptIn,
  MosWorkspaceConfig,
} from "./config.ts";
import { checkMosHandshake, createMosTcpClient } from "./tcp-client.ts";
import type { MosTcpClient } from "./tcp-client.ts";

export type MosLinkStatus = "off" | "waiting" | "live" | "lost";

export interface MosWorkspaceStatus {
  readonly config: MosWorkspaceConfig | null;
  readonly status: MosLinkStatus;
}

export interface MosRundownStatus extends MosRundownOptIn {
  readonly configured: boolean;
  readonly status: MosLinkStatus;
}

export interface MosCheckResult {
  readonly ok: boolean;
  readonly reason?:
    | "bad_host"
    | "bad_port"
    | "host_not_allowed"
    | "unreachable"
    | "bad_response"
    | "not_configured";
}

export interface MosBridgeService {
  getWorkspace(
    callerUserId: string,
    workspaceId: string,
  ): Promise<MosConfigOutcome<MosWorkspaceStatus>>;
  saveWorkspace(
    callerUserId: string,
    workspaceId: string,
    raw: unknown,
  ): Promise<MosConfigOutcome<MosWorkspaceStatus>>;
  deleteWorkspace(
    callerUserId: string,
    workspaceId: string,
  ): Promise<MosConfigOutcome<{ removed: boolean }>>;
  checkWorkspace(
    callerUserId: string,
    workspaceId: string,
    overrideRaw?: unknown,
  ): Promise<MosConfigOutcome<MosCheckResult>>;
  getRundown(
    callerUserId: string,
    docId: string,
  ): Promise<MosConfigOutcome<MosRundownStatus>>;
  setRundown(
    callerUserId: string,
    docId: string,
    input: { workspaceId: string; enabled: boolean; roSlug?: string },
  ): Promise<MosConfigOutcome<MosRundownStatus>>;
  /** Handles prompter-initiated heartbeat / roReq / roReqAll strictly for opted-in rundowns (IDOR-safe). */
  handleIncomingMosMessage(message: MosMessage): MosMessage[];
  stop(): Promise<void>;
}

interface WorkspaceRuntime {
  config: MosWorkspaceConfig;
  client: MosTcpClient | null;
  status: MosLinkStatus;
  connecting: Promise<MosTcpClient | null> | null;
}

interface ActiveRundown {
  readonly docId: string;
  readonly workspaceId: string;
  roSlug: string;
  lastRo: MosRunningOrder | null;
  unsubscribe: () => void;
}

export function createMosBridgeService(options: {
  storage: Storage;
  sync: () => SyncService;
  feed: PrompterFeedHub;
  clock: Clock;
  lookup?: DnsLookupFn;
  handshakeTimeoutMs?: number;
}): MosBridgeService {
  const { storage, sync, feed, clock, lookup, handshakeTimeoutMs } = options;
  const store = createMosConfigStore({ storage, sync });
  const runtimes = new Map<string, WorkspaceRuntime>();
  const workspaceQueues = new Map<string, Promise<void>>();
  const activeRundowns = new Map<string, ActiveRundown>();
  let messageSeq = 0;
  let stopped = false;

  const nextMessageId = (): number => {
    messageSeq += 1;
    return messageSeq;
  };

  function closeWorkspaceClient(workspaceId: string): void {
    workspaceQueues.delete(workspaceId);
    const rt = runtimes.get(workspaceId);
    if (rt === undefined) return;
    rt.client?.close();
    rt.client = null;
    rt.connecting = null;
    rt.status = "off";
    runtimes.delete(workspaceId);
  }

  async function ensureClient(
    workspaceId: string,
    config: MosWorkspaceConfig,
  ): Promise<MosTcpClient | null> {
    if (stopped || !config.enabled) return null;
    let rt = runtimes.get(workspaceId);
    if (rt === undefined) {
      rt = { config, client: null, status: "waiting", connecting: null };
      runtimes.set(workspaceId, rt);
    }
    if (rt.client !== null) return rt.client;
    if (rt.connecting !== null) return rt.connecting;

    rt.connecting = (async () => {
      const target = await resolvePinnedTarget(config.host, config.upperPort, {
        allowedCidrs: config.allowedCidrs,
        lookup,
      });
      if (!target.ok || stopped || runtimes.get(workspaceId) !== rt) {
        if (rt !== undefined) rt.status = "lost";
        return null;
      }
      const client = createMosTcpClient({
        target,
        onStatus(connected) {
          if (runtimes.get(workspaceId) === rt)
            rt.status = connected ? "live" : "lost";
        },
      });
      rt.client = client;
      return client;
    })();
    try {
      return await rt.connecting;
    } finally {
      if (runtimes.get(workspaceId) === rt) rt.connecting = null;
    }
  }

  function enqueueBatch(
    workspaceId: string,
    messages: readonly MosMessage[],
  ): void {
    if (messages.length === 0 || stopped) return;
    const prev = workspaceQueues.get(workspaceId) ?? Promise.resolve();
    const run = async (): Promise<void> => {
      if (stopped) return;
      const config = store.readWorkspace(workspaceId);
      if (config === null || !config.enabled) return;
      const client = await ensureClient(workspaceId, config);
      if (client === null) return;
      const rt = runtimes.get(workspaceId);
      for (const msg of messages) {
        try {
          await client.send(msg);
          if (rt !== undefined) rt.status = "live";
        } catch {
          if (rt !== undefined) rt.status = "lost";
          break;
        }
      }
    };
    const next = prev.then(run, run);
    workspaceQueues.set(workspaceId, next);
  }

  function deliverFeedUpdate(
    entry: ActiveRundown,
    nextFeed: PrompterFeed | null,
  ): void {
    const config = store.readWorkspace(entry.workspaceId);
    if (config === null || !config.enabled) return;
    const nextRo =
      nextFeed === null
        ? null
        : projectPrompterFeedToMos(entry.docId, entry.roSlug, nextFeed);
    const messages = diffMosRunningOrder(entry.lastRo, nextRo, {
      mosId: config.mosId,
      ncsId: config.ncsId,
      dialect: config.dialect,
      nextMessageId,
    });
    entry.lastRo = nextRo;
    enqueueBatch(entry.workspaceId, messages);
  }

  function attachRundown(opt: MosRundownOptIn): void {
    const existing = activeRundowns.get(opt.docId);
    if (existing !== undefined) {
      if (existing.workspaceId === opt.workspaceId) {
        existing.roSlug = opt.roSlug;
        return;
      }
      detachRundown(opt.docId);
    }
    const entry: ActiveRundown = {
      docId: opt.docId,
      workspaceId: opt.workspaceId,
      roSlug: opt.roSlug,
      lastRo: null,
      unsubscribe: () => {},
    };
    activeRundowns.set(opt.docId, entry);
    // Strictly subscribe to PrompterFeedHub (never reads live CRDT docs directly!)
    entry.unsubscribe = feed.addFeedListener(opt.docId, (nextFeed) => {
      if (activeRundowns.get(opt.docId) !== entry) return;
      deliverFeedUpdate(entry, nextFeed);
    });
  }

  function detachRundown(docId: string): void {
    const entry = activeRundowns.get(docId);
    if (entry === undefined) return;
    entry.unsubscribe();
    activeRundowns.delete(docId);
    if (entry.lastRo !== null) {
      const config = store.readWorkspace(entry.workspaceId);
      if (config !== null && config.enabled) {
        const del = diffMosRunningOrder(entry.lastRo, null, {
          mosId: config.mosId,
          ncsId: config.ncsId,
          dialect: config.dialect,
          nextMessageId,
        });
        enqueueBatch(entry.workspaceId, del);
      }
    }
  }

  function statusOfWorkspace(workspaceId: string): MosLinkStatus {
    const cfg = store.readWorkspace(workspaceId);
    if (cfg === null || !cfg.enabled) return "off";
    return runtimes.get(workspaceId)?.status ?? "waiting";
  }

  function rundownStatusOf(opt: MosRundownOptIn): MosRundownStatus {
    const cfg =
      opt.workspaceId !== "" ? store.readWorkspace(opt.workspaceId) : null;
    const configured = cfg !== null && cfg.enabled;
    return {
      ...opt,
      configured,
      status:
        opt.enabled && configured ? statusOfWorkspace(opt.workspaceId) : "off",
    };
  }

  return {
    async getWorkspace(callerUserId, workspaceId) {
      const res = await store.getWorkspace(callerUserId, workspaceId);
      if (!res.ok) return res;
      return {
        ok: true,
        value: { config: res.value, status: statusOfWorkspace(workspaceId) },
      };
    },
    async saveWorkspace(callerUserId, workspaceId, raw) {
      const res = await store.saveWorkspace(callerUserId, workspaceId, raw);
      if (!res.ok) return res;
      closeWorkspaceClient(workspaceId);
      for (const opt of store.listEnabledRundowns()) {
        if (opt.workspaceId !== workspaceId) continue;
        detachRundown(opt.docId);
        if (res.value.enabled) attachRundown(opt);
      }
      return {
        ok: true,
        value: { config: res.value, status: statusOfWorkspace(workspaceId) },
      };
    },
    async deleteWorkspace(callerUserId, workspaceId) {
      const res = await store.deleteWorkspace(callerUserId, workspaceId);
      if (!res.ok) return res;
      for (const entry of Array.from(activeRundowns.values()))
        if (entry.workspaceId === workspaceId) detachRundown(entry.docId);
      closeWorkspaceClient(workspaceId);
      return res;
    },
    async checkWorkspace(callerUserId, workspaceId, overrideRaw) {
      const auth = await store.getWorkspace(callerUserId, workspaceId);
      if (!auth.ok) return auth;
      const role = storage.directory.roleOf(
        indexDocId("workspace", workspaceId),
        callerUserId,
      );
      if (role === null || role.role !== "owner")
        return { ok: false, code: "forbidden" };
      const resolved = resolveCheckConfig(auth.value, overrideRaw);
      if (!resolved.ok) return { ok: true, value: resolved };
      const cfg = resolved.config;
      const pinned = await resolvePinnedTarget(cfg.host, cfg.upperPort, {
        allowedCidrs: cfg.allowedCidrs,
        lookup,
      });
      if (!pinned.ok)
        return { ok: true, value: { ok: false, reason: pinned.code } };
      return {
        ok: true,
        value: await checkMosHandshake({
          target: pinned,
          mosId: cfg.mosId,
          ncsId: cfg.ncsId,
          nowIso: new Date(clock.now()).toISOString(),
          timeoutMs: handshakeTimeoutMs,
        }),
      };
    },
    async getRundown(callerUserId, docId) {
      const res = await store.getRundownOptIn(callerUserId, docId);
      return res.ok ? { ok: true, value: rundownStatusOf(res.value) } : res;
    },
    async setRundown(callerUserId, docId, input) {
      const res = await store.setRundownOptIn(callerUserId, docId, input);
      if (!res.ok) return res;
      if (res.value.enabled) attachRundown(res.value);
      else detachRundown(docId);
      return { ok: true, value: rundownStatusOf(res.value) };
    },
    handleIncomingMosMessage(message) {
      const env = {
        mosId: message.mosId,
        ncsId: message.ncsId,
        ...(message.messageId !== undefined
          ? { messageId: message.messageId }
          : {}),
      };
      if (message.kind === "heartbeat")
        return [
          {
            ...env,
            kind: "heartbeat",
            time: new Date(clock.now()).toISOString(),
          },
        ];
      if (message.kind === "roReqAll")
        return [
          {
            ...env,
            kind: "roListAll",
            runningOrders: Array.from(activeRundowns.values(), (r) => ({
              roId: r.docId,
              roSlug: r.roSlug,
            })),
          },
        ];
      if (message.kind === "roReq") {
        const entry = activeRundowns.get(message.roId);
        if (entry === undefined || entry.lastRo === null)
          return [
            { ...env, kind: "roAck", roId: message.roId, roStatus: "NACK" },
          ];
        const cfg = store.readWorkspace(entry.workspaceId);
        return diffMosRunningOrder(null, entry.lastRo, {
          mosId: env.mosId,
          ncsId: env.ncsId,
          dialect: cfg?.dialect ?? "autoscript_winplus_ip",
          nextMessageId,
        });
      }
      return [];
    },
    stop() {
      stopped = true;
      for (const entry of activeRundowns.values()) entry.unsubscribe();
      activeRundowns.clear();
      for (const wsId of Array.from(runtimes.keys()))
        closeWorkspaceClient(wsId);
      return Promise.resolve();
    },
  };
}
