import { expect, test } from "bun:test";
import { COMMANDS, createCommandService } from "@manent/commands";
import type { CommandContext, CommandDefinition } from "@manent/commands";
import {
  POINTERS,
  SETTINGS,
  createMemoryBag,
  createSettingsStore,
} from "@manent/settings";
import type { SearchPointer, SettingDefinition } from "@manent/settings";
import { DIALOG_WORDS, MENU_WORDS, PREFERENCES_WORDS } from "@manent/ui";
import { checkStrings } from "../check-glossary.ts";
import type { StringSource } from "../check-glossary.ts";
import { NAMES, TERMS } from "../glossary/index.ts";

const CTX: CommandContext = {
  screen: "document",
  focus: "page",
  docOpen: true,
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
  layoutView: "page",
  spaceBeforeSet: false,
  zoom: null,
  zoomPercent: null,
  production: null,
};

const labelOf = (c: CommandDefinition, ctx: CommandContext): string =>
  typeof c.label === "function"
    ? c.label(ctx, { get: () => undefined })
    : c.label;
const reasonsOf = (c: CommandDefinition): string[] =>
  c.whyNot === null ? [] : [c.whyNot(CTX)];
const noop = (): void => {};

const HANDLERS: Readonly<Record<string, () => void>> = Object.fromEntries(
  COMMANDS.map((c) => [c.id, noop]),
);
const bag = () => createMemoryBag({ initial: {}, writable: () => true });
const STORE = createSettingsStore({
  registry: SETTINGS,
  bags: { personal: bag(), device: bag(), script: bag() },
  beforeWrite: noop,
  deferRemote: (apply) => apply(),
  locked: () => false,
});

const scopeOf = (def: SettingDefinition): StringSource["scope"] =>
  def.scope === "script" ? "shared" : "personal";

/** Every word a setting shows: its label, help, noun and the label of each choice, held to the scope it speaks of. */
function settingStrings(registry: typeof SETTINGS): StringSource[] {
  return registry.all.flatMap((def: SettingDefinition) =>
    [
      def.label,
      def.description,
      def.noun,
      ...(def.type.choices ?? []).map((c) => c.label),
    ]
      .filter((text) => text !== null)
      .map((text) => ({ file: "settings", text, scope: scopeOf(def) })),
  );
}

/** What a search shows for a pointer: every `says`, and the label of an `elsewhere` pointer; an answer's label is search input only. */
function pointerStrings(pointers: readonly SearchPointer[]): StringSource[] {
  return pointers.flatMap((p) => {
    const says =
      typeof p.says === "string" ? [p.says] : [p.says.desktop, p.says.web];
    const shown = p.kind === "elsewhere" ? [p.label, ...says] : says;
    return shown.map((text) => ({
      file: "settings",
      text,
      scope: "any" as const,
    }));
  });
}

// spelt with capitals wherever they stand
const CAPITALISED = new Set([
  ...[...TERMS.map((term) => term.term), ...NAMES].flatMap((text) =>
    text.split(/\s+/),
  ),
  "Enter",
  "Tab",
  "Esc",
  "OMITTED",
  "CONT'D",
  "MORE",
  "CONTINUED",
  // the pronoun
  "I",
]);
const WORD = new RegExp(String.raw`[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*`, "gu");
const CAPITAL = new RegExp(String.raw`^\p{Lu}`, "u");

// a submenu's name before ": ", and a place before " → " ("Preferences → Writing"), end one name; the next starts with a capital
const NAME_END = new RegExp(String.raw`: | → `);

/** The words of `text` that break sentence case: a capital after the first word of each name. */
function capitalsOutOfPlace(text: string): string[] {
  return text.split(NAME_END).flatMap((part) =>
    [...part.matchAll(WORD)]
      .slice(1)
      .map((m) => m[0])
      .filter((word) => CAPITAL.test(word) && !CAPITALISED.has(word)),
  );
}

/** The ids of commands whose label ends in "…" but which open nothing to ask for more. */
const actingAtOnce = (commands: readonly CommandDefinition[]): string[] =>
  commands
    .filter((c) => labelOf(c, CTX).endsWith("…") && c.opens === null)
    .map((c) => c.id);

test("every setting and command label, reason and search answer passes the glossary", () => {
  expect(
    checkStrings([
      ...settingStrings(SETTINGS),
      ...pointerStrings(POINTERS),
      ...COMMANDS.flatMap((c) =>
        [labelOf(c, CTX), ...reasonsOf(c)].map((text) => ({
          file: "commands",
          text,
          scope: "any" as const,
        })),
      ),
    ]),
  ).toEqual([]);
});

test("every command label and menu word is sentence case", () => {
  expect(
    [
      "Check Spelling as I type",
      "Theme: Dark",
      "After Dialogue, Enter starts",
      "Scene CONTINUED",
    ].map(capitalsOutOfPlace),
  ).toEqual([["Spelling"], [], [], []]);
  const panes = [
    PREFERENCES_WORDS.writing,
    PREFERENCES_WORDS.appearance,
    PREFERENCES_WORDS.keyboard,
    PREFERENCES_WORDS.account,
    PREFERENCES_WORDS.device(true),
    PREFERENCES_WORDS.device(false),
  ];
  const menuWords = Object.values(MENU_WORDS).flatMap((word) =>
    typeof word === "string" ? [word] : panes.map((pane) => word(pane, pane)),
  );
  const texts = [
    ...COMMANDS.map((c) => labelOf(c, CTX)),
    ...SETTINGS.all.flatMap((def: SettingDefinition) => [
      def.label,
      ...(def.type.choices ?? []).map((c) => c.label),
    ]),
    ...menuWords,
  ];
  expect(
    texts
      .map((text) => [text, capitalsOutOfPlace(text)] as const)
      .filter(([, words]) => words.length > 0),
  ).toEqual([]);
});

test("every label that ends in … belongs to a command that asks for more before it acts", () => {
  const fixture: CommandDefinition = {
    ...COMMANDS[0],
    id: "test.preferences",
    label: "Preferences…",
    opens: null,
  };
  expect([actingAtOnce(COMMANDS), actingAtOnce([fixture])]).toEqual([
    [],
    ["test.preferences"],
  ]);
});

test("the panel commands are disabled off a document, with their reason", () => {
  const off = createCommandService({
    commands: COMMANDS,
    handlers: HANDLERS,
    context: () => ({ ...CTX, docOpen: false }),
    settings: STORE,
    bindings: () => new Map(),
    onDisabled: noop,
  });
  expect(off.state("view.leftPanel")).toMatchObject({
    visible: true,
    enabled: false,
    whyNot: "needs a document open",
  });
});

test("Sign in to sync waits for a connection and says so", () => {
  const offline = createCommandService({
    commands: COMMANDS,
    handlers: HANDLERS,
    context: () => ({ ...CTX, signedIn: false, online: false }),
    settings: STORE,
    bindings: () => new Map(),
    onDisabled: noop,
  });
  expect(offline.state("app.signInToSync")).toMatchObject({
    visible: true,
    enabled: false,
    whyNot: "needs a connection",
  });
  expect(
    DIALOG_WORDS.disabledLine("Sign in to sync", "needs a connection"),
  ).toBe("Sign in to sync needs a connection.");
});
