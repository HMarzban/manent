// Server-held remote prompter operator lease (CAS, 30 s TTL, per-deviceId) and scroll control fanout (ADR 0072).
import type { Storage } from "@manent/storage";
import {
  PROMPTER_OPERATOR_TTL_MS,
  encodePrompterOperatorChanged,
  encodePrompterScrollControl,
  isDocId,
  isPrompterScrollCommand,
} from "@manent/sync-protocol";
import type {
  ControlKind,
  Identity,
  Message,
  PrompterControlResponse,
  PrompterOperator,
  PrompterOperatorReleaseRequest,
  PrompterOperatorResponse,
  PrompterOperatorTakeRequest,
  PrompterScrollCommand,
  PrompterScrollState,
} from "@manent/sync-protocol";
import type { Clock, SyncService } from "../sync/ports.ts";
import type { Room } from "../sync/rooms.ts";
import {
  checkRundownControlAccess,
  nextScrollState,
  projectedScrollOffset,
} from "./hub-fanout.ts";
import { createRundownChain } from "./send-trail.ts";
import type { PrompterFeedHub } from "./subscribe.ts";

export interface PrompterControlStatus {
  operator: PrompterOperator | null;
  scroll: PrompterScrollState | null;
  serverTime: number;
}

export type PrompterControlOutcome<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: "bad_request" | "forbidden" | "not_in_rundown" | "deleted";
    }
  | {
      ok: false;
      code: "operator_taken";
      operator: PrompterOperator;
      serverTime: number;
    }
  | { ok: false; code: "not_operator"; serverTime: number };

export interface PrompterControlService {
  status(
    userId: string,
    docId: string,
  ): Promise<PrompterControlOutcome<PrompterControlStatus>>;
  take(
    user: Identity,
    docId: string,
    request: PrompterOperatorTakeRequest,
  ): Promise<PrompterControlOutcome<PrompterOperatorResponse>>;
  release(
    userId: string,
    docId: string,
    request: PrompterOperatorReleaseRequest,
  ): Promise<PrompterControlOutcome<PrompterOperatorResponse>>;
  command(
    userId: string,
    docId: string,
    cmd: PrompterScrollCommand,
  ): Promise<PrompterControlOutcome<PrompterControlResponse>>;
  onEditorLeft(room: Room, userId: string): void;
  onForgotten(room: Room): void;
  sendSnapshotTo(
    docId: string,
    tell: (message: Message) => void,
    meta: { generation: number; headSeq: number },
  ): void;
  stop(): void;
}

interface RundownControlState {
  operator: PrompterOperator | null;
  generation: number | null;
  scroll: PrompterScrollState | null;
  cancelExpiry: (() => void) | null;
}

const MAX_DEVICE_ID = 128;
const isDeviceId = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= MAX_DEVICE_ID;
const badReq = <T>(): Promise<PrompterControlOutcome<T>> =>
  Promise.resolve({ ok: false, code: "bad_request" });
const isHolder = (
  op: PrompterOperator | null,
  userId: string,
  deviceId: string,
): boolean => op !== null && op.userId === userId && op.deviceId === deviceId;

