import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import type { StatusFacts } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { withRecordedAccess } from "../src/editor-host/test-hooks.ts";
import { LayoutGroup } from "../src/screens/document/layout-group.tsx";
import { ServicesProvider } from "../src/services/context.tsx";
import { FactsContext } from "../src/state/bridge-contexts.ts";
import { createFactsStore } from "../src/state/facts.store.ts";
import type { EditorFacts } from "../src/state/facts.store.ts";
import { bindGuard } from "../src/state/guard.ts";
import { press, typeInto } from "./document-frame.fixtures.tsx";
import {
  createClock,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

const DOC_ID = "00000000-0000-4000-8000-0000000000b2";
const IN_A_BLOCK: Partial<EditorFacts> = {
  blockId: "b1",
  columnCells: 60,
  blockIndent: 15,
  blockWidth: 35,
  blockAlign: null,
  blockSpaceBefore: 1,
};

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

/** The group of a document open with `access`, over facts the test publishes and an editor that records what it is asked to run. */
function drawGroup(access: StatusFacts["access"] = "edit") {
  const clock = createClock();
  const environment = testEnvironment({
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => clock.schedule(fn, 16),
  });
  bindGuard(environment.guard);
  const services = withRecordedAccess(
    testServices({ userId: "leo", environment }),
    new Map([[DOC_ID, access]]),
  );
  const ran: unknown[] = [];
  services.editor.attach({
    run(action) {
      ran.push(action);
      return { ok: true };
    },
    zoomPercent: () => 100,
  });
  const facts = createFactsStore({
    guard: environment.guard,
    frame: environment.frame,
  });
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  roots.push(root);
  act(() =>
    root.render(
      <ServicesProvider services={services}>
        <FactsContext value={facts.selectors}>
          <LayoutGroup docId={DOC_ID} />
        </FactsContext>
      </ServicesProvider>,
    ),
  );
  return {
    el,
    ran,
    publish(changed: Partial<EditorFacts>) {
      act(() => {
        facts.writer.publish(changed);
        clock.advance(16);
      });
    },
  };
}

/** The field whose label reads `name`; throws when there is none. */
function field(el: Element, name: string): HTMLInputElement {
  const label = [...el.querySelectorAll("label")].find(
    (l) => l.textContent === name,
  );
  const input = el.ownerDocument.getElementById(label?.htmlFor ?? "");
  if (!(input instanceof HTMLInputElement))
    throw new TypeError(`no field ${name}`);
  return input;
}

const values = (el: Element): string[] =>
  ["Indent", "Width", "Space before"].map((name) => field(el, name).value);

test("Layout shows the block's values and commits each on Enter, once", () => {
  const group = drawGroup();
  group.publish(IN_A_BLOCK);
  const shown = values(group.el);
  const indent = field(group.el, "Indent");
  act(() => indent.focus());
  typeInto(indent, "2.0");
  press(indent, "Enter");
  act(() => indent.blur());
  const right = [...group.el.querySelectorAll("button")].find(
    (b) => b.textContent === "Right",
  );
  act(() => right?.click());
  expect([shown, group.ran]).toEqual([
    ["1.5 in", "3.5 in", "1 line"],
    [
      { kind: "layout", indent: 20 },
      { kind: "layout", align: "right" },
    ],
  ]);
});

test("a field commits when it loses focus, and shows the fact's value again after", () => {
  const group = drawGroup();
  group.publish(IN_A_BLOCK);
  const space = field(group.el, "Space before");
  act(() => space.focus());
  typeInto(space, "3");
  act(() => space.blur());
  const typed = space.value;
  group.publish({ blockSpaceBefore: 3 });
  expect([typed, space.value, group.ran]).toEqual([
    "1 line",
    "3 lines",
    [{ kind: "layout", spaceBefore: 3 }],
  ]);
});

test("Layout is absent without a caret or pages, and read-only for someone who cannot edit", () => {
  const empty = drawGroup();
  const before = empty.el.childElementCount;
  empty.publish({ ...IN_A_BLOCK, columnCells: null });
  const withoutPages = empty.el.childElementCount;
  const viewer = drawGroup("view");
  viewer.publish(IN_A_BLOCK);
  const readOnly = ["Indent", "Width", "Space before"].map(
    (name) => field(viewer.el, name).readOnly,
  );
  const right = [...viewer.el.querySelectorAll("button")].find(
    (b) => b.textContent === "Right",
  );
  act(() => right?.click());
  const indent = field(viewer.el, "Indent");
  act(() => indent.focus());
  press(indent, "ArrowUp");
  const stepped = indent.value;
  press(indent, "Enter");
  expect([before, withoutPages, readOnly, stepped, viewer.ran]).toEqual([
    0,
    0,
    [true, true, true],
    "1.5 in",
    [],
  ]);
});

test("Indent, Width and Space before are number fields whose arrow keys step the value, committed on Enter", () => {
  const group = drawGroup();
  group.publish(IN_A_BLOCK);
  const spoken = ["Indent", "Width", "Space before"].map((name) => {
    const input = field(group.el, name);
    return [
      input.getAttribute("role"),
      input.getAttribute("aria-valuenow"),
      input.getAttribute("aria-valuetext"),
    ];
  });
  const indent = field(group.el, "Indent");
  act(() => indent.focus());
  press(indent, "ArrowUp");
  press(indent, "ArrowUp");
  const stepped = [indent.value, indent.getAttribute("aria-valuenow")];
  const before = [...group.ran];
  press(indent, "Enter");
  const space = field(group.el, "Space before");
  act(() => space.focus());
  press(space, "ArrowDown");
  press(space, "ArrowDown");
  act(() => space.blur());
  expect([spoken, stepped, before, group.ran]).toEqual([
    [
      ["spinbutton", "1.5", "1.5 in"],
      ["spinbutton", "3.5", "3.5 in"],
      ["spinbutton", "1", "1 line"],
    ],
    ["1.7 in", "1.7"],
    [],
    [
      { kind: "layout", indent: 17 },
      { kind: "layout", spaceBefore: 0 },
    ],
  ]);
});

test("a field refuses text that is not a number in its own unit, and shows the block's value again", () => {
  const group = drawGroup();
  group.publish(IN_A_BLOCK);
  const cases: readonly (readonly [string, string])[] = [
    ["Indent", "2,5"],
    ["Indent", "1.5in2"],
    ["Width", "3 lines"],
    ["Space before", "3 lines 7"],
    ["Space before", "2 in"],
  ];
  for (const [name, text] of cases) {
    const input = field(group.el, name);
    act(() => input.focus());
    typeInto(input, text);
    press(input, "Enter");
  }
  expect([values(group.el), group.ran]).toEqual([
    ["1.5 in", "3.5 in", "1 line"],
    [],
  ]);
});
