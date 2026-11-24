import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { createMemoryBag } from "@manent/settings";
import { createValue, useSubscribable } from "@manent/ui";
import { act } from "react";
import type { HistorySection } from "../src/screens/document/history-sections.ts";
import type { OutlineRow } from "../src/state/outline.store.ts";
import {
  NEW_SCRIPT,
  buttonNamed,
  click,
  nameOf,
  press,
  region,
  renderFrame,
  unmountFrame,
} from "./document-frame.fixtures.tsx";
import type { Frame } from "./document-frame.fixtures.tsx";

withDom();

const HISTORY = "../src/screens/document/history-sections.ts";
const DETAILS = "../src/screens/document/details-sections.ts";
const MARKS = "../src/screens/document/scene-marks.ts";

afterEach(() => {
  unmountFrame();
  mock.module(HISTORY, () => ({ HISTORY_SECTIONS: [] }));
  mock.module(DETAILS, () => ({ DETAILS_SECTIONS: [] }));
  mock.module(MARKS, () => ({ SCENE_MARK_SOURCES: [] }));
});

// 17 Nov 2026, 12:00 in this machine's time zone
const NOV_17 = new Date(2026, 10, 17, 12).getTime();
const SAM = { userId: "sam", name: "Sam", initials: "SO", colour: 2 };

const scene = (
  blockId: string,
  number: string,
  heading: string,
  patch: Partial<OutlineRow> = {},
): OutlineRow => ({
  blockId,
  kind: "scene",
  number,
  heading,
  synopsis: "",
  eighths: null,
  omitted: false,
  current: false,
  ...patch,
});

/** Runs `commandId` as a control does, lets what a panel loads apart arrive, then lets a frame pass. */
async function run(frame: Frame, commandId: string): Promise<void> {
  await act(async () => {
    frame.services.commands.run(commandId, "control");
  });
  act(() => frame.clock.advance(16));
}

const sidePanel = (frame: Frame): HTMLElement =>
  region(frame.container, "side_panel");
const leftPanel = (frame: Frame): HTMLElement =>
  region(frame.container, "left_panel");

/** The words a setting's control is named by. */
const labelOf = (control: Element): string =>
  document.getElementById(control.getAttribute("aria-labelledby") ?? "")
    ?.textContent ?? "";

/** The message the slot shows, and the actions it draws. */
function shownMessage(frame: Frame): string[] {
  const slot = region(frame.container, "status_bar").querySelector(
    "[role='status']",
  );
  return [...(slot?.querySelectorAll("p, button") ?? [])].map(nameOf);
}

const tabs = (panel: HTMLElement): string[] =>
  [...panel.querySelectorAll("[role='tab']")].map(nameOf);

/** A row of a list, its menu last, as it is seen, and as it is read aloud. */
function rowText(row: Element): [string, string] {
  const parts = (hide: string): string =>
    [...row.querySelectorAll(".mn-row > *, [data-row-menu] > :not(.mn-row)")]
      .map((part) => {
        const copy = part.cloneNode(true);
        if (!(copy instanceof Element)) return "";
        for (const hidden of copy.querySelectorAll(hide)) hidden.remove();
        return copy.matches(hide) ? "" : (copy.textContent ?? "");
      })
      .filter((text) => text !== "")
      .join(" ");
  return [parts(".sr-only"), parts("[aria-hidden='true']")];
}

const listRows = (panel: HTMLElement): Element[] => [
  ...panel.querySelectorAll("[role='listitem']"),
];

