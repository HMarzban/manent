import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkBoundaries, toRepoPath } from "../check-boundaries.ts";

const repoRoot = join(import.meta.dir, "..", "..");

const made: string[] = [];
afterAll(async () => {
  await Promise.all(
    made.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function tree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "manent-boundaries-"));
  made.push(root);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

const C = "catalog:";
const W = "workspace:*";

function manifest(
  dir: string,
  dependencies: Record<string, string> = {},
  devDependencies: Record<string, string> = {},
): Record<string, string> {
  const exports = dir.startsWith("packages/")
    ? { exports: { ".": "./src/index.ts" } }
    : {};
  const m = {
    name: `@manent/${dir.split("/").at(-1)}`,
    version: "0.0.0",
    private: true,
    type: "module",
    ...exports,
    dependencies,
    devDependencies,
  };
  return { [`${dir}/package.json`]: JSON.stringify(m, null, 2) + "\n" };
}

const BASE: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "fixture",
    private: true,
    workspaces: { packages: ["packages/*", "apps/*", "bench", "e2e", "tools"] },
  }),
  ...manifest(
    "packages/schema",
    { "prosemirror-model": C },
    { "fast-check": C },
  ),
  ...manifest("packages/crdt", {
    "@manent/schema": W,
    yjs: C,
    "y-protocols": C,
    lib0: C,
  }),
  ...manifest("packages/sync-protocol", { "@manent/crdt": W, lib0: C }),
  ...manifest("packages/server-core", {
    "@manent/sync-protocol": W,
    "@manent/editor": W,
    "@scope/lib": C,
  }),
  ...manifest("packages/editor", { "@manent/crdt": W, "y-prosemirror": C }),
  ...manifest("packages/testkit", { "@manent/server-core": W }),
  ...manifest(
    "apps/web",
    { zustand: C, electrobun: C },
    { "@manent/testkit": W },
  ),
  ...manifest("apps/server", { "@manent/server-core": W, yjs: C }),
  ...manifest("tools", { "@manent/server-core": W }),
};

const lines = (...text: string[]) => text.join("\n") + "\n";

/** Each violation as `<file>:<line> <rule>`. */
async function check(files: Record<string, string>): Promise<string[]> {
  const root = await tree({ ...BASE, ...files });
  return (await checkBoundaries(root)).map(
    (v) => `${v.file}:${v.line} ${v.rule}`,
  );
}

test("a tree that follows the rules has no violations", async () => {
  expect(
    await check({
      "packages/schema/src/index.ts": lines(
        'import { Schema } from "prosemirror-model";',
        "export {};",
      ),
      "packages/crdt/src/index.ts": lines(
        'import "@manent/schema";',
        'import * as Y from "yjs";',
        'import * as encoding from "lib0/encoding";',
        'export * from "./doc.ts";',
      ),
      "packages/sync-protocol/src/index.ts": lines(
        'import type { Doc } from "@manent/crdt";',
      ),
      "packages/editor/src/index.ts": lines(
        'import { ySyncPlugin } from "y-prosemirror";',
        'import "@manent/crdt";',
      ),
      "packages/server-core/src/index.ts": lines(
        'import "@manent/sync-protocol";',
        'import { serve } from "bun";',
        'import { join } from "node:path";',
        'import "@scope/lib/sub";',
      ),
      "apps/web/src/main.ts": lines(
        'import type { TourFile } from "@manent/testkit";',
        'import { create } from "zustand";',
        "document.title = 'Manent';",
      ),
      "apps/server/src/main.ts": lines('import "@manent/server-core";'),
      "tools/demo/cli.ts": lines(
        'import "@manent/server-core";',
        'import "node:fs";',
        "Bun.file('x');",
      ),
      "packages/schema/test/a.test.ts": lines(
        'import { test } from "bun:test";',
        'import fc from "fast-check";',
        'import "../src/index.ts";',
      ),
    }),
  ).toEqual([]);
});

test("the allow-list is the dependency table", async () => {
  expect(
    await check({
      "packages/schema/src/a.ts": lines('import "@manent/crdt";'),
      "packages/server-core/src/a.ts": lines('import "@manent/editor";'),
      "packages/editor/src/a.ts": lines('import "@manent/crdt";'),
    }),
  ).toEqual([
    "packages/schema/src/a.ts:1 allow-list",
    "packages/server-core/src/a.ts:1 allow-list",
  ]);
  expect(
    await check({
      ...manifest("packages/schema", { "prosemirror-model": C, zustand: C }),
      "packages/schema/src/a.ts": lines(
        'import { Node } from "prosemirror-model";',
        'import { create } from "zustand";',
      ),
    }),
  ).toEqual(["packages/schema/src/a.ts:2 allow-list"]);
});

