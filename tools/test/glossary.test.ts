import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import {
  checkReverse,
  checkStrings,
  interfaceStrings,
} from "../check-glossary.ts";
import type { StringSource } from "../check-glossary.ts";
import {
  ENGINEERING_WORDS,
  FEATURES,
  NOT_SENT_EXCEPTION,
  TERMS,
} from "../glossary.ts";

const repoRoot = join(import.meta.dir, "..", "..");

const trees = createTempTrees("manent glossary ");
afterAll(trees.removeAll);

const SCOPED_DOCUMENT = [
  "export const D = {",
  "  scriptScopeLine: (t: string) => `Shared. Everyone on ${t} sees these.`,",
  '  ownPreferences: "Your own preferences",',
  "  setBy: (name: string) => `Set by ${name}`,",
  '  readOnlySettings: "Read only",',
  '  back: "‹ Library",',
  "};",
].join("\n");
/** The word files that carry a scope, each holding every key its scope names. */
const SCOPED_FILES = {
  "packages/ui/src/words/preferences.ts":
    'export const P = { a: "Reset all preferences" };',
  "packages/ui/src/words/sync-centre.ts":
    'export const S = { title: "Sync centre" };',
  "packages/ui/src/words/document.ts": SCOPED_DOCUMENT,
};

const s = (text: string): StringSource => ({ file: "x", text, scope: "any" });
const rules = (texts: readonly string[]) =>
  checkStrings(texts.map(s)).map((v) => [v.rule, v.word]);

test("a banned word fails, and a word that is also a term is allowed", () => {
  expect(checkStrings([s("Open the dashboard")]).map((v) => v.rule)).toEqual([
    "banned-word",
  ]);
  expect(checkStrings([s("Send draft…"), s("Open beside")])).toEqual([]); // "send" and "open" are terms
  expect(
    checkStrings([s("Couldn't name this draft."), s("Try again")]),
  ).toEqual([]);
});

test("a banned phrase fails whatever its case or the words around it", () => {
  expect(
    rules([
      "Running order",
      "A block type here",
      "Open the Sidebar",
      "an item",
    ]),
  ).toEqual([
    ["banned-word", "running order"],
    ["banned-word", "block type"],
    ["banned-word", "sidebar"],
    ["banned-word", "item"],
  ]);
});

test("a word the palette accepts is never banned", () => {
  expect(rules(["Line type", "Night mode", "Version history"])).toEqual([]);
});

test("a noun that is neither a term, a name nor a plain word fails", () => {
  expect(
    checkStrings([s("Open the gizmo")]).map((v) => [v.rule, v.word]),
  ).toEqual([["unlisted-word", "gizmo"]]);
});

test("names, numbers, key labels and parameters are words of the interface", () => {
  expect(
    rules([
      "Dana Reyes and Sam's Blue pages",
      "Page 12A of 1,212",
      "Press ⌘K or Ctrl+Shift+F6",
      "{name} changed {noun}",
      "Manent's Scene Heading",
    ]),
  ).toEqual([]);
});

test("engineering words never reach the interface, except the fixed not-sent sentences", () => {
  expect(checkStrings([s("The sync failed")]).map((v) => v.rule)).toEqual([
    "engineering-word",
  ]);
  expect(
    checkStrings([s("Access removed, 5 not sent"), s("Deleted, 5 not sent")]),
  ).toEqual([]);
});

test("not sent outside its fixed sentences reads as engineering", () => {
  expect(
    rules([
      "Your 5 changes were not sent",
      "Access removed, {} not sent",
      "You no longer have access to '{}'. Your {} changes that were not sent are kept on this device.",
      "Some errors and a conflict",
    ]),
  ).toEqual([
    ["engineering-word", "not sent"],
    ["engineering-word", "errors"],
    ["engineering-word", "conflict"],
  ]);
});

test("terms are matched longest first", () => {
  expect(
    checkStrings([s("Play from here"), s("Start a stage play from this…")]),
  ).toEqual([]);
});

test("a term covers a banned word it holds, and the next word is checked on its own", () => {
  expect(
    rules(["Room log", "Room log log", "Choose who you are gizmo"]),
  ).toEqual([["unlisted-word", "gizmo"]]);
  expect(rules(["Synced backed up", "Synced, backed up"])).toEqual([
    ["banned-word", "backed up"],
    ["banned-word", "backed up"],
  ]);
});

test("setting is never personal and preference never shared", () => {
  expect(
    checkStrings([{ file: "x", text: "Theme setting", scope: "personal" }]).map(
      (v) => v.rule,
    ),
  ).toEqual(["scope-word"]);
  expect(
    checkStrings([
      { file: "x", text: "Your own preferences", scope: "shared" },
      { file: "x", text: "Script settings", scope: "shared" },
      { file: "x", text: "Your own preferences", scope: "personal" },
      { file: "x", text: "Script settings", scope: "any" },
    ]).map((v) => [v.rule, v.word]),
  ).toEqual([["scope-word", "preferences"]]);
});