test("Script settings shows its scope line and its rows, named by their labels", async () => {
  mock.module(DETAILS, () => ({ DETAILS_SECTIONS: [] }));
  const frame = await renderFrame({ title: "The Long Night" });
  await run(frame, "doc.scriptSettings");
  const panel = sidePanel(frame);
  const controls = panel.querySelectorAll(
    "[role='switch'], [role='radiogroup'], [role='combobox']",
  );
  expect([
    [...panel.querySelectorAll("h2, h3, p")].map(nameOf),
    [...controls].map(labelOf),
    nameOf(buttonNamed(panel, "Your own preferences")),
  ]).toEqual([
    [
      "Script",
      "Shared. Everyone on The Long Night sees these. Changing them can move page breaks.",
      "Page setup",
      "Default: Screenplay",
      "Default: US Letter",
      "From the region, when this script was created.",
      "Mores and Continueds",
      "Default: On",
      "Default: On",
      "Default: Off",
      "Scene numbers",
      "Default: 12A",
      "Revisions",
      "Default: White → Blue → Pink → Yellow → Green → Goldenrod → Buff → Salmon → Cherry",
      "Default: 17 Nov 2026",
      "Header and footer",
      "A thin line under the header.",
      "A thin line over the footer.",
    ],
    [
      "Format",
      "Paper",
      "(MORE) and (CONT'D) at page breaks",
      "Same-speaker (CONT'D)",
      "Scene CONTINUED",
      "Numbering scheme",
      "Colour order",
      "Date format",
      "Header",
      "On the first page too",
      "With a rule",
      "Footer",
      "On the first page too",
      "With a rule",
    ],
    "Your own preferences",
  ]);
});

test("changing paper says so to you with Undo, and to others with your name", async () => {
  const scriptBag = createMemoryBag({ initial: {}, writable: () => true });
  const frame = await renderFrame({ scriptBag, startAt: NOV_17 });
  act(() => frame.people.set([SAM]));
  await run(frame, "doc.scriptSettings");
  const a4 = [...sidePanel(frame).querySelectorAll("[role='radio']")].find(
    (radio) => labelOf(radio) === "A4",
  );
  if (a4 === undefined) throw new Error("no A4 choice");
  await click(a4);
  const yours = shownMessage(frame);
  await click(buttonNamed(region(frame.container, "status_bar"), "Undo"));
  const afterUndo = scriptBag.read()["script.paper"];
  act(() => scriptBag.receive({ "script.paper": "a4" }, "sam"));
  const paperLines = [...sidePanel(frame).querySelectorAll("p")]
    .map(nameOf)
    .filter((line) => line.startsWith("Set by"));
  expect([yours, afterUndo, shownMessage(frame), paperLines]).toEqual([
    ["Paper size is now A4.", "Undo"],
    "letter",
    ["Sam changed paper size to A4.", "Script settings"],
    ["Set by Sam 17 Nov · was US Letter"],
  ]);
});

test("resetting paper says so with Undo, which sets it back", async () => {
  const scriptBag = createMemoryBag({
    initial: { "script.paper": "a4" },
    writable: () => true,
  });
  const frame = await renderFrame({ scriptBag, startAt: NOV_17 });
  await run(frame, "doc.scriptSettings");
  await click(buttonNamed(sidePanel(frame), "Reset"));
  const afterReset = [scriptBag.read()["script.paper"], shownMessage(frame)];
  await click(buttonNamed(region(frame.container, "status_bar"), "Undo"));
  expect([afterReset, scriptBag.read()["script.paper"]]).toEqual([
    [undefined, ["Paper size is now US Letter.", "Undo"]],
    "a4",
  ]);
});

test("a reader sees every control read-only and why", async () => {
  const frame = await renderFrame({
    role: "viewer",
    status: { ...NEW_SCRIPT, neverSynced: false, access: "view" },
    scriptBag: createMemoryBag({ initial: {}, writable: () => false }),
  });
  await run(frame, "doc.scriptSettings");
  const panel = sidePanel(frame);
  const controls = [
    ...panel.querySelectorAll(
      "[role='switch'], [role='radio'], [role='combobox']",
    ),
  ];
  expect([
    controls.map((control) => control.hasAttribute("data-disabled")),
    [...panel.querySelectorAll("p")]
      .map(nameOf)
      .includes("Only editors can change script settings."),
  ]).toEqual([controls.map(() => true), true]);
});

test("the Scenes list says how to start, and marks the caret's scene", async () => {
  const frame = await renderFrame();
  await run(frame, "view.leftPanel");
  const empty = leftPanel(frame).querySelector("p")?.textContent;
  act(() =>
    frame.outline.set([
      scene("a", "1", "INT. KITCHEN"),
      scene("b", "2", "EXT. PIER", { current: true }),
    ]),
  );
  expect([
    tabs(leftPanel(frame)),
    empty,
    listRows(leftPanel(frame)).map((row) => [
      rowText(row)[0],
      row.querySelector(".mn-row")?.getAttribute("aria-current") ?? null,
    ]),
  ]).toEqual([
    ["Scenes"],
    "Scenes appear here as you write. Type INT. or EXT. on a new line.",
    [
      ["1 INT. KITCHEN ⋯", null],
      ["2 EXT. PIER ⋯", "true"],
    ],
  ]);
});

