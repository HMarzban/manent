import { expect, test } from "bun:test";
import { decodeAwareness, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { blocksOf } from "@manent/schema";
import { createLocalSessions } from "../src/editor-host/editor-sessions.ts";
import type { LocalSession } from "../src/editor-host/editor-sessions.ts";
import { createSimulatedWriter } from "../src/editor-host/simulated-writer.ts";
import { createClock } from "./services.fixtures.ts";

const DOC = "8f0d1c2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";
const DANA = { userId: "dana", name: "Dana Reyes", colorIndex: 2 };

/** Frames that pass only when fired. */
function createFrames(): { request(fn: () => void): () => void; fire(): void } {
  let queued: (() => void)[] = [];
  return {
    request(fn) {
      queued.push(fn);
      return () => {
        queued = queued.filter((f) => f !== fn);
      };
    },
    fire() {
      const due = queued;
      queued = [];
      for (const fn of due) fn();
    },
  };
}

function sessions(frames = createFrames()) {
  let ids = 0;
  return createLocalSessions({
    frames,
    clock: createClock(),
    ids: () => `block-${String(++ids).padStart(4, "0")}`,
  });
}

const blocksOfDoc = (doc: CrdtDoc) =>
  blocksOf(scriptBody(doc).materialize()).map((block) => ({
    type: block.attrs.type,
    text: block.runs.map((run) => run.text).join(""),
  }));

const textOf = (session: LocalSession): string =>
  blocksOfDoc(session.doc())
    .map((block) => block.text)
    .join("\n");

/** A session and Dana writing into it from her own copy. */
function withOther() {
  const frames = createFrames();
  const s = sessions(frames).open(DOC, "screenplay");
  const other = createSimulatedWriter({
    session: s,
    person: DANA,
    clientId: 7,
  });
  return { s, frames, other };
}

test("a new script starts with one empty element of its format", () => {
  const s = sessions().open(DOC, "manuscript");
  expect([blocksOfDoc(s.doc()), s.readOnly.get()]).toEqual([
    [{ type: "chapter", text: "" }],
    null,
  ]);
});

test("a document has one session while it is open, and a new script after it closes", () => {
  const all = sessions();
  const first = all.open(DOC, "screenplay");
  scriptBody(first.doc()).write((writer) =>
    writer.insertText("block-0001", 0, "INT. HOUSE"),
  );
  const again = all.open(DOC, "screenplay");
  first.close();
  const reopened = all.open(DOC, "screenplay");
  expect([again === first, textOf(first), textOf(reopened)]).toEqual([
    true,
    "INT. HOUSE",
    "",
  ]);
});

test("remote updates arrive merged, once per frame, and wait for a composition", () => {
  const { s, frames, other } = withOther();
  other.type(0, 0, "a");
  other.type(0, 1, "b");
  expect(textOf(s)).toBe("");
  s.holdRemote();
  frames.fire();
  expect(textOf(s)).toBe("");
  s.releaseRemote();
  expect(textOf(s)).toBe("ab");
});

test("a simulated writer's cursor arrives as awareness", () => {
  const { s, other } = withOther();
  const heard: unknown[] = [];
  s.onAwareness((update) => heard.push(...decodeAwareness(update)));
  other.select(0, 0);
  other.leave();
  const place = { blockId: "block-0001", offset: 0 };
  expect(heard).toEqual([
    {
      clientId: 7,
      clock: 1,
      state: { user: DANA, cursor: { anchor: place, head: place, at: 0 } },
    },
    { clientId: 7, clock: 2, state: null },
  ]);
});

test("a simulated writer sees what was typed in the session before it types", () => {
  const { s, frames, other } = withOther();
  scriptBody(s.doc()).write((writer) =>
    writer.insertText("block-0001", 0, "INT. "),
  );
  other.type(0, 5, "HOUSE");
  frames.fire();
  expect(textOf(s)).toBe("INT. HOUSE");
});
