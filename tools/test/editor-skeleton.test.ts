import { expect, test } from "bun:test";
import * as crdt from "@manent/crdt";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

/** The folders a registration list names, in its order. */
const exportLines = async (file: string): Promise<string[]> =>
  (await Bun.file(join(repoRoot, file)).text()).split("\n").flatMap((line) => {
    const folder = new RegExp(
      '^export \\* from "\\./([a-z][a-z0-9-]*)/index\\.ts";$',
    ).exec(line)?.[1];
    return folder === undefined ? [] : [folder];
  });

test("the editor and the binding are lists of feature folders", async () => {
  expect(await exportLines("packages/editor/src/index.ts")).toEqual(
    expect.arrayContaining([
      "actions",
      "bridge",
      "complete",
      "cursors",
      "elements",
      "identity",
      "keys",
      "page",
      "pagination",
      "picker",
      "script-editor",
      "scroll",
      "sections",
    ]),
  );
  expect(await exportLines("packages/crdt-binding/src/index.ts")).toEqual([
    "binding",
    "history",
    "presence",
  ]);
});

test("the editor's ports name no CRDT, React or registry module", async () => {
  const text = await Bun.file(
    join(repoRoot, "packages/editor/src/script-editor/ports.ts"),
  ).text();
  for (const banned of [
    "yjs",
    "y-prosemirror",
    "@manent/crdt",
    "react",
    "@manent/commands",
    "@manent/settings",
  ])
    expect([banned, text.includes(`"${banned}`)]).toEqual([banned, false]);
});

test("the web app declares the font files the PDF embeds", async () => {
  expect(
    (await Bun.file(join(repoRoot, "apps/web/package.json")).json())
      .dependencies["@fontsource/courier-prime"],
  ).toBe("catalog:");
});

test("crdt names the review origin and the undo scope", () => {
  expect([
    crdt.ORIGIN_REVIEW,
    typeof crdt.createUndoScope,
    typeof crdt.undoManagerForBinding,
  ]).toEqual(["review", "function", "function"]);
});
