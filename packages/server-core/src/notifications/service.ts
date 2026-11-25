// The notifications service: detects new workspace comments, enqueues outbox rows, runs the 15 s delivery loop, and serves settings routes.
import { readCommentItems, readCommentsPush } from "@manent/crdt";
import type { PendingOutboxRow, Storage } from "@manent/storage";
import {
  NOTIFICATION_ADAPTERS,
  commentsDocId,
  indexDocId,
} from "@manent/sync-protocol";
import type {
  NotificationAdapter,
  NotificationAdapterStatus,
  NotificationDeliveryState,
  NotificationEventType,
  NotificationsGetResponse,
  NotificationsSetResponse,
} from "@manent/sync-protocol";
import type { Directory } from "../auth/directory.ts";
import type { Clock, SyncHooks } from "../sync/ports.ts";
import {
  NOTIFICATION_SETTING_KEYS,
  hintForAddress,
  validateNotificationAddress,
} from "./addresses.ts";
import { DEFAULT_TIMEOUT_MS, deliverDue } from "./deliver.ts";
import { formatAdapterPayload } from "./payloads.ts";
import type { NotificationEvent } from "./payloads.ts";
import { findScriptWorkspace } from "./workspace-lookup.ts";

/** Interval between background outbox delivery ticks in milliseconds. */
export const DELIVER_INTERVAL_MS = 15_000;

export type NotificationsRefusal = "bad_request" | "forbidden";

export type NotificationsOutcome<T> =
  { ok: true; value: T } | { ok: false; code: NotificationsRefusal };

/** Notifications service carried on ServerConfig.notify and SyncHooks. */
export interface NotificationsService extends SyncHooks {
  /** Lists notification adapters for workspaceId; members see on/off only, owners see masked hints and delivery state. */
  get(
    callerUserId: string,
    workspaceId: string,
  ): NotificationsOutcome<NotificationsGetResponse>;
  /** Saves or removes an adapter address for workspaceId; owners only. */
  set(
    callerUserId: string,
    workspaceId: string,
    adapter: NotificationAdapter,
    address: string | null,
  ): NotificationsOutcome<NotificationsSetResponse>;
  /** Drains due outbox rows once. */
  deliverNow(): Promise<number>;
  /** Stops the background delivery timer. */
  stop(): void;
}

const WORKSPACE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const isValidWorkspaceId = (value: unknown): value is string =>
  typeof value === "string" && WORKSPACE_ID.test(value);

const refused = (code: NotificationsRefusal) => ({ ok: false, code }) as const;

function summarizeDelivery(pendingRows: readonly PendingOutboxRow[]): {
  state: NotificationDeliveryState;
  nextTryAt: number | null;
} {
  let retryingAt: number | null = null;
  let hasStopped = false;
  for (const row of pendingRows) {
    if (row.nextTryAt >= Number.MAX_SAFE_INTEGER || row.attempts >= 6) {
      hasStopped = true;
    } else if (row.attempts > 0) {
      retryingAt =
        retryingAt === null
          ? row.nextTryAt
          : Math.min(retryingAt, row.nextTryAt);
    }
  }
  if (retryingAt !== null) return { state: "retrying", nextTryAt: retryingAt };
  if (hasStopped) return { state: "stopped", nextTryAt: null };
  return { state: "delivering", nextTryAt: null };
}

export interface NotificationsServiceOptions {
  readonly storage: Storage;
  readonly users: Directory;
  readonly clock: Clock;
  readonly openUrl: string;
  readonly resendApiKey: string | null;
  readonly resendFrom: string | null;
  readonly fetch: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly log?: (error: unknown) => void;
}

