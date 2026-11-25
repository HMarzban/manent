import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { COMMANDS } from "@manent/commands";
import type {
  CommandId,
  CommandService,
  CommandState,
  Resolved,
  RunSource,
} from "@manent/commands";
import { CommandsProvider, createValue } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { registerLiveEditor } from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";
import {
  EMPTY_SELECTION_MARKS,
  readSelectionMarks,
} from "../src/editor-host/selection-marks.ts";
import { SelectionToolbar } from "../src/selection/selection-toolbar.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { FactsContext } from "../src/state/bridge-contexts.ts";
import { createFactsStore } from "../src/state/facts.store.ts";
import type { EditorFacts } from "../src/state/facts.store.ts";
import { bindGuard } from "../src/state/guard.ts";
import {
  QUIET_DOM,
  createClock,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

const DOC_ID = "00000000-0000-4000-8000-0000000000b2";

interface FakeMark {
  readonly type: { readonly name: string };
  readonly attrs: Readonly<Record<string, unknown>>;
}

interface FakeTextNode {
  readonly isText: true;
  readonly text: string;
  readonly marks: readonly FakeMark[];
}

const mark = (
  name: string,
  attrs: Readonly<Record<string, unknown>> = {},
): FakeMark => ({
  type: { name },
  attrs,
});

const rectOf = (
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

const COMMAND_DEFS = new Map(COMMANDS.map((def) => [def.id, def]));

const EMPTY_RESOLVED: Resolved = {
  effective: new Map(),
  editorTable: [],
  lostChord: [],
};

const ALL_SELECTION_COMMANDS: readonly CommandId[] = [
  "format.bold",
  "format.italic",
  "format.underline",
  "format.strike",
  "format.caps",
  "format.colour.none",
  "format.colour.red",
  "format.colour.orange",
  "format.colour.green",
  "format.colour.blue",
  "format.colour.violet",
  "format.highlight.none",
  "format.highlight.yellow",
  "format.highlight.green",
  "format.highlight.pink",
  "format.highlight.orange",
  "format.highlight.violet",
  "format.alignLeft",
  "format.alignCenter",
  "format.alignRight",
  "format.spaceBefore",
  "production.markRevised",
  "alternate.add",
  "material.moveToCuts",
  "comment.add",
  "note.add",
  "timing.exclude",
];

const roots: Root[] = [];
const cleanups: (() => void)[] = [];
const realGetSelection = document.getSelection.bind(document);

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const stop of cleanups.splice(0)) stop();
  document.getSelection = realGetSelection;
  document.body.replaceChildren();
});

function createFakeEditor(
  docId: string,
  initialNodes: readonly FakeTextNode[],
  options: { empty?: boolean } = {},
) {
  let nodes: readonly FakeTextNode[] = initialNodes;
  const parent = {
    isTextblock: true,
    attrs: { id: "block-1" },
    textContent: "Hello world",
  };
  const editor = {
    docId,
    editable: true,
    view: {
      state: {
        get doc() {
          return {
            nodesBetween(
              _from: number,
              _to: number,
              visitor: (node: FakeTextNode) => void,
            ) {
              for (const node of nodes) visitor(node);
            },
          };
        },
        get selection() {
          const empty = options.empty === true;
          const fromPos = 1;
          const toPos = empty ? 1 : 6;
          return {
            empty,
            $from: { pos: fromPos, parent, parentOffset: 0 },
            $to: { pos: toPos, parent, parentOffset: empty ? 0 : 5 },
            ranges: [{ $from: { pos: fromPos }, $to: { pos: toPos } }],
          };
        },
      },
    },
  } as unknown as LiveEditor;
  const unregister = registerLiveEditor(editor);
  cleanups.push(unregister);
  return {
    setNodes(next: readonly FakeTextNode[]) {
      nodes = next;
    },
  };
}

interface HarnessOptions {
  available?: readonly CommandId[];
  initialNodes?: readonly FakeTextNode[];
  pageRect?: DOMRect;
  selectionRect?: DOMRect;
  facts?: Partial<EditorFacts>;
  onCommandRun?: (id: string, source: RunSource) => void;
}

