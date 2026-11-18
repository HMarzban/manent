import { afterEach, expect, test } from "bun:test";
import {
  createHotkeyChordHandler,
  formatForDisplay,
  matchesKeyboardEvent,
  normalizeHotkey,
  useHotkey,
  useHotkeyRecorder,
  useHotkeys,
  validateHotkey,
} from "@tanstack/react-hotkeys";
import { COMMANDS, resolveBindings } from "@manent/commands";
import type { Chord } from "@manent/commands";
import type { Platform } from "@manent/settings";
import { createKeyResolver, keyLabel } from "../src/index.ts";

const PLATFORMS: readonly Platform[] = ["mac", "windows", "linux"];

// the library reads the platform from the navigator on each match; a server runtime reads as linux
const AGENTS: Readonly<
  Record<"mac" | "windows", { userAgent: string; platform: string }>
> = {
  mac: {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)",
    platform: "MacIntel",
  },
  windows: {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    platform: "Win32",
  },
};
const SERVER_NAVIGATOR = globalThis.navigator;
const pretendPlatform = (platform: "mac" | "windows"): void => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: AGENTS[platform],
  });
};
afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: SERVER_NAVIGATOR,
  });
});

interface PressInit {
  key: string;
  code: string;
  keyCode?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
}

/** A recorded key press, outside any DOM. */
class Press extends Event implements KeyboardEvent {
  readonly DOM_KEY_LOCATION_STANDARD = 0;
  readonly DOM_KEY_LOCATION_LEFT = 1;
  readonly DOM_KEY_LOCATION_RIGHT = 2;
  readonly DOM_KEY_LOCATION_NUMPAD = 3;
  readonly key: string;
  readonly code: string;
  readonly keyCode: number;
  readonly charCode = 0;
  readonly which: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
  readonly location = 0;
  readonly repeat = false;
  readonly detail = 0;
  readonly view = null;
  constructor(init: PressInit) {
    super("keydown", { bubbles: true, cancelable: true });
    this.key = init.key;
    this.code = init.code;
    this.keyCode = init.keyCode ?? 0;
    this.which = this.keyCode;
    this.ctrlKey = init.ctrlKey ?? false;
    this.metaKey = init.metaKey ?? false;
    this.altKey = init.altKey ?? false;
    this.shiftKey = init.shiftKey ?? false;
    this.isComposing = init.isComposing ?? false;
  }
  getModifierState(key: string): boolean {
    const held: Readonly<Record<string, boolean>> = {
      Control: this.ctrlKey,
      Meta: this.metaKey,
      Alt: this.altKey,
      Shift: this.shiftKey,
    };
    return held[key] ?? false;
  }
  initKeyboardEvent(): void {}
  initUIEvent(): void {}
}

interface Recorded {
  name: string;
  platform: "mac" | "windows";
  init: PressInit;
}

// the same chords on four layouts: the character a key types differs, its position does not
const RECORDED: readonly Recorded[] = (["mac", "windows"] as const).flatMap(
  (platform): Recorded[] => {
    const mod = platform === "mac" ? { metaKey: true } : { ctrlKey: true };
    return [
      {
        name: "US Mod+K",
        platform,
        init: { key: "k", code: "KeyK", keyCode: 75, ...mod },
      },
      {
        name: "US Mod+G",
        platform,
        init: { key: "g", code: "KeyG", keyCode: 71, ...mod },
      },
      {
        name: "US Mod+,",
        platform,
        init: { key: ",", code: "Comma", keyCode: 188, ...mod },
      },
      {
        name: "US Mod+/",
        platform,
        init: { key: "/", code: "Slash", keyCode: 191, ...mod },
      },
      {
        name: "US F6",
        platform,
        init: { key: "F6", code: "F6", keyCode: 117 },
      },
      {
        name: "US Shift+F6",
        platform,
        init: { key: "F6", code: "F6", keyCode: 117, shiftKey: true },
      },
      {
        name: "US Mod+Alt+1",
        platform,
        init: {
          key: platform === "mac" ? "¡" : "1",
          code: "Digit1",
          keyCode: 49,
          altKey: true,
          ...mod,
        },
      },
      {
        name: "German Mod+K",
        platform,
        init: { key: "k", code: "KeyK", keyCode: 75, ...mod },
      },
      {
        name: "German Mod+,",
        platform,
        init: { key: ",", code: "Comma", keyCode: 188, ...mod },
      },
      {
        name: "German Mod+/",
        platform,
        init: { key: "/", code: "Digit7", keyCode: 55, shiftKey: true, ...mod },
      },
      {
        name: "German Mod+G",
        platform,
        init: { key: "g", code: "KeyG", keyCode: 71, ...mod },
      },
      {
        name: "French Mod+K",
        platform,
        init: { key: "k", code: "KeyK", keyCode: 75, ...mod },
      },
      {
        name: "French Mod+,",
        platform,
        init: { key: ",", code: "KeyM", keyCode: 188, ...mod },
      },
      {
        name: "French Mod+/",
        platform,
        init: {
          key: "/",
          code: "Period",
          keyCode: 190,
          shiftKey: true,
          ...mod,
        },
      },
      {
        name: "French Mod+Alt+1",
        platform,
        init: { key: "&", code: "Digit1", keyCode: 49, altKey: true, ...mod },
      },
      {
        name: "Russian Mod+K",
        platform,
        init: { key: "л", code: "KeyK", keyCode: 75, ...mod },
      },
      {
        name: "Russian Mod+G",
        platform,
        init: { key: "п", code: "KeyG", keyCode: 71, ...mod },
      },
      {
        name: "Russian Mod+,",
        platform,
        init: { key: ",", code: "Slash", keyCode: 191, shiftKey: true, ...mod },
      },
      {
        name: "Russian F6",
        platform,
        init: { key: "F6", code: "F6", keyCode: 117 },
      },
    ].map((press) => ({ ...press, name: `${platform} ${press.name}` }));
  },
);

