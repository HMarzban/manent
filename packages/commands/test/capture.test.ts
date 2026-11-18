import { expect, test } from "bun:test";
import type { Platform } from "@manent/settings";
import { RESERVED_KEYS, checkCapture, resolveBindings } from "../src/index.ts";
import type { CommandDefinition } from "../src/index.ts";

const command = (
  id: string,
  over: Partial<CommandDefinition> = {},
): CommandDefinition => ({
  id,
  label: "Go",
  group: "view",
  home: null,
  scope: "global",
  keys: { mac: [], windows: [], linux: [] },
  keysFixed: false,
  when: null,
  whyNot: null,
  visible: null,
  checked: null,
  passThrough: null,
  menus: [],
  palette: { keywords: [] },
  opens: null,
  reach: "self",
  setting: null,
  ...over,
});

const everywhere = (...keys: string[]) => ({
  mac: keys,
  windows: keys,
  linux: keys,
});

const FIXTURE: readonly CommandDefinition[] = [
  command("test.a", { keys: everywhere("Mod+Alt+1") }),
  command("test.dual", { keys: everywhere("Mod+D") }),
  command("test.undo", {
    keysFixed: true,
    keys: { mac: ["Mod+Z"], windows: ["Control+Z"], linux: ["Control+Z"] },
  }),
  command("test.find", { scope: "editor", keys: everywhere("Mod+E") }),
  command("test.pick", { scope: "surface:palette", keys: everywhere("Mod+P") }),
];

const verdict = (press: {
  chord: string;
  typedCharacter?: string;
  commandId?: string;
  platform?: Platform;
  shell?: "web" | "desktop";
}) => {
  const platform = press.platform ?? "mac";
  const shell = press.shell ?? "web";
  return checkCapture({
    chord: press.chord,
    typedCharacter: press.typedCharacter ?? null,
    commandId: press.commandId ?? "test.a",
    commands: FIXTURE,
    resolved: resolveBindings({
      commands: FIXTURE,
      custom: [],
      platform,
      shell,
      findings: { failsHere: new Set() },
    }),
    platform,
    shell,
  });
};

test("capture refuses what is fixed, what types, and what would leave the script on the web", () => {
  expect(verdict({ chord: "Enter" })).toEqual({ ok: false, reason: "fixed" });
  expect(verdict({ chord: "Alt+N", typedCharacter: "˜" })).toEqual({
    ok: false,
    reason: "types_character",
  });
  expect(verdict({ chord: "Mod+W", shell: "web" })).toEqual({
    ok: false,
    reason: "leaves_script",
  });
  expect(verdict({ chord: "Mod+W", shell: "desktop" })).toEqual({ ok: true });
  expect(verdict({ chord: "Mod+D" })).toEqual({
    ok: "ask",
    holderId: "test.dual",
  });
  expect(verdict({ chord: "Mod+T" })).toEqual({
    ok: "warn",
    effect: "usually opens a new tab",
  });
});

test("every structural key, every editing key and a fixed holder's key is fixed", () => {
  const fixed = [
    "Enter",
    "Tab",
    "Shift+Tab",
    "Backspace",
    "Delete",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Mod+Z",
    "Mod+Shift+Z",
    "Control+Y",
    "Mod+X",
    "Mod+C",
    "Mod+V",
    "Mod+A",
  ];
  expect(fixed.map((chord) => verdict({ chord, platform: "linux" }))).toEqual(
    fixed.map(() => ({ ok: false, reason: "fixed" })),
  );
  expect([
    verdict({ chord: "Control+Z", platform: "windows" }),
    verdict({ chord: "Control+Z", platform: "mac" }),
  ]).toEqual([{ ok: false, reason: "fixed" }, { ok: true }]);
});

test("a press that types a character, or may on another layout, is refused", () => {
  expect([
    verdict({ chord: "Shift+A", typedCharacter: "A" }),
    verdict({ chord: "Alt+N", platform: "windows" }),
    verdict({ chord: "Mod+Alt+M", platform: "windows" }),
    verdict({ chord: "Mod+Shift+S", typedCharacter: "S" }),
    verdict({ chord: "Control+Alt+M", typedCharacter: "µ", platform: "mac" }),
    verdict({ chord: "Mod+Alt+M", platform: "mac" }),
  ]).toEqual([
    { ok: false, reason: "types_character" },
    { ok: false, reason: "types_character" },
    { ok: false, reason: "types_character" },
    { ok: true },
    { ok: true },
    { ok: true },
  ]);
});

test("a chord held only in a scope that never meets this one is free", () => {
  expect([
    verdict({ chord: "Mod+E", commandId: "test.pick" }),
    verdict({ chord: "Mod+P", commandId: "test.find" }),
    verdict({ chord: "Mod+E", commandId: "test.a" }),
    verdict({ chord: "Mod+P", commandId: "test.a" }),
    verdict({ chord: "Mod+D", commandId: "test.dual" }),
  ]).toEqual([
    { ok: true },
    { ok: true },
    { ok: "ask", holderId: "test.find" },
    { ok: "ask", holderId: "test.pick" },
    { ok: true },
  ]);
});

