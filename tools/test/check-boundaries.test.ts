import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { RULES } from "../boundaries.config.ts";
import type { BoundaryRules, WorkspaceRule } from "../boundaries.config.ts";
import { checkBoundaries } from "../check-boundaries.ts";

const repoRoot = join(import.meta.dir, "..", "..");

const trees = createTempTrees("manent-boundaries-");
afterAll(trees.removeAll);

const row = (r: Partial<WorkspaceRule>): WorkspaceRule => ({
  layer: 0,
  runtime: "bun",
  importable: "product",
  internal: [],
  typesOnly: [],
  external: "declared",
  forbiddenGlobals: [],
  ...r,
});
const FIXTURE: BoundaryRules = {
  workspaces: {
    schema: row({ runtime: "pure", external: ["prosemirror-model"] }),
    crdt: row({
      runtime: "pure",
      internal: ["schema"],
      external: ["yjs", "y-protocols", "lib0"],
    }),
    "sync-protocol": row({
      runtime: "pure",
      internal: ["crdt"],
      typesOnly: ["crdt"],
      external: ["lib0"],
    }),
    "server-core": row({ internal: ["sync-protocol", "crdt", "schema"] }),
    editor: row({ runtime: "browser", internal: ["schema", "crdt"] }),
    testkit: row({ layer: "tooling", internal: "*" }),
    web: row({
      runtime: "browser",
      importable: "never",
      internal: "*",
      typesOnly: ["testkit"],
    }),
    server: row({ importable: "never", internal: "*" }),
    tools: row({ layer: "tooling", importable: "never", internal: "*" }),
  },
  restrictedExternal: {
    yjs: ["crdt"],
    "y-protocols": ["crdt"],
    "y-prosemirror": ["editor"],
    electrobun: ["desktop"],
  },
  forbiddenGlobals: [
    "Bun",
    "process",
    "window",
    "document",
    "navigator",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "requestAnimationFrame",
    "HTMLElement",
  ],
  zones: [],
};
const rulesWith = (part: Partial<BoundaryRules>): BoundaryRules => ({
  ...FIXTURE,
  ...part,
});

const C = "catalog:";
const W = "workspace:*";

/** The fixture manifest of `dir`, with `fields` overriding; its "exports" is on line 6. */
function manifestWith(
  dir: string,
  fields: Record<string, unknown>,
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
    dependencies: {},
    devDependencies: {},
    ...fields,
  };
  return { [`${dir}/package.json`]: JSON.stringify(m, null, 2) + "\n" };
}