function mountToolbar(options: HarnessOptions = {}) {
  const clock = createClock();
  let pageFocusCalls = 0;
  const environment = testEnvironment({
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => clock.schedule(fn, 16),
    dom: {
      ...QUIET_DOM,
      focusPage: () => {
        pageFocusCalls++;
        return true;
      },
    },
  });
  bindGuard(environment.guard);
  const services = testServices({ userId: "leo", environment });
  const facts = createFactsStore({
    guard: environment.guard,
    frame: environment.frame,
  });

  const editor = createFakeEditor(
    DOC_ID,
    options.initialNodes ?? [{ isText: true, text: "Hello", marks: [] }],
  );

  const available = new Set<string>(
    options.available ?? ALL_SELECTION_COMMANDS,
  );
  const ran: { id: string; source: RunSource }[] = [];
  const listeners = new Set<() => void>();
  const service: CommandService = {
    run(id, source) {
      ran.push({ id, source });
      options.onCommandRun?.(id, source);
      return "ran";
    },
    state(id): CommandState {
      const def = COMMAND_DEFS.get(id as CommandId);
      const label =
        def === undefined
          ? id
          : typeof def.label === "function"
            ? id
            : def.label;
      const keys = def?.keys.mac ?? [];
      const ok = available.has(id);
      return {
        enabled: ok,
        visible: ok,
        checked: null,
        label,
        keys,
        whyNot: ok ? null : "unavailable",
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  const pageRegion = document.createElement("div");
  pageRegion.setAttribute("data-region", "page");
  const pageText = document.createElement("p");
  pageText.textContent = "Hello world";
  pageRegion.append(pageText);
  const pageRect = options.pageRect ?? rectOf(0, 60, 800, 600);
  pageRegion.getBoundingClientRect = () => pageRect;

  const sidePanel = document.createElement("div");
  sidePanel.setAttribute("data-region", "side_panel");
  const sideButton = document.createElement("button");
  sidePanel.append(sideButton);

  const host = document.createElement("div");
  document.body.append(pageRegion, sidePanel, host);

  let currentRect = options.selectionRect ?? rectOf(200, 220, 120, 20);
  let collapsed = false;
  document.getSelection = () =>
    ({
      rangeCount: 1,
      isCollapsed: collapsed,
      getRangeAt: () => ({
        commonAncestorContainer: pageText,
        getBoundingClientRect: () => currentRect,
      }),
    }) as unknown as Selection;

  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <CommandsProvider
            service={service}
            resolved={createValue(EMPTY_RESOLVED)}
            platform="mac"
          >
            <FactsContext value={facts.selectors}>
              <SelectionToolbar docId={DOC_ID} />
            </FactsContext>
          </CommandsProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    );
    facts.writer.publish({
      selectionEmpty: false,
      selectedText: "Hello",
      blockId: "block-1",
      ...options.facts,
    });
    clock.advance(16);
  });

  const selectWithPointer = (): void => {
    act(() => {
      pageText.dispatchEvent(
        new PointerEvent("pointerdown", { button: 0, bubbles: true }),
      );
      pageText.dispatchEvent(
        new PointerEvent("pointerup", { button: 0, bubbles: true }),
      );
      clock.advance(150);
    });
  };

  return {
    clock,
    editor,
    facts,
    pageRegion,
    pageText,
    sideButton,
    ran,
    pageFocusCalls: () => pageFocusCalls,
    setSelectionRect(next: DOMRect) {
      currentRect = next;
    },
    setCollapsed(next: boolean) {
      collapsed = next;
    },
    notifyCommands() {
      act(() => {
        for (const listener of listeners) listener();
      });
    },
    publishFacts(changed: Partial<EditorFacts>) {
      act(() => {
        facts.writer.publish(changed);
        clock.advance(16);
      });
    },
    selectWithPointer,
    toolbar: () =>
      document.querySelector<HTMLElement>("[data-selection-toolbar]"),
  };
}

