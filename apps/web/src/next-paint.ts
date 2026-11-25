// The moment after the browser paints its next frame, as the benchmark times a keystroke.

/** Runs `callback` after the next frame's paint: one frame, then a message, which runs after that frame's paint. */
export function afterNextPaint(callback: () => void): void {
  requestAnimationFrame(() => {
    const channel = new MessageChannel();
    channel.port1.addEventListener("message", () => {
      callback();
      channel.port1.close();
    });
    // a listener added this way hears nothing until the port starts
    channel.port1.start();
    channel.port2.postMessage(null);
  });
}
