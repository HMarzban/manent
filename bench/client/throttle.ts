// What a run does to a page before a client scenario times it: the processor slowdown it asks for, and in a proof run
// a busy wait inside every span a client scenario times itself.
import type { CDPSession, Page } from "@playwright/test";
import { benchThrottle, proveMs } from "../env.ts";

/**
 * Busy-waits `waitMs` in the page (a) in a capture-phase `keydown`, `pointerdown` and `wheel` listener on `window`,
 * (b) at the start of every `requestAnimationFrame` callback and (c) before every `message` event a `WebSocket`
 * delivers, so that keystroke to paint, a frame, a remote change reaching the page and keystroke to Saved each span
 * at least one wait.
 */
function installProofWaits(waitMs: number): void {
  const wait = (): void => {
    const untilMs = performance.now() + waitMs;
    while (performance.now() < untilMs);
  };
  for (const type of ["keydown", "pointerdown", "wheel"])
    window.addEventListener(type, wait, { capture: true });
  const frame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    frame((time) => {
      wait();
      callback(time);
    });
  // one wait a socket, added before the socket's first message listener, so it runs once before every listener
  const waited = new WeakSet<WebSocket>();
  const add = WebSocket.prototype.addEventListener;
  const waitFirst = (socket: WebSocket): void => {
    if (waited.has(socket)) return;
    waited.add(socket);
    Reflect.apply(add, socket, ["message", wait]);
  };
  WebSocket.prototype.addEventListener = function (
    this: WebSocket,
    ...args: Parameters<WebSocket["addEventListener"]>
  ) {
    if (args[0] === "message") waitFirst(this);
    Reflect.apply(add, this, args);
  };
  const handler = Object.getOwnPropertyDescriptor(
    WebSocket.prototype,
    "onmessage",
  );
  if (handler?.set === undefined) throw new TypeError("no onmessage setter");
  const { get, set } = handler;
  Object.defineProperty(WebSocket.prototype, "onmessage", {
    configurable: true,
    enumerable: handler.enumerable ?? true,
    get,
    set(this: WebSocket, listener: unknown) {
      waitFirst(this);
      Reflect.apply(set, this, [listener]);
    },
  });
}

/** Slows `page`'s processor by the run's throttle and, in a proof run, adds proveMs() inside every timed span. */
export async function throttlePage(page: Page, cdp: CDPSession): Promise<void> {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: benchThrottle() });
  const waitMs = proveMs();
  if (waitMs !== null) await page.addInitScript(installProofWaits, waitMs);
}
