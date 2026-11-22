import { expect, test } from "bun:test";
import {
  liveEditor,
  livePagination,
  registerLiveEditor,
} from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";

const unsubscribe = (): (() => void) => () => {};

// an Ink editor: no scaffold, so no pagination, and the view is never read
const fake = (docId: string): LiveEditor => ({
  docId,
  doc: {} as LiveEditor["doc"],
  view: {} as LiveEditor["view"],
  scaffold: null,
  presence: {
    publish: () => {},
    subscribe: unsubscribe,
    subscribePeople: unsubscribe,
  },
  editable: true,
  zoom: () => 1,
});

test("the live editor of a document is the one registered last, until it leaves", () => {
  const a = fake("d1");
  const b = fake("d1");
  const offA = registerLiveEditor(a);
  const offB = registerLiveEditor(b);
  expect([liveEditor("d1"), liveEditor("d2")]).toEqual([b, null]);
  offA();
  expect(liveEditor("d1")).toBe(b);
  offB();
  expect([liveEditor("d1"), livePagination("d1")]).toEqual([null, null]);
});
