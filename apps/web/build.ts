// Builds the web app to static files; run directly, it builds to apps/web/dist.

import { rm } from "node:fs/promises";
import { join, relative } from "node:path";
import tailwind from "bun-plugin-tailwind";

/** Empties `outDir` and builds the app into it; `files` are the outputs' paths relative to `outDir`. */
export async function buildWeb(options: {
  outDir: string;
}): Promise<{ ok: true; files: string[] } | { ok: false; logs: string[] }> {
  const { outDir } = options;
  await rm(outDir, { recursive: true, force: true });
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "src/index.html")],
    outdir: outDir,
    plugins: [tailwind],
    minify: true,
    target: "browser",
    sourcemap: "linked",
    publicPath: "/",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  if (!result.success)
    return { ok: false, logs: result.logs.map((log) => log.message) };
  return {
    ok: true,
    files: result.outputs.map((output) => relative(outDir, output.path)),
  };
}

if (import.meta.main) {
  const outDir = join(import.meta.dir, "dist");
  const built = await buildWeb({ outDir });
  if (!built.ok) {
    for (const log of built.logs) console.error(log);
    process.exit(1);
  }
  for (const file of built.files)
    console.log(relative(import.meta.dir, join(outDir, file)));
}