test("off macOS a Control chord is checked as its Mod spelling, and on macOS it is not", () => {
  expect([
    verdict({ chord: "Mod+Y", platform: "windows" }),
    verdict({ chord: "Control+X", platform: "linux" }),
    verdict({ chord: "Control+D", platform: "windows" }),
    verdict({ chord: "Control+T", platform: "linux" }),
    verdict({ chord: "Control+W", platform: "windows" }),
    verdict({ chord: "Control+X", platform: "mac" }),
    verdict({ chord: "Control+D", platform: "mac" }),
  ]).toEqual([
    { ok: false, reason: "fixed" },
    { ok: false, reason: "fixed" },
    { ok: "ask", holderId: "test.dual" },
    { ok: "warn", effect: "usually opens a new tab" },
    { ok: false, reason: "leaves_script" },
    { ok: true },
    { ok: true },
  ]);
});

test("a key the system keeps warns on every shell, and a browser's key only on the web", () => {
  expect([
    verdict({ chord: "Alt+Tab", platform: "windows" }),
    verdict({ chord: "Alt+Tab", platform: "linux", shell: "desktop" }),
    verdict({ chord: "Mod+Tab", platform: "mac", shell: "desktop" }),
    verdict({ chord: "Mod+N", platform: "linux" }),
    verdict({ chord: "Mod+N", platform: "linux", shell: "desktop" }),
    verdict({ chord: "Alt+Tab", platform: "mac" }),
  ]).toEqual([
    { ok: "warn", effect: "switches windows" },
    { ok: "warn", effect: "switches windows" },
    { ok: "warn", effect: "switches windows" },
    { ok: "warn", effect: "usually opens a new window" },
    { ok: true },
    { ok: true },
  ]);
});

test("the reserved keys hold only what is documented", () => {
  expect(RESERVED_KEYS.every((k) => k.evidence === "documented")).toBe(true);
  expect(new Set(RESERVED_KEYS.map((k) => k.chord))).toEqual(
    new Set(["Mod+T", "Mod+N", "Mod+W", "Alt+Tab", "Mod+Tab"]),
  );
});

test("each reserved key says what it usually does, and where", () => {
  expect(
    RESERVED_KEYS.map((k) => [
      k.chord,
      k.platform,
      k.host,
      k.effect,
      k.leavesScript,
    ]),
  ).toEqual([
    ["Mod+T", "mac", "chromium", "usually opens a new tab", false],
    ["Mod+T", "mac", "firefox", "usually opens a new tab", false],
    ["Mod+T", "mac", "safari", "usually opens a new tab", false],
    ["Mod+T", "windows", "chromium", "usually opens a new tab", false],
    ["Mod+T", "windows", "firefox", "usually opens a new tab", false],
    ["Mod+T", "windows", "safari", "usually opens a new tab", false],
    ["Mod+T", "linux", "chromium", "usually opens a new tab", false],
    ["Mod+T", "linux", "firefox", "usually opens a new tab", false],
    ["Mod+T", "linux", "safari", "usually opens a new tab", false],
    ["Mod+N", "mac", "chromium", "usually opens a new window", false],
    ["Mod+N", "mac", "firefox", "usually opens a new window", false],
    ["Mod+N", "mac", "safari", "usually opens a new window", false],
    ["Mod+N", "windows", "chromium", "usually opens a new window", false],
    ["Mod+N", "windows", "firefox", "usually opens a new window", false],
    ["Mod+N", "windows", "safari", "usually opens a new window", false],
    ["Mod+N", "linux", "chromium", "usually opens a new window", false],
    ["Mod+N", "linux", "firefox", "usually opens a new window", false],
    ["Mod+N", "linux", "safari", "usually opens a new window", false],
    ["Mod+W", "mac", "chromium", "usually closes this tab", true],
    ["Mod+W", "mac", "firefox", "usually closes this tab", true],
    ["Mod+W", "mac", "safari", "usually closes this tab", true],
    ["Mod+W", "windows", "chromium", "usually closes this tab", true],
    ["Mod+W", "windows", "firefox", "usually closes this tab", true],
    ["Mod+W", "windows", "safari", "usually closes this tab", true],
    ["Mod+W", "linux", "chromium", "usually closes this tab", true],
    ["Mod+W", "linux", "firefox", "usually closes this tab", true],
    ["Mod+W", "linux", "safari", "usually closes this tab", true],
    ["Alt+Tab", "windows", "os", "switches windows", false],
    ["Alt+Tab", "linux", "os", "switches windows", false],
    ["Mod+Tab", "mac", "os", "switches windows", false],
  ]);
});
