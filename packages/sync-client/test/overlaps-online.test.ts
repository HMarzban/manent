import { expect, test } from "bun:test";
import { blockText, blockView } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { B1, B2, DOC, setup, typeIn } from "./scripted-server.ts";
import type { World } from "./scripted-server.ts";

/** The Yjs client ID of Dana's device. */
const DANA = 77;

const textOf = (wording: BlockJSON | null): string =>
  wording === null ? "" : blockText(blockView(wording));

/** Dana's typing at the end of the block, as the server sends it on. */
function remoteTypingIn(w: World, blockId: string, text: string): void {
  const update = w.server.writeAs(DOC, DANA, (writer) =>
    writer.insertText(blockId, Number.MAX_SAFE_INTEGER, text),
  );
  w.server.syncUpdate(DOC, update);
}

/** Open and live, with "a" typed into B1. */
async function typedLive() {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.settle();
  typeIn(h, B1, "a");
  return { w, h };
}

/** Delivered, and shown at the next frame. */
async function shown(w: World): Promise<void> {
  await w.settle();
  w.frames.fire();
  await w.settle();
}

test("a block two people change within three seconds is listed once, with both wordings", async () => {
  const { w, h } = await typedLive();
  w.fake.advance(2_000);
  remoteTypingIn(w, B1, "z");
  await shown(w);
  expect(h.recovered.get()).toMatchObject([
    { cause: "overlap", blockId: B1, otherClientIds: [DANA] },
  ]);
  const wordings = () =>
    h.recovered.get().map((item) => [textOf(item.mine), textOf(item.theirs)]);
  expect(wordings()).toEqual([["a", "z"]]);
  remoteTypingIn(w, B1, "y");
  await shown(w);
  // replaced, not added
  expect(wordings()).toEqual([["a", "zy"]]);
});

test("a change that comes after the window is not an overlap", async () => {
  const { w, h } = await typedLive();
  w.fake.advance(3_001);
  remoteTypingIn(w, B1, "z");
  await shown(w);
  expect(h.recovered.get()).toEqual([]);
});

test("someone else's change elsewhere in the script is not an overlap", async () => {
  const { w, h } = await typedLive();
  w.fake.advance(2_000);
  remoteTypingIn(w, B2, "z");
  await shown(w);
  expect(h.recovered.get()).toEqual([]);
});

test("the same words typed at once by two people leave nothing to review", async () => {
  const { w, h } = await typedLive();
  remoteTypingIn(w, B1, "a");
  await shown(w);
  expect(h.recovered.get()).toEqual([]);
});
