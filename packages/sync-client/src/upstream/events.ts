// The reader of an event another tab or the local node passed on, and which of them the upstream
// status carries.
import { CONTROL_KINDS, LOCK_SOURCES } from "@manent/sync-protocol";
import type {
  ControlKind,
  LockAnchorRecord,
  LockSource,
} from "@manent/sync-protocol";
import type { DocEvent } from "../session/doc-handle.ts";

export type UpstreamEvent = Extract<
  DocEvent,
  { type: "receipt" | "rebuilt" | "past_window" | "rejected" }
>;

type Fields = Record<string, unknown>;

export function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const UPSTREAM_EVENT_TYPES: Readonly<Record<UpstreamEvent["type"], true>> =
  Object.freeze({
    receipt: true,
    rebuilt: true,
    past_window: true,
    rejected: true,
  });

/** One of the kinds of event the upstream status carries. */
export function isUpstreamEvent(event: DocEvent): event is UpstreamEvent {
  return Object.hasOwn(UPSTREAM_EVENT_TYPES, event.type);
}

type Subscribed = Extract<DocEvent, { type: "subscribed" }>;

function isControlKind(value: unknown): value is ControlKind {
  return CONTROL_KINDS.some((kind) => kind === value);
}

function isLockSource(value: unknown): value is LockSource {
  return LOCK_SOURCES.some((source) => source === value);
}

function isLockAnchor(value: unknown): value is LockAnchorRecord {
  if (!isFields(value)) return false;
  const { level, order, label, blockId, offset, quote, fallbackIds } = value;
  return (
    typeof level === "number" &&
    typeof order === "number" &&
    typeof label === "string" &&
    typeof blockId === "string" &&
    typeof offset === "number" &&
    typeof quote === "string" &&
    Array.isArray(fallbackIds) &&
    Array.from(fallbackIds).every((id) => typeof id === "string") &&
    isLockSource(value.source)
  );
}

function isLockAnchors(value: unknown): value is Subscribed["lockAnchors"] {
  return (
    value === null ||
    (Array.isArray(value) && Array.from(value).every((a) => isLockAnchor(a)))
  );
}

function isRevision(value: unknown): value is Subscribed["revision"] {
  return (
    value === null ||
    (isFields(value) &&
      typeof value.setId === "string" &&
      typeof value.baselineVersionId === "string")
  );
}

/**
 * An event another tab or the local node passed on; null for anything else.
 * `replaced` and `recovered` read as null: a leading tab sends each as a
 * message of its own, and the node passes on neither.
 */
export function readEvent(value: unknown): DocEvent | null {
  if (!isFields(value)) return null;
  const { code, replayed, setAside, sent, key, message } = value;
  const { applied, overlaps, versionId } = value;
  const { kind, data, lockLevel, lockAnchors, revision } = value;
  switch (value.type) {
    case "rejected":
      return typeof code === "number" &&
        typeof replayed === "number" &&
        typeof setAside === "number"
        ? { type: "rejected", code, replayed, setAside }
        : null;
    case "setting_refused":
      return typeof key === "string" && typeof message === "string"
        ? { type: "setting_refused", key, message }
        : null;
    case "receipt":
      return typeof sent === "number" &&
        typeof setAside === "number" &&
        typeof overlaps === "number"
        ? { type: "receipt", sent, setAside, overlaps }
        : null;
    case "rebuilt":
      return typeof applied === "number" &&
        typeof overlaps === "number" &&
        typeof setAside === "number"
        ? { type: "rebuilt", applied, overlaps, setAside }
        : null;
    case "past_window":
      return typeof versionId === "string"
        ? { type: "past_window", versionId }
        : null;
    case "control":
      return isControlKind(kind) && data instanceof Uint8Array
        ? { type: "control", kind, data }
        : null;
    case "subscribed":
      return typeof lockLevel === "number" &&
        isLockAnchors(lockAnchors) &&
        isRevision(revision)
        ? { type: "subscribed", lockLevel, lockAnchors, revision }
        : null;
    default:
      return null;
  }
}
