import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { createValue } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { createEditorMount } from "../src/editor-host/editor-mount.ts";
import { createLocalSessions } from "../src/editor-host/editor-sessions.ts";
import { liveEditor } from "../src/editor-host/live-editor.ts";
import { INITIAL_SHELL_STATE } from "../src/services/ports.ts";
import type { PersonServices, ShellState } from "../src/services/ports.ts";
import { AnnouncerRegion } from "../src/shell/announcer-region.tsx";
import { createShellDom } from "../src/shell/regions.tsx";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { zoomActions } from "../src/state/zoom.store.ts";
import {
  createClock,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();
bindGuard(createGuard({ flavour: "test" }));

const DOC = "3c9e2f4a-1b7d-4e8f-9a6c-5d2b8e1f0a47";
const noop = (): void => {};

let disposers: (() => void)[] = [];
let roots: Root[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0).toReversed()) dispose();
  for (const root of roots.splice(0)) act(() => root.unmount());
  zoomActions.set("fit_width");
  document.body.replaceChildren();
});

// fonts that never load: the page is drawn in the fallback face
const PORTS = {
  fonts: { add: noop },
  makeFace: () => ({ load: () => new Promise<never>(noop) }),
  wait: () => new Promise<never>(noop),
  defer: (run: () => void) => run(),
  whenIdle: noop,
  userAgent: "test",
};

/** Sam's services with DOC on screen, the shell's announcer drawn, and the page's editor of DOC, a script of `format`, mounted on `clock`. */
function openPage(
  clock: ReturnType<typeof createClock>,
  format: "screenplay" | "ink" = "screenplay",
) {
  const root = createRoot(
    document.body.appendChild(document.createElement("div")),
  );
  roots.push(root);
  act(() => root.render(<AnnouncerRegion />));
  const shellState = createValue<ShellState>({
    ...INITIAL_SHELL_STATE,
    screen: "document",
    docId: DOC,
  });
  const services: PersonServices = testServices({
    userId: "sam",
    environment: testEnvironment({ dom: createShellDom(document), shellState }),
  });
  services.openScriptStore(DOC).set("script.format", format);
  const zooms: unknown[] = [];
  const element = document.body.appendChild(document.createElement("div"));
  const mount = createEditorMount({
    sessions: createLocalSessions({
      frames: { request: () => noop },
      clock,
      ids: () => "block-0001",
    }),
    services: () => services,
    control: services.editor,
    keys: { resolve: () => null, run: () => false },
    ports: PORTS,
    frames: { request: (fn) => clock.schedule(fn, 16) },
    timers: clock,
    platform: "mac",
    ids: () => "block-0999",
    random: () => "r",
    observe(open) {
      if (open === null) return;
      const { editor } = open;
      const setZoom = editor.setZoom.bind(editor);
      editor.setZoom = (zoom) => {
        zooms.push(zoom);
        setZoom(zoom);
      };
    },
  });
  disposers.push(
    mount.mount({
      element,
      docId: DOC,
      facts: { publish: noop },
      outline: { publish: noop, publishCurrent: noop },
      settings: services.openScriptStore(DOC),
      guard: { enter: noop, leave: noop },
    }),
  );
  const polite = document.querySelector('[aria-live="polite"]');
  if (polite === null) throw new TypeError("no polite region is drawn");
  const said: string[] = [];
  new MutationObserver(() => {
    if (polite.textContent !== "") said.push(polite.textContent ?? "");
  }).observe(polite, { childList: true });
  return { services, element, zooms, said };
}

/** Lets the handlers' reach to the open editors, loaded apart from the entry, arrive. */
const editorCodeLoaded = () => import("../src/editor-host/live-editor.ts");

const drawn = (): number | undefined => liveEditor(DOC)?.zoom();

/** A pinch over `element`, and whether the browser's own zoom was prevented. */
function pinch(element: HTMLElement, deltaY: number): boolean {
  const event = new WheelEvent("wheel", { deltaY, cancelable: true });
  // the test DOM's wheel event leaves out the modifier keys it is given
  Object.defineProperty(event, "ctrlKey", { value: true });
  element.dispatchEvent(event);
  return event.defaultPrevented;
}

test("a change of zoom reaches the open page, and a refusal at the end says so", async () => {
  const page = openPage(createClock());
  await editorCodeLoaded();
  const before = drawn();
  zoomActions.set(150);
  const after = drawn();
  zoomActions.set(300);
  page.services.commands.run("view.zoomIn", "key");
  expect([
    before,
    after,
    page.zooms,
    page.services.messages.current()?.text,
  ]).toEqual([0.5, 1.5, [150, 300], "Zoom in isn't available at 300\u00a0%."]);
});

test("a key or a pinch is announced, a menu choice is not", async () => {
  const clock = createClock();
  const page = openPage(clock);
  await editorCodeLoaded();
  zoomActions.set(125);
  page.services.commands.run("view.zoomIn", "key");
  await Promise.resolve();
  const byKey = page.said.splice(0);
  page.services.commands.run("view.zoomFitWidth", "menu");
  await Promise.resolve();
  const byMenu = page.said.splice(0);
  const pinches = [-20, -20, -20].map((deltaY) => {
    const prevented = pinch(page.element, deltaY);
    clock.advance(10);
    return prevented;
  });
  clock.advance(139);
  await Promise.resolve();
  const resting = page.said.splice(0);
  clock.advance(1);
  await Promise.resolve();
  expect([byKey, byMenu, pinches, resting, page.said, page.zooms]).toEqual([
    ["Zoom: 150\u00a0%"],
    [],
    [true, true, true],
    [],
    ["Zoom: 92\u00a0%"],
    // a pinch zooms once per frame: the first two events share one
    [125, 150, "fit_width", 75, 92],
  ]);
});

test("a pinch over an Ink script is left to the browser", async () => {
  const clock = createClock();
  const page = openPage(clock, "ink");
  await editorCodeLoaded();
  const prevented = pinch(page.element, -20);
  clock.advance(200);
  expect([prevented, zoomActions.get(), page.said]).toEqual([
    false,
    "fit_width",
    [],
  ]);
});
