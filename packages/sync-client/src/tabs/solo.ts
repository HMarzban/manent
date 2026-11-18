import type { LeaderPort } from "../ports/ports.ts";

/** The leader port of a client with no other tabs: elected at once, in a later microtask, and posting to nobody. */
export function soloLeader(tabId: string): LeaderPort {
  return {
    tabId,
    campaign(handlers) {
      let withdrawn = false;
      void Promise.resolve().then(() => {
        if (!withdrawn) handlers.onElected();
      });
      return () => {
        withdrawn = true;
      };
    },
    post() {
      // no other tab to hear it
    },
    listen() {
      return () => {};
    },
  };
}
