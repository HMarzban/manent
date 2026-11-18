import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import tailwind from "bun-plugin-tailwind";
import { createTempTrees } from "@manent/testkit";
import {
  composite,
  contrastRatio,
  luminance,
  parseColour,
} from "../theme/contrast.ts";
import type { Rgba } from "../theme/contrast.ts";
import { parseCss } from "../theme/parse.ts";
import { PAIRS } from "../theme/pairs.ts";
import type { ContrastPair } from "../theme/pairs.ts";
import { readTheme, resolveToken, resolveValue } from "../theme/resolve.ts";
import type { Scheme, ThemeFile, Variant } from "../theme/resolve.ts";

const repoRoot = join(import.meta.dir, "..", "..");

const trees = createTempTrees("manent-theme-");
afterAll(trees.removeAll);

const theme = readTheme(
  await Bun.file(join(repoRoot, "packages/ui/src/theme.css")).text(),
);
const VARIANTS: readonly Variant[] = (["light", "dark"] as const).flatMap(
  (scheme) =>
    (["standard", "more"] as const).flatMap((contrast) =>
      (["sheet", "white"] as const).map((paper) => ({
        scheme,
        contrast,
        paper,
      })),
    ),
);

const v = (scheme: Scheme): Variant => ({
  scheme,
  contrast: "standard",
  paper: "sheet",
});
const rgba = (text: string): Rgba => parseColour(text);
/** A translucent fill as it rests on the chrome of its scheme. */
const over = (colour: Rgba, scheme: Scheme): Rgba =>
  composite(colour, resolveToken(theme, "--bg-chrome", v(scheme)));

/** The theme as an element inside the demo scope sees it: the scope's own declarations win in every contrast. */
const demoTheme: ThemeFile = {
  ...theme,
  root: new Map([...theme.root, ...theme.demo]),
  contrast: new Map(
    [...theme.contrast].filter(([key]) => !theme.demo.has(key)),
  ),
};

/**
 * The variant a pair's colours resolve in: on the page, the sheet's own scheme; in the demo scope,
 * the scope's own; on chrome, the sheet that follows the theme, as the chrome tables measure it.
 */
const placed = (pair: ContrastPair, variant: Variant): Variant => {
  switch (pair.on) {
    case "page":
      return variant.paper === "white"
        ? { ...variant, scheme: theme.whitePageScheme ?? variant.scheme }
        : variant;
    case "demo":
      return {
        ...variant,
        scheme: theme.demoScheme ?? variant.scheme,
        paper: "sheet",
      };
    case "chrome":
      return { ...variant, paper: "sheet" };
  }
};

/** A token, or a token at an opacity: `--bg-accent/80`, or `--collab-1/--page-who-alpha` for a percentage the theme declares. */
const colourOf = (source: ThemeFile, ref: string, at: Variant): Rgba => {
  const [name = ref, opacity] = ref.split("/");
  const colour = resolveToken(source, name, at);
  if (opacity === undefined) return colour;
  const percent = Number.parseFloat(
    opacity.startsWith("--") ? resolveValue(source, opacity, at) : opacity,
  );
  return { ...colour, a: (colour.a * percent) / 100 };
};

/** The pair's ratio, its fill resting on the layers of `over`, nearest first. */
const ratioOf = (pair: ContrastPair, variant: Variant): number => {
  const at = placed(pair, variant);
  const source = pair.on === "demo" ? demoTheme : theme;
  const [bottom = pair.bg, ...above] = pair.over.toReversed();
  const ground = above.reduce(
    (below, ref) => composite(colourOf(source, ref, at), below),
    colourOf(source, bottom, at),
  );
  return contrastRatio(
    colourOf(source, pair.fg, at),
    colourOf(source, pair.bg, at),
    ground,
  );
};

const references = (value: string): string[] =>
  [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name = ""]) => name);

/** Whether following var() from `from` comes back to `to`. */
const reaches = (
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  from: string,
  to: string,
  seen: Set<string> = new Set(),
): boolean =>
  [...(graph.get(from) ?? [])].some(
    (next) =>
      next === to ||
      (!seen.has(next) && (seen.add(next), reaches(graph, next, to, seen))),
  );

