// A simulated person's caret as the others see it, sent as an editor sends its own.
import { blockIds, encodeAwareness } from "@manent/crdt";
import type { DocHandle, Clock } from "@manent/sync-client";

/** How long a caret stays still inside one block before it is sent, as an editor waits. */
const IDLE_MS = 200;
/** The last state is sent again this long after the last send, within the server's 30-second timeout. */
const RENEW_MS = 15_000;

/** A place in a block: its id and the offset in its text. */
export interface Caret {
  blockId: string;
  offset: number;
}

export interface WriterPresence {
  /** The caret is now at `caret`: sent at once when it is in another block, else after IDLE_MS of stillness. */
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
  // the block last sent and its index, which stays a good hint while the caret is in it
  let sent: { blockId: string; at: number } | null = null;
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
    sent = { blockId: caret.blockId, at };
    sendState({ cursor: { anchor: caret, head: caret, at } });
    cancelRenew = clock.schedule(() => send(caret), RENEW_MS);
  };
  return {
    moved(caret) {
      cancelSend();
      cancelSend = noop;
      if (sent?.blockId !== caret.blockId) {
        send(caret);
        return;
      }
      cancelSend = clock.schedule(() => {
        cancelSend = noop;
        send(caret);
      }, IDLE_MS);
    },
    leave() {
      cancelSend();
      cancelRenew();
      sendState(null);
    },
  };
}
