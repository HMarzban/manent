import { expect, test } from "bun:test";
import { loadDoc, scriptBody } from "@manent/crdt";
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

test("text typed while a follower takes the lead and reads the store is saved and sent", async () => {
  const { w, tabs } = await tabWorld();
  const store = w.space.store("dana");
  let reading: Promise<void> | null = null;
  // the store's reads wait while `reading` is set, as a slow browser store does
  const slow = new Proxy(store, {
    get(target, key) {
      const held = reading;
      if (key === "load" && held !== null)
        return async (docId: string) => {
          await held;
          return target.load(docId);
        };
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const a = w.makeClient({ leader: tabs.port("a"), frames: fakeFrames() });
  const b = w.makeClient({
    leader: tabs.port("b"),
    frames: fakeFrames(),
    store: slow,
  });
  await a.open(DOC);
  const hb = await b.open(DOC);
  await w.online();
  const held = Promise.withResolvers<void>();
  reading = held.promise;
  tabs.closeTab("a");
  await w.turn();
  expect(b.link.get().leader).toBe(true);
  type(hb, "typed as the lead changed");
  held.resolve();
  await w.settle();
  await w.online();
  expect([
    hb.status.get().saved,
    pushedText(w).some((text) => text.includes("typed as the lead changed")),
  ]).toEqual([true, true]);
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

/** The text of every own entry stored, and of every push, each applied in order to the seed. */
const ownText = async (w: World): Promise<string> =>
  textAfter(
    (await w.store.load(DOC))!.entries.flatMap((e) =>
      e.kind === "update" && e.own ? [e.update] : [],
    ),
  );
const allPushed = (w: World): string =>
  textAfter(w.server.got("PUSH").map((p) => p.update));

test("a following tab that closes a script and opens it again has every later edit stored", async () => {
  const { w, tab } = await tabWorld();
  const [a, b] = [tab("a"), tab("b")];
  await a.open(DOC);
  const first = await b.open(DOC);
  await w.online();
  type(first, "one");
  await w.settle();
  await first.close();
  await w.settle();
  const again = await b.open(DOC);
  await w.settle();
  type(again, " two");
  await w.settle();
  expect([await ownText(w), allPushed(w)]).toEqual(["one two\n", "one two\n"]);
  expect(again.status.get().saved).toBe(true);
});

test("a following tab keeps every edit stored after the lead goes to it and comes back", async () => {
  const { w, tabs, tab } = await tabWorld();
  const [a, b] = [tab("a"), tab("b")];
  await a.open(DOC);
  const hb = await b.open(DOC);
  await w.online();
  type(hb, "one");
  await w.settle();
  tabs.depose();
  await w.settle();
  await w.online();
  expect(b.link.get().leader).toBe(true);
  tabs.depose();
  await w.settle();
  await w.online();
  expect(a.link.get().leader).toBe(true);
  type(hb, " two");
  await w.settle();
  expect(allPushed(w)).toBe("one two\n");
  expect(hb.status.get().saved).toBe(true);
});

test("the leader lets a script go once no tab holds it open", async () => {
  const { w, tab } = await tabWorld();
  const a = tab("a");
  await w.settle();
  const [b, c] = [tab("b"), tab("c")];
  const [hb, hc] = [await b.open(DOC), await c.open(DOC)];
  await w.online();
  expect(a.link.get().leader).toBe(true);
  const sent = (): number => w.server.got("UNSUBSCRIBE").length;
  const subscribed = sent();
  await hb.close();
  await w.settle();
  expect(sent()).toBe(subscribed);
  await hc.close();
  await w.settle();
  expect(sent()).toBe(subscribed + 1);
  expect(w.server.got("SUBSCRIBE")).toHaveLength(subscribed + 1);
});

test("a leader whose app closes a script another tab holds, and opens it again, follows it as before", async () => {
  const { w, tab } = await tabWorld();
  const [a, b] = [tab("a"), tab("b")];
  const ha = await a.open(DOC);
  await b.open(DOC);
  await w.online();
  const subscribed = w.server.got("UNSUBSCRIBE").length;
  await ha.close();
  await w.settle();
  expect(w.server.got("UNSUBSCRIBE")).toHaveLength(subscribed);
  const again = await a.open(DOC);
  type(again, "back");
  await w.settle();
  expect(again.status.get()).toMatchObject({ saved: true, waiting: 1 });
});

test("a deposed leader lets go of a script only another tab held", async () => {
  const { w, tabs, tab } = await tabWorld();
  const a = tab("a");
  await w.settle();
  const b = tab("b");
  const hb = await b.open(DOC);
  await w.online();
  tabs.depose();
  await w.settle();
  await w.online();
  expect(b.link.get().leader).toBe(true);
  const subscribed = w.server.got("UNSUBSCRIBE").length;
  await hb.close();
  await w.settle();
  expect(w.server.got("UNSUBSCRIBE")).toHaveLength(subscribed + 1);
  expect(a.link.get().leader).toBe(false);
});

/** The leader's last push is refused for good, and the server answers its fresh subscription with what it holds. */
async function rejectLastPush(w: World): Promise<void> {
  w.server.answer.subscribe = false;
  w.server.error(DOC, {
    code: 4422,
    message: "invalid",
    permanent: true,
    clientSeq: w.server.got("PUSH").at(-1)!.clientSeq,
  });
  await w.settle();
  w.server.subscribedWithState(DOC, w.server.doc(DOC).encodeState());
  await w.settle();
}

test("a following tab's edit the leader never stored is kept as Recovered text when the script is replaced", async () => {
  const { w, tabs, tab } = await tabWorld();
  const [a, b] = [tab("a"), tab("b")];
  const ha = await a.open(DOC);
  const hb = await b.open(DOC);
  await w.online();
  type(ha, "from a");
  await w.settle();
  tabs.dropMessagesTo("a");
  typeIn(hb, B2, "only in b");
  await w.settle();
  await rejectLastPush(w);
  w.fake.advance(50);
  expect(hb.recovered.get().map((r) => [r.blockId, r.text, r.cause])).toEqual([
    [B2, "only in b", "rejected"],
  ]);
  expect(textOf(hb.doc())).toBe("from a\n");
});

test("a following tab's edit the leader received is kept as Recovered text once when the script is replaced", async () => {
  const { w, tab } = await tabWorld();
  const [a, b] = [tab("a"), tab("b")];
  const ha = await a.open(DOC);
  const hb = await b.open(DOC);
  await w.online();
  type(ha, "from a");
  await w.settle();
  w.store.holdWrites();
  typeIn(hb, B2, "seen by a");
  await w.settle();
  await rejectLastPush(w);
  expect(ha.recovered.get()).toEqual([]);
  expect(hb.recovered.get().map((r) => r.text)).toEqual(["seen by a"]);
  w.store.releaseWrites();
  await w.settle();
  w.fake.advance(50);
  await w.settle();
  expect([textOf(ha.doc()), textOf(hb.doc())]).toEqual([
    "from a\nseen by a",
    "from a\nseen by a",
  ]);
});

test("a follower's edit made before it saw the move is merged into the new document", async () => {
  const { w, tabs, tab } = await tabWorld();
  const [a, b] = [tab("a"), tab("b")];
  const ha = await a.open(DOC);
  const hb = await b.open(DOC);
  await w.online();
  const left = ha.doc();
  const heard: Uint8Array[] = [];
  left.subscribe((update) => heard.push(update));
  w.server.answer.subscribe = false;
  w.server.moved(DOC, 1, 2);
  await w.settle();
  w.server.subscribedWithState(DOC, w.server.doc(DOC).encodeState(), {
    generation: 2,
    headSeq: 1,
  });
  while (w.network.step());
  typeIn(hb, B2, "late");
  w.server.answer.subscribe = true;
  await w.settle();
  w.fake.advance(50);
  await w.settle();
  expect(textOf(ha.doc())).toBe("\nlate");
  expect(textOf(hb.doc())).toBe("\nlate");
  const edit = tabs.posted().find((m) => m.t === "edit");
  expect(edit).toMatchObject({ generation: 1 });
  const opened = tabs.posted().find((m) => m.t === "opened");
  expect(opened).toEqual({
    v: 1,
    from: "b",
    t: "opened",
    docId: DOC,
    generation: 2,
    clientId: hb.doc().clientId,
  });
  expect((await w.store.load(DOC))!.meta.clientIds).toContain(
    hb.doc().clientId,
  );
  expect(w.server.got("PUSH").map((p) => p.generation)).toEqual([2]);
  expect(textAfter2(w, w.server.got("PUSH")[0]!.update)).toBe("\nlate");
  // released: what is written into the document the move left is heard by nobody
  const before = heard.length;
  scriptBody(left).write((writer) => writer.insertText(B1, 0, "?"));
  expect(heard.length).toBe(before);
});

/** The server's text once the update is applied to its copy. */
function textAfter2(w: World, update: Uint8Array): string {
  const doc = loadDoc(w.server.doc(DOC).encodeState());
  doc.applyUpdate(update);
  return textOf(doc);
}