const TAILWIND_NAMESPACES = [
  "--color-",
  "--font-",
  "--text-",
  "--tracking-",
  "--leading-",
  "--breakpoint-",
  "--container-",
  "--spacing",
  "--radius-",
  "--shadow-",
  "--inset-shadow-",
  "--drop-shadow-",
  "--blur-",
  "--perspective-",
  "--aspect-",
  "--ease-",
  "--animate-",
  "--default-",
];
const isPageKey = (key: string): boolean =>
  key.startsWith("--page-") || key === "--elev-page";

const isLayout = (property: string): boolean =>
  ["width", "height", "line-height", "letter-spacing"].includes(property) ||
  ["font", "padding", "margin", "border"].some((start) =>
    property.startsWith(start),
  );
/** Each `selector { property }` that a data-attribute rule or a media query declares and that could move a line. */
const layoutRulesOnPage = (t: ThemeFile): string[] =>
  t.rules.flatMap(({ selector, atRules, declarations }) =>
    selector !== null &&
    (selector.includes("[data-") ||
      atRules.some((at) => at.startsWith("@media")))
      ? declarations
          .filter(
            ({ property }) =>
              property.startsWith("--geo-") ||
              (selector.includes(".mn-page-view") && isLayout(property)),
          )
          .map(({ property }) => `${selector} { ${property} }`)
      : [],
  );

/** The theme compiled with Tailwind against tools/theme/fixture.html: every stylesheet the build writes. */
const compileFixture = async (): Promise<string> => {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "..", "theme", "fixture.html")],
    outdir: await trees.tree({}),
    plugins: [tailwind],
  });
  if (!result.success)
    throw new Error(result.logs.map((log) => log.message).join("\n"));
  const sheets = result.outputs.filter((output) =>
    output.path.endsWith(".css"),
  );
  return (await Promise.all(sheets.map((sheet) => sheet.text()))).join("\n");
};

test("the parser keeps adjacent rules, their at-rules and their declarations apart", () => {
  expect(
    parseCss(
      '/* a; b { } */a{x:1}b,c{y:url("p;q");z:2}@media (m){d{w:3}}@theme{--t:4}@import "e";',
    ),
  ).toEqual([
    {
      selector: "a",
      atRules: [],
      declarations: [{ property: "x", value: "1" }],
    },
    {
      selector: "b,c",
      atRules: [],
      declarations: [
        { property: "y", value: 'url("p;q")' },
        { property: "z", value: "2" },
      ],
    },
    {
      selector: "d",
      atRules: ["@media (m)"],
      declarations: [{ property: "w", value: "3" }],
    },
    {
      selector: null,
      atRules: ["@theme"],
      declarations: [{ property: "--t", value: "4" }],
    },
  ]);
});

test("a token resolves in its scheme and contrast, translucent values keep their alpha, and white page turns only the page light", () => {
  expect([
    resolveToken(theme, "--bg-subtle", v("light")),
    resolveToken(theme, "--fg", { ...v("dark"), contrast: "more" }),
    resolveToken(theme, "--fg", { ...v("dark"), paper: "white" }),
    resolveToken(theme, "--page-ink", { ...v("dark"), paper: "white" }),
  ]).toEqual([
    { r: 31, g: 29, b: 26, a: 0.06 },
    { r: 255, g: 255, b: 255, a: 1 },
    { r: 239, g: 236, b: 230, a: 1 },
    { r: 26, g: 26, b: 26, a: 1 },
  ]);
});

test("the ratio is WCAG 2's, with translucent colours composited over the ground first", () => {
  const white = rgba("#ffffff");
  const black = rgba("#000000");
  expect([
    contrastRatio(black, white, white),
    contrastRatio(rgba("rgb(0 0 0 / 0.5)"), white, white).toFixed(2),
    contrastRatio(black, rgba("rgb(0 0 0 / 0)"), white),
  ]).toEqual([21, "3.98", 21]);
});

test("every pair passes its threshold in four themes and on both papers", () => {
  const failing = PAIRS.flatMap((p) =>
    VARIANTS.map((variant) => ({
      p: `${p.fg} on ${p.bg}`,
      v: variant,
      ratio: ratioOf(p, variant),
      min: p.min[variant.contrast],
    })).filter((r) => r.ratio < r.min),
  );
  expect(failing).toEqual([]);
});

test("the contrast script fails a pair it should", () => {
  expect(
    contrastRatio(rgba("#777777"), rgba("#888888"), rgba("#ffffff")),
  ).toBeLessThan(1.5); // literal colours are allowed in test files
});

