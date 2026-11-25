// A simulated person's caret as the others see it, sent promptly as they type.
import { blockIds, encodeAwareness } from "@manent/crdt";
import type { DocHandle, Clock } from "@manent/sync-client";

/** Shortest gap between awareness sends inside one block, ms: immediate on normal typing, throttled under burst load. */
const MIN_INTERVAL_MS = 50;
/** The last state is sent again this long after the last send, within the server's 30-second timeout. */
const RENEW_MS = 15_000;

/** A place in a block: its id and the offset in its text. */
export interface Caret {
  blockId: string;
  offset: number;
}

export interface WriterPresence {
  /** The caret is now at `caret`: sent at once on block change or once MIN_INTERVAL_MS has passed, else on a trailing tick. */
  moved(caret: Caret): void;
  /** Stops every timer and sends a null state once. */
  leave(): void;
}

const noop = (): void => {};

/**
 * Sends the caret as awareness state `{ cursor }` with the index of its block as the hint, and the last state
 * again every RENEW_MS, so that the server never removes a person who is still writing.
 */
export function createWriterPresence(options: {
  handle: Pick<DocHandle, "doc" | "sendAwareness">;
  clock: Clock;
}): WriterPresence {
  const { handle, clock } = options;
  let tick = 0;
  let left = false;
  // the block last sent, its index hint, and when it was sent
  let sent: { blockId: string; at: number; sentAt: number } | null = null;
  let cancelSend = noop;
  let cancelRenew = noop;
  const sendState = (state: Record<string, unknown> | null) => {
    tick += 1;
    const { clientId } = handle.doc();
    handle.sendAwareness(encodeAwareness([{ clientId, clock: tick, state }]));
  };
  const send = (caret: Caret) => {
    cancelRenew();
    const at =
      sent?.blockId === caret.blockId
        ? sent.at
        : blockIds(handle.doc()).indexOf(caret.blockId);
    sent = { blockId: caret.blockId, at, sentAt: clock.now() };
    sendState({ cursor: { anchor: caret, head: caret, at } });
    cancelRenew = clock.schedule(() => send(caret), RENEW_MS);
  };
  return {
    moved(caret) {
      if (left) return;
      cancelSend();
      cancelSend = noop;
      const waitMs =
        sent === null || sent.blockId !== caret.blockId
          ? 0
          : sent.sentAt + MIN_INTERVAL_MS - clock.now();
      if (waitMs <= 0) {
        send(caret);
        return;
      }
      cancelSend = clock.schedule(() => {
        cancelSend = noop;
        send(caret);
      }, waitMs);
    },
    leave() {
      if (left) return;
      left = true;
      cancelSend();
      cancelSend = noop;
      cancelRenew();
      cancelRenew = noop;
      sendState(null);
    },
  };
}
