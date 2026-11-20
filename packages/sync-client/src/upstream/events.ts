// The reader of an event another tab or the local node passed on, and which of them the upstream
// status carries.
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

/**
 * An event another tab or the local node passed on; null for anything else.
 * `replaced` and `recovered` read as null: a leading tab sends each as a
 * message of its own, and the node passes on neither.
 */
export function readEvent(value: unknown): DocEvent | null {
  if (!isFields(value)) return null;
  const { code, replayed, setAside, sent, key, message } = value;
  const { applied, overlaps, versionId } = value;
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
    default:
      return null;
  }
}
