import { expect, test } from "bun:test";
import { SETTINGS } from "@manent/settings";
import { PRODUCT_SETTING_RULES, settingRulesFrom } from "../src/index.ts";

const rules = settingRulesFrom(SETTINGS.all);

test("a script setting is checked by its definition, and nothing else is a script setting", () => {
  expect([
    rules.check("script.paper", "a4"),
    rules.check("script.paper", "b5"),
    rules.check("writing.checkSpelling", true),
    rules.check("script.nope", 1),
  ]).toEqual([
    { ok: true },
    { ok: false, code: "bad_value" },
    { ok: false, code: "unknown_key" },
    { ok: false, code: "unknown_key" },
  ]);
  expect(
    SETTINGS.byScope("script").map((d) => [d.key, rules.isGuarded(d.key)]),
  ).toEqual(SETTINGS.byScope("script").map((d) => [d.key, d.guard !== null]));
});

test("the product's rules are the settings' own", () => {
  expect(PRODUCT_SETTING_RULES.check("script.paper", "b5")).toEqual({
    ok: false,
    code: "bad_value",
  });
});

test("a key is guarded only when it is a script setting with a guard", () => {
  const paper = SETTINGS.byScope("script").find(
    (d) => d.key === "script.paper",
  );
  if (paper === undefined) throw new Error("no script.paper definition");
  const unguarded = settingRulesFrom([{ ...paper, guard: null }]);
  expect([
    rules.isGuarded("script.paper"),
    rules.isGuarded("writing.checkSpelling"),
    rules.isGuarded("script.nope"),
    unguarded.isGuarded("script.paper"),
  ]).toEqual([true, false, false, false]);
});
