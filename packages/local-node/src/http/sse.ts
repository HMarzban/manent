// One page's event stream: frames written as they come, a comment frame between them while it is idle.
import type { Clock } from "@manent/sync-client";

export interface EventStream {
  /** The `text/event-stream` answer the page reads. */
  readonly response: Response;
  /** One `data:` frame; `data` holds no line break. */
  send(data: string): void;
}

const encoder = new TextEncoder();
const nothing = (): void => {};

/** `onClose` runs once, when the page closes the stream; nothing is written after it. */
export function createEventStream(options: {
  clock: Clock;
  heartbeatMs: number;
  onClose(): void;
}): EventStream {
  const { clock, heartbeatMs } = options;
  let write: (text: string) => void = nothing;
  let cancelBeat: () => void = nothing;
  const beat = (): void => {
    write(": \n\n");
    cancelBeat = clock.schedule(beat, heartbeatMs);
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      write = (text) => controller.enqueue(encoder.encode(text));
      cancelBeat = clock.schedule(beat, heartbeatMs);
    },
    cancel() {
      cancelBeat();
      options.onClose();
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
  };
}
