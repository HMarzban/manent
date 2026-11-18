import { expect, test } from "bun:test";
import fc from "fast-check";
import { BROWSER_ZOOM_KEYS, resolveBindings } from "../src/index.ts";
import type { Platform } from "@manent/settings";
import type {
  CommandDefinition,
  CommandScope,
  CustomBinding,
  Findings,
} from "../src/index.ts";

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
  command("test.b"),
  command("test.e", { scope: "editor", keys: everywhere("Mod+E") }),
  command("test.pageBreak", { scope: "editor", keys: everywhere("Mod+Enter") }),
  command("test.s1", { scope: "surface:palette", keys: everywhere("Mod+J") }),
  command("test.s2", {
    scope: "surface:send",
    keys: everywhere("Mod+J", "Mod+E"),
  }),
  command("test.zoomIn", { keys: everywhere("Mod+=") }),
  command("test.fit"),
];

const NONE: Findings = { failsHere: new Set() };

const CHORDS = [
  "Mod+Alt+1",
  "Mod+D",
  "Mod+E",
  "Mod+J",
  "Mod+=",
  "Mod+0",
  "Mod+Y",
  "Mod+Enter",
];
const arbCustom: fc.Arbitrary<CustomBinding[]> = fc.array(
  fc.record({
    commandId: fc.constantFrom(...FIXTURE.map((c) => c.id), "test.gone"),
    keys: fc.subarray(CHORDS, { minLength: 0, maxLength: 3 }),
    at: fc.integer({ min: 0, max: 3 }),
  }),
  { maxLength: 8 },
);

const overlap = (a: CommandScope, b: CommandScope): boolean =>
  a === "global" || b === "global" || a === b;

test("resolveBindings is the same whatever order the custom entries arrive in", () => {
  fc.assert(
    fc.property(arbCustom, (custom) => {
      const a = resolveBindings({
        commands: FIXTURE,
        custom,
        platform: "mac",
        shell: "web",
        findings: NONE,
      });
      const b = resolveBindings({
        commands: FIXTURE,
        custom: [...custom].toReversed(),
        platform: "mac",
        shell: "web",
        findings: NONE,
      });
      expect([...a.effective]).toEqual([...b.effective]);
      expect([a.lostChord, a.editorTable]).toEqual([
        b.lostChord,
        b.editorTable,
      ]);
    }),
    { numRuns: 500 },
  );
});

test("no chord is held by two commands in overlapping scopes", () => {
  fc.assert(
    fc.property(
      arbCustom,
      fc.constantFrom<Platform>("mac", "windows", "linux"),
      fc.constantFrom<"web" | "desktop">("web", "desktop"),
      fc.subarray(CHORDS),
      (custom, platform, shell, refused) => {
        const { effective } = resolveBindings({
          commands: FIXTURE,
          custom,
          platform,
          shell,
          findings: { failsHere: new Set(refused) },
        });
        const holders = FIXTURE.flatMap((c) =>
          (effective.get(c.id) ?? []).map((chord) => ({ chord, c })),
        );
        for (const one of holders)
          for (const other of holders)
            if (one.c !== other.c && one.chord === other.chord)
              expect([
                one.c.id,
                other.c.id,
                overlap(one.c.scope, other.c.scope),
              ]).toEqual([one.c.id, other.c.id, false]);
      },
    ),
    { numRuns: 500 },
  );
});

test("the later of two clashing assignments keeps the chord, and the loser is listed", () => {
  const r = resolveBindings({
    commands: FIXTURE,
    platform: "mac",
    shell: "web",
    findings: NONE,
    custom: [
      { commandId: "test.a", keys: ["Mod+D"], at: 1 },
      { commandId: "test.b", keys: ["Mod+D"], at: 2 },
    ],
  });
  expect([
    r.effective.get("test.b"),
    r.effective.get("test.a"),
    r.lostChord,
  ]).toEqual([["Mod+D"], [], ["test.a"]]);
});

