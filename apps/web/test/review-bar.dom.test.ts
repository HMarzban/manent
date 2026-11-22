import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { scriptBody } from "@manent/crdt";
import { createEditorControl } from "../src/editor-host/control.ts";
import { createEditorMount } from "../src/editor-host/editor-mount.ts";
import { createLocalSessions } from "../src/editor-host/editor-sessions.ts";
import type { EditorSessions } from "../src/editor-host/editor-sessions.ts";
import { liveEditor } from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";
import type { PersonServices } from "../src/services/ports.ts";
import { bindGuard } from "../src/state/guard.ts";
import {
  B1,
  B2,
  B3,
  action,
  fakeReview,
  overlap,
  sceneEightDoc,
} from "./review-dom.fixtures.ts";
import {
  createClock,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

const DOC = "8f0d1c2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";
const noop = (): void => {};
type EditorView = LiveEditor["view"];

let disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0).toReversed()) dispose();
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

/** Sessions whose one document holds the format's first block, then B1, B2 and B3. */
function sceneSessions(): EditorSessions {
  const local = createLocalSessions({
    frames: { request: () => noop },
    clock: createClock(),
    ids: () => "block-first-0",
  });
  const session = local.open(DOC, "screenplay");
  scriptBody(session.doc()).write((w) =>
    w.insertBlocks("block-first-0", [
      action(B1, "The tide turns."),
      action(B2, "Gulls circle."),
      action(B3, "A bell rings."),
    ]),
  );
  return { open: () => ({ ...session, close: noop }) };
}

function mountFor(services: PersonServices): EditorView {
  const clock = createClock();
  const mount = createEditorMount({
    sessions: sceneSessions(),
    services: () => services,
    control: createEditorControl(),
    keys: { resolve: () => null, run: () => false },
    ports: PORTS,
    frames: { request: () => noop },
    timers: clock,
    platform: "mac",
    ids: () => "block-made-9",
    random: () => "r",
  });
  disposers.push(
    mount.mount({
      element: document.body.appendChild(document.createElement("div")),
      docId: DOC,
      facts: { publish: noop },
      outline: { publish: noop },
      settings: services.openScriptStore(DOC),
      guard: { enter: noop, leave: noop },
    }),
  );
  const live = liveEditor(DOC);
  if (live === null) throw new TypeError("no editor is open");
  return live.view;
}

/** Whether `set` draws a margin bar. */
function holdsBars(set: unknown): boolean {
  const find: unknown =
    typeof set === "object" && set !== null ? Reflect.get(set, "find") : null;
  if (typeof find !== "function") return false;
  const drawn: unknown = Reflect.apply(find, set, []);
  return (
    Array.isArray(drawn) &&
    drawn.some((d: unknown) => {
      const spec: unknown = Reflect.get(Object(d), "spec");
      return String(Reflect.get(Object(spec), "key")).startsWith("margin:");
    })
  );
}

/** The decoration set that holds the margin bars, as the editor draws it now. */
function marginSet(view: EditorView): unknown {
  let found: unknown = null;
  view.someProp("decorations", (decorations) => {
    const set: unknown = decorations.call(view, view.state);
    if (holdsBars(set)) found = set;
  });
  return found;
}

/** The end of block `id`'s text, as a position of the editor's document. */
function endOf(view: EditorView, id: string): number {
  let end = -1;
  view.state.doc.descendants((node, pos) => {
    if (node.attrs.id === id) end = pos + node.nodeSize - 1;
    return end === -1;
  });
  return end;
}

test("a margin bar stands beside each passage to review and leads to it", () => {
  const ran: string[] = [];
  const environment = testEnvironment({ ran: (id) => ran.push(id) });
  bindGuard(environment.guard);
  environment.shellState.set({
    ...environment.shellState.get(),
    screen: "document",
    docId: DOC,
  });
  const base = testServices({ userId: "sam", environment });
  const review = fakeReview(sceneEightDoc());
  review.entriesOf.set([
    overlap("item-1", DOC, B1, ["dana"]),
    overlap("item-2", DOC, B2, []),
  ]);
  const view = mountFor({ ...base, review });
  const bars = [...view.dom.querySelectorAll("button[aria-label='To review']")];
  const before = marginSet(view);
  view.dispatch(view.state.tr.insertText(" Far off.", endOf(view, B3)));
  const after = marginSet(view);
  const second = bars[1];
  second?.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  );
  expect([
    bars.map((bar) => bar.closest("[data-id]")?.getAttribute("data-id")),
    before !== null && after === before,
    review.focusTarget(DOC).get(),
    ran,
  ]).toEqual([[B1, B2], true, B2, ["history.review"]]);
});
