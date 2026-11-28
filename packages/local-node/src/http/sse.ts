// One page's event stream: frames written as they come, a comment frame between them while it is idle.
import type { Clock } from "@manent/sync-client";

export interface EventStream {
  /** The `text/event-stream` answer the page reads. */
  readonly response: Response;
  /** One `data:` frame; `data` holds no line break. */
  send(data: string): void;
  /** Ends the stream from the server side and cancels its heartbeat timer. */
  close(): void;
}

const encoder = new TextEncoder();
const nothing = (): void => {};

/** `onClose` runs once, when the page closes the stream or `close()` is called; nothing is written after it. */
export function createEventStream(options: {
  clock: Clock;
  heartbeatMs: number;
  onClose(): void;
}): EventStream {
  const { clock, heartbeatMs } = options;
  let closed = false;
  let write: (text: string) => void = nothing;
  let endController: () => void = nothing;
  let cancelBeat: () => void = nothing;
  const finish = (): void => {
    if (closed) return;
    closed = true;
    write = nothing;
    cancelBeat();
    cancelBeat = nothing;
    options.onClose();
  };
  const beat = (): void => {
    if (closed) return;
    write(": \n\n");
    cancelBeat = clock.schedule(beat, heartbeatMs);
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      write = (text) => {
        if (closed) return;
        controller.enqueue(encoder.encode(text));
      };
      endController = () => {
        try {
          controller.close();
        } catch {
          // stream already closed or cancelled
        }
      };
      cancelBeat = clock.schedule(beat, heartbeatMs);
    },
    cancel() {
      finish();
    },
  });
  return {
    response: new Response(body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
      },
    }),
    send: (data) => write(`data: ${data}\n\n`),
    close() {
      if (closed) return;
      finish();
      endController();
    },
  };
}
