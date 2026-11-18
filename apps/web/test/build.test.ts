import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { buildWeb } from "../build.ts";

const trees = createTempTrees("manent-web-build-");
afterAll(() => trees.removeAll());

test("the web app builds to static files with absolute asset paths", async () => {
  const outDir = await trees.tree({});
  const built = await buildWeb({ outDir });
  expect(built.ok).toBe(true);
  const html = await Bun.file(join(outDir, "index.html")).text();
  expect(html).toMatch(new RegExp('src="/chunk-[a-z0-9]+\\.js"'));
  expect(html).toMatch(new RegExp('href="/chunk-[a-z0-9]+\\.css"'));
}, 30_000);
