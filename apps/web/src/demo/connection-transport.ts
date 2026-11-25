// The demo's Connection for one tab: its sync transport cut off, or each frame and request held back, as the control says.
import { ConnectError } from "@manent/sync-client";
import type {
  Clock,
  Connection,
  Subscribable,
  Transport,
} from "@manent/sync-client";
import type { ConnectionMode } from "../services/sync/device-memory.ts";

/** How long Slow holds back each frame, either way, and each request. */
export const SLOW_DELAY_MS = 1_500;

export interface ConnectionControl {
  mode: Subscribable<ConnectionMode>;
  set(mode: ConnectionMode): void;
}

interface Waiting {
  dueAt: number;
  pass(): void;
}

/** Passes each one on once its delay has passed and every one before it has gone, so nothing is ever reordered. */
function createLine(clock: Clock): (delayMs: number, pass: () => void) => void {
  const waiting: Waiting[] = [];
  const run = (): void => {
    while (waiting[0] !== undefined && waiting[0].dueAt <= clock.now())
      waiting.shift()?.pass();
    const next = waiting[0];
    if (next !== undefined) clock.schedule(run, next.dueAt - clock.now());
  };
  return (delayMs, pass) => {
    if (waiting.length === 0 && delayMs === 0) return pass();
    const last = waiting.at(-1)?.dueAt ?? Number.NEGATIVE_INFINITY;
    waiting.push({ dueAt: Math.max(clock.now() + delayMs, last), pass });
    if (waiting.length === 1) clock.schedule(run, delayMs);
  };
}

/** `send`, unless the tab's Connection is Offline: then it rejects ConnectError("unreachable") at once, and nothing leaves the tab. */
export function throughConnection<T>(
  control: { mode(): ConnectionMode },
  send: () => Promise<T>,
): Promise<T> {
  return control.mode() === "offline"
    ? Promise.reject(new ConnectError("unreachable"))
    : send();
}

/**
 * `transport` as the tab's Connection leaves it. Offline: connect, createDocument and replay reject
 * ConnectError("unreachable") at once, and no frame goes either way. Slow: each frame either way and each request is
 * passed on `delayMs` later, in order; changing the mode never reorders what is already held back.
 */
export function connectionTransport(options: {
  transport: Transport;
  clock: Clock;
  delayMs: number;
  control: { mode(): ConnectionMode };
}): Transport {
  const { transport, control } = options;
  const out = createLine(options.clock);
  const delay = (): number => (control.mode() === "slow" ? options.delayMs : 0);
  const offline = (): boolean => control.mode() === "offline";
  const request = <T>(send: () => Promise<T>): Promise<T> =>
    throughConnection(
      control,
      () =>
        new Promise<T>((resolve, reject) => {
          out(delay(), () => {
            send().then(resolve, reject);
          });
        }),
    );
  return {
    connect(handlers) {
      const inward = createLine(options.clock);
      return request(() =>
        transport.connect({
          onFrame(frame) {
            inward(delay(), () => {
              if (!offline()) handlers.onFrame(frame);
            });
          },
          onClose: (code, reason) =>
            inward(0, () => handlers.onClose(code, reason)),
        }),
      ).then((connection): Connection => ({
        send(frame) {
          out(delay(), () => {
            if (!offline()) connection.send(frame);
          });
        },
        close: (code, reason) => connection.close(code, reason),
      }));
    },
    createDocument: (body) => request(() => transport.createDocument(body)),
    replay: (body) => request(() => transport.replay(body)),
    ...(transport.driver === undefined
      ? {}
      : {
          driver: {
            current: (docId) => request(() => transport.driver!.current(docId)),
            take: (body) => request(() => transport.driver!.take(body)),
            release: (body) => request(() => transport.driver!.release(body)),
          },
        }),
  };
}
