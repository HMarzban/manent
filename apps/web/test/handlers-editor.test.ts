import { expect, test } from "bun:test";
import {
  COMMANDS,
  EDITOR_COMMANDS,
  createCommandService,
} from "@manent/commands";
import type {
  CommandContext,
  EditorCommandId,
  RunResult,
  SettingReader,
} from "@manent/commands";
import type { ActionResult } from "@manent/editor";
import { createMessageQueue } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import {
  EDITOR_COMMAND_ACTIONS,
  actionOf,
} from "../src/editor-host/command-actions.ts";
import { createEditorControl } from "../src/editor-host/control.ts";
import { createEditorHandlers } from "../src/handlers/editor.ts";
import { createEditorKeyRun } from "../src/handlers/editor-key-run.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { rulerActions } from "../src/state/ruler.store.ts";

bindGuard(createGuard({ flavour: "test" }));

type Refusal = Extract<ActionResult, { ok: false }>["reason"];

const CTX: CommandContext = {
  screen: "document",
  focus: "page",
  docOpen: false,
  role: "editor",
  online: true,
  platform: "mac",
  shell: "web",
  demo: false,
  signedIn: true,
  panelOpen: { left: false, side: false },
  historyPresent: false,
  format: null,
  rulerShown: false,
  spaceBeforeSet: false,
  zoom: null,
  zoomPercent: null,
  production: null,
};

const ctx = (over: Partial<CommandContext>): CommandContext => ({
  ...CTX,
  ...over,
});
const noSettings: SettingReader = { get: () => undefined };
const queue = (): MessageQueue =>
  createMessageQueue({ now: () => 0, schedule: () => () => {} });
const messages = queue();

const labelOf = (id: string): string => {
  const label = COMMANDS.find((c) => c.id === id)?.label;
  if (typeof label !== "string") throw new RangeError(`no label for ${id}`);
  return label;
};

const serviceWith = (over: Partial<CommandContext>) =>
  createCommandService({
    commands: COMMANDS,
    handlers: {},
    context: () => ctx(over),
    settings: { get: () => undefined, set: () => ({ ok: true }) },
    bindings: () => new Map(),
    onDisabled: () => {},
  });

/** What the message slot says after `id` runs over a page that answers `answer`; null when it says nothing. */
function slotAfter(
  id: EditorCommandId,
  answer: ActionResult | null,
  format: string,
): string | null {
  const slot = queue();
  const control = createEditorControl();
  if (answer !== null)
    control.attach({ run: () => answer, zoomPercent: () => 100 });
  createEditorHandlers({
    control,
    messages: slot,
    formatLabel: () => format,
    docId: () => "d1",
    navigate: () => {},
  })[id]();
  return slot.current()?.text ?? null;
}

const refusal = (
  id: EditorCommandId,
  reason: Refusal,
  format = "Screenplay",
): string | null => slotAfter(id, { ok: false, reason }, format);
const refusalWithNoEditor = (id: EditorCommandId): string | null =>
  slotAfter(id, null, "Screenplay");

test("every editor command has an action", () => {
  expect(Object.keys(EDITOR_COMMAND_ACTIONS).toSorted()).toEqual(
    EDITOR_COMMANDS.filter((c) => c.scope === "editor")
      .map((c) => c.id)
      .toSorted(),
  );
});

test("Undo and Redo chosen outside the page are the page's own", () => {
  expect([actionOf("edit.undo"), actionOf("edit.redo")]).toEqual([
    { kind: "undo" },
    { kind: "redo" },
  ]);
});

test("a Ruler or Layout change reaches the page with the values it carries", () => {
  const change = { kind: "layout", indent: 12 } as const;
  expect(actionOf(change)).toBe(change);
});

test("each editor command asks the page for its own action", () => {
  const asked: unknown[] = [];
  const control = createEditorControl();
  control.attach({
    run(id) {
      asked.push(actionOf(id));
      return { ok: true };
    },
    zoomPercent: () => 100,
  });
  const handlers = createEditorHandlers({
    control,
    messages: queue(),
    formatLabel: () => "Screenplay",
    docId: () => "d1",
    navigate: () => {},
  });
  for (const c of EDITOR_COMMANDS) if (c.scope === "editor") handlers[c.id]();
  expect(asked).toEqual([
    { kind: "picker" },
    ...[
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "0",
      "E",
      "M",
      "C",
      "G",
    ].map((slot) => ({ kind: "element", slot })),
    { kind: "dual_dialogue" },
    { kind: "page_break" },
    ...["bold", "italic", "underline", "strike", "caps"].map((mark) => ({
      kind: "style",
      mark,
    })),
    { kind: "align", value: "left" },
    { kind: "align", value: "center" },
    { kind: "align", value: "right" },
    { kind: "space_before" },
    ...[null, "red", "orange", "green", "blue", "violet"].map((value) => ({
      kind: "colour",
      value,
    })),
    ...[null, "yellow", "green", "pink", "orange", "violet"].map((value) => ({
      kind: "highlight",
      value,
    })),
  ]);
});

test("a refused command says why in the message slot", () => {
  expect(refusal("format.dualDialogue", "needs_two_speeches")).toBe(
    "Dual dialogue needs two speeches.",
  );
  expect(refusal("element.transition", "not_in_format", "Stage play")).toBe(
    "Transition isn't part of the Stage play format.",
  );
  expect(refusal("format.bold", "read_only")).toBe(
    "Bold isn't available on a read-only page.",
  );
  expect([
    refusal("format.spaceBefore", "nothing_to_do"),
    refusalWithNoEditor("format.bold"),
  ]).toEqual([null, null]);
});

test("a viewer's editing key on the page says why, and the browser does not act on it", () => {
  const run = createEditorKeyRun({
    commands: serviceWith({ docOpen: true, role: "viewer" }),
    messages,
    labelOf,
  });
  expect([
    run("format.bold"),
    messages.current()?.text,
    run("doc.rename"),
  ]).toEqual([true, "Bold isn't available on a read-only page.", false]);
});

test("a key the page's command uses or refuses is spent, and one it passes is not", () => {
  const slot = queue();
  const answers = new Map<string, RunResult>([
    ["format.bold", "ran"],
    ["format.italic", "disabled"],
    ["format.underline", "passed"],
  ]);
  const run = createEditorKeyRun({
    commands: { run: (id) => answers.get(id) ?? "absent" },
    messages: slot,
    labelOf,
  });
  expect([
    run("format.bold"),
    run("format.italic"),
    run("format.underline"),
    slot.current(),
  ]).toEqual([true, true, false, null]);
});

test("Space before shows checked when the block has its own", () => {
  const d = EDITOR_COMMANDS.find((x) => x.id === "format.spaceBefore")!;
  expect([
    d.checked!(ctx({ docOpen: true, spaceBeforeSet: true }), noSettings),
    d.checked!(ctx({ docOpen: true, spaceBeforeSet: false }), noSettings),
  ]).toEqual([true, false]);
});

test("Export and Print open their forms, and Ruler toggles", () => {
  const visited: string[] = [];
  const handlers = createEditorHandlers({
    control: createEditorControl(),
    messages: queue(),
    formatLabel: () => "Screenplay",
    docId: () => "d1",
    navigate: (path) => visited.push(path),
  });
  handlers["doc.export"]();
  handlers["doc.print"]();
  const shown = [rulerActions.get()];
  handlers["view.ruler"]();
  shown.push(rulerActions.get());
  handlers["view.ruler"]();
  shown.push(rulerActions.get());
  expect([visited, shown]).toEqual([
    ["/s/d1/send/export", "/s/d1/send/print"],
    [false, true, false],
  ]);
});
