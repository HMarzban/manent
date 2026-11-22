// The theme's custom properties, block by block, and their values for one variant as a browser resolves them.
import { parseColour } from "./contrast.ts";
import type { Rgba } from "./contrast.ts";
import { parseCss } from "./parse.ts";
import type { CssRule, Declaration } from "./parse.ts";

export type Scheme = "light" | "dark";
export interface Variant {
  scheme: Scheme;
  contrast: "standard" | "more";
  paper: "sheet" | "white";
}

/** Every rule of the theme, and the custom properties of its three blocks; within a block a later declaration wins. */
export interface ThemeFile {
  rules: readonly CssRule[];
  /** `:root` outside any at-rule. */
  root: ReadonlyMap<string, string>;
  /** `:root` under `prefers-contrast: more`. */
  contrast: ReadonlyMap<string, string>;
  /** The demo bar's scope. */
  demo: ReadonlyMap<string, string>;
  /** The `color-scheme` the sheet takes when White page is on; null when the theme sets none. */
  whitePageScheme: Scheme | null;
  /** The `color-scheme` of the demo bar's scope; null when the theme sets none. */
  demoScheme: Scheme | null;
}

const CONTRAST_MEDIA = "@media (prefers-contrast: more)";
const DEMO_SCOPE = '[data-surface="demo"]';
const WHITE_PAGE = "html[data-white-page] .mn-pages";
const VAR = /var\(\s*(--[\w-]+)\s*\)/g;
const LIGHT_DARK = "light-dark(";

/** The declarations of every rule whose selector list holds exactly this selector, under these enclosing at-rules, in order. */
const declarationsOf = (
  rules: readonly CssRule[],
  selector: string,
  atRules: readonly string[] = [],
): Declaration[] =>
  rules
    .filter(
      (rule) =>
        (rule.selector ?? "")
          .split(",")
          .some((listed) => listed.trim() === selector) &&
        rule.atRules.join("\n") === atRules.join("\n"),
    )
    .flatMap((rule) => rule.declarations);

const customProperties = (
  declarations: readonly Declaration[],
): Map<string, string> =>
  new Map(
    declarations
      .filter(({ property }) => property.startsWith("--"))
      .map(({ property, value }) => [property, value]),
  );

const colorScheme = (declarations: readonly Declaration[]): Scheme | null => {
  const value = declarations.findLast(
    ({ property }) => property === "color-scheme",
  )?.value;
  return value === "light" || value === "dark" ? value : null;
};

export function readTheme(css: string): ThemeFile {
  const rules = parseCss(css);
  const demo = declarationsOf(rules, DEMO_SCOPE);
  return {
    rules,
    root: customProperties(declarationsOf(rules, ":root")),
    contrast: customProperties(
      declarationsOf(rules, ":root", [CONTRAST_MEDIA]),
    ),
    demo: customProperties(demo),
    whitePageScheme: colorScheme(declarationsOf(rules, WHITE_PAGE)),
    demoScheme: colorScheme(demo),
  };
}

/** Replaces every var() in `value` by its declared value, recursively; `trail` holds the names being resolved, to refuse a cycle. */
function substitute(
  theme: ThemeFile,
  value: string,
  contrast: Variant["contrast"],
  trail: readonly string[],
): string {
  return value.replace(VAR, (_, name: string) => {
    if (trail.includes(name))
      throw new RangeError(
        `${name} refers to itself through ${trail.join(", ")}`,
      );
    const declared =
      (contrast === "more" ? theme.contrast.get(name) : undefined) ??
      theme.root.get(name);
    if (declared === undefined)
      throw new RangeError(`the theme declares no ${name}`);
    return substitute(theme, declared, contrast, [...trail, name]);
  });
}

/** Picks one side of every light-dark(), innermost first: the last occurrence holds no other. */
function pickScheme(value: string, scheme: Scheme): string {
  let text = value;
  for (
    let at = text.lastIndexOf(LIGHT_DARK);
    at !== -1;
    at = text.lastIndexOf(LIGHT_DARK)
  ) {
    const open = at + LIGHT_DARK.length;
    let depth = 0;
    let comma = -1;
    let close = open;
    for (
      ;
      close < text.length && !(text[close] === ")" && depth === 0);
      close++
    ) {
      if (text[close] === "(") depth++;
      else if (text[close] === ")") depth--;
      else if (text[close] === "," && depth === 0 && comma === -1)
        comma = close;
    }
    if (comma === -1 || close === text.length)
      throw new RangeError(`a light-dark() without two values in ${value}`);
    const side =
      scheme === "light"
        ? text.slice(open, comma)
        : text.slice(comma + 1, close);
    text = text.slice(0, at) + side.trim() + text.slice(close + 1);
  }
  return text;
}

/**
 * The value of `name` with every var() and light-dark() resolved. A `--page-` token resolves in the sheet's scheme,
 * which is the theme's White page scheme when the paper is white; every other token in the chrome's.
 * Throws a RangeError for an undeclared name or a cycle.
 */
export function resolveValue(
  theme: ThemeFile,
  name: string,
  variant: Variant,
): string {
  const scheme =
    name.startsWith("--page-") && variant.paper === "white"
      ? (theme.whitePageScheme ?? variant.scheme)
      : variant.scheme;
  return pickScheme(
    substitute(theme, `var(${name})`, variant.contrast, []),
    scheme,
  );
}

/** The colour `name` resolves to; a translucent value keeps its alpha. Throws a TypeError when the value is not a colour. */
export function resolveToken(
  theme: ThemeFile,
  name: string,
  variant: Variant,
): Rgba {
  return parseColour(resolveValue(theme, name, variant));
}