test("readSelectionMarks reports empty, uniform and mixed marks across selected text nodes", () => {
  expect(readSelectionMarks("missing-doc")).toEqual(EMPTY_SELECTION_MARKS);

  const emptyEditor = createFakeEditor(
    "empty-doc",
    [{ isText: true, text: "Hi", marks: [mark("bold")] }],
    { empty: true },
  );
  expect(readSelectionMarks("empty-doc")).toEqual(EMPTY_SELECTION_MARKS);
  void emptyEditor;

  const editor = createFakeEditor("marks-doc", [
    {
      isText: true,
      text: "Hello ",
      marks: [
        mark("bold"),
        mark("italic"),
        mark("color", { value: "red" }),
        mark("highlight", { value: "yellow" }),
      ],
    },
    {
      isText: true,
      text: "world",
      marks: [
        mark("bold"),
        mark("italic"),
        mark("color", { value: "red" }),
        mark("highlight", { value: "yellow" }),
      ],
    },
  ]);
  expect(readSelectionMarks("marks-doc")).toEqual({
    bold: true,
    italic: true,
    underline: false,
    strike: false,
    caps: false,
    color: "red",
    highlight: "yellow",
  });

  editor.setNodes([
    {
      isText: true,
      text: "Hello ",
      marks: [mark("bold"), mark("color", { value: "red" })],
    },
    {
      isText: true,
      text: "world",
      marks: [mark("underline"), mark("color", { value: "blue" })],
    },
  ]);
  expect(readSelectionMarks("marks-doc")).toEqual({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    caps: false,
    color: "mixed",
    highlight: null,
  });
});

test("the toolbar appears 150 ms after pointer release and hides on page keystroke or outside click", () => {
  const ui = mountToolbar();
  act(() => {
    ui.pageText.dispatchEvent(
      new PointerEvent("pointerdown", { button: 0, bubbles: true }),
    );
    ui.pageText.dispatchEvent(
      new PointerEvent("pointerup", { button: 0, bubbles: true }),
    );
    ui.clock.advance(149);
  });
  expect(ui.toolbar()).toBe(null);

  act(() => ui.clock.advance(1));
  expect(ui.toolbar()?.getAttribute("role")).toBe("toolbar");

  // clicking outside the page (e.g. side panel) dismisses the bar
  act(() => {
    ui.sideButton.dispatchEvent(
      new PointerEvent("pointerdown", { button: 0, bubbles: true }),
    );
  });
  expect(ui.toolbar()).toBe(null);

  // re-select and press a key in the page
  ui.selectWithPointer();
  expect(ui.toolbar()).not.toBe(null);
  act(() => {
    ui.pageText.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    );
  });
  expect(ui.toolbar()).toBe(null);
});

test("pointercancel clears an in-progress drag and zero-rect ranges never draw the bar", () => {
  const ui = mountToolbar();
  act(() => {
    ui.pageText.dispatchEvent(
      new PointerEvent("pointerdown", { button: 0, bubbles: true }),
    );
    document.dispatchEvent(
      new PointerEvent("pointercancel", { bubbles: true }),
    );
    ui.pageText.dispatchEvent(
      new PointerEvent("pointerup", { button: 0, bubbles: true }),
    );
    ui.clock.advance(200);
  });
  expect(ui.toolbar()).toBe(null);

  ui.setSelectionRect(rectOf(0, 0, 0, 0));
  ui.selectWithPointer();
  expect(ui.toolbar()).toBe(null);
});

test("the toolbar flips below when the selection is near or above the top of the page", () => {
  const ui = mountToolbar({
    pageRect: rectOf(0, 60, 800, 600),
    selectionRect: rectOf(200, 75, 100, 20),
  });
  ui.selectWithPointer();
  const belowBar = ui.toolbar();
  expect([belowBar?.style.top, belowBar?.style.transform]).toEqual([
    "95px",
    "translate(-50%, 0.5rem)",
  ]);

  // partially scrolled selection above page top clamps to visible bounds
  ui.setSelectionRect(rectOf(200, 20, 100, 80));
  ui.selectWithPointer();
  const clampedBar = ui.toolbar();
  expect([clampedBar?.style.top, clampedBar?.style.transform]).toEqual([
    "100px",
    "translate(-50%, 0.5rem)",
  ]);

  // with room above the selection, the bar sits above it
  ui.setSelectionRect(rectOf(200, 220, 100, 20));
  ui.selectWithPointer();
  const aboveBar = ui.toolbar();
  expect([aboveBar?.style.top, aboveBar?.style.transform]).toEqual([
    "220px",
    "translate(-50%, calc(-100% - 0.5rem))",
  ]);

  // full-viewport selection with no room above or below pins inside the visible top of the page
  ui.setSelectionRect(rectOf(200, 20, 100, 700));
  ui.selectWithPointer();
  const fullBar = ui.toolbar();
  expect([fullBar?.style.top, fullBar?.style.transform]).toEqual([
    "68px",
    "translate(-50%, 0.5rem)",
  ]);
});

