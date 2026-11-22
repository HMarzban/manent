import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";

const trees = createTempTrees("manent-bundled-fonts-");
afterAll(() => trees.removeAll());

test(
  "a bundled server opens the script font from any working directory",
  async () => {
    const outDir = await trees.tree({});
    const built = await Bun.build({
      entrypoints: [join(import.meta.dir, "fixtures/read-render-pdf.ts")],
      target: "bun",
      outdir: outDir,
      naming: "main.js",
    });
    expect(built.success).toBe(true);
    const child = Bun.spawn([process.execPath, join(outDir, "main.js")], {
      cwd: await trees.tree({}),
      stdout: "ignore",
      stderr: "pipe",
    });
    const stderr = await new Response(child.stderr).text();
    expect({ code: await child.exited, stderr }).toEqual({
      code: 0,
      stderr: "",
    });
  },
  { timeout: 30_000 },
);
