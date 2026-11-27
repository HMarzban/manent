// Builds and optionally serves the standalone 24-gem Museum Edition showcase straight from packages/ui.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { HIDDEN_GEM_PATHS, STUDIO_PALETTES } from "@manent/ui";
import type { StudioPaletteId } from "@manent/settings";
import { paletteTheme, readTheme, resolveValue } from "./resolve.ts";
import type { Scheme } from "./resolve.ts";

interface DemoThemeTokens {
  desk: string;
  chrome: string;
  overlay: string;
  surface: string;
  line: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  tint: string;
}

const DEFAULT_PORT = 4749;
const ENGINE_MARKER = new RegExp("\\/\\*__GEMS_ENGINE__\\*\\/");
const DATA_MARKER = new RegExp("\\/\\*__GEMS_DATA__\\*\\/");

function resolveAllPalettes(
  themeCss: string,
): Record<Scheme, Record<StudioPaletteId, DemoThemeTokens>> {
  const base = readTheme(themeCss);
  const schemes: readonly Scheme[] = ["light", "dark"];
  const out = {
    light: {} as Record<StudioPaletteId, DemoThemeTokens>,
    dark: {} as Record<StudioPaletteId, DemoThemeTokens>,
  };
  for (const scheme of schemes) {
    const variant = {
      scheme,
      contrast: "standard" as const,
      paper: "sheet" as const,
    };
    for (const palette of STUDIO_PALETTES) {
      const themed = paletteTheme(base, palette.id);
      const token = (name: string): string =>
        resolveValue(themed, name, variant);
      out[scheme][palette.id] = {
        desk: token("--bg-desk"),
        chrome: token("--bg-chrome"),
        overlay: token("--bg-overlay"),
        surface: token("--bg-raised"),
        line: token("--line"),
        ink: token("--fg"),
        muted: token("--fg-muted"),
        accent: token("--fg-accent"),
        accent2: token("--gem-accent-2"),
        tint: token("--bg-accent"),
      };
    }
  }
  return out;
}

async function bundleLiveEngine(repoRoot: string): Promise<string> {
  const brandDir = join(
    repoRoot,
    "packages",
    "ui",
    "src",
    "components",
    "brand",
  );
  const entry = join(brandDir, "__gems_demo_virtual_entry__.ts");
  const entrySource = [
    `import { GEM_SCENES } from ${JSON.stringify(join(brandDir, "gem-scene-registry.ts"))};`,
    `import { BURST_DURATION_MS, drawStageBurst } from ${JSON.stringify(join(brandDir, "gem-stage-bursts.ts"))};`,
    `import { clamp01, drawBackAtmosphere, drawFrontVignette, drawRegistrationFrame } from ${JSON.stringify(join(brandDir, "gem-stage-primitives.ts"))};`,
    `import { playGemFoley } from ${JSON.stringify(join(brandDir, "gem-audio.ts"))};`,
    "Object.assign(globalThis, {",
    "  __MANENT_GEMS__: {",
    "    GEM_SCENES,",
    "    BURST_DURATION_MS,",
    "    drawStageBurst,",
    "    drawBackAtmosphere,",
    "    drawFrontVignette,",
    "    drawRegistrationFrame,",
    "    playGemFoley,",
    "    clamp01,",
    "  },",
    "});",
  ].join("\n");

  const result = await Bun.build({
    entrypoints: [entry],
    files: { [entry]: entrySource },
    target: "browser",
    format: "iife",
    minify: true,
  });
  if (!result.success || result.outputs.length === 0) {
    const details = result.logs.map((log) => log.message).join("; ");
    throw new Error(`Could not bundle Hidden Gems showcase engine: ${details}`);
  }
  return (await result.outputs[0]!.text()).trim();
}

/** Builds a self-contained single-file HTML showcase straight from packages/ui. */
export async function buildGemsDemoHtml(repoRoot: string): Promise<string> {
  const [template, themeCss, engineJs] = await Promise.all([
    readFile(join(repoRoot, "tools", "theme", "gems-demo.html"), "utf8"),
    readFile(join(repoRoot, "packages", "ui", "src", "theme.css"), "utf8"),
    bundleLiveEngine(repoRoot),
  ]);

  const payload = {
    palettes: STUDIO_PALETTES.map((p) => ({
      id: p.id,
      name: p.name,
      badge: p.badge,
      tagline: p.tagline,
      whisper: p.whisper,
      iconAuthor: p.iconAuthor,
    })),
    paths: HIDDEN_GEM_PATHS,
    themes: resolveAllPalettes(themeCss),
  };

  const dataJs = `window.__MANENT_GEMS_DATA__ = ${JSON.stringify(payload)};`;
  return template
    .replace(ENGINE_MARKER, () => engineJs)
    .replace(DATA_MARKER, () => dataJs);
}

function parseArgs(argv: readonly string[]): {
  outPath: string | null;
  port: number;
} {
  let outPath: string | null = null;
  let port = DEFAULT_PORT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out" && argv[i + 1] !== undefined) {
      outPath = argv[i + 1]!;
      i++;
    } else if (arg === "--port" && argv[i + 1] !== undefined) {
      const parsed = Number.parseInt(argv[i + 1]!, 10);
      if (Number.isFinite(parsed) && parsed > 0) port = parsed;
      i++;
    }
  }
  return { outPath, port };
}

if (import.meta.main) {
  const repoRoot = resolve(import.meta.dir, "..", "..");
  const { outPath, port } = parseArgs(process.argv.slice(2));
  if (outPath !== null) {
    const html = await buildGemsDemoHtml(repoRoot);
    const target = resolve(process.cwd(), outPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html, "utf8");
    console.log(`Wrote Hidden Gems Museum showcase to ${target}`);
  } else {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port,
      async fetch() {
        const html = await buildGemsDemoHtml(repoRoot);
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    });
    console.log(
      `Hidden Gems Museum showcase listening on http://127.0.0.1:${server.port}`,
    );
  }
}