test("the bar draws icon-only formatting toggles with live active state, dividers and trailing actions", async () => {
  let boldActive = true;
  const ui = mountToolbar({
    initialNodes: [{ isText: true, text: "Hello", marks: [mark("bold")] }],
    onCommandRun: (id) => {
      if (id === "format.bold") {
        boldActive = !boldActive;
        ui.editor.setNodes([
          {
            isText: true,
            text: "Hello",
            marks: boldActive ? [mark("bold")] : [],
          },
        ]);
      }
    },
  });
  ui.selectWithPointer();

  const bar = ui.toolbar();
  expect(bar).not.toBe(null);

  const bold = bar?.querySelector<HTMLButtonElement>(
    "[data-tour='format.bold']",
  );
  const italic = bar?.querySelector<HTMLButtonElement>(
    "[data-tour='format.italic']",
  );
  const underline = bar?.querySelector<HTMLButtonElement>(
    "[data-tour='format.underline']",
  );
  expect([
    bold?.getAttribute("aria-label"),
    bold?.textContent,
    bold?.getAttribute("aria-pressed"),
    italic?.getAttribute("aria-label"),
    italic?.textContent,
    italic?.getAttribute("aria-pressed"),
    underline?.getAttribute("aria-label"),
    underline?.textContent,
    underline?.getAttribute("aria-pressed"),
  ]).toEqual([
    "Bold",
    "",
    "true",
    "Italic",
    "",
    "false",
    "Underline",
    "",
    "false",
  ]);

  // dividers separate formatting, trailing main actions and contextual state slot
  const dividers = bar?.querySelectorAll("span.bg-line[aria-hidden='true']");
  expect(dividers?.length).toBe(2);

  // trailing actions and contextual state slot show leading icon + text label
  const comment = bar?.querySelector<HTMLButtonElement>(
    "[data-tour='comment.add']",
  );
  const note = bar?.querySelector<HTMLButtonElement>("[data-tour='note.add']");
  const stateBtn = bar?.querySelector<HTMLButtonElement>(
    "[data-tour='production.markRevised']",
  );
  expect([
    comment?.textContent,
    comment?.querySelector("svg") !== null,
    note?.textContent,
    note?.querySelector("svg") !== null,
    stateBtn?.textContent,
    stateBtn?.querySelector("svg") !== null,
  ]).toEqual(["Comment", true, "Note", true, "Mark revised", true]);

  // clicking Bold toggles the live editor mark and immediately refreshes aria-pressed
  await act(async () => {
    bold?.click();
  });
  expect([ui.ran, bold?.getAttribute("aria-pressed")]).toEqual([
    [{ id: "format.bold", source: "control" }],
    "false",
  ]);
});

test("when revision marking is absent the state slot draws Add alternate with a leading icon", () => {
  const ui = mountToolbar({
    available: ["format.bold", "comment.add", "alternate.add"],
  });
  ui.selectWithPointer();
  const stateBtn = ui
    .toolbar()
    ?.querySelector<HTMLButtonElement>("[data-tour='alternate.add']");
  expect([
    stateBtn?.textContent,
    stateBtn?.querySelector("svg") !== null,
  ]).toEqual(["Add alternate", true]);
});

const swatchItem = (name: string): HTMLElement | null =>
  document
    .querySelector<HTMLElement>(
      `[data-slot='dropdown-menu-content'] .mn-swatch[data-swatch='${name}']`,
    )
    ?.closest<HTMLElement>("[role='menuitem'].mn-swatch-item") ?? null;

const swatchActive = (name: string): boolean =>
  document
    .querySelector(
      `[data-slot='dropdown-menu-content'] .mn-swatch[data-swatch='${name}']`,
    )
    ?.hasAttribute("data-active") ?? false;

