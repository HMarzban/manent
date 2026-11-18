import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { buildWeb } from "../build.ts";
import { BOOT_SCRIPT } from "../src/boot/boot-script.ts";

const trees = createTempTrees("manent-web-build-");
afterAll(() => trees.removeAll());

type Built = Awaited<ReturnType<typeof buildWeb>>;

interface Chunk {
  name: string;
  path: string;
  entry: boolean;
  /** The chunks this one imports statically, by output name. */
  imports: readonly string[];
}

/** The script outputs of a build, from its metafile. */
function chunksOf(built: Built, outDir: string): Chunk[] {
  if (!built.ok) throw new TypeError(built.logs.join("\n"));
  return Object.entries(built.metafile.outputs)
    .filter(([name]) => name.endsWith(".js"))
    .map(([name, output]) => ({
      name,
      path: join(outDir, name),
      entry: output.entryPoint?.endsWith("index.html") === true,
      imports: output.imports
        .filter((i) => i.kind === "import-statement")
        .map((i) => i.path),
    }));
}

/** Within its limit, a size equals itself capped at the limit; over it, the failure shows both. */
const withinBudget = (
  chunk: string,
  kb: number,
  limit: number,
): { chunk: string; kb: number; limit: number } => ({
  chunk,
  kb: Math.min(kb, limit),
  limit,
});

const gzipKb = async (chunk: Chunk): Promise<number> =>
  Bun.gzipSync(await Bun.file(chunk.path).bytes()).length / 1024;

const productionBuild = async (): Promise<{ outDir: string; built: Built }> => {
  const outDir = await trees.tree({});
  return { outDir, built: await buildWeb({ outDir, flavour: "production" }) };
};

const entryText = async (built: Built, outDir: string): Promise<string> => {
  const entry = chunksOf(built, outDir).find((c) => c.entry);
  if (entry === undefined) throw new TypeError("no entry chunk");
  return Bun.file(entry.path).text();
};

test("the web app builds to static files with absolute asset paths", async () => {
  const { outDir, built } = await productionBuild();
  expect(built.ok).toBe(true);
  const html = await Bun.file(join(outDir, "index.html")).text();
  expect(html).toMatch(new RegExp('src="/chunk-[a-z0-9]+\\.js"'));
  expect(html).toMatch(new RegExp('href="/chunk-[a-z0-9]+\\.css"'));
}, 30_000);

test("the build puts the boot script first in the head, and splits screens into chunks", async () => {
  const { outDir, built } = await productionBuild();
  const html = await Bun.file(join(outDir, "index.html")).text();
  const head = new RegExp(
    "<head>\\s*(<script>[^<]*</script>)\\s*(<meta [^>]*>)",
  ).exec(html);
  expect([head?.[1], head?.[2]]).toEqual([
    `<script>${BOOT_SCRIPT}</script>`,
    '<meta name="color-scheme" content="light dark" />',
  ]);
  expect(
    chunksOf(built, outDir).filter((c) => c.name.startsWith("./chunk-")).length,
  ).toBeGreaterThan(1);
}, 30_000);

test("the static frame stands in the page until the app replaces it", async () => {
  const { outDir } = await productionBuild();
  const html = await Bun.file(join(outDir, "index.html")).text();
  expect(html).toMatch(
    new RegExp(
      '<div id="root">\\s*<div class="mn-static-frame">\\s*<div class="mn-static-titlebar"></div>\\s*<div class="mn-static-statusbar"></div>\\s*</div>\\s*</div>',
    ),
  );
}, 30_000);

test("the test flavour is a build of its own", async () => {
  const outDir = await trees.tree({});
  const built = await buildWeb({ outDir, flavour: "test" });
  const production = await productionBuild();
  const [testEntry, productionEntry] = await Promise.all([
    entryText(built, outDir),
    entryText(production.built, production.outDir),
  ]);
  expect([testEntry === productionEntry, built.ok]).toEqual([false, true]);
}, 60_000);

test("bundle budget: entry ≤ 150 KB and every other chunk ≤ 60 KB gzip", async () => {
  const { outDir, built } = await productionBuild();
  for (const chunk of chunksOf(built, outDir)) {
    const kb = await gzipKb(chunk);
    const limit = chunk.entry ? 150 : 60;
    expect({ chunk: chunk.name, kb, limit }).toEqual(
      withinBudget(chunk.name, kb, limit),
    );
  }
}, 60_000);

test("first-load JavaScript is at most 350 KB gzip", async () => {
  const { outDir, built } = await productionBuild();
  const chunks = chunksOf(built, outDir);
  const entry = chunks.find((c) => c.entry);
  if (entry === undefined) throw new TypeError("no entry chunk");
  const firstLoad = chunks.filter(
    (c) => c === entry || entry.imports.includes(c.name),
  );
  let kb = 0;
  for (const chunk of firstLoad) kb += await gzipKb(chunk);
  expect({ chunk: "first load", kb, limit: 350 }).toEqual(
    withinBudget("first load", kb, 350),
  );
}, 60_000);
