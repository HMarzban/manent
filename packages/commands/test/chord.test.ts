import { expect, test } from "bun:test";
import fc from "fast-check";
import { breaksLayoutRules, isChord } from "../src/index.ts";

const MODIFIERS = ["Mod", "Control", "Alt", "Shift"] as const;
const KEYS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  "Enter",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  ...",/[]=-",
];

test("a chord is the hotkey string form, modifiers in order", () => {
  expect(
    [
      "Mod+K",
      "Mod+Shift+S",
      "Shift+F6",
      "Mod+,",
      "Mod+/",
      "Alt+ArrowUp",
      "Control+Y",
      "F6",
    ].map(isChord),
  ).toEqual(Array(8).fill(true));
  expect(
    ["Shift+Mod+K", "Mod+", "Ctrl+K", "Mod+KK", "mod+k"].map(isChord),
  ).toEqual(Array(5).fill(false));
});

test("a chord holds exactly one key, and two chords written together are not one", () => {
  expect(
    [
      "Mod+K+Mod+K",
      "Mod+KMod+K",
      "F6F6",
      "F13",
      "F0",
      "Mod+Mod+K",
      "Tab",
      " Mod+K",
      "Mod+K ",
    ].map(isChord),
  ).toEqual(Array(9).fill(false));
});

test("every chord built from the form is one, and its modifiers out of order make it none", () => {
  const arbModifiers = fc.subarray([...MODIFIERS], { minLength: 0 });
  const arbKey = fc.constantFrom(...KEYS);
  fc.assert(
    fc.property(arbModifiers, arbKey, (modifiers, key) =>
      isChord([...modifiers, key].join("+")),
    ),
    { numRuns: 500 },
  );
  fc.assert(
    fc.property(
      fc.subarray([...MODIFIERS], { minLength: 2 }),
      arbKey,
      (modifiers, key) => !isChord([...modifiers.toReversed(), key].join("+")),
    ),
    { numRuns: 500 },
  );
});

test("no default breaks the layout rules", () => {
  expect(breaksLayoutRules("Mod+Alt+M", "windows")).toBe("ctrl_alt_character");
  expect(breaksLayoutRules("Mod+Alt+M", "mac")).toBeNull();
  expect(breaksLayoutRules("Alt+N", "mac")).toBe("alt_character");
  expect(breaksLayoutRules("Alt+ArrowUp", "windows")).toBeNull();
});

test("a chord that may type a character is named by the rule it breaks", () => {
  expect(
    (
      [
        ["Control+Alt+1", "linux"],
        ["Mod+Alt+,", "linux"],
        ["Mod+Control+Alt+Shift+]", "windows"],
        ["Control+Alt+M", "mac"],
        ["Alt+Shift+2", "mac"],
        ["Alt+-", "windows"],
        ["Mod+Alt+F6", "windows"],
        ["Alt+Enter", "linux"],
        ["Mod+Shift+S", "windows"],
        ["Shift+A", "mac"],
      ] as const
    ).map(([chord, platform]) => breaksLayoutRules(chord, platform)),
  ).toEqual([
    "ctrl_alt_character",
    "ctrl_alt_character",
    "ctrl_alt_character",
    null,
    "alt_character",
    "alt_character",
    null,
    null,
    null,
    null,
  ]);
});
