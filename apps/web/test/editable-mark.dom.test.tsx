import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { clearMarks, setMarksEnabled } from "@manent/perf";
import { createEditorControl } from "../src/editor-host/control.ts";
import { createEditorMount } from "../src/editor-host/editor-mount.ts";
import { createLocalSessions } from "../src/editor-host/editor-sessions.ts";
import { installEditorHooks } from "../src/editor-host/test-hooks.ts";
import type { EditorHooks } from "../src/editor-host/test-hooks.ts";
import { createClock, testServices } from "./services.fixtures.ts";

withDom();

const DOC = "8f0d1c2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";
const noop = (): void => {};

afterEach(() => {
  clearMarks();
  setMarksEnabled(false);
  document.body.replaceChildren();
});

// fonts that never load and timers that never fire: the page is drawn in the fallback face
const PORTS = {
  fonts: { add: noop },
  makeFace: () => ({ load: () => new Promise<never>(noop) }),
  wait: () => new Promise<never>(noop),
  defer: (run: () => void) => run(),
  whenIdle: noop,
  userAgent: "test",
};

test("the first editable moment is recorded once per mount, from navigation start", () => {
  const services = testServices({ userId: "leo" });
  const frames = { request: () => noop };
  const clock = createClock();
  let ids = 0;
  const nextId = () => `block-${String(++ids).padStart(4, "0")}`;
  const sessions = createLocalSessions({ frames, clock, ids: nextId });
  // the hooks turn the marks on, and read them back as the benchmark does
  const page: { editor?: EditorHooks } = {};
  installEditorHooks(page, {
    services,
    navigate: noop,
    current: () => null,
    sessions,
    access: new Map(),
  });
  const mount = createEditorMount({
    sessions,
    services: () => services,
    control: createEditorControl(),
    keys: { resolve: () => null, run: () => false },
    ports: PORTS,
    frames,
    timers: clock,
    platform: "mac",
    ids: nextId,
    random: () => "r",
  });
  const open = (): (() => void) =>
    mount.mount({
      element: document.body.appendChild(document.createElement("div")),
      docId: DOC,
      facts: { publish: noop },
      outline: { publish: noop, publishCurrent: noop },
      settings: services.openScriptStore(DOC),
      guard: { enter: noop, leave: noop },
    });
  const starts = (): number[] =>
    page.editor!.marks("open.editable").map((record) => record.startMs);
  const dispose = open();
  const once = starts();
  dispose();
  const again = open();
  services.openScriptStore(DOC).set("script.format", "ink");
  const twice = starts();
  again();
  expect([once, twice]).toEqual([[0], [0, 0]]);
});