test("the More menu groups inline styles, visual colour and highlight swatches, alignment and actions", async () => {
  let colour: string | null = "blue";
  let highlight: string | null = null;
  const syncEditorMarks = (
    editor: ReturnType<typeof createFakeEditor>,
  ): void => {
    const marks: FakeMark[] = [mark("strike")];
    if (colour !== null) marks.push(mark("color", { value: colour }));
    if (highlight !== null) marks.push(mark("highlight", { value: highlight }));
    editor.setNodes([{ isText: true, text: "Hello", marks }]);
  };

  const ui = mountToolbar({
    initialNodes: [
      {
        isText: true,
        text: "Hello",
        marks: [mark("strike"), mark("color", { value: "blue" })],
      },
    ],
    facts: { blockAlign: "center", blockSpaceBeforeSet: true },
    onCommandRun: (id) => {
      if (id === "format.colour.red") {
        colour = "red";
        syncEditorMarks(ui.editor);
      } else if (id === "format.highlight.yellow") {
        highlight = "yellow";
        syncEditorMarks(ui.editor);
      }
    },
  });
  ui.selectWithPointer();

  const moreTrigger = ui
    .toolbar()
    ?.querySelector<HTMLButtonElement>("button[aria-label='More']");
  expect(moreTrigger).not.toBe(null);

  await act(async () => {
    moreTrigger?.click();
  });

  const menu = document.querySelector<HTMLElement>(
    "[data-slot='dropdown-menu-content']",
  );
  expect(menu).not.toBe(null);
  expect(menu?.hasAttribute("data-selection-toolbar")).toBe(true);
  // valid WAI-ARIA menu: zero raw <button> elements inside role="menu"
  expect(menu?.querySelectorAll("button").length).toBe(0);

  // group labels live inside role="group"
  const groups = [...(menu?.querySelectorAll("[role='group']") ?? [])];
  expect(groups.length).toBe(2);
  const labels = groups.map(
    (group) =>
      group.querySelector("[data-slot='dropdown-menu-label']")?.textContent,
  );
  expect(labels).toEqual(["Text colour", "Highlight"]);

  // swatch palettes are valid role="menuitem" entries inside role="group"
  const swatchItems = [
    ...(menu?.querySelectorAll<HTMLElement>(
      "[role='group'] [role='menuitem'].mn-swatch-item",
    ) ?? []),
  ];
  expect(
    swatchItems.map((el) =>
      el.querySelector(".mn-swatch")?.getAttribute("data-swatch"),
    ),
  ).toEqual([
    "text-none",
    "text-red",
    "text-orange",
    "text-green",
    "text-blue",
    "text-violet",
    "hl-none",
    "hl-yellow",
    "hl-green",
    "hl-pink",
    "hl-orange",
    "hl-violet",
  ]);

  expect([
    swatchActive("text-blue"),
    swatchActive("text-red"),
    swatchActive("hl-yellow"),
  ]).toEqual([true, false, false]);

  // menu items include inline styles, paragraph alignment, Move to cuts and Pin to project facts
  const items = [
    ...(menu?.querySelectorAll(
      "[data-slot='dropdown-menu-item']:not(.mn-swatch-item)",
    ) ?? []),
  ];
  const itemTexts = items.map((el) => el.textContent?.trim() ?? "");
  expect(itemTexts).toEqual([
    "Strikethrough",
    "All-caps",
    "Align left",
    "Align centre",
    "Align right",
    "Space before",
    "Move to cuts",
    "Pin to project facts",
  ]);

  // active inline and paragraph items carry a trailing check icon (2 svgs: leading icon + check)
  expect(items.map((el) => el.querySelectorAll("svg").length)).toEqual([
    2, 1, 1, 2, 1, 2, 1, 1,
  ]);

  // clicking a swatch runs its command, closes the menu, restores page focus and refreshes active state
  await act(async () => {
    swatchItem("text-red")?.click();
  });
  expect([
    ui.ran,
    document.querySelector("[data-slot='dropdown-menu-content']"),
    ui.pageFocusCalls(),
  ]).toEqual([[{ id: "format.colour.red", source: "menu" }], null, 1]);

  // reopen More to verify active swatch moved from blue to red
  await act(async () => {
    moreTrigger?.click();
  });
  expect([swatchActive("text-blue"), swatchActive("text-red")]).toEqual([
    false,
    true,
  ]);

  await act(async () => {
    swatchItem("hl-yellow")?.click();
  });
  expect([
    ui.ran.at(-1),
    document.querySelector("[data-slot='dropdown-menu-content']"),
    ui.pageFocusCalls(),
  ]).toEqual([{ id: "format.highlight.yellow", source: "menu" }, null, 2]);

  await act(async () => {
    moreTrigger?.click();
  });
  expect(swatchActive("hl-yellow")).toBe(true);
});

