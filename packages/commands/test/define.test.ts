import { expect, test } from "bun:test";
import { CommandsError, defineCommands } from "../src/index.ts";
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

const refusal = (definitions: readonly CommandDefinition[]) => {
  try {
    defineCommands(definitions);
    return null;
  } catch (e) {
    return e instanceof CommandsError ? [e.code, e.id] : "other";
  }
};

test("defineCommands refuses a duplicate id, a bad chord, and a when without a whyNot", () => {
  expect([
    refusal([command("test.go"), command("test.go")]),
    refusal([
      command("test.go", {
        keys: { mac: ["Mod+K"], windows: ["Ctrl+K"], linux: [] },
      }),
    ]),
    refusal([command("test.go", { when: (ctx) => ctx.docOpen })]),
    refusal([command("Test.go")]),
  ]).toEqual([
    ["duplicate_id", "test.go"],
    ["bad_chord", "test.go"],
    ["missing_why_not", "test.go"],
    ["bad_id", "Test.go"],
  ]);
});

test("a command id is an area and a name, each in its own segment", () => {
  expect(
    [
      "app.palette",
      "setting.writing.typewriterScrolling",
      "setting.writing.announce.elements_pages",
      "setting.device.interfaceSize.125",
    ].map((id) => refusal([command(id)])),
  ).toEqual([null, null, null, null]);
  expect(
    [
      "palette",
      "app.",
      ".palette",
      "app..palette",
      "app.pal ette",
      "1app.palette",
    ].map((id) => refusal([command(id)])),
  ).toEqual(
    [
      "palette",
      "app.",
      ".palette",
      "app..palette",
      "app.pal ette",
      "1app.palette",
    ].map((id) => ["bad_id", id]),
  );
});

test("a well-formed list is given back as it was given", () => {
  const list = [
    command("test.go", {
      when: (ctx) => ctx.docOpen,
      whyNot: () => "needs a document open",
      keys: { mac: ["Mod+K"], windows: ["Control+K"], linux: ["Control+K"] },
    }),
  ];
  expect(defineCommands(list)).toBe(list);
});
