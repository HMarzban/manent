// A setting request in authority mode: a resend is recognised, the value is checked, and the
// authority writes the setting into the room's document itself.
import { scriptSettings } from "@manent/crdt";
import type { Peer, SettingRules } from "./ports.ts";
import type { Room } from "./rooms.ts";

const utf8 = new TextDecoder("utf-8", { fatal: true });
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function wellFormed(text: string): string {
  return text.replace(LONE_SURROGATE, "\uFFFD");
}

/** A JSON reviver: a lone surrogate, in a string or a key, becomes U+FFFD, as every peer decodes it. */
function reviveWellFormed(_key: string, value: unknown): unknown {
  if (typeof value === "string") return wellFormed(value);
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return value;
  const entries = Object.entries(value);
  return Object.fromEntries(entries.map(([k, v]) => [wellFormed(k), v]));
}

/** The value as JSON; null for bytes that are not UTF-8 JSON. */
function readValue(bytes: Uint8Array): { value: unknown } | null {
  try {
    return { value: JSON.parse(utf8.decode(bytes), reviveWellFormed) };
  } catch {
    // not UTF-8, or not JSON: the request is refused as bad_value
    return null;
  }
}

/**
 * A resend (its `clientSeq` is at or below the highest this person and device committed, or at or
 * below `queued`, the highest of theirs already queued) changes nothing. Otherwise the value is
 * checked and written into the loaded room's document, and the update that write made is returned.
 * `message` on a refusal is the ERROR's message.
 */
export function applySetting(
  room: Room,
  peer: Peer,
  message: { clientSeq: number; key: string; value: Uint8Array },
  now: number,
  registry: SettingRules,
  queued: number,
):
  | { ok: true; update: Uint8Array }
  | { ok: true; duplicate: true }
  | { ok: false; message: string } {
  const { clientSeq, key } = message;
  const last = room.file.log.lastSetRequest(
    room.docId,
    peer.userId,
    peer.deviceId,
  );
  if (clientSeq <= Math.max(last, queued)) return { ok: true, duplicate: true };
  const read = readValue(message.value);
  if (read === null) return { ok: false, message: "bad_value" };
  const checked = registry.check(key, read.value);
  if (!checked.ok) return { ok: false, message: checked.code };
  if (registry.isGuarded(key) && room.row.locked > 0)
    return { ok: false, message: "locked" };
  if (room.doc === null)
    throw new RangeError(`the room of ${room.docId} is not loaded`);
  const settings = scriptSettings(room.doc);
  const replaced = settings.entries()[key] ?? null;
  const made: Uint8Array[] = [];
  const stop = room.doc.subscribe((update) => made.push(update));
  try {
    settings.set(key, read.value, {
      userId: peer.userId,
      setAt: now,
      replaced,
    });
  } finally {
    stop();
  }
  // one transaction that always writes the meta, so exactly one update
  const [update] = made;
  if (update === undefined)
    throw new Error(`writing ${key} into ${room.docId} made no update`);
  return { ok: true, update };
}
