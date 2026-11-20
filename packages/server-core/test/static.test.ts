import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/index.ts";
import { HTTP, makeConfig } from "./config.ts";

const made: string[] = [];
afterAll(async () => {
  await Promise.all(
    made.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

test("the service worker and the page are always asked for again", async () => {
  const webDir = await mkdtemp(join(tmpdir(), "manent-static-"));
  made.push(webDir);
  await writeFile(
    join(webDir, "index.html"),
    "<!doctype html><title>app</title>",
  );
  await writeFile(join(webDir, "sw.js"), "self.x = 1;");
  await writeFile(join(webDir, "chunk-abc12345.js"), "export const a = 1;");
  const web = createServer(makeConfig({ http: { ...HTTP, webDir } }));
  const cacheControl = async (
    path: string,
  ): Promise<[string, string | null]> => {
    const response = await web.fetch(
      new Request(`http://localhost:4747${path}`),
      { remoteAddress: "127.0.0.1", upgrade: () => false },
    );
    if (response === null) throw new TypeError(`${path} was upgraded`);
    return [path, response.headers.get("cache-control")];
  };
  const paths = [
    "/sw.js",
    "/",
    "/index.html",
    "/s/01a1b2c3",
    "/chunk-abc12345.js",
  ];
  expect(await Promise.all(paths.map(cacheControl))).toEqual([
    ["/sw.js", "no-cache"],
    ["/", "no-cache"],
    ["/index.html", "no-cache"],
    ["/s/01a1b2c3", "no-cache"],
    ["/chunk-abc12345.js", null],
  ]);
});
