// Remote prompter scroll control DTOs and CONTROL frame codecs (ADR 0072).
import { isDocId } from "./doc-id.ts";

/** Server-held operator lease lifetime in milliseconds unless renewed or released. */
export const PROMPTER_OPERATOR_TTL_MS = 30_000;

/** Minimum allowed remote scroll rate in lines per second. */
export const PROMPTER_MIN_SPEED_LPS = 0.5;

/** Maximum allowed remote scroll rate in lines per second. */
export const PROMPTER_MAX_SPEED_LPS = 15;

/** Default remote scroll rate in lines per second. */
export const PROMPTER_DEFAULT_SPEED_LPS = 3;

const MAX_DEVICE_ID_LENGTH = 128;
const MAX_NUDGE_LINES = 1_000;

export const PROMPTER_SCROLL_ACTIONS = [
  "play",
  "pause",
  "speed",
  "cue",
  "nudge",
] as const;
export type PrompterScrollAction = (typeof PROMPTER_SCROLL_ACTIONS)[number];

/** Who currently holds the remote prompter scroll lease for one rundown. */
export interface PrompterOperator {
  userId: string;
  name: string;
  deviceId: string;
  /** Epoch milliseconds when the server granted or renewed the lease. */
  since: number;
  /** Epoch milliseconds when the lease expires unless renewed or released. */
  expiresAt: number;
}

/** Body of POST /api/prompter/:docId/operator/take (compare-and-swap on expected holder). */
export interface PrompterOperatorTakeRequest {
  deviceId: string;
  /** Expected current holder userId; null when expecting nobody. */
  expectedUserId: string | null;
  /** Optional expected current holder deviceId for same-user multi-device CAS. */
  expectedDeviceId?: string | null;
}

/** Body of POST /api/prompter/:docId/operator/release. */
export interface PrompterOperatorReleaseRequest {
  deviceId: string;
}

/** Answer to take/release/status; operator is null when nobody controls the prompter. */
export interface PrompterOperatorResponse {
  operator: PrompterOperator | null;
  /** Current server epoch milliseconds for clock-offset smoothing. */
  serverTime: number;
}

/** 409 answer when take fails compare-and-swap because someone else controls the prompter. */
export interface PrompterOperatorTakenResponse {
  error: "operator_taken";
  operator: PrompterOperator;
  serverTime: number;
}

/** JSON payload of CONTROL `prompter_operator_changed`. */
export interface PrompterOperatorChanged {
  docId: string;
  operator: PrompterOperator | null;
  /** Server epoch milliseconds when the operator state changed. */
  serverTime: number;
}

/** Body of POST /api/prompter/:docId/control. */
export type PrompterScrollCommand =
  | {
      action: "play";
      deviceId: string;
      linesPerSecond?: number;
    }
  | {
      action: "pause";
      deviceId: string;
    }
  | {
      action: "speed";
      deviceId: string;
      linesPerSecond: number;
    }
  | {
      action: "cue";
      deviceId: string;
      rowId: string;
      lineOffset?: number;
    }
  | {
      action: "nudge";
      deviceId: string;
      deltaLines: number;
    };

/** Authoritative remote scroll anchor for client-side rAF interpolation. */
export interface PrompterScrollState {
  /** Monotonically increasing revision per rundown so stale frames are ignored. */
  seq: number;
  playing: boolean;
  linesPerSecond: number;
  rowId: string | null;
  lineOffset: number;
  /** Server epoch milliseconds when this anchor was established. */
  updatedAt: number;
  operatorUserId: string | null;
  operatorDeviceId: string | null;
}

/** JSON payload of CONTROL `prompter_scroll`. */
export interface PrompterScrollControlEvent {
  docId: string;
  scroll: PrompterScrollState;
  /** Server epoch milliseconds when emitted (for smoothed clock offset). */
  serverTime: number;
}

/** Answer to POST /api/prompter/:docId/control. */
export interface PrompterControlResponse {
  scroll: PrompterScrollState;
  operator: PrompterOperator;
  serverTime: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isDeviceId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_DEVICE_ID_LENGTH;

const isEpochMs = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isValidSpeed = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= PROMPTER_MIN_SPEED_LPS &&
  value <= PROMPTER_MAX_SPEED_LPS;

export function isPrompterOperator(value: unknown): value is PrompterOperator {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.userId) &&
    typeof value.name === "string" &&
    isDeviceId(value.deviceId) &&
    isEpochMs(value.since) &&
    isEpochMs(value.expiresAt) &&
    value.expiresAt >= value.since
  );
}

export function isPrompterScrollCommand(
  value: unknown,
): value is PrompterScrollCommand {
  if (!isRecord(value) || !isDeviceId(value.deviceId)) return false;
  switch (value.action) {
    case "play":
      return (
        value.linesPerSecond === undefined || isValidSpeed(value.linesPerSecond)
      );
    case "pause":
      return true;
    case "speed":
      return isValidSpeed(value.linesPerSecond);
    case "cue":
      return (
        isNonEmptyString(value.rowId) &&
        (value.lineOffset === undefined ||
          (typeof value.lineOffset === "number" &&
            Number.isFinite(value.lineOffset) &&
            value.lineOffset >= 0))
      );
    case "nudge":
      return (
        typeof value.deltaLines === "number" &&
        Number.isFinite(value.deltaLines) &&
        value.deltaLines !== 0 &&
        Math.abs(value.deltaLines) <= MAX_NUDGE_LINES
      );
    default:
      return false;
  }
}

export function isPrompterScrollState(
  value: unknown,
): value is PrompterScrollState {
  if (!isRecord(value)) return false;
  return (
    isEpochMs(value.seq) &&
    typeof value.playing === "boolean" &&
    isValidSpeed(value.linesPerSecond) &&
    (value.rowId === null || isNonEmptyString(value.rowId)) &&
    typeof value.lineOffset === "number" &&
    Number.isFinite(value.lineOffset) &&
    isEpochMs(value.updatedAt) &&
    (value.operatorUserId === null || isNonEmptyString(value.operatorUserId)) &&
    (value.operatorDeviceId === null || isDeviceId(value.operatorDeviceId))
  );
}

function decodeJson(data: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
  } catch {
    return null;
  }
}

export function encodePrompterOperatorChanged(
  event: PrompterOperatorChanged,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event));
}

export function parsePrompterOperatorChanged(
  data: Uint8Array,
): PrompterOperatorChanged | null {
  const value = decodeJson(data);
  if (!isRecord(value) || !isDocId(value.docId) || !isEpochMs(value.serverTime))
    return null;
  if (value.operator !== null && !isPrompterOperator(value.operator))
    return null;
  return {
    docId: value.docId,
    operator: value.operator,
    serverTime: value.serverTime,
  };
}

export function encodePrompterScrollControl(
  event: PrompterScrollControlEvent,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event));
}

export function parsePrompterScrollControl(
  data: Uint8Array,
): PrompterScrollControlEvent | null {
  const value = decodeJson(data);
  if (
    !isRecord(value) ||
    !isDocId(value.docId) ||
    !isEpochMs(value.serverTime) ||
    !isPrompterScrollState(value.scroll)
  )
    return null;
  return {
    docId: value.docId,
    scroll: value.scroll,
    serverTime: value.serverTime,
  };
}
