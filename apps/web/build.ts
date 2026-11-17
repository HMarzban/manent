// Builds the web app to static files in apps/web/dist.

import { rm } from "node:fs/promises";
import { join, relative } from "node:path";
import tailwind from "bun-plugin-tailwind";

const outdir = join(import.meta.dir, "dist");
await rm(outdir, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [join(import.meta.dir, "src/index.html")],
  outdir,
  plugins: [tailwind],
  minify: true,
  target: "browser",
  sourcemap: "linked",
  publicPath: "/",
  define: { "process.env.NODE_ENV": '"production"' },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
for (const output of result.outputs)
  console.log(relative(import.meta.dir, output.path));
