import { expect, test } from "bun:test";
import { memoryTabs } from "../src/testing/index.ts";
import type { MemoryTabs } from "../src/testing/index.ts";
import type { SyncClient } from "../src/index.ts";
import {
  B1,
  B2,
  DOC,
  fakeFrames,
  setup,
  textAfter,
  textOf,
  type,
  typeIn,
} from "./scripted-server.ts";
import type { FakeFrames, World } from "./scripted-server.ts";

/** One user's tabs over one memoryTabs, one store space and one network; each tab has frames of its own. */
async function tabWorld(): Promise<{
  w: World;
  tabs: MemoryTabs;
  tab(id: string): SyncClient;
  /** Runs the animation frames that tab asked for. */
  fire(id: string): void;
  ackAll(): Promise<void>;
}> {
  const w = await setup();
  const tabs = memoryTabs();
  const frames = new Map<string, FakeFrames>();
  return {
    w,
    tabs,
    tab(id) {
      const own = fakeFrames();
      frames.set(id, own);
      return w.makeClient({ leader: tabs.port(id), frames: own });
    },
    fire: (id) => frames.get(id)?.fire(),
    async ackAll() {
      const last = w.server.got("PUSH").at(-1);
      if (last !== undefined) w.server.ack(DOC, last.clientSeq, 10);
      await w.settle();
    },
  };
}

function occurrences(text: string, part: string): number {
  return text.split(part).length - 1;
}

const pushedText = (w: World): string[] =>
  w.server.got("PUSH").map((p) => textAfter([p.update]));

test("two tabs on one script share one connection and never duplicate or lose an edit", async () => {
  const { w, tab, ackAll } = await tabWorld();
  const [a, b] = [tab("a"), tab("b")];
  const [ha, hb] = [await a.open(DOC), await b.open(DOC)];
  await w.online();
  expect(w.server.ends()).toBe(1);
  expect(a.link.get().leader).toBe(true);
  expect(b.link.get().leader).toBe(false);
  type(ha, "from a ");
  type(hb, "from b ");
  await w.settle();
  await ackAll();
  w.fake.advance(50);
  expect(textOf(ha.doc())).toBe(textOf(hb.doc()));
  expect(occurrences(textOf(ha.doc()), "from b ")).toBe(1);
  expect(occurrences(textOf(ha.doc()), "from a ")).toBe(1);
  expect(hb.status.get()).toMatchObject({ saved: true, synced: true });
  expect(new Set(w.server.got("SUBSCRIBE").at(-1)!.clientIds)).toEqual(
    new Set([ha.doc().clientId, hb.doc().clientId]),
  );
});

test("when the leader tab closes, a follower takes over with nothing lost", async () => {
  const { w, tabs, tab } = await tabWorld();
  const [a, b] = [tab("a"), tab("b")];
  await a.open(DOC);
  const hb = await b.open(DOC);
  await w.online();
  tabs.dropMessagesTo("a");
  type(hb, "typed as the leader died");
  await w.settle();
  expect(hb.status.get().saved).toBe(false);
  tabs.closeTab("a");
  await w.settle();
  await w.online();
  expect(b.link.get().leader).toBe(true);
  expect(hb.status.get().saved).toBe(true);
  expect(
    pushedText(w).some((text) => text.includes("typed as the leader died")),
  ).toBe(true);
});

test("a hidden leader still shows a follower the server's updates within 50 ms", async () => {
  const { w, tab } = await tabWorld();
  const [a, b] = [tab("a"), tab("b")];
  await a.open(DOC);
  const hb = await b.open(DOC);
  await w.online();
  w.server.syncUpdate(
    DOC,
    w.server.write(DOC, (writer) => writer.insertText(B2, 0, "news")),
  );
  await w.settle();
  expect([w.server.ends(), textOf(hb.doc())]).toEqual([1, "\n"]);
  w.fake.advance(50);
  expect(textOf(hb.doc())).toBe("\nnews");
});

test("a follower's text that reaches the leader after a remote delete is found, once", async () => {
  const { w, tab, fire } = await tabWorld();
  const [a, b] = [tab("a"), tab("b")];
  const ha = await a.open(DOC);
  const hb = await b.open(DOC);
  await w.online();
  w.server.syncUpdate(
    DOC,
    w.server.write(DOC, (writer) => writer.deleteBlock(B1)),
  );
  await w.settle();
  fire("a");
  typeIn(hb, B1, " late");
  await w.settle();
  w.fake.advance(50);
  await w.settle();
  expect(ha.recovered.get().map((r) => r.text)).toEqual([" late"]);
  expect(hb.recovered.get()).toEqual(ha.recovered.get());
  expect(await w.store.recovered(DOC)).toHaveLength(1);
});

test("a deposed leader steps down and re-sends what it had not saved", async () => {
  const { w, tabs, tab } = await tabWorld();
  const [a, b] = [tab("a"), tab("b")];
  const ha = await a.open(DOC);
  await b.open(DOC);
  await w.online();
  w.store.holdWrites();
  type(ha, "unsaved in a");
  await w.settle();
  expect(w.server.got("PUSH")).toEqual([]);
  tabs.depose();
  await w.settle();
  expect([a.link.get().leader, w.closes()]).toEqual([false, 1]);
  w.store.releaseWrites();
  await w.settle();
  await w.online();
  expect(b.link.get().leader).toBe(true);
  expect(
    pushedText(w).filter((text) => text.includes("unsaved in a")),
  ).toHaveLength(1);
  expect(textOf(ha.doc())).toBe("unsaved in a\n");
});

test("a leader whose store says another tab leads steps down and re-sends what it had not saved", async () => {
  const { w, tab } = await tabWorld();
  const [a, b] = [tab("a"), tab("b")];
  const ha = await a.open(DOC);
  await b.open(DOC);
  await w.online();
  w.store.refuseWrites("lost_lead");
  a.link.subscribe((facts) => {
    if (!facts.leader) w.store.refuseWrites(null);
  });
  type(ha, "fenced");
  await w.settle();
  expect(a.link.get().leader).toBe(false);
  await w.online();
  expect(b.link.get().leader).toBe(true);
  expect(pushedText(w).filter((text) => text.includes("fenced"))).toHaveLength(
    1,
  );
});

test("an edit a follower sends again to the same leader is stored once", async () => {
  const { w, tab } = await tabWorld();
  const [a, b] = [tab("a"), tab("b")];
  await a.open(DOC);
  const hb = await b.open(DOC);
  await w.online();
  w.store.holdWrites();
  type(hb, "once");
  await w.settle();
  // a tab that opens asks who leads, and the leader's answer makes the follower send again
  await tab("c").open(DOC);
  await w.settle();
  w.store.releaseWrites();
  await w.settle();
  const own = (await w.store.load(DOC))!.entries.filter(
    (e) => e.kind === "update" && e.own,
  );
  expect(own).toHaveLength(1);
  expect(hb.status.get().saved).toBe(true);
});

test("a third tab opening mid-edit gets the leader's state, waiting edits included", async () => {
  const { w, tab } = await tabWorld();
  const [a, b] = [tab("a"), tab("b")];
  await a.open(DOC);
  const hb = await b.open(DOC);
  await w.online();
  w.store.holdWrites();
  type(hb, "waiting");
  await w.settle();
  const c = tab("c");
  const hc = await c.open(DOC);
  expect(textOf(hc.doc())).toBe("waiting\n");
  expect(hc.status.get()).toMatchObject({ saved: false, waiting: 1 });
  w.store.releaseWrites();
});