test("every var() resolves, none refers to itself, and the high-contrast block adds no new key", () => {
  const declarations = theme.rules.flatMap((rule) => rule.declarations);
  const declared = new Set(declarations.map(({ property }) => property));
  const graph = new Map<string, Set<string>>();
  for (const { property, value } of declarations)
    graph.set(
      property,
      new Set([...(graph.get(property) ?? []), ...references(value)]),
    );
  expect({
    unresolved: declarations
      .flatMap(({ value }) => references(value))
      .filter((name) => !declared.has(name)),
    selfReferring: [...graph.keys()].filter((name) =>
      reaches(graph, name, name),
    ),
    newInContrast: [...theme.contrast.keys()].filter(
      (key) => !theme.root.has(key),
    ),
  }).toEqual({ unresolved: [], selfReferring: [], newInContrast: [] });
});

test("no tier-2 name starts with a Tailwind namespace, and the demo scope declares every chrome colour", () => {
  const chromeColours = [...theme.contrast.keys()].filter(
    (key) => !isPageKey(key),
  );
  expect({
    namespaced: [...theme.root.keys()].filter(
      (key) =>
        !key.startsWith("--p-") &&
        TAILWIND_NAMESPACES.some((space) => key.startsWith(space)),
    ),
    chromeColours,
    undeclaredInDemo: chromeColours.filter((key) => !theme.demo.has(key)),
  }).toEqual({
    namespaced: [],
    chromeColours: [
      "--bg-desk",
      "--bg-chrome",
      "--bg-raised",
      "--bg-overlay",
      "--bg-subtle",
      "--bg-control",
      "--bg-selected",
      "--bg-accent",
      "--bg-scrim",
      "--fg",
      "--fg-muted",
      "--fg-disabled",
      "--fg-on-accent",
      "--fg-accent",
      "--fg-ok",
      "--fg-attention",
      "--fg-danger",
      "--fg-on-danger",
      "--line",
      "--line-strong",
      "--focus",
      "--chip-line",
      "--elev-overlay",
      "--elev-dialog",
    ],
    undeclaredInDemo: [],
  });
});

test("no rule with a data attribute or inside a media query declares geometry or layout on the page", () => {
  expect(layoutRulesOnPage(theme)).toEqual([]); // --geo-*, font*, width, height, padding, margin, border, line-height, letter-spacing on or inside .mn-page-view
});

test("the page is the lightest resting surface in light and dark; in high contrast its edge stands out", () => {
  for (const scheme of ["light", "dark"] as const)
    for (const t of ["--bg-desk", "--bg-chrome", "--bg-raised", "--bg-subtle"])
      expect(
        luminance(resolveToken(theme, "--page-paper", v(scheme))) >
          luminance(over(resolveToken(theme, t, v(scheme)), scheme)),
      ).toBe(true);
  for (const scheme of ["light", "dark"] as const) {
    const more: Variant = { ...v(scheme), contrast: "more" };
    const desk = resolveToken(theme, "--bg-desk", more);
    expect(
      contrastRatio(resolveToken(theme, "--page-edge", more), desk, desk),
    ).toBeGreaterThanOrEqual(4.5);
  }
});

test("in the dark theme the sheet is dark with light ink, and white page turns it back to paper", () => {
  const dark = v("dark");
  const white = { ...v("dark"), paper: "white" } as const;
  expect([
    luminance(resolveToken(theme, "--page-paper", dark)) <
      luminance(resolveToken(theme, "--page-ink", dark)),
    luminance(resolveToken(theme, "--page-paper", white)) >
      luminance(resolveToken(theme, "--page-ink", white)),
  ]).toEqual([true, true]);
});

test("the theme compiles: no palette, no off-scale size, inert dark:, and the token utilities exist", async () => {
  const css = await compileFixture(); // Bun.build of tools/theme/fixture.html with bun-plugin-tailwind into a temporary directory
  for (const absent of [
    ".bg-red-500",
    ".text-zinc-700",
    ".text-3xl",
    ".font-serif",
    ".shadow-inner",
  ])
    expect(css).not.toContain(absent);
  expect(css).toMatch(
    new RegExp("\\.dark\\\\:bg-input\\\\/30:where\\(\\[data-never\\]\\)"),
  );
  for (const present of [
    ".h-control",
    ".min-h-row",
    ".text-ui",
    ".bg-desk",
    ".rounded-control",
    ".shadow-overlay",
  ])
    expect(css).toContain(present);
}, 30_000);
