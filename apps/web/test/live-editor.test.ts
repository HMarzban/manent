import { expect, test } from "bun:test";
import type { ScriptEditor } from "@manent/editor";
import type { FrontPage, Pagination } from "@manent/pagination";
import { connectEditor } from "../src/editor-host/connect-editor.ts";
import { createEditorControl } from "../src/editor-host/control.ts";
import {
  liveContentPageCount,
  liveEditor,
  liveFrontPages,
  livePagination,
  registerLiveEditor,
} from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";

const unsubscribe = (): (() => void) => () => {};

// an Ink editor, without pages; the view is never read
const fake = (docId: string, over: Partial<LiveEditor> = {}): LiveEditor => ({
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
  pagination: () => null,
  zoom: () => 1,
  frontPages: () => null,
  ...over,
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

test("livePagination, liveContentPageCount and liveFrontPages read from the registered editor", () => {
  const pagination = {
    pages: [{ label: "1" }, { label: "1A" }, { label: "2" }, { label: "B2" }],
  } as unknown as Pagination;
  const frontPages = [{ label: "i" }] as unknown as FrontPage[];
  const off = registerLiveEditor(
    fake("d3", {
      pagination: () => pagination,
      frontPages: () => frontPages,
    }),
  );
  expect([
    livePagination("d3"),
    liveContentPageCount("d3"),
    liveFrontPages("d3"),
    liveContentPageCount("missing"),
    liveFrontPages("missing"),
  ]).toEqual([pagination, 2, frontPages, null, null]);
  off();
});

test("connectEditor attaches the editor to its control and registers it as live until disconnected", () => {
  const control = createEditorControl();
  const seen: unknown[] = [];
  let titled = false;
  const pagination = { pages: [{ label: "1" }] } as unknown as Pagination;
  const frontPages = [{ label: "i" }] as unknown as FrontPage[];
  const editor = {
    view: {} as ScriptEditor["view"],
    scaffold: {} as NonNullable<ScriptEditor["scaffold"]>,
    run(action: unknown) {
      seen.push(action);
      return { ok: true as const };
    },
    pagination: () => pagination,
    zoomPercent: () => 125,
    showTitlePage() {
      titled = true;
    },
    frontPages: () => frontPages,
  } as unknown as ScriptEditor;
  const disconnect = connectEditor({
    control,
    docId: "d4",
    doc: {} as LiveEditor["doc"],
    editor,
    presence: fake("d4").presence,
    editable: true,
  });
  const ran = control.run("format.bold");
  control.showTitlePage();
  expect([
    ran,
    seen,
    titled,
    control.zoomPercent(),
    livePagination("d4"),
    liveEditor("d4")?.zoom(),
    liveFrontPages("d4"),
  ]).toEqual([
    { ok: true },
    [{ kind: "style", mark: "bold" }],
    true,
    125,
    pagination,
    1.25,
    frontPages,
  ]);
  disconnect();
  expect([
    control.run("format.bold"),
    control.zoomPercent(),
    liveEditor("d4"),
  ]).toEqual([null, null, null]);
});