test("two assignments made at the same moment go to the larger command id", () => {
  const r = resolveBindings({
    commands: FIXTURE,
    platform: "mac",
    shell: "web",
    findings: NONE,
    custom: [
      { commandId: "test.a", keys: ["Mod+D"], at: 1 },
      { commandId: "test.b", keys: ["Mod+D"], at: 1 },
    ],
  });
  expect([
    r.effective.get("test.b"),
    r.effective.get("test.a"),
    r.lostChord,
  ]).toEqual([["Mod+D"], [], ["test.a"]]);
});

test("a shortcut this device refused falls back to the default, and nothing is written back", () => {
  const custom: readonly CustomBinding[] = Object.freeze([
    Object.freeze({
      commandId: "test.a",
      keys: Object.freeze(["Mod+Y"]),
      at: 1,
    }),
  ]);
  const findings: Findings = { failsHere: new Set(["Mod+Y"]) };
  const r = resolveBindings({
    commands: FIXTURE,
    custom,
    platform: "mac",
    shell: "web",
    findings,
  });
  expect([r.effective.get("test.a"), r.lostChord]).toEqual([["Mod+Alt+1"], []]);
  expect([custom, [...findings.failsHere]]).toEqual([
    [{ commandId: "test.a", keys: ["Mod+Y"], at: 1 }],
    ["Mod+Y"],
  ]);
});

test("of one command's entries from two devices, the later usable one counts", () => {
  const r = resolveBindings({
    commands: FIXTURE,
    platform: "mac",
    shell: "web",
    findings: { failsHere: new Set(["Mod+Y"]) },
    custom: [
      { commandId: "test.b", keys: ["Mod+D"], at: 1 },
      { commandId: "test.b", keys: ["Mod+Y"], at: 3 },
      { commandId: "test.b", keys: ["Mod+U"], at: 2 },
      { commandId: "test.a", keys: [], at: 1 },
      { commandId: "test.gone", keys: ["Mod+E"], at: 4 },
    ],
  });
  expect([
    r.effective.get("test.b"),
    r.effective.get("test.a"),
    r.effective.get("test.e"),
    r.lostChord,
  ]).toEqual([["Mod+U"], [], ["Mod+E"], []]);
});

test("a global chord and a surface chord never share a press; editor chords form the editor table", () => {
  const plain = resolveBindings({
    commands: FIXTURE,
    custom: [],
    platform: "mac",
    shell: "web",
    findings: NONE,
  });
  expect([
    plain.effective.get("test.s1"),
    plain.effective.get("test.s2"),
    plain.lostChord,
  ]).toEqual([["Mod+J"], ["Mod+J", "Mod+E"], []]);
  expect(plain.editorTable).toEqual([
    { id: "test.e", chord: "Mod+E" },
    { id: "test.pageBreak", chord: "Mod+Enter" },
  ]);
  const claimed = resolveBindings({
    commands: FIXTURE,
    custom: [{ commandId: "test.a", keys: ["Mod+J", "Mod+E"], at: 1 }],
    platform: "mac",
    shell: "web",
    findings: NONE,
  });
  expect([
    claimed.effective.get("test.a"),
    claimed.effective.get("test.s1"),
    claimed.effective.get("test.s2"),
    claimed.editorTable,
    claimed.lostChord,
  ]).toEqual([
    ["Mod+J", "Mod+E"],
    [],
    [],
    [{ id: "test.pageBreak", chord: "Mod+Enter" }],
    ["test.e", "test.s1", "test.s2"],
  ]);
});

test("the browser's zoom keys are bound on the desktop and never on the web", () => {
  const custom = [{ commandId: "test.fit", keys: ["Mod+0"], at: 1 }];
  const on = (shell: "web" | "desktop") => {
    const r = resolveBindings({
      commands: FIXTURE,
      custom,
      platform: "windows",
      shell,
      findings: NONE,
    });
    return [
      r.effective.get("test.zoomIn"),
      r.effective.get("test.fit"),
      r.lostChord,
    ];
  };
  expect([on("desktop"), on("web")]).toEqual([
    [["Mod+="], ["Mod+0"], []],
    [[], [], []],
  ]);
  expect(BROWSER_ZOOM_KEYS).toEqual(["Mod+=", "Mod+-", "Mod+0"]);
});