const manifest = (
  dir: string,
  dependencies: Record<string, string> = {},
  devDependencies: Record<string, string> = {},
): Record<string, string> =>
  manifestWith(dir, { dependencies, devDependencies });

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
async function check(
  files: Record<string, string>,
  rules: BoundaryRules = FIXTURE,
): Promise<string[]> {
  const root = await trees.tree({ ...BASE, ...files });
  return (await checkBoundaries(root, rules)).map(
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
      "packages/sync-protocol/src/b.ts": lines(
        "export enum E { A, B }",
        'import type { X } from "@manent/crdt";',
      ),
      "packages/sync-protocol/src/c.ts": lines(
        "export type { A }",
        'import { b } from "@manent/crdt"',
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
    "packages/sync-protocol/src/a.ts:4 inline-type",
    "packages/sync-protocol/src/c.ts:2 types-only",
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
        "window?.alert();",
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
    "packages/schema/src/a.ts:11 pure",
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
    "packages/crdt/src/a.ts:4 test-code",
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

test("a workspace with no rule is a violation", async () => {
  expect(
    await check({
      ...manifest("packages/ghost"),
      "packages/ghost/src/index.ts": lines('import "yjs";'),
    }),
  ).toEqual(["packages/ghost/package.json:1 no-rule"]);
});

test("a test file obeys the allow-list for production entries, and may take values across a types-only edge", async () => {
  expect(
    await check({
      "packages/schema/test/a.test.ts": lines('import "@manent/crdt";'),
      "packages/crdt/test/a.test.ts": lines(
        'import { x } from "@manent/schema";',
      ),
      "packages/sync-protocol/test/a.test.ts": lines(
        'import { x } from "@manent/crdt";',
      ),
    }),
  ).toEqual(["packages/schema/test/a.test.ts:1 allow-list"]);
});

test("only test folders, test files and the testing entry are test code", async () => {
  expect(
    await check({
      "packages/schema/src/test/helper.ts": lines(
        'import "yjs";',
        "document.title;",
      ),
      "packages/schema/src/testing/index.ts": lines(
        'import fc from "fast-check";',
        "document.title;",
      ),
      "packages/schema/src/a.test.ts": lines('import "yjs";'),
    }),
  ).toEqual([
    "packages/schema/src/test/helper.ts:1 restricted-external",
    "packages/schema/src/test/helper.ts:2 pure",
  ]);
});

test("a package may have a second entry for test code and tooling only", async () => {
  const both = { ".": "./src/index.ts", "./testing": "./src/testing/index.ts" };
  expect(
    await check({
      ...manifestWith("packages/schema", { exports: both }),
      "packages/schema/src/testing/index.ts": "export {};\n",
      "packages/crdt/test/a.test.ts": lines(
        'import "@manent/schema/testing";',
        'import "@manent/schema/internal";',
      ),
      "packages/crdt/src/a.ts": lines('import "@manent/schema/testing";'),
      "tools/a.ts": lines('import "@manent/schema/testing";'),
      // crdt has no such entry
      "packages/schema/test/b.test.ts": lines('import "@manent/crdt/testing";'),
    }),
  ).toEqual([
    "packages/crdt/src/a.ts:1 testing-entry",
    "packages/crdt/test/a.test.ts:2 deep-import",
    "packages/schema/test/b.test.ts:1 deep-import",
  ]);
  // the file is missing
  expect(
    await check(manifestWith("packages/schema", { exports: both })),
  ).toEqual(["packages/schema/package.json:6 single-entry"]);
  expect(
    await check(
      manifestWith("packages/schema", {
        exports: { ".": "./src/index.ts", "./testing": "./src/testing.ts" },
      }),
    ),
  ).toEqual(["packages/schema/package.json:6 single-entry"]);
  const theme = { ".": "./src/index.ts", "./theme.css": "./src/theme.css" };
  expect(
    await check({
      ...manifestWith("packages/schema", { exports: theme }),
      "packages/schema/src/theme.css": ":root {}\n",
    }),
  ).toEqual([]);
  // the stylesheet is missing
  expect(
    await check(manifestWith("packages/schema", { exports: theme })),
  ).toEqual(["packages/schema/package.json:6 single-entry"]);
});

test("a tooling package may have a DOM entry, which only test code and tooling import", async () => {
  const dom = { ".": "./src/index.ts", "./dom": "./src/dom.ts" };
  expect(
    await check({
      ...manifestWith("packages/testkit", { exports: dom }),
      "packages/testkit/src/dom.ts": "export {};\n",
      ...manifestWith("packages/schema", { exports: dom }),
      "packages/schema/src/dom.ts": "export {};\n",
      "packages/crdt/test/a.dom.test.ts": lines(
        'import "@manent/testkit/dom";',
      ),
      "apps/web/src/a.ts": lines('import "@manent/testkit/dom";'),
    }),
  ).toEqual([
    "apps/web/src/a.ts:1 testing-entry",
    // schema is not tooling
    "packages/schema/package.json:6 single-entry",
  ]);
});

test("a tests-only package is imported by test code and tooling, never by product code or a testing entry", async () => {
  const rules = rulesWith({
    workspaces: {
      ...FIXTURE.workspaces,
      testkit: row({ layer: "tooling", importable: "tests", internal: "*" }),
    },
  });
  expect(
    await check(
      {
        "apps/web/src/a.ts": lines('import type { T } from "@manent/testkit";'),
        "packages/schema/test/a.test.ts": lines('import "@manent/testkit";'),
        "tools/a.ts": lines('import "@manent/testkit";'),
        "packages/schema/src/testing/index.ts": lines(
          'import "@manent/testkit";',
        ),
      },
      rules,
    ),
  ).toEqual([
    "apps/web/src/a.ts:1 testing-entry",
    "packages/schema/src/testing/index.ts:1 testing-entry",
  ]);
});

test("product code never imports its own test code", async () => {
  expect(
    await check({
      "packages/schema/src/a.ts": lines(
        'import "./testing/index.ts";',
        'import "../test/helpers.ts";',
      ),
      "packages/schema/src/testing/index.ts": lines('import "../a.ts";'),
    }),
  ).toEqual([
    "packages/schema/src/a.ts:1 test-code",
    "packages/schema/src/a.ts:2 test-code",
  ]);
});

test("a built-in module can have a single home", async () => {
  const rules = rulesWith({
    restrictedExternal: {
      ...FIXTURE.restrictedExternal,
      "bun:sqlite": ["server-core"],
    },
  });
  expect(
    await check(
      {
        "packages/server-core/src/a.ts": lines('import "bun:sqlite";'),
        "apps/server/src/a.ts": lines('import "bun:sqlite";'),
        "apps/server/test/a.test.ts": lines('import "bun:sqlite";'),
      },
      rules,
    ),
  ).toEqual(["apps/server/src/a.ts:1 restricted-external"]);
});

test("a pure row can forbid further globals", async () => {
  const rules = rulesWith({
    workspaces: {
      ...FIXTURE.workspaces,
      schema: row({
        runtime: "pure",
        external: ["prosemirror-model"],
        forbiddenGlobals: ["fetch", "setTimeout"],
      }),
    },
  });
  const code = lines('fetch("x");', "setTimeout(() => {}, 1);");
  expect(
    await check(
      { "packages/schema/src/a.ts": code, "packages/crdt/src/a.ts": code },
      rules,
    ),
  ).toEqual([
    "packages/schema/src/a.ts:1 pure",
    "packages/schema/src/a.ts:2 pure",
  ]);
});

test("a zone keeps a global and a package's values inside its folders", async () => {
  const rules = rulesWith({
    zones: [
      {
        workspace: "server-core",
        only: ["src/http/"],
        globals: ["Bun"],
        values: [],
      },
      {
        workspace: "web",
        only: ["src/editor-host/"],
        globals: [],
        values: ["@manent/editor"],
      },
    ],
  });
  expect(
    await check(
      {
        ...manifest("apps/web", { zustand: C, "@manent/editor": W }),
        "packages/server-core/src/http/static.ts": lines('Bun.file("x");'),
        "packages/server-core/src/auth/sessions.ts": lines(
          'new Bun.CryptoHasher("sha256");',
          "let s: Bun.Server<unknown>;",
        ),
        "packages/server-core/test/a.test.ts": lines('Bun.file("x");'),
        "apps/web/src/editor-host/a.ts": lines(
          'import { x } from "@manent/editor";',
        ),
        "apps/web/src/screens/a.tsx": lines(
          'import { x } from "@manent/editor";',
          'import type { X } from "@manent/editor";',
        ),
      },
      rules,
    ),
  ).toEqual([
    "apps/web/src/screens/a.tsx:1 zone",
    "packages/server-core/src/auth/sessions.ts:1 zone",
    "packages/server-core/src/auth/sessions.ts:2 zone",
  ]);
});

test("a type is imported and exported in its own statement", async () => {
  expect(
    await check({
      "packages/schema/src/a.ts": lines(
        'import { a, type B } from "./x.ts";',
        'export { type B } from "./x.ts";',
        'import type { B } from "./x.ts";',
        "const text = 'import { type X } from \"y\"';",
      ),
      "packages/schema/test/a.test.ts": lines(
        'import { type B } from "../src/index.ts";',
      ),
    }),
  ).toEqual([
    "packages/schema/src/a.ts:1 inline-type",
    "packages/schema/src/a.ts:2 inline-type",
    "packages/schema/test/a.test.ts:1 inline-type",
  ]);
});

test("this repository passes", async () => {
  expect(await checkBoundaries(repoRoot, RULES)).toEqual([]);
});