/** Creates the workspace notifications service with comment enqueueing and a 15 s delivery loop. */
export function createNotificationsService(
  options: NotificationsServiceOptions,
): NotificationsService {
  const { storage, users, clock, resendApiKey, resendFrom } = options;
  const openUrl = options.openUrl.replace(/\/+$/, "");
  const log = options.log ?? (() => {});
  const emailAvailable =
    resendApiKey !== null &&
    resendApiKey.length > 0 &&
    resendFrom !== null &&
    resendFrom.length > 0;

  const isAvailable = (adapter: NotificationAdapter): boolean =>
    adapter !== "email" || emailAvailable;

  const addressOf = (
    workspaceId: string,
    adapter: NotificationAdapter,
  ): string | null => {
    const row = storage.workspace.get(
      workspaceId,
      NOTIFICATION_SETTING_KEYS[adapter],
    );
    return row === null || row.value.length === 0 ? null : row.value;
  };

  function buildStatuses(
    workspaceId: string,
    isOwner: boolean,
  ): NotificationAdapterStatus[] {
    const pending = isOwner ? storage.outbox.pending(workspaceId) : [];
    return NOTIFICATION_ADAPTERS.map((adapter) => {
      const available = isAvailable(adapter);
      const saved = addressOf(workspaceId, adapter);
      const on = saved !== null && available;
      if (!isOwner) {
        return {
          adapter,
          on,
          available,
          hint: null,
          state: null,
          nextTryAt: null,
        };
      }
      const hint = saved === null ? null : hintForAddress(adapter, saved);
      if (!on) {
        return { adapter, on, available, hint, state: null, nextTryAt: null };
      }
      const delivery = summarizeDelivery(
        pending.filter((row) => row.adapter === adapter),
      );
      return {
        adapter,
        on,
        available,
        hint,
        state: delivery.state,
        nextTryAt: delivery.nextTryAt,
      };
    });
  }

  let stopped = false;
  let inFlight = false;
  let cancelTimer: (() => void) | null = null;

  const deliverNow = async (): Promise<number> => {
    if (inFlight) return 0;
    inFlight = true;
    try {
      return await deliverDue({
        outbox: storage.outbox,
        adapters: { addressOf, resendApiKey, resendFrom },
        now: clock.now,
        fetch: options.fetch,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        schedule: clock.schedule,
      });
    } finally {
      inFlight = false;
    }
  };

  const scheduleNext = (): void => {
    if (stopped) return;
    cancelTimer = clock.schedule(() => {
      cancelTimer = null;
      void deliverNow()
        .catch(log)
        .finally(() => scheduleNext());
    }, DELIVER_INTERVAL_MS);
  };
  scheduleNext();

  return {
    get(callerUserId, workspaceId) {
      if (!isValidWorkspaceId(workspaceId)) return refused("bad_request");
      const role = storage.directory.roleOf(
        indexDocId("workspace", workspaceId),
        callerUserId,
      )?.role;
      if (role === undefined) return refused("forbidden");
      return {
        ok: true,
        value: { adapters: buildStatuses(workspaceId, role === "owner") },
      };
    },

    set(callerUserId, workspaceId, adapter, address) {
      if (!isValidWorkspaceId(workspaceId)) return refused("bad_request");
      const role = storage.directory.roleOf(
        indexDocId("workspace", workspaceId),
        callerUserId,
      )?.role;
      if (role !== "owner") return refused("forbidden");
      const key = NOTIFICATION_SETTING_KEYS[adapter];
      if (address === null) {
        storage.workspace.remove(workspaceId, key);
      } else {
        const validated = validateNotificationAddress(adapter, address);
        if (validated === null) return refused("bad_request");
        storage.workspace.set(workspaceId, key, validated, callerUserId);
      }
      return {
        ok: true,
        value: { adapters: buildStatuses(workspaceId, true) },
      };
    },

    deliverNow,

    stop(): void {
      stopped = true;
      cancelTimer?.();
      cancelTimer = null;
    },

    committed({ room, sender, report }) {
      if (
        room.kind !== "comments" ||
        room.doc === null ||
        report === null ||
        sender === null ||
        room.home.kind === "user" ||
        !report.maps.includes("items")
      ) {
        return;
      }
      try {
        const scriptDocId = storage.directory
          .documentsIn(room.home)
          .find((id) => commentsDocId(id) === room.docId);
        if (
          scriptDocId === undefined ||
          storage.directory.tombstoneOf(scriptDocId) !== null
        ) {
          return;
        }
        const workspace = findScriptWorkspace(
          storage,
          users,
          scriptDocId,
          room.home.id,
          sender.userId,
        );
        if (workspace === null) return;

        const enabledAdapters = NOTIFICATION_ADAPTERS.filter(
          (adapter) =>
            isAvailable(adapter) &&
            addressOf(workspace.workspaceId, adapter) !== null,
        );
        if (enabledAdapters.length === 0) return;

        const writes = readCommentsPush(room.doc, report).filter(
          (w) => w.map === "items" && !w.replaced && w.previous === null,
        );
        if (writes.length === 0) return;
        const addedIds = new Set(writes.map((w) => w.key));
        const allItems = readCommentItems(room.doc);
        const at = clock.now();
        const url = `${openUrl}/s/${scriptDocId}`;

        for (const write of writes) {
          const item = allItems[write.key];
          if (item === undefined) continue;
          const hasEarlier = Object.entries(allItems).some(
            ([otherId, other]) =>
              other.threadId === item.threadId &&
              otherId !== write.key &&
              !addedIds.has(otherId),
          );
          const type: NotificationEventType =
            item.mentionedUserIds.length > 0
              ? "person_mentioned"
              : hasEarlier
                ? "reply_added"
                : "thread_opened";
          const authorName =
            users.user(item.authorUserId)?.name ?? item.authorUserId;
          const mentionedNames = item.mentionedUserIds.map(
            (id) => users.user(id)?.name ?? id,
          );
          const event: NotificationEvent = {
            type,
            workspaceId: workspace.workspaceId,
            workspaceName: workspace.workspaceName,
            docId: scriptDocId,
            title: workspace.title,
            threadId: item.threadId,
            itemId: write.key,
            authorUserId: item.authorUserId,
            authorName,
            mentionedUserIds: item.mentionedUserIds,
            mentionedNames,
            text: item.body,
            url,
            at,
          };
          for (const adapter of enabledAdapters) {
            storage.outbox.enqueue({
              workspaceId: workspace.workspaceId,
              adapter,
              payload: formatAdapterPayload(adapter, event),
            });
          }
        }
      } catch (error) {
        // a sync hook never throws into the commit path
        log(error);
      }
    },
  };
}
