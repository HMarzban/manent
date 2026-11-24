// Steps 0 and 1 of the write path, before an entry's bytes are read: the subscription, the
// generation, the buckets and the sizes, and the refusal an entry gets.
import {
  CODE,
  MESSAGE_LIMIT_BYTES,
  isPermanentPushError,
} from "@manent/sync-protocol";
import type { DocRole } from "@manent/sync-protocol";
import type { Refusal } from "./errors.ts";
import type { Room, Subscription } from "./rooms.ts";
import type { WritePathPorts } from "./write-path-ports.ts";

/**
 * Owners and editors write. A commenter or a viewer reads a script through a viewer; an index, which a viewer cannot
 * project, it subscribes to as an editor does, and every write it sends is refused.
 */
export const isWriterRole = (role: DocRole): boolean =>
  role === "owner" || role === "edit";

/** Commenters also write to comments documents; every other room admits owners and editors only. */
export const mayWriteInRoom = (kind: string, role: DocRole): boolean =>
  isWriterRole(role) || (kind === "comments" && role === "comment");

/** A refusal for good names the entry; any other may be retried. */
export function refusal(
  code: number,
  message: string,
  clientSeq: number,
  retryAfterMs: number | null = null,
): Refusal {
  const permanent = isPermanentPushError(code);
  const named = permanent ? clientSeq : null;
  return { code, message, permanent, retryAfterMs, clientSeq: named };
}

/** The refusal of an entry of `bytes` from `subscription`; null admits it. */
export function admit(
  ports: Pick<WritePathPorts, "limits" | "bucketOf">,
  room: Room,
  subscription: Subscription,
  message: { clientSeq: number; generation: number },
  bytes: number,
): Refusal | null {
  const { limits } = ports;
  const no = (code: number, text: string, retryAfterMs: number | null = null) =>
    refusal(code, text, message.clientSeq, retryAfterMs);
  if (subscription.mode !== "edit") return no(CODE.FORBIDDEN, "not_subscribed");
  if (!mayWriteInRoom(room.kind, subscription.access.role))
    return no(CODE.FORBIDDEN, "read_only_role");
  if (message.generation !== room.row.generation)
    return no(CODE.GENERATION_MISMATCH, "generation_moved");
  const { frames, bytes: volume } = ports.bucketOf(subscription.peer);
  // a bucket refuses a cost above its burst for ever: a larger message waits for a full one
  const cost = Math.min(bytes, limits.byteBurst);
  const frame = frames.take(1);
  const taken = frame.ok ? volume.take(cost) : frame;
  if (!taken.ok)
    return no(CODE.RATE_LIMITED, "rate_limited", taken.retryAfterMs);
  const tooLarge =
    bytes > MESSAGE_LIMIT_BYTES ||
    room.sizeBytes + bytes > limits.documentBytes;
  return tooLarge ? no(CODE.TOO_LARGE, "too_large") : null;
}
