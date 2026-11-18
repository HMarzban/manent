import { expect, test } from "bun:test";
import { createMemoryNetwork } from "../src/testing/index.ts";
import type { MemoryNetwork, ServerEnd } from "../src/testing/index.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A network whose `random` returns the values given, then 0. */
function setup(draws: number[] = []): {
  network: MemoryNetwork;
  ends: ServerEnd[];
  created: string[];
} {
  const network = createMemoryNetwork({ random: () => draws.shift() ?? 0 });
  const ends: ServerEnd[] = [];
  const created: string[] = [];
  network.serve({
    connected: (end) => ends.push(end),
    createDocument: (userId, request) => {
      created.push(`${userId}:${request.docId}`);
      return { ok: true };
    },
  });
  return { network, ends, created };
}

function listener(): {
  got: string[];
  closes: number[];
  handlers: {
    onFrame(frame: Uint8Array): void;
    onClose(code: number): void;
  };
} {
  const got: string[] = [];
  const closes: number[] = [];
  return {
    got,
    closes,
    handlers: {
      onFrame: (frame) => got.push(decoder.decode(frame)),
      onClose: (code) => closes.push(code),
    },
  };
}

test("frames wait for a step, arrive in order per connection, and a cut loses what was queued", async () => {
  const { network, ends } = setup();
  const client = listener();
  const connection = await network.transport("dana").connect(client.handlers);
  const end = ends[0]!;
  const serverGot: string[] = [];
  const serverCloses: number[] = [];
  end.onFrame = (frame) => serverGot.push(decoder.decode(frame));
  end.onClose = (code) => serverCloses.push(code);
  expect(end.userId).toBe("dana");
  end.send(encoder.encode("a"));
  end.send(encoder.encode("b"));
  expect([client.got, network.queued()]).toEqual([[], 2]);
  network.step();
  network.step();
  expect(client.got).toEqual(["a", "b"]);
  connection.send(encoder.encode("c"));
  end.send(encoder.encode("d"));
  network.partition(true);
  expect(network.step()).toBe(true);
  expect([client.closes, serverCloses, serverGot, client.got]).toEqual([
    [1006],
    [1006],
    [],
    ["a", "b"],
  ]);
  expect([network.queued(), network.step()]).toEqual([0, false]);
  await expect(
    network.transport("dana").connect(client.handlers),
  ).rejects.toMatchObject({ code: "unreachable" });
});

test("a duplicated or swapped frame is still each frame, whole", async () => {
  const twice = setup();
  const a = listener();
  await twice.network.transport("dana").connect(a.handlers);
  twice.network.faults({ duplicate: 1 });
  twice.ends[0]!.send(encoder.encode("a"));
  twice.ends[0]!.send(encoder.encode("b"));
  while (twice.network.step());
  expect(a.got).toEqual(["a", "a", "b", "b"]);

  const swapped = setup();
  const b = listener();
  await swapped.network.transport("dana").connect(b.handlers);
  swapped.network.faults({ swap: 1 });
  swapped.ends[0]!.send(encoder.encode("a"));
  swapped.ends[0]!.send(encoder.encode("b"));
  while (swapped.network.step());
  expect(b.got).toEqual(["b", "a"]);
});

test("with nobody signed in the server is never reached", async () => {
  const { network, ends, created } = setup();
  const { handlers } = listener();
  await expect(network.transport(null).connect(handlers)).rejects.toMatchObject(
    { code: "sign_in" },
  );
  await expect(
    network
      .transport(null)
      .createDocument({ docId: "d", kind: "script", home: "user" }),
  ).rejects.toMatchObject({ code: "sign_in" });
  expect([ends.length, created]).toEqual([0, []]);
});

test("a refused session and a cut each keep the server from being reached", async () => {
  const { network, ends, created } = setup();
  const { handlers } = listener();
  network.refuseSessions(true);
  await expect(
    network.transport("dana").connect(handlers),
  ).rejects.toMatchObject({ code: "sign_in" });
  network.refuseSessions(false);
  network.partition(true);
  await expect(
    network
      .transport("dana")
      .createDocument({ docId: "d", kind: "script", home: "user" }),
  ).rejects.toMatchObject({ code: "unreachable" });
  network.partition(false);
  expect(
    await network
      .transport("dana")
      .createDocument({ docId: "d", kind: "script", home: "user" }),
  ).toEqual({ ok: true });
  expect([ends.length, created]).toEqual([0, ["dana:d"]]);
});

test("a close reaches the other end at a step, after what was sent to it before", async () => {
  const { network, ends } = setup();
  const client = listener();
  const connection = await network.transport("dana").connect(client.handlers);
  const end = ends[0]!;
  const serverGot: string[] = [];
  const serverCloses: [number, string][] = [];
  end.onFrame = (frame) => serverGot.push(decoder.decode(frame));
  end.onClose = (code, reason) => serverCloses.push([code, reason]);
  end.send(encoder.encode("lost"));
  connection.send(encoder.encode("kept"));
  connection.close(1000, "offline");
  connection.send(encoder.encode("after"));
  end.send(encoder.encode("after"));
  while (network.step());
  expect([serverGot, serverCloses, client.got, client.closes]).toEqual([
    ["kept"],
    [[1000, "offline"]],
    [],
    [],
  ]);
});

test("the connection a step serves is the one random picks", async () => {
  const { network, ends } = setup([0.9]);
  const first = listener();
  const second = listener();
  await network.transport("dana").connect(first.handlers);
  await network.transport("sam").connect(second.handlers);
  ends[0]!.send(encoder.encode("one"));
  ends[1]!.send(encoder.encode("two"));
  network.step();
  expect([first.got, second.got]).toEqual([[], ["two"]]);
});
