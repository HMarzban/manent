// Pure rAF remote prompter scroll interpolator (0 React renders/sec) and rundown operator-control runtime.
import {
  PROMPTER_OPERATOR_TTL_MS,
  parsePrompterOperatorChanged,
  parsePrompterScrollControl,
} from "@manent/sync-protocol";
import type {
  ControlKind,
  PrompterOperator,
  PrompterScrollCommand,
  PrompterScrollState,
} from "@manent/sync-protocol";
import {
  DOCUMENT_WORDS,
  PROMPTER_CONTROL_WORDS,
  PROMPTER_WORDS,
  READOUT_WORDS,
} from "@manent/ui";
import { readDeviceId } from "../services/device-id.ts";
import type { PrompterControlInput } from "../state/prompter.store.ts";
import {
  fetchPrompterControlStatus,
  postPrompterOperatorRelease,
  postPrompterOperatorTake,
  postPrompterScrollCommand,
} from "./prompter-control-http.ts";
import { resolveTargetRow } from "./prompter-model.ts";
import { tokenOf } from "./prompter-send.ts";
import type { PrompterRuntimeState } from "./prompter-send.ts";
import {
  PROMPTER_EYE_LINE_RATIO,
  computeRemoteScrollTop,
  createRemoteScrollController,
} from "./scroll-driver.ts";
import type {
  PrompterFollowMode,
  PrompterRemoteScroll,
  RemoteScrollContainer,
  RemoteScrollController,
} from "./scroll-driver.ts";

export {
  PROMPTER_EYE_LINE_RATIO,
  computeRemoteScrollTop,
  createRemoteScrollController,
};
export type {
  PrompterFollowMode,
  PrompterRemoteScroll,
  RemoteScrollContainer,
  RemoteScrollController,
};

const RENEW_INTERVAL_MS = Math.floor(PROMPTER_OPERATOR_TTL_MS / 2);
const RENEW_RETRY_BASE_MS = 2_000;
const RENEW_RETRY_MAX_MS = 10_000;
const RENEW_RECONCILE_AFTER = 2;
const CONTROL_MESSAGE_ID = "prompter.control";

export interface PrompterControlRuntime {
  readonly deviceId: string;
  refreshStatus(): void;
  handleControlFrame(kind: ControlKind, data: Uint8Array): void;
  takeControl(): void;
  takeOver(): void;
  stopControlling(): void;
  sendCommand(command: PrompterControlInput): void;
  jumpHere(rowId?: string): void;
  onConnectivityChange(online: boolean): void;
  dispose(): void;
}

const unavailableText = (): string =>
  READOUT_WORDS.unavailable(
    PROMPTER_CONTROL_WORDS.controlPrompter,
    PROMPTER_WORDS.tryAgain,
  );

