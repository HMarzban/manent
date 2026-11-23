// A SUBSCRIBE in prompter mode.
import { syncError } from "../sync/errors.ts";
import type { SubscribeHandler } from "../sync/subscribe.ts";

/** Refuses every prompter, as a mode without a handler is refused, until the feed is served. */
export const subscribePrompter: SubscribeHandler = ({ message, tell }) =>
  tell(
    syncError("prompter_unavailable", {
      docId: message.docId,
      generation: message.generation,
    }),
  );