/** Every default chord of a platform, in command order. */
const tableFor = (platform: Platform): { id: string; chord: Chord }[] =>
  [
    ...resolveBindings({
      commands: COMMANDS,
      custom: [],
      platform,
      shell: "web",
      findings: { failsHere: new Set() },
    }).effective,
  ].flatMap(([id, keys]) => keys.map((chord) => ({ id, chord })));

/** What the library's own chord handlers answer: the first entry whose handler fires. */
function libraryAnswer(
  event: KeyboardEvent,
  table: readonly { id: string; chord: Chord }[],
): string | null {
  let fired: string | null = null;
  for (const { id, chord } of table) {
    createHotkeyChordHandler(
      normalizeHotkey(chord),
      () => {
        fired ??= id;
      },
      { preventDefault: false, stopPropagation: false },
    )(event);
  }
  return fired;
}

test("the hotkey library offers the names this code uses", () => {
  expect(
    [
      useHotkey,
      useHotkeys,
      useHotkeyRecorder,
      formatForDisplay,
      matchesKeyboardEvent,
      validateHotkey,
    ].map((f) => typeof f),
  ).toEqual([
    "function",
    "function",
    "function",
    "function",
    "function",
    "function",
  ]);
  expect(validateHotkey("Mod+K").valid).toBe(true);
});

test("every default is a valid hotkey to the library", () => {
  for (const c of COMMANDS)
    for (const p of PLATFORMS)
      for (const k of c.keys[p])
        expect([c.id, k, validateHotkey(k).valid]).toEqual([c.id, k, true]);
});

test("the page's resolver and the library agree on recorded presses", () => {
  const answers: [string, string | null][] = [];
  for (const press of RECORDED) {
    pretendPlatform(press.platform);
    const table = tableFor(press.platform);
    const resolver = createKeyResolver({ table: () => table });
    const event = new Press(press.init);
    expect([press.name, resolver(event)]).toEqual([
      press.name,
      libraryAnswer(event, table),
    ]);
    answers.push([press.name, resolver(event)]);
  }
  // the agreement is not two nulls: the Latin chords resolve on every layout
  expect(
    answers.filter(([name]) => name.includes("Mod+K") || name.includes("F6")),
  ).toEqual([
    ["mac US Mod+K", "app.palette"],
    ["mac US F6", "app.nextRegion"],
    ["mac US Shift+F6", "app.previousRegion"],
    ["mac German Mod+K", "app.palette"],
    ["mac French Mod+K", "app.palette"],
    ["mac Russian Mod+K", "app.palette"],
    ["mac Russian F6", "app.nextRegion"],
    ["windows US Mod+K", "app.palette"],
    ["windows US F6", "app.nextRegion"],
    ["windows US Shift+F6", "app.previousRegion"],
    ["windows German Mod+K", "app.palette"],
    ["windows French Mod+K", "app.palette"],
    ["windows Russian Mod+K", "app.palette"],
    ["windows Russian F6", "app.nextRegion"],
  ]);
});

test("a typed character never reaches the matcher", () => {
  let reads = 0;
  const resolver = createKeyResolver({
    table: () => {
      reads += 1;
      return [{ id: "app.palette", chord: "Mod+K" }];
    },
  });
  const answers = [
    resolver(new Press({ key: "a", code: "KeyA" })),
    resolver(new Press({ key: "é", code: "Digit2" })),
    resolver(new Press({ key: "A", code: "KeyA", shiftKey: true })),
    resolver(
      new Press({ key: "k", code: "KeyK", ctrlKey: true, isComposing: true }),
    ),
  ];
  expect([answers, reads]).toEqual([[null, null, null, null], 0]);
  expect([
    resolver(new Press({ key: "k", code: "KeyK", ctrlKey: true })),
    reads,
  ]).toEqual(["app.palette", 1]);
});

test("labels follow the platform", () => {
  expect([
    keyLabel("Mod+K", "mac"),
    keyLabel("Mod+K", "windows"),
    keyLabel("Shift+F6", "mac"),
  ]).toEqual(["⌘K", "Ctrl+K", "⇧F6"]);
  expect([
    keyLabel("Alt+Enter", "mac"),
    keyLabel("Mod+Alt+1", "mac"),
    keyLabel("Control+Shift+Z", "linux"),
    keyLabel("Mod+,", "windows"),
  ]).toEqual(["⌥↵", "⌘⌥1", "Ctrl+Shift+Z", "Ctrl+,"]);
});