test("a built feature uses every one of its terms", () => {
  expect(
    checkReverse([s("Sync centre"), s("Saved")], ["saving"]).map(
      (v) => v.message,
    ),
  ).toContain('"Receipt" (saving) is used by no interface string');
});

test("a feature not yet built is not held to its terms", () => {
  expect(checkReverse([s("Saved")], [])).toEqual([]);
  const terms = TERMS.filter((term) => term.feature === "games").map(
    (t) => t.term,
  );
  expect(
    checkReverse(
      terms.map((term) => s(`Try ${term} now`)),
      ["games"],
    ),
  ).toEqual([]);
});

test("every feature has its terms, and the engineering words and fixed sentences are the agreed ones", () => {
  expect(FEATURES.filter((f) => !TERMS.some((t) => t.feature === f))).toEqual(
    [],
  );
  expect(ENGINEERING_WORDS).toEqual([
    "generation",
    "rebuild",
    "conflict",
    "error",
    "failed",
  ]);
  expect(NOT_SENT_EXCEPTION).toEqual([
    "Access removed, {n} not sent",
    "Deleted, {n} not sent",
    "You no longer have access to '{title}'. Your {n} changes that were not sent are kept on this device.",
    "'{title}' was deleted by {name} on {date}. Your {n} changes that were not sent are kept on this device.",
  ]);
});

test("the strings of a source are its literals' words, with imports, code values and parameters left out", async () => {
  const root = await trees.tree({
    "packages/ui/src/words/a.ts": [
      'import { x } from "./b.ts";',
      'export const A = { title: "Library", kind: "stage_play", id: "history.review",',
      '  line: (n: number) => `${n} of ${count({ n })} waiting`, sep: " · ",',
      "  pair: (a: string, b: string) => `${a}${b} left` };",
    ].join("\n"),
    ...SCOPED_FILES,
    "apps/web/src/text.ts": 'export const TEXT = { a: "Choose who you are" };',
  });
  expect(await interfaceStrings(root)).toEqual([
    { file: "packages/ui/src/words/a.ts", text: "Library", scope: "any" },
    {
      file: "packages/ui/src/words/a.ts",
      text: "{} of {} waiting",
      scope: "any",
    },
    { file: "packages/ui/src/words/a.ts", text: " · ", scope: "any" },
    { file: "packages/ui/src/words/a.ts", text: "{}{} left", scope: "any" },
    {
      file: "packages/ui/src/words/document.ts",
      text: "Shared. Everyone on {} sees these.",
      scope: "shared",
    },
    {
      file: "packages/ui/src/words/document.ts",
      text: "Your own preferences",
      scope: "personal",
    },
    {
      file: "packages/ui/src/words/document.ts",
      text: "Set by {}",
      scope: "shared",
    },
    {
      file: "packages/ui/src/words/document.ts",
      text: "Read only",
      scope: "shared",
    },
    {
      file: "packages/ui/src/words/document.ts",
      text: "‹ Library",
      scope: "any",
    },
    {
      file: "packages/ui/src/words/preferences.ts",
      text: "Reset all preferences",
      scope: "personal",
    },
    {
      file: "packages/ui/src/words/sync-centre.ts",
      text: "Sync centre",
      scope: "personal",
    },
    { file: "apps/web/src/text.ts", text: "Choose who you are", scope: "any" },
  ]);
});

test("a scope that names a key no table holds stops the check", async () => {
  const root = await trees.tree({
    ...SCOPED_FILES,
    "packages/ui/src/words/document.ts": SCOPED_DOCUMENT.replace(
      "  setBy:",
      "  setsBy:",
    ),
  });
  await expect(interfaceStrings(root)).rejects.toThrow(
    "packages/ui/src/words/document.ts: the scope key setBy matches no table key",
  );
});

test("a scoped file that is missing stops the check", async () => {
  const { "packages/ui/src/words/sync-centre.ts": _, ...rest } = SCOPED_FILES;
  const root = await trees.tree(rest);
  await expect(interfaceStrings(root)).rejects.toThrow(
    "packages/ui/src/words/sync-centre.ts has a scope but was not read",
  );
});

test("the vocabulary file holds words only", async () => {
  const text = await Bun.file(join(repoRoot, "tools/glossary.ts")).text();
  expect(text).not.toMatch(/\b\d+\.\d+\b|design|glossary\.md|superpowers/); // no section number, no citation of a private document
});

test("every interface string of this repository passes", async () => {
  expect(checkStrings(await interfaceStrings(repoRoot))).toEqual([]);
});