test("the left tab and its empty state follow the format", async () => {
  const seen: [string[], string | null | undefined][] = [];
  for (const [format, kind] of [
    ["manuscript", "book"],
    ["ink", "game"],
    ["variety", "podcast"],
  ] as const) {
    const frame = await renderFrame({
      kind,
      scriptBag: createMemoryBag({
        initial: { "script.format": format },
        writable: () => true,
      }),
    });
    await run(frame, "view.leftPanel");
    seen.push([
      tabs(leftPanel(frame)),
      leftPanel(frame).querySelector("p")?.textContent,
    ]);
    unmountFrame();
  }
  expect(seen).toEqual([
    [
      ["Chapters"],
      "Chapters appear here as you write. Press ⌥↵ then 1 for a chapter.",
    ],
    [
      ["Knots"],
      "Knots appear here as you write. Type === and a name on a new line.",
    ],
    [
      ["Scenes"],
      "Segments appear here as you write. Press ⌥↵ then 1 for a segment.",
    ],
  ]);
});

test("History is present only while a section has something, and shows its sections in order", async () => {
  const toReview = createValue(false);
  const versions = createValue(false);
  const fake = (
    id: HistorySection["id"],
    visible: typeof versions,
    words: string,
  ): HistorySection => ({
    id,
    useVisible: () => useSubscribable(visible),
    Section: () => <button type="button">{words}</button>,
  });
  mock.module(HISTORY, () => ({
    HISTORY_SECTIONS: [
      fake("to_review", toReview, "To review fake"),
      fake("versions", versions, "Versions fake"),
    ],
  }));
  const frame = await renderFrame();
  await run(frame, "view.sidePanel");
  const before = tabs(sidePanel(frame));
  act(() => versions.set(true));
  const present = tabs(sidePanel(frame));
  await run(frame, "history.open");
  const panel = sidePanel(frame);
  expect([
    before,
    present,
    nameOf(panel.querySelector("[role='tab'][aria-selected='true']") ?? panel),
    [
      ...(panel
        .querySelector("[role='tabpanel']")
        ?.querySelectorAll("button") ?? []),
    ].map(nameOf),
    nameOf(document.activeElement ?? document.body),
  ]).toEqual([
    ["Comments", "Details"],
    ["Comments", "History", "Details"],
    "History",
    ["Versions fake"],
    "Versions fake",
  ]);
});

test("Details and Scenes draw what later plans register", async () => {
  mock.module(DETAILS, () => ({
    DETAILS_SECTIONS: [
      {
        id: "selection_fake",
        scope: "selection",
        Section: () => <p>Selection fake</p>,
      },
    ],
  }));
  mock.module(MARKS, () => ({
    SCENE_MARK_SOURCES: [
      () => createValue(new Map([["a", [{ kind: "revised" }]]])),
    ],
  }));
  const frame = await renderFrame();
  await run(frame, "view.sidePanel");
  const scopes = [...sidePanel(frame).querySelectorAll("h2")].map(nameOf);
  await run(frame, "view.leftPanel");
  act(() =>
    frame.outline.set([
      scene("a", "1", "INT. KITCHEN"),
      scene("d", "4", "INT. CAR", { omitted: true }),
    ]),
  );
  expect([scopes, listRows(leftPanel(frame)).map(rowText)]).toEqual([
    ["Selection", "Script"],
    [
      ["1 INT. KITCHEN * ⋯", "1 INT. KITCHEN, revised"],
      ["4  OMITTED", "4  OMITTED"],
    ],
  ]);
});

