// Tracks the binding's remote holds on an EditorSession so a replacement waits until every hold releases.
import type { BoundDocument } from "@manent/crdt-binding";
import type { Timers } from "@manent/editor";
import type { EditorSession } from "./editor-sessions.ts";

const noop = (): void => {};

/** The session as the binding sees it, counting the binding's holds; `whenReleased` runs once none is left, after the release returns, unless cancelled first. */
export function trackHolds(
  session: EditorSession,
  timers: Timers,
): { document: BoundDocument; whenReleased(run: () => void): () => void } {
  let holds = 0;
  let waiting: (() => void) | null = null;
  let cancel = noop;
  return {
    document: {
      doc: () => session.doc(),
      holdRemote() {
        holds++;
        session.holdRemote();
      },
      releaseRemote() {
        holds--;
        session.releaseRemote();
        const run = waiting;
        if (holds > 0 || run === null) return;
        waiting = null;
        // the release may come from inside the view's update, which must finish first
        cancel = timers.schedule(() => {
          cancel = noop;
          run();
        }, 0);
      },
      sendAwareness: (update) => session.sendAwareness(update),
      onAwareness: (listener) => session.onAwareness(listener),
    },
    whenReleased(run) {
      if (holds === 0) {
        run();
        return noop;
      }
      waiting = run;
      return () => {
        waiting = null;
        cancel();
      };
    },
  };
}
