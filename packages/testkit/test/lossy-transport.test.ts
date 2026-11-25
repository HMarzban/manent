import { expect, test } from "bun:test";
import type { SocketLike } from "@manent/client-web";
import { lossySocket } from "../src/index.ts";

test("lossy socket copies inbound Uint8Array views before delaying them", () => {
  const underlying: SocketLike = {
    binaryType: "arraybuffer",
    send() {},
    close() {},
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  const scheduled: (() => void)[] = [];
  const wrapped = lossySocket(underlying, {
    lossRate: 1,
    delayMs: 50,
    random: () => 0,
    schedule: (run) => {
      scheduled.push(run);
    },
  });
  const received: unknown[] = [];
  Object.assign(wrapped, {
    onmessage: (event: { data: unknown }) => received.push(event.data),
  });

  const backing = new Uint8Array([10, 20, 30, 40]);
  const view = backing.subarray(1, 3);
  underlying.onmessage?.({ data: view });
  // Mutate the original buffer while the frame is delayed in the inbound queue
  backing.fill(99);
  expect(scheduled).toHaveLength(1);
  scheduled[0]!();

  expect(received).toHaveLength(1);
  expect(received[0]).toBeInstanceOf(Uint8Array);
  expect(Array.from(received[0] as Uint8Array)).toEqual([20, 30]);
});
