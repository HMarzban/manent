// The leader by Web Locks: one lock per user, held for as long as the tab leads, and one
// channel per user for the tabs' messages.
import type { LeaderPort } from "@manent/sync-client";

/** The shape of `navigator.locks`. */
export interface LockApi {
  request(
    name: string,
    options: { signal: AbortSignal },
    held: () => Promise<void>,
  ): Promise<unknown>;
}

/** What the tabs use of a BroadcastChannel. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
}

/**
 * A BroadcastChannel as a ChannelLike. The browser's handler property takes its own
 * event type, which the shape's does not, so its messages are passed on to the shape's handler.
 */
function broadcastChannel(name: string): ChannelLike {
  const channel = new BroadcastChannel(name);
  const like: ChannelLike = {
    postMessage: channel.postMessage.bind(channel),
    onmessage: null,
    close: channel.close.bind(channel),
  };
  channel.addEventListener("message", (event) => like.onmessage?.(event));
  return like;
}

/** Defaults: `navigator.locks`, read at each campaign, and BroadcastChannel. `onDeposed` never runs: a lock is never taken away. */
export function webLeader(options: {
  userId: string;
  tabId: string;
  locks?: LockApi;
  channel?: (name: string) => ChannelLike;
}): LeaderPort {
  const { userId, tabId } = options;
  const channel = (options.channel ?? broadcastChannel)(
    `manent:tabs:${userId}`,
  );
  const listeners = new Set<(message: unknown) => void>();
  const onmessage: ChannelLike["onmessage"] = (event) => {
    for (const listener of listeners) listener(event.data);
  };
  // the shape has a handler property, not addEventListener
  Object.assign(channel, { onmessage });
  return {
    tabId,
    campaign(handlers) {
      const locks = options.locks ?? navigator.locks;
      const withdrawal = new AbortController();
      let release: (() => void) | null = null;
      let done = false;
      const held = (): Promise<void> => {
        // withdrawn once the grant was decided, when aborting no longer refuses it: let the lock go unused
        if (done) return Promise.resolve();
        handlers.onElected();
        return new Promise((resolve) => (release = resolve));
      };
      locks
        .request(`manent:leader:${userId}`, { signal: withdrawal.signal }, held)
        .catch((error: unknown) => {
          // a withdrawal before the grant rejects the request: that is the withdrawal itself
          if (!withdrawal.signal.aborted) throw error;
        });
      return () => {
        done = true;
        if (release === null) withdrawal.abort();
        else release();
      };
    },
    post: channel.postMessage.bind(channel),
    listen(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
