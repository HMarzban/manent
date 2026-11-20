import { afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import {
  DESKTOP_NOTICES,
  EXTRA_NOTICES,
  collectNotices,
  desktopNotices,
  renderNotices,
  writeNotices,
} from "../notices.ts";

const repoRoot = join(import.meta.dir, "../..");
const trees = createTempTrees("manent-notices-");
afterAll(() => trees.removeAll());

// recorded when the file was fetched from unicode.org
const UNICODE_LICENSE_SHA256 =
  "e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96";

const sha256 = (bytes: Uint8Array): string =>
  new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

const readExtra = (extra: {
  title: string;
  path: string;
}): { title: string; text: string } => ({
  title: extra.title,
  text: readFileSync(join(repoRoot, extra.path), "utf8"),
});

/** A bun.lock, written with trailing commas as Bun writes it, whose apps/web lists quiet-pkg under `field`. */
const lockWith = (
  field: "dependencies" | "devDependencies",
  { lockfileVersion = 2, entry = `"quiet-pkg@1.0.0", "", {}, "sha512-0"` } = {},
): string => `{
  "lockfileVersion": ${lockfileVersion},
  "workspaces": {
    "": { "name": "manent", },
    "apps/web": { "name": "@manent/web", "${field}": { "quiet-pkg": "1.0.0", }, },
    "apps/server": { "name": "@manent/server", },
    "apps/desktop": { "name": "@manent/desktop", },
  },
  "packages": {
    "quiet-pkg": [${entry}],
  },
}
`;

const STORED = "node_modules/.bun/quiet-pkg@1.0.0/node_modules/quiet-pkg";
const MANIFEST = JSON.stringify({
  name: "quiet-pkg",
  version: "1.0.0",
  license: "MIT",
});

const ONE_WITHOUT_LICENCE = {
  "bun.lock": lockWith("dependencies"),
  [`${STORED}/package.json`]: MANIFEST,
  [`${STORED}/index.js`]: "export {};\n",
};

const DEV_ONLY = {
  "bun.lock": lockWith("devDependencies"),
  [`${STORED}/package.json`]: MANIFEST,
  [`${STORED}/LICENSE`]: "MIT License\n",
};

test("every bundled package has its licence text", () => {
  const { entries, missing } = collectNotices(repoRoot);
  expect(missing).toEqual([]);
  expect(entries.map((e) => e.name)).toEqual(
    expect.arrayContaining([
      "react",
      "yjs",
      "prosemirror-model",
      "@fontsource/courier-prime",
      "@fontsource-variable/inter",
    ]),
  );
});

test("a bundled package without a licence text fails the check", async () => {
  const root = await trees.tree(ONE_WITHOUT_LICENCE);
  expect(collectNotices(root).missing).toEqual(["quiet-pkg@1.0.0"]);
  expect(() => writeNotices(join(root, "n.txt"), root)).toThrow(
    "quiet-pkg@1.0.0",
  );
});

test("a lock of a version this reader does not know is refused", async () => {
  const root = await trees.tree({
    ...ONE_WITHOUT_LICENCE,
    "bun.lock": lockWith("dependencies", { lockfileVersion: 3 }),
  });
  expect(() => collectNotices(root)).toThrow(RangeError);
  expect(() => collectNotices(root)).toThrow(
    "bun.lock is version 3; this reader knows version 2",
  );
});

test("a package whose dependencies are not where the lock keeps them is refused", async () => {
  const cases = [
    {
      entry: `"quiet-pkg@1.0.0", {}, "sha512-0"`,
      message:
        "bun.lock: the package quiet-pkg has no dependency record at index 2",
    },
    {
      entry: `"quiet-pkg@1.0.0", "", { "dependencies": ["left-pad"] }, "sha512-0"`,
      message: "bun.lock: the dependencies field of quiet-pkg is not a record",
    },
  ];
  for (const { entry, message } of cases) {
    const root = await trees.tree({
      ...ONE_WITHOUT_LICENCE,
      "bun.lock": lockWith("dependencies", { entry }),
    });
    expect(() => collectNotices(root)).toThrow(TypeError);
    expect(() => collectNotices(root)).toThrow(message);
  }
});

test("what only tests and tools use is not listed", async () => {
  // a devDependency everywhere
  expect(collectNotices(repoRoot).entries.map((e) => e.name)).not.toContain(
    "fast-check",
  );
  expect(collectNotices(await trees.tree(DEV_ONLY)).entries).toEqual([]);
});

test("the fonts' and Unicode's licences travel with the build", () => {
  const text = renderNotices(
    collectNotices(repoRoot).entries,
    EXTRA_NOTICES.map(readExtra),
  );
  expect(text).toContain("==== @fontsource/courier-prime ");
  expect(text).toContain("SIL Open Font License");
  expect(text).toContain("==== Unicode Character Database 15.0.0 ====");
  expect(
    sha256(
      readFileSync(join(repoRoot, "tools/notices/unicode-license-v3.txt")),
    ),
  ).toBe(UNICODE_LICENSE_SHA256);
});

test("the notices are a header, then each package's heading and texts, then each extra", () => {
  const entries = [
    {
      name: "a-pkg",
      version: "1.0.0",
      licence: "MIT",
      texts: ["A one\r\n", "A two"],
    },
  ];
  expect(renderNotices(entries, [{ title: "Data", text: "D\n\n" }])).toBe(
    "Manent includes the following software from others. Each is listed with its licence.\n\n" +
      "==== a-pkg 1.0.0 (MIT) ====\n\nA one\n\nA two\n\n" +
      "==== Data ====\n\nD\n",
  );
});

test("two runs over one lock file give the same bytes", async () => {
  const dir = await trees.tree({});
  writeNotices(join(dir, "one.txt"), repoRoot);
  writeNotices(join(dir, "two.txt"), repoRoot);
  expect(readFileSync(join(dir, "two.txt"))).toEqual(
    readFileSync(join(dir, "one.txt")),
  );
});

test("the notices the web build writes are the rendered text", async () => {
  const out = join(await trees.tree({}), "third-party-notices.txt");
  const run = Bun.spawnSync(
    [process.execPath, join(repoRoot, "tools/notices.ts"), out],
    { cwd: repoRoot },
  );
  expect(run.exitCode).toBe(0);
  expect(readFileSync(out, "utf8")).toBe(
    renderNotices(
      collectNotices(repoRoot).entries,
      EXTRA_NOTICES.map(readExtra),
    ),
  );
});

test("the desktop's notices add the toolkit's texts that are present and name the rest", async () => {
  const dir = await trees.tree({ "bun-license.txt": "Bun's licence\n" });
  expect(desktopNotices("Web notices\n", dir)).toEqual({
    text: "Web notices\n\n==== bun-license.txt ====\n\nBun's licence\n",
    missing: [
      "chromium-credits.html",
      "cef-license.txt",
      "electrobun-license.txt",
    ],
  });
  expect(DESKTOP_NOTICES).toEqual([
    "chromium-credits.html",
    "cef-license.txt",
    "bun-license.txt",
    "electrobun-license.txt",
  ]);
});