test("some imports are for types only", async () => {
  expect(
    await check({
      "packages/sync-protocol/src/a.ts": lines(
        'import { x } from "@manent/crdt";',
        'import type { X } from "@manent/crdt";',
        'export type { Y } from "@manent/crdt";',
        'import { type Z } from "@manent/crdt";',
      ),
      "apps/web/src/a.ts": lines(
        'import { validateTour } from "@manent/testkit";',
        'import type { TourFile } from "@manent/testkit";',
      ),
    }),
  ).toEqual([
    "apps/web/src/a.ts:1 types-only",
    "packages/sync-protocol/src/a.ts:1 types-only",
    "packages/sync-protocol/src/a.ts:4 types-only",
  ]);
});

test("pure packages touch neither the DOM nor Bun", async () => {
  expect(
    await check({
      "packages/schema/src/a.ts": lines(
        'import "bun:sqlite";',
        'import "node:fs";',
        'Bun.file("x");',
        "document.title;",
        "window.x;",
        "globalThis.localStorage;",
        "view.document;",
        "// document.title",
        '"window.x";',
        "process.env;",
      ),
      "packages/schema/test/a.test.ts": lines(
        "document.title;",
        'import "node:fs";',
      ),
      "packages/editor/src/a.ts": lines("document.title;"),
    }),
  ).toEqual([
    "packages/schema/src/a.ts:1 pure",
    "packages/schema/src/a.ts:2 pure",
    "packages/schema/src/a.ts:3 pure",
    "packages/schema/src/a.ts:4 pure",
    "packages/schema/src/a.ts:5 pure",
    "packages/schema/src/a.ts:6 pure",
    "packages/schema/src/a.ts:10 pure",
  ]);
});

test("browser packages do not import Bun or Node modules", async () => {
  expect(
    await check({
      "packages/editor/src/a.ts": lines(
        'import "node:path";',
        'import { file } from "bun";',
      ),
      "packages/server-core/src/a.ts": lines('import "node:path";'),
    }),
  ).toEqual([
    "packages/editor/src/a.ts:1 no-bun",
    "packages/editor/src/a.ts:2 no-bun",
  ]);
});

test("no deep imports across packages", async () => {
  expect(
    await check({
      "packages/crdt/src/a.ts": lines(
        'import "@manent/schema/src/x";',
        'import "../../schema/src/x";',
        'import "./b.ts";',
        'import "../test/helper.ts";',
      ),
    }),
  ).toEqual([
    "packages/crdt/src/a.ts:1 deep-import",
    "packages/crdt/src/a.ts:2 deep-import",
  ]);
});

test("apps, bench, e2e and tools are never imported", async () => {
  expect(
    await check({
      "packages/server-core/src/a.ts": lines('import "@manent/web";'),
      "tools/demo/a.ts": lines(
        'import "../../apps/server/src/main";',
        'import "@manent/tools";',
      ),
    }),
  ).toEqual([
    "packages/server-core/src/a.ts:1 app-import",
    "tools/demo/a.ts:1 app-import",
    "tools/demo/a.ts:2 app-import",
  ]);
});

test("yjs, y-protocols, y-prosemirror and electrobun stay in their one home", async () => {
  expect(
    await check({
      "apps/server/src/a.ts": lines('import * as Y from "yjs";'),
      "packages/crdt/src/a.ts": lines(
        'import "yjs";',
        'import "y-protocols/awareness";',
        'import "y-prosemirror";',
      ),
      "packages/editor/src/a.ts": lines('import "y-prosemirror";'),
      "apps/web/src/a.ts": lines('import "electrobun";'),
    }),
  ).toEqual([
    "apps/server/src/a.ts:1 restricted-external",
    "apps/web/src/a.ts:1 restricted-external",
    "packages/crdt/src/a.ts:3 restricted-external",
  ]);
});

