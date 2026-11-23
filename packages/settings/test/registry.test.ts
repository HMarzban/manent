import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  MENU_IDS,
  REGISTRY_ERROR_CODES,
  RegistryError,
  SCRIPT_GROUPS,
  SECTION_IDS,
  createRegistry,
  setting,
  t,
} from "../src/index.ts";
import type { SettingDefinition } from "../src/index.ts";

const ok = setting({
  key: "writing.sample",
  scope: "personal",
  type: t.boolean(),
  default: false,
  label: "Sample",
  description: null,
  noun: null,
  surfaces: [{ in: "preferences", section: "writing", order: 1 }],
  apply: { how: "read" },
  boot: false,
  guard: null,
  keywords: [],
});
const refusal = (
  defs: readonly SettingDefinition[],
  retired: string[] = [],
) => {
  try {
    createRegistry(defs, retired, []);
    return null;
  } catch (e) {
    return e instanceof RegistryError ? [e.code, e.key] : "other";
  }
};

test("a well-formed registry answers by key, scope and surface", () => {
  const r = createRegistry([ok], [], []);
  expect([
    r.get("writing.sample").label,
    r.byScope("personal").length,
    r.bySurface("preferences").length,
    r.bySurface("palette").length,
  ]).toEqual(["Sample", 1, 1, 0]);
});

test("each malformed definition is refused with its code and key", () => {
  expect(refusal([{ ...ok, key: "Writing.Sample" }])).toEqual([
    "bad_key",
    "Writing.Sample",
  ]);
  expect(refusal([ok, ok])).toEqual(["duplicate_key", "writing.sample"]);
  expect(refusal([ok], ["writing.sample"])).toEqual([
    "retired_key",
    "writing.sample",
  ]);
  expect(refusal([{ ...ok, default: "yes" as never }])).toEqual([
    "bad_default",
    "writing.sample",
  ]);
  expect(refusal([{ ...ok, surfaces: [] }])).toEqual([
    "no_surface",
    "writing.sample",
  ]);
  expect(refusal([{ ...ok, boot: true }])).toEqual([
    "boot_not_attribute",
    "writing.sample",
  ]);
  expect(
    refusal([{ ...ok, apply: { how: "editor", effect: "layout" } }]),
  ).toEqual(["preference_on_layout", "writing.sample"]);
  expect(
    refusal([
      { ...ok, surfaces: [{ in: "scriptSettings", group: "mores", order: 1 }] },
    ]),
  ).toEqual(["preference_off_preferences", "writing.sample"]);
  expect(refusal([{ ...ok, key: "script.sample", scope: "script" }])).toEqual([
    "shared_on_preferences",
    "script.sample",
  ]);
});

test("types parse without coercing", () => {
  const c = t.choice([
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ]);
  expect([
    c.parse("a"),
    c.parse("c").ok,
    t.boolean().parse(1).ok,
    t.boolean().parse(false),
  ]).toEqual([
    { ok: true, value: "a" },
    false,
    false,
    { ok: true, value: false },
  ]);
});

test("the closed lists are fixed", () => {
  expect(SECTION_IDS).toEqual([
    "writing",
    "appearance",
    "keyboard",
    "account",
    "device",
  ]);
  expect(MENU_IDS).toEqual([
    "app",
    "file",
    "edit",
    "view",
    "format",
    "script",
    "production",
    "window",
    "help",
    "title",
    "person",
  ]);
  expect(SCRIPT_GROUPS).toEqual([
    "page_setup",
    "mores",
    "scene_numbers",
    "revisions",
    "header_footer",
    "layout_engine",
  ]);
  expect(REGISTRY_ERROR_CODES).toEqual([
    "duplicate_key",
    "retired_key",
    "bad_default",
    "no_surface",
    "boot_not_attribute",
    "preference_on_layout",
    "preference_off_preferences",
    "shared_on_preferences",
    "bad_key",
  ]);
});

test("a value type accepts exactly its values and gives them back as they came", () => {
  const c = t.choice([
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ]);
  const input = fc.oneof(
    fc.constantFrom("a", "b", "A", "true", true, false, 0, 1, null),
    fc.anything(),
  );
  fc.assert(
    fc.property(input, (value) => {
      expect(t.boolean().parse(value)).toEqual(
        typeof value === "boolean"
          ? { ok: true, value }
          : { ok: false, reason: "not_boolean" },
      );
      expect(c.parse(value)).toEqual(
        value === "a" || value === "b"
          ? { ok: true, value }
          : { ok: false, reason: "not_choice" },
      );
    }),
    { numRuns: 500 },
  );
});

test("asking for a key the registry does not hold is a caller's mistake", () => {
  const r = createRegistry<readonly SettingDefinition[]>([ok], [], []);
  expect(() => r.get("writing.other")).toThrow(RangeError);
});
