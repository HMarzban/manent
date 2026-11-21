// The moment the page's first frame is on screen, for the shell, which shows the window then.

/** Calls `run` in a task after the next frame: a frame callback runs before the frame is painted, the task after it. */
export function afterFirstFrame(
  run: () => void,
  frames: { request(fn: () => void): void },
): void {
  frames.request(() => {
    const { port1, port2 } = new MessageChannel();
    port1.addEventListener("message", () => {
      port1.close();
      run();
    });
    port1.start();
    port2.postMessage(null);
  });
}
