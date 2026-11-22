// The desktop window's close: at once when nothing is at risk, otherwise after the close question, or once the copy it offered is written.
import type { MessageQueue } from "@manent/ui";
import type { CloseGuard } from "../services/sync/close-guard.ts";
import type { DesktopHost } from "./host.ts";

const noop = (): void => {};

/**
 * Answers each `close_requested` of the shell. With no document the device cannot save, the window closes at once;
 * otherwise the shell is told to keep it, and the guard asks. Close without exporting closes the window; Export a copy
 * closes it when the queue's current message becomes `exportedText()`, unless the route has left `exportPath()` before,
 * or the shell asks to close again. The returned function stops answering.
 */
export function installDesktopClose(options: {
  host: DesktopHost;
  guard: CloseGuard;
  queue: MessageQueue;
  exportedText: () => string;
  routeChanges: (listener: (pathname: string) => void) => () => void;
  exportPath: () => string;
}): () => void {
  const { host, guard, queue } = options;
  const answer = (close: boolean): void =>
    host.send({ v: 1, t: "close_answer", close });
  let endWatch = noop;
  const closeOnceExported = (): void => {
    const stops = [
      queue.subscribe(() => {
        if (queue.current()?.text !== options.exportedText()) return;
        endWatch();
        answer(true);
      }),
      options.routeChanges((pathname) => {
        if (pathname !== options.exportPath()) endWatch();
      }),
    ];
    endWatch = () => {
      for (const stop of stops) stop();
      endWatch = noop;
    };
  };
  const stopHearing = host.onMessage((message) => {
    if (message.t !== "close_requested") return;
    endWatch();
    if (guard.failing() === null) return answer(true);
    answer(false);
    void guard.ask().then((choice) => {
      if (choice === "leave") answer(true);
      if (choice === "export") closeOnceExported();
    });
  });
  return () => {
    stopHearing();
    endWatch();
  };
}
