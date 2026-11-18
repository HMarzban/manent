import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

interface Manifest {
  workspaces?: { catalog: Record<string, string> };
  exports?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const manifestAt = (dir: string) =>
  JSON.parse(
    readFileSync(join(repoRoot, dir, "package.json"), "utf8"),
  ) as Manifest;
const rootManifest = manifestAt(".");
const entryPath = (name: string) =>
  join(repoRoot, "packages", name, "src", "index.ts");
const declared = (dir: string) =>
  Object.keys({
    ...manifestAt(dir).dependencies,
    ...manifestAt(dir).devDependencies,
  });
const exportLines = async (file: string) =>
  (await Bun.file(join(repoRoot, file)).text())
    .split("\n")
    .filter((l) => l.startsWith("export"));

// nothing here is fixed by the skeleton: a failure means an earlier commit is missing
test("what typesetting assumes is declared", async () => {
  expect(rootManifest.workspaces!.catalog).toMatchObject({
    fontkit: "2.0.4",
    "pdfjs-dist": "6.5.438",
    "@types/pdfkit": "0.17.7",
    "@types/fontkit": "2.0.9",
  });
  expect(manifestAt("packages/pagination").exports).toEqual({
    ".": "./src/index.ts",
    "./testing": "./src/testing/index.ts",
  });
  expect(declared("packages/editor")).toEqual(
    expect.arrayContaining([
      "prosemirror-model",
      "prosemirror-state",
      "prosemirror-view",
      "prosemirror-transform",
      "prosemirror-keymap",
      "@fontsource/courier-prime",
      "fast-check",
      "@manent/pagination",
      "@manent/schema",
    ]),
  );
  expect(declared("packages/editor")).not.toContain("@manent/crdt");
  expect(declared("packages/formats")).toEqual(
    expect.arrayContaining([
      "pdfkit",
      "@types/pdfkit",
      "pdfjs-dist",
      "@fontsource/courier-prime",
    ]),
  );
  expect(declared("tools")).toEqual(
    expect.arrayContaining([
      "fontkit",
      "@types/fontkit",
      "@fontsource/courier-prime",
    ]),
  );
  expect(declared("e2e")).toEqual(
    expect.arrayContaining([
      "prosemirror-view",
      "pdfjs-dist",
      "@fontsource/courier-prime",
    ]),
  );
  const schema = await import(entryPath("schema"));
  expect([typeof schema.blockView, typeof schema.blocksOf]).toEqual([
    "function",
    "function",
  ]);
});

test("the engine's constants are the page's arithmetic", async () => {
  const p = await import(entryPath("pagination"));
  expect([p.ENGINE_VERSION, p.TABLE_VERSION, p.UNICODE_VERSION]).toEqual([
    1,
    1,
    "15.0.0",
  ]);
  expect([p.CELL_PT * 10, p.LINE_PT * 6, p.UNIT_PT * p.UNITS_PER_LINE]).toEqual(
    [72, 72, 12],
  );
  expect([
    p.CELL_PX,
    p.LINE_PX,
    p.UNIT_PX,
    p.WRAP_MODE,
    p.BLOCK_SLACK_CELLS,
  ]).toEqual([9.6, 16, 8, "pre-wrap", 0.5]);
  expect(p.STYLE).toEqual({
    BOLD: 1,
    ITALIC: 2,
    UNDERLINE: 4,
    STRIKE: 8,
    CAPS: 16,
  });
  expect(p.FONT_FACE_KEYS).toEqual([
    "latin-400-normal",
    "latin-400-italic",
    "latin-700-normal",
    "latin-700-italic",
    "latin-ext-400-normal",
    "latin-ext-400-italic",
    "latin-ext-700-normal",
    "latin-ext-700-italic",
  ]);
});

test("each feature folder is registered in one line and imports cleanly", async () => {
  expect(await exportLines("packages/editor/src/index.ts")).toEqual(
    expect.arrayContaining([
      'export * from "./page/index.ts";',
      'export * from "./pagination/index.ts";',
      'export * from "./sections/index.ts";',
    ]),
  );
  // later work adds its own lines
  expect(await exportLines("packages/formats/src/index.ts")).toEqual(
    expect.arrayContaining(['export * from "./pdf/index.ts";']),
  );
  for (const name of ["pagination", "editor", "formats"])
    await import(entryPath(name));
});

test("generated tables and golden pages are left alone by the formatter", async () => {
  const ignored = (
    await Bun.file(join(repoRoot, ".prettierignore")).text()
  ).split("\n");
  expect(ignored).toEqual(
    expect.arrayContaining([
      "packages/pagination/src/engines/*/tables/*.generated.ts",
      "packages/pagination/test/golden/",
    ]),
  );
});
