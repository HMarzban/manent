import { expect, test } from "bun:test";
import { webLeader } from "../src/index.ts";
import type { ChannelLike, LockApi } from "../src/index.ts";

interface Waiting {
  held: () => Promise<void>;
  signal: AbortSignal;
  granted: (value: unknown) => void;
  refused: (error: unknown) => void;
}

/** Web Locks in memory: a queue per name, each lock granted in a later microtask, as the browser does. */
function fakeLocks(): LockApi & { requested: string[] } {
  const queues = new Map<string, Waiting[]>();
  const grant = (name: string): void => {
    const first = queues.get(name)?.[0];
    if (first === undefined) return;
    void Promise.resolve().then(async () => {
      first.granted(await first.held());
      queues.get(name)!.shift();
      grant(name);
    });
  };
  const requested: string[] = [];
  return {
    requested,
    request(name, options, held) {
      requested.push(name);
      return new Promise((granted, refused) => {
        const queue = queues.get(name) ?? [];
        queues.set(name, queue);
        const waiting: Waiting = {
          held,
          signal: options.signal,
          granted,
          refused,
        };
        queue.push(waiting);
        options.signal.addEventListener("abort", () => {
          if (queue[0] === waiting) return;
          queue.splice(queue.indexOf(waiting), 1);
          refused(new DOMException("withdrawn", "AbortError"));
        });
        if (queue.length === 1) grant(name);
      });
    },
  };
}

/** BroadcastChannel in memory: a hub per name; a channel never hears itself. */
function fakeChannels(): {
  channel: (name: string) => ChannelLike;
  opened: string[];
} {
  const hubs = new Map<string, Set<ChannelLike>>();
  const opened: string[] = [];
  const channel = (name: string): ChannelLike => {
    opened.push(name);
    const hub = hubs.get(name) ?? new Set();
    hubs.set(name, hub);
    const self: ChannelLike = {
      onmessage: null,
      postMessage(message) {
        const data: unknown = structuredClone(message);
        for (const other of hub)
          if (other !== self)
            void Promise.resolve().then(() => other.onmessage?.({ data }));
      },
      close: () => hub.delete(self),
    };
    hub.add(self);
    return self;
  };
  return { channel, opened };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

test("the lock and the channel are named for the user", async () => {
  const locks = fakeLocks();
  const channels = fakeChannels();
  const port = webLeader({
    userId: "dana",
    tabId: "t1",
    locks,
    channel: channels.channel,
  });
  port.campaign({ onElected: () => {}, onDeposed: () => {} });
  port.post({ v: 1, from: "t1", t: "who" });
  expect(locks.requested).toEqual(["manent:leader:dana"]);
  expect(channels.opened).toEqual(["manent:tabs:dana"]);
});

test("two tabs of one user: one leads; when it gives up, the other does; another user is not in the queue", async () => {
  const locks = fakeLocks();
  const { channel } = fakeChannels();
  const events: string[] = [];
  const campaign = (userId: string, tabId: string) =>
    webLeader({ userId, tabId, locks, channel }).campaign({
      onElected: () => events.push(tabId),
      onDeposed: () => events.push(`-${tabId}`),
    });
  const giveUp = campaign("dana", "t1");
  campaign("dana", "t2");
  campaign("sam", "t3");
  await settle();
  expect(events).toEqual(["t1", "t3"]);
  giveUp();
  await settle();
  expect(events).toEqual(["t1", "t3", "t2"]);
});

test("withdrawing before the lock is granted is quiet", async () => {
  const locks = fakeLocks();
  const { channel } = fakeChannels();
  const events: string[] = [];
  const campaign = (tabId: string) =>
    webLeader({ userId: "dana", tabId, locks, channel }).campaign({
      onElected: () => events.push(tabId),
      onDeposed: () => events.push(`-${tabId}`),
    });
  const giveUp = campaign("t1");
  const withdraw = campaign("t2");
  await settle();
  withdraw();
  giveUp();
  await settle();
  expect(events).toEqual(["t1"]);
  // withdrawn in the turn the free lock was asked for, so granted all the same: it is let go unused
  campaign("t3")();
  await settle();
  expect(events).toEqual(["t1"]);
  campaign("t4");
  await settle();
  expect(events).toEqual(["t1", "t4"]);
});

test("a message reaches the user's other tabs only", async () => {
  const locks = fakeLocks();
  const { channel } = fakeChannels();
  const heard: [string, unknown][] = [];
  const tab = (userId: string, tabId: string) => {
    const port = webLeader({ userId, tabId, locks, channel });
    port.listen((message) => heard.push([tabId, message]));
    return port;
  };
  const t1 = tab("dana", "t1");
  tab("dana", "t2");
  tab("sam", "t3");
  t1.post({ v: 1, from: "t1", t: "who" });
  await settle();
  expect(heard).toEqual([["t2", { v: 1, from: "t1", t: "who" }]]);
});