test("an import must be declared in the importer's own package.json", async () => {
  expect(
    await check({
      "packages/editor/src/a.ts": lines(
        'import "prosemirror-state";',
        'import "@manent/schema";',
      ),
      "packages/crdt/src/a.ts": lines('import "lib0/encoding";'),
      "packages/server-core/src/a.ts": lines(
        'import "@scope/lib/sub";',
        'import "@scope/other";',
      ),
      "apps/web/src/a.ts": lines(
        'import type { TourFile } from "@manent/testkit";',
      ),
    }),
  ).toEqual([
    "packages/editor/src/a.ts:1 undeclared",
    "packages/editor/src/a.ts:2 undeclared",
    "packages/server-core/src/a.ts:2 undeclared",
  ]);
});

test("a package has one public entry and catalog versions", async () => {
  expect(
    await check({
      "packages/schema/package.json": lines(
        "{",
        '  "name": "@manent/schema",',
        '  "type": "module",',
        '  "exports": { ".": "./src/index.ts", "./x": "./src/x.ts" }',
        "}",
      ),
      "packages/crdt/package.json": lines(
        "{",
        '  "name": "@manent/crdt",',
        '  "exports": { ".": "./src/index.ts" },',
        '  "dependencies": {',
        '    "@manent/schema": "^0.0.0",',
        '    "yjs": "13.6.33",',
        '    "lib0": "catalog:"',
        "  }",
        "}",
      ),
      "apps/server/package.json": lines(
        "{",
        '  "name": "@manent/server",',
        '  "devDependencies": { "yjs": "catalog:", "@manent/server-core": "workspace:^" }',
        "}",
      ),
    }),
  ).toEqual([
    "apps/server/package.json:3 catalog",
    "packages/crdt/package.json:5 catalog",
    "packages/crdt/package.json:6 catalog",
    "packages/schema/package.json:4 single-entry",
  ]);
});

test("every import form is seen, and text that only looks like one is not", async () => {
  expect(
    await check({
      "packages/editor/src/a.ts": lines(
        'export * from "@manent/web";',
        'import("@manent/web");',
        'require("@manent/web");',
        'import type { X } from "@manent/web";',
        'import "@manent/web";',
        "import {",
        "  a,",
        "  b,",
        '} from "@manent/web";',
        "import d, * as e from '@manent/web';",
        'export { f as g } from "@manent/web";',
      ),
      "packages/editor/src/b.ts": lines(
        '// import "@manent/web";',
        "/* import '@manent/web';",
        '   export * from "@manent/web"; */',
        "const s = 'import \"@manent/web\"';",
        "const t = \"import('@manent/web')\";",
        'const u = `require("@manent/web")`;',
        'const v = "a \\" import \'@manent/web\' \\"";',
        "const w = `",
        'import "@manent/web";',
        "`;",
      ),
    }),
  ).toEqual([
    "packages/editor/src/a.ts:1 app-import",
    "packages/editor/src/a.ts:2 app-import",
    "packages/editor/src/a.ts:3 app-import",
    "packages/editor/src/a.ts:4 app-import",
    "packages/editor/src/a.ts:5 app-import",
    "packages/editor/src/a.ts:9 app-import",
    "packages/editor/src/a.ts:10 app-import",
    "packages/editor/src/a.ts:11 app-import",
  ]);
});

test("test files may reach further, but never deep or into apps", async () => {
  expect(
    await check({
      "packages/schema/test/a.test.ts": lines(
        'import fc from "fast-check";',
        'import { test } from "bun:test";',
        'import * as Y from "yjs";',
        'import "@manent/crdt/src/doc";',
        'import "@manent/server";',
      ),
      "packages/schema/src/b.test.ts": lines(
        'import "yjs";',
        "document.title;",
      ),
    }),
  ).toEqual([
    "packages/schema/test/a.test.ts:4 deep-import",
    "packages/schema/test/a.test.ts:5 app-import",
  ]);
});

test("toRepoPath gives the same path on every system", () => {
  expect(
    toRepoPath(
      "C:\\work\\manent",
      "C:\\work\\manent\\packages\\schema\\src\\a.ts",
    ),
  ).toBe("packages/schema/src/a.ts");
  expect(
    toRepoPath("/work/manent", "/work/manent/packages/schema/src/a.ts"),
  ).toBe("packages/schema/src/a.ts");
  expect(toRepoPath("/work/manent/", "packages\\schema\\src\\a.ts")).toBe(
    "packages/schema/src/a.ts",
  );
});

test("this repository passes", async () => {
  expect(await checkBoundaries(repoRoot)).toEqual([]);
});
