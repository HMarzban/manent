// The messages waiting for the slot: one shown at a time, in arrival order, none dropped.
import type { Timing } from "../../surfaces/timing.ts";
import type { Message, MessageQueue } from "./message.ts";

/** How long a `reverse` or `brief` message stays once it is shown. */
export const MESSAGE_REVERSE_MS = 30_000;

const ACTION_LIMIT = 2;
const UNDO = "edit.undo";

const assertMessage = (message: Message): void => {
  if (message.actions.length > ACTION_LIMIT) {
    throw new RangeError(
      `a message holds at most two actions, not ${message.actions.length}`,
    );
  }
  if (message.ownWork && message.lifetime !== "until_dismissed") {
    throw new RangeError(
      `a message about own work stays until dismissed, not ${message.lifetime}`,
    );
  }
};

const withoutUndo = (message: Message): Message =>
  message.actions.some((action) => action.commandId === UNDO)
    ? {
        ...message,
        actions: message.actions.filter((action) => action.commandId !== UNDO),
      }
    : message;

// a message's id names its kind and may repeat; `key` is unique within one queue, one per push
interface Entry {
  key: number;
  message: Message;
}

/** `push` throws a RangeError for more than two actions, and for own work whose lifetime is not `until_dismissed`. */
export function createMessageQueue(options: Timing): MessageQueue {
  let waiting: readonly Entry[] = [];
  let pushes = 0;
  let receipts: readonly Message[] = [];
  let cancelTimer: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  // the time of a reverse or brief message starts when it is shown
  const show = (): void => {
    cancelTimer?.();
    cancelTimer = null;
    const head = waiting[0];
    if (head === undefined || head.message.lifetime === "until_dismissed")
      return;
    cancelTimer = options.schedule(() => remove(head.key), MESSAGE_REVERSE_MS);
  };
  const remove = (key: number): void => {
    const shown = waiting[0]?.key === key;
    waiting = waiting.filter((entry) => entry.key !== key);
    if (shown) show();
    notify();
  };

  return {
    push(message) {
      assertMessage(message);
      waiting = [...waiting, { key: pushes++, message }];
      if (message.ownWork) receipts = [...receipts, message];
      if (waiting.length === 1) show();
      notify();
    },
    current: () => waiting[0]?.message ?? null,
    // the shown message comes first, so it is the one dismissed when its id matches
    dismiss(id) {
      const entry = waiting.find(({ message }) => message.id === id);
      if (entry !== undefined) remove(entry.key);
    },
    withdraw(id) {
      if (!waiting.some(({ message }) => message.id === id)) return;
      const shown = waiting[0]?.message.id === id;
      waiting = waiting.filter(({ message }) => message.id !== id);
      if (shown) show();
      notify();
    },
    withdrawUndo() {
      waiting = waiting.map(({ key, message }) => ({
        key,
        message: withoutUndo(message),
      }));
      notify();
    },
    receipts: () => receipts,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