test("focusin moving to an external popover hides the bubble menu while toolbar focus keeps it open", async () => {
  const ui = mountToolbar();
  ui.selectWithPointer();
  expect(ui.toolbar()).not.toBe(null);

  // focusing a button inside the toolbar keeps the bar visible
  const bold = ui
    .toolbar()
    ?.querySelector<HTMLButtonElement>("[data-tour='format.bold']");
  await act(async () => {
    bold?.focus();
  });
  expect(ui.toolbar()).not.toBe(null);

  // focusing an input inside an external popover (e.g. CommentPopover) hides the bar immediately
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  const input = document.createElement("input");
  dialog.append(input);
  document.body.append(dialog);

  await act(async () => {
    input.focus();
  });
  expect(ui.toolbar()).toBe(null);
});

test("hovering More leaves the chevron unrotated, opening rotates it, and outside press does not steal focus", async () => {
  const ui = mountToolbar();
  ui.selectWithPointer();

  const moreTrigger = ui
    .toolbar()
    ?.querySelector<HTMLButtonElement>("button[aria-label='More']");
  expect(moreTrigger).not.toBe(null);
  const chevron = moreTrigger?.querySelectorAll("svg")[1];
  expect(chevron).not.toBe(undefined);
  expect(chevron?.getAttribute("class")).not.toContain("rotate-180");

  // hovering the trigger opens its tooltip without rotating the chevron
  await act(async () => {
    moreTrigger?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    moreTrigger?.dispatchEvent(
      new PointerEvent("pointerenter", { bubbles: true }),
    );
    ui.clock.advance(600);
  });
  expect(chevron?.getAttribute("class")).not.toContain("rotate-180");

  // opening the More menu rotates the chevron
  await act(async () => {
    moreTrigger?.click();
  });
  expect(
    document.querySelector("[data-slot='dropdown-menu-content']"),
  ).not.toBe(null);
  expect(chevron?.getAttribute("class")).toContain("rotate-180");

  // clicking outside closes the menu without stealing focus back to the page
  const callsBefore = ui.pageFocusCalls();
  await act(async () => {
    ui.sideButton.dispatchEvent(
      new PointerEvent("pointerdown", { button: 0, bubbles: true }),
    );
    ui.sideButton.dispatchEvent(
      new MouseEvent("mousedown", { button: 0, bubbles: true }),
    );
  });
  expect(document.querySelector("[data-slot='dropdown-menu-content']")).toBe(
    null,
  );
  expect(ui.pageFocusCalls()).toBe(callsBefore);
});

test("roving tabindex moves across bar buttons with arrow keys, Home, End and Escape returns focus to the page", async () => {
  const ui = mountToolbar({
    available: [
      "format.bold",
      "format.italic",
      "format.underline",
      "comment.add",
    ],
  });
  ui.selectWithPointer();

  const bar = ui.toolbar();
  const buttons = [
    ...(bar?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ??
      []),
  ];
  // Bold, Italic, Underline, More (holding Pin to project facts), Comment
  expect(buttons.length).toBe(5);
  expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1, -1]);

  await act(async () => {
    buttons[0]?.focus();
    buttons[0]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  });
  expect([document.activeElement, buttons.map((b) => b.tabIndex)]).toEqual([
    buttons[1] ?? null,
    [-1, 0, -1, -1, -1],
  ]);

  await act(async () => {
    buttons[1]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
  });
  expect([document.activeElement, buttons.map((b) => b.tabIndex)]).toEqual([
    buttons[4] ?? null,
    [-1, -1, -1, -1, 0],
  ]);

  await act(async () => {
    buttons[4]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
  });
  expect([document.activeElement, buttons.map((b) => b.tabIndex)]).toEqual([
    buttons[3] ?? null,
    [-1, -1, -1, 0, -1],
  ]);

  await act(async () => {
    buttons[3]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
  });
  expect([document.activeElement, buttons.map((b) => b.tabIndex)]).toEqual([
    buttons[0] ?? null,
    [0, -1, -1, -1, -1],
  ]);

  await act(async () => {
    buttons[0]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(ui.pageFocusCalls()).toBe(1);
});
