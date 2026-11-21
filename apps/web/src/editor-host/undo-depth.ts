// The editor's history with a count of the steps the person can undo, for the test build's hooks.
import type { HistoryPort } from "@manent/editor";

/** The history with a count of the steps it can undo: each step added counts one, each undo it runs takes one away. */
export function countSteps(history: HistoryPort): {
  history: HistoryPort;
  depth(): number;
  stop(): void;
} {
  let depth = 0;
  const stop = history.onStep(() => {
    depth++;
  });
  return {
    history: {
      ...history,
      undo(state, dispatch) {
        const done = history.undo(state, dispatch);
        if (done && dispatch !== undefined) depth--;
        return done;
      },
    },
    depth: () => depth,
    stop,
  };
}