export function createPrompterControl(options: {
  storage: Storage;
  sync: () => SyncService;
  clock: Clock;
  feed: PrompterFeedHub;
}): PrompterControlService {
  const { storage, sync, clock, feed } = options;
  const inChain = createRundownChain();
  const byDoc = new Map<string, RundownControlState>();

  function ensure(docId: string): RundownControlState {
    let state = byDoc.get(docId);
    if (state === undefined) {
      state = {
        operator: null,
        generation: null,
        scroll: null,
        cancelExpiry: null,
      };
      byDoc.set(docId, state);
    }
    return state;
  }

  function fanout(docId: string, kind: ControlKind, data: Uint8Array): void {
    feed.broadcastControl(docId, kind, data);
    sync().broadcast(docId, kind, data);
  }

  function clearOperator(
    docId: string,
    state: RundownControlState,
    now: number,
  ): void {
    state.cancelExpiry?.();
    state.cancelExpiry = null;
    if (state.operator === null) return;
    state.operator = null;
    state.generation = null;
    if (state.scroll?.playing) {
      state.scroll = {
        ...state.scroll,
        seq: state.scroll.seq + 1,
        playing: false,
        lineOffset: projectedScrollOffset(state.scroll, now),
        updatedAt: now,
        operatorUserId: null,
        operatorDeviceId: null,
      };
      fanout(
        docId,
        "prompter_scroll",
        encodePrompterScrollControl({
          docId,
          scroll: state.scroll,
          serverTime: now,
        }),
      );
    }
    fanout(
      docId,
      "prompter_operator_changed",
      encodePrompterOperatorChanged({ docId, operator: null, serverTime: now }),
    );
  }

  function armExpiry(docId: string, state: RundownControlState): void {
    state.cancelExpiry?.();
    const expiresAt = state.operator?.expiresAt;
    if (expiresAt === undefined) {
      state.cancelExpiry = null;
      return;
    }
    state.cancelExpiry = clock.schedule(
      () => {
        state.cancelExpiry = null;
        if (byDoc.get(docId) !== state || state.operator === null) return;
        const now = clock.now();
        if (now < state.operator.expiresAt) return armExpiry(docId, state);
        clearOperator(docId, state, now);
      },
      Math.max(1, expiresAt - clock.now()),
    );
  }

  function purgeExpired(
    docId: string,
    state: RundownControlState | undefined,
    now: number,
  ): void {
    if (state?.operator && state.operator.expiresAt <= now)
      clearOperator(docId, state, now);
  }

  return {
    status(userId, docId) {
      if (!isDocId(docId)) return badReq();
      return inChain(docId, async () => {
        const auth = checkRundownControlAccess(
          storage,
          sync(),
          userId,
          docId,
          false,
        );
        if (!auth.ok) return auth;
        const now = clock.now();
        const state = byDoc.get(docId);
        purgeExpired(docId, state, now);
        return {
          ok: true,
          value: {
            operator: state?.operator ?? null,
            scroll: state?.scroll ?? null,
            serverTime: now,
          },
        };
      });
    },
    take(user, docId, req) {
      if (
        !isDocId(docId) ||
        !isDeviceId(req.deviceId) ||
        (req.expectedUserId !== null &&
          typeof req.expectedUserId !== "string") ||
        (req.expectedDeviceId !== undefined &&
          req.expectedDeviceId !== null &&
          typeof req.expectedDeviceId !== "string")
      )
        return badReq();
      return inChain(docId, async () => {
        const auth = checkRundownControlAccess(
          storage,
          sync(),
          user.userId,
          docId,
          true,
        );
        if (!auth.ok) return auth;
        const now = clock.now();
        const state = ensure(docId);
        purgeExpired(docId, state, now);
        const cur = state.operator;
        const same = isHolder(cur, user.userId, req.deviceId);
        if (cur !== null && !same) {
          const okUser = cur.userId === req.expectedUserId;
          const okDev =
            req.expectedDeviceId === undefined ||
            cur.deviceId === req.expectedDeviceId;
          if (!okUser || !okDev)
            return {
              ok: false,
              code: "operator_taken",
              operator: cur,
              serverTime: now,
            };
        }
        const operator: PrompterOperator = {
          userId: user.userId,
          name: user.name,
          deviceId: req.deviceId,
          since: same ? cur!.since : now,
          expiresAt: now + PROMPTER_OPERATOR_TTL_MS,
        };
        state.operator = operator;
        state.generation = auth.generation;
        armExpiry(docId, state);
        fanout(
          docId,
          "prompter_operator_changed",
          encodePrompterOperatorChanged({ docId, operator, serverTime: now }),
        );
        return { ok: true, value: { operator, serverTime: now } };
      });
    },
    release(userId, docId, req) {
      if (!isDocId(docId) || !isDeviceId(req.deviceId)) return badReq();
      return inChain(docId, async () => {
        const auth = checkRundownControlAccess(
          storage,
          sync(),
          userId,
          docId,
          false,
        );
        if (!auth.ok) return auth;
        const now = clock.now();
        const state = byDoc.get(docId);
        purgeExpired(docId, state, now);
        if (
          state === undefined ||
          !isHolder(state.operator, userId, req.deviceId)
        )
          return { ok: false, code: "not_operator", serverTime: now };
        clearOperator(docId, state, now);
        return { ok: true, value: { operator: null, serverTime: now } };
      });
    },
    command(userId, docId, cmd) {
      if (!isDocId(docId) || !isPrompterScrollCommand(cmd)) return badReq();
      return inChain(docId, async () => {
        const auth = checkRundownControlAccess(
          storage,
          sync(),
          userId,
          docId,
          true,
        );
        if (!auth.ok) return auth;
        const now = clock.now();
        const state = byDoc.get(docId);
        purgeExpired(docId, state, now);
        const cur = state?.operator ?? null;
        if (
          state === undefined ||
          cur === null ||
          !isHolder(cur, userId, cmd.deviceId)
        )
          return { ok: false, code: "not_operator", serverTime: now };
        const operator: PrompterOperator = {
          ...cur,
          expiresAt: now + PROMPTER_OPERATOR_TTL_MS,
        };
        state.operator = operator;
        armExpiry(docId, state);
        const scroll = nextScrollState(state.scroll, cmd, userId, now);
        state.scroll = scroll;
        fanout(
          docId,
          "prompter_scroll",
          encodePrompterScrollControl({ docId, scroll, serverTime: now }),
        );
        return { ok: true, value: { scroll, operator, serverTime: now } };
      });
    },
    onEditorLeft(room, userId) {
      const state = byDoc.get(room.docId);
      const holding = state?.operator ?? null;
      if (state === undefined || holding === null || holding.userId !== userId)
        return;
      for (const peer of [...room.editors.keys(), ...room.viewers.keys()])
        if (peer.userId === userId && peer.deviceId === holding.deviceId)
          return;
      if (
        state.generation !== null &&
        state.generation !== room.row.generation
      ) {
        state.generation = room.row.generation;
        return;
      }
      clearOperator(room.docId, state, clock.now());
    },
    onForgotten(room) {
      const state = byDoc.get(room.docId);
      if (state === undefined) return;
      clearOperator(room.docId, state, clock.now());
      byDoc.delete(room.docId);
    },
    sendSnapshotTo(docId, tell, meta) {
      const state = byDoc.get(docId);
      if (state === undefined) return;
      const now = clock.now();
      purgeExpired(docId, state, now);
      const send = (kind: ControlKind, data: Uint8Array): void =>
        tell({
          type: "CONTROL",
          docId,
          generation: meta.generation,
          seq: meta.headSeq,
          kind,
          data,
        });
      if (state.operator !== null)
        send(
          "prompter_operator_changed",
          encodePrompterOperatorChanged({
            docId,
            operator: state.operator,
            serverTime: now,
          }),
        );
      if (state.scroll !== null)
        send(
          "prompter_scroll",
          encodePrompterScrollControl({
            docId,
            scroll: state.scroll,
            serverTime: now,
          }),
        );
    },
    stop() {
      for (const state of byDoc.values()) state.cancelExpiry?.();
      byDoc.clear();
    },
  };
}