/** Manages server operator lease, periodic renewal, control frames and HTTP scroll commands for one rundown. */
export function createPrompterControlRuntime(
  state: PrompterRuntimeState,
  hooks: { emit(): void; publish(): void },
): PrompterControlRuntime {
  const deviceId = readDeviceId(state.env.storage, state.env.randomId);
  let cancelRenew: (() => void) | null = null;
  let renewFailures = 0;
  let refreshSeq = 0;

  const isMe = (op: PrompterOperator | null): boolean =>
    op !== null &&
    op.userId === state.services.userId &&
    op.deviceId === deviceId;
  const stopRenew = (): void => {
    cancelRenew?.();
    cancelRenew = null;
  };
  const pushMsg = (text: string): void => {
    state.services.messages.withdraw(CONTROL_MESSAGE_ID);
    state.services.messages.push({
      id: CONTROL_MESSAGE_ID,
      text,
      lifetime: "brief",
      ownWork: false,
      actions: [],
    });
  };
  const revokeForbidden = (): void => {
    applyOperator(null);
    pushMsg(DOCUMENT_WORDS.noAccess);
    void refreshStatusAsync();
  };

  const scheduleRenew = (delayMs: number = RENEW_INTERVAL_MS): void => {
    stopRenew();
    if (state.disposed || !state.online || !isMe(state.operator)) return;
    cancelRenew = state.env.schedule(() => {
      cancelRenew = null;
      if (state.disposed || !state.online || !isMe(state.operator)) return;
      const body = {
        deviceId,
        expectedUserId: state.services.userId,
        expectedDeviceId: deviceId,
      };
      void postPrompterOperatorTake(state.rundownId, body, tokenOf(state)).then(
        (outcome) => {
          if (state.disposed) return;
          if (outcome.ok) {
            renewFailures = 0;
            applyOperator(outcome.response.operator);
          } else if (outcome.code === "operator_taken") {
            renewFailures = 0;
            applyOperator(outcome.operator);
          } else if (outcome.code === "forbidden") {
            revokeForbidden();
          } else {
            renewFailures += 1;
            const backoff = Math.min(
              RENEW_RETRY_MAX_MS,
              RENEW_RETRY_BASE_MS * 2 ** (renewFailures - 1),
            );
            if (state.online && isMe(state.operator)) scheduleRenew(backoff);
            if (renewFailures >= RENEW_RECONCILE_AFTER)
              void refreshStatusAsync();
          }
        },
      );
    }, delayMs);
  };

  const applyOperator = (next: PrompterOperator | null): void => {
    refreshSeq += 1;
    state.operator = next;
    state.isOperator = isMe(next);
    if (state.isOperator) scheduleRenew();
    else {
      renewFailures = 0;
      stopRenew();
    }
    hooks.emit();
    hooks.publish();
  };

  const applyScroll = (next: PrompterScrollState | null): void => {
    if (next !== null && state.scroll !== null && next.seq < state.scroll.seq)
      return;
    state.scroll = next;
    hooks.emit();
  };

  const refreshStatusAsync = async (): Promise<boolean> => {
    if (state.disposed || !state.online) return false;
    const seq = ++refreshSeq;
    const status = await fetchPrompterControlStatus(
      state.rundownId,
      tokenOf(state),
    );
    if (state.disposed || seq !== refreshSeq || status === null) return false;
    renewFailures = 0;
    state.operator = status.operator;
    state.isOperator = isMe(status.operator);
    state.scroll = status.scroll;
    if (state.isOperator) scheduleRenew();
    else stopRenew();
    hooks.emit();
    hooks.publish();
    return true;
  };

  const claim = (
    expectedUserId: string | null,
    expectedDeviceId?: string | null,
  ): void => {
    if (state.disposed || !state.online || state.takingControl) return;
    state.takingControl = true;
    hooks.emit();
    const body =
      expectedDeviceId !== undefined
        ? { deviceId, expectedUserId, expectedDeviceId }
        : { deviceId, expectedUserId };
    void postPrompterOperatorTake(state.rundownId, body, tokenOf(state)).then(
      (outcome) => {
        state.takingControl = false;
        if (state.disposed) return;
        if (outcome.ok) {
          renewFailures = 0;
          return applyOperator(outcome.response.operator);
        }
        if (outcome.code === "operator_taken") {
          renewFailures = 0;
          applyOperator(outcome.operator);
          pushMsg(
            PROMPTER_CONTROL_WORDS.alreadyControlsPrompter(
              outcome.operator.name,
            ),
          );
          return;
        }
        if (outcome.code === "forbidden") return revokeForbidden();
        pushMsg(unavailableText());
        hooks.emit();
        void refreshStatusAsync();
      },
    );
  };

  const sendCommand = (command: PrompterControlInput): void => {
    if (state.disposed || !state.online || !state.isOperator) return;
    const full = { ...command, deviceId } as PrompterScrollCommand;
    void postPrompterScrollCommand(state.rundownId, full, tokenOf(state)).then(
      (outcome) => {
        if (state.disposed) return;
        if (outcome.ok) {
          renewFailures = 0;
          applyOperator(outcome.response.operator);
          applyScroll(outcome.response.scroll);
        } else if (outcome.code === "not_operator") void refreshStatusAsync();
        else if (outcome.code === "forbidden") revokeForbidden();
        else if (outcome.code === "other") {
          pushMsg(unavailableText());
          void refreshStatusAsync();
        }
      },
    );
  };

  const releaseNow = (): void => {
    void postPrompterOperatorRelease(
      state.rundownId,
      { deviceId },
      tokenOf(state),
    );
  };

  return {
    deviceId,
    refreshStatus: () => void refreshStatusAsync(),
    handleControlFrame(kind, data) {
      if (kind === "prompter_operator_changed") {
        const event = parsePrompterOperatorChanged(data);
        if (event !== null) applyOperator(event.operator);
      } else if (kind === "prompter_scroll") {
        const event = parsePrompterScrollControl(data);
        if (event !== null) applyScroll(event.scroll);
      }
    },
    takeControl: () => claim(null),
    takeOver: () =>
      claim(state.operator?.userId ?? null, state.operator?.deviceId ?? null),
    stopControlling() {
      if (state.disposed || !state.isOperator) return;
      refreshSeq += 1;
      renewFailures = 0;
      stopRenew();
      state.operator = null;
      state.isOperator = false;
      hooks.emit();
      hooks.publish();
      releaseNow();
    },
    sendCommand,
    jumpHere(rowId) {
      if (state.disposed || !state.online || !state.isOperator) return;
      const row =
        rowId !== undefined
          ? (state.latestView?.rundown?.rows.find((r) => r.id === rowId) ??
            null)
          : resolveTargetRow(
              state.latestView,
              state.latestBeside,
              state.overrideRowId,
            );
      if (
        row === null ||
        (row.prompter === null && !state.knownSentRows.has(row.id))
      )
        return;
      sendCommand({ action: "cue", rowId: row.id, lineOffset: 0 });
    },
    onConnectivityChange(online) {
      stopRenew();
      renewFailures = 0;
      if (!online) return;
      void refreshStatusAsync().then((ok) => {
        if (!ok && !state.disposed && state.online && isMe(state.operator))
          scheduleRenew();
      });
    },
    dispose() {
      stopRenew();
      if (state.isOperator && state.online) releaseNow();
    },
  };
}