test("each panel's edge is a separator the arrows move, and its close button names the panel", async () => {
  const frame = await renderFrame();
  await run(frame, "view.leftPanel");
  await run(frame, "view.sidePanel");
  const edge = leftPanel(frame).querySelector("[role='separator']");
  if (edge === null) throw new Error("no edge");
  const before = [
    "aria-label",
    "aria-valuenow",
    "aria-valuemin",
    "aria-valuemax",
  ].map((name) => edge.getAttribute(name));
  press(edge, "ArrowRight");
  expect([
    before,
    edge.getAttribute("aria-valuenow"),
    nameOf(buttonNamed(leftPanel(frame), "Close left panel")),
    nameOf(buttonNamed(sidePanel(frame), "Close side panel")),
  ]).toEqual([
    ["Resize left panel", "260", "200", "360"],
    "268",
    "Close left panel",
    "Close side panel",
  ]);
});

test("closing a panel that held focus returns focus to the page", async () => {
  const frame = await renderFrame();
  await run(frame, "view.sidePanel");
  const close = buttonNamed(sidePanel(frame), "Close side panel");
  act(() => close.focus());
  await click(close);
  expect([
    frame.container.querySelector("[data-region='side_panel']") !== null,
    document.activeElement
      ?.closest("[data-region]")
      ?.getAttribute("data-region"),
  ]).toEqual([false, "page"]);
});

test("a switch's change is said with on and off", async () => {
  const frame = await renderFrame();
  await run(frame, "doc.scriptSettings");
  const sceneContinued = [
    ...sidePanel(frame).querySelectorAll("[role='switch']"),
  ].find((control) => labelOf(control) === "Scene CONTINUED");
  if (sceneContinued === undefined) throw new Error("no switch");
  await click(sceneContinued);
  const on = shownMessage(frame);
  await click(sceneContinued);
  // the second message waits for the first to have had its time
  act(() => frame.clock.advance(30_000));
  expect([on, shownMessage(frame)]).toEqual([
    ["Scene CONTINUED is now on.", "Undo"],
    ["Scene CONTINUED is now off.", "Undo"],
  ]);
});

test("a panel that throws leaves the page mounted", async () => {
  const frame = await renderFrame({ brokenOutline: true });
  const host = frame.container.querySelector("[data-editor-host]");
  await run(frame, "view.leftPanel");
  // React reports the error its boundary caught; the panel's own words are what this test reads
  const reported = spyOn(console, "error").mockImplementation(() => {});
  act(() => frame.outline.set([scene("a", "1", "INT. KITCHEN")]));
  reported.mockRestore();
  const panel = leftPanel(frame);
  expect([
    panel.querySelector("p")?.textContent,
    nameOf(buttonNamed(panel, "Reload panel")),
    frame.container.querySelector("[data-editor-host]") === host,
    host?.isConnected,
  ]).toEqual([
    "Couldn't build this list. Your script is unaffected.",
    "Reload panel",
    true,
    true,
  ]);
});

test("Script settings opened by its command puts focus on its first control; the bare toggle leaves focus where it was", async () => {
  const frame = await renderFrame();
  await run(frame, "doc.scriptSettings");
  const opened = nameOf(document.activeElement ?? document.body);
  act(() => {
    frame.services.commands.run("view.sidePanel", "control");
  });
  const title = buttonNamed(
    region(frame.container, "title_bar"),
    "Untitled script",
  );
  act(() => title.focus());
  await run(frame, "view.sidePanel");
  expect([
    opened,
    frame.container.querySelector("[data-region='side_panel']") !== null,
    document.activeElement === title,
  ]).toEqual(["Script settings", true, true]);
});

test("in a narrow window one panel closes the other, and a panel over the page closes when focus returns to it", async () => {
  const narrow = await renderFrame({ viewportWidthPx: 1300 });
  await run(narrow, "view.leftPanel");
  await run(narrow, "view.sidePanel");
  const open = ["left_panel", "side_panel"].map(
    (name) =>
      narrow.container.querySelector(`[data-region='${name}']`) !== null,
  );
  unmountFrame();
  const narrower = await renderFrame({ viewportWidthPx: 1000 });
  await run(narrower, "view.sidePanel");
  const overlaid = sidePanel(narrower).closest("[data-overlay]") !== null;
  const close = buttonNamed(sidePanel(narrower), "Close side panel");
  act(() => close.focus());
  press(close, "Escape");
  expect([
    open,
    overlaid,
    narrower.container.querySelector("[data-region='side_panel']") !== null,
  ]).toEqual([[false, true], true, false]);
});
