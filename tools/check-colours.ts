// Finds colour written outside the theme file: every colour, and the type sizes the stock style names,
// come from packages/ui/src/theme.css through its tokens and utilities.
import { join } from "node:path";

export interface Violation {
  file: string;
  line: number;
  rule: "colour-outside-theme";
  message: string;
}

const PATTERNS = [
  "packages/**/*.{ts,tsx,css,html}",
  "apps/**/*.{ts,tsx,css,html}",
];
const THEME = "packages/ui/src/theme.css";
const STOCK = "packages/ui/src/components/stock/";
/** Folders of tests, installed packages and build output: never the interface's source. */
const SKIPPED_FOLDERS = ["test", "node_modules", "dist", "build", "artifacts"];

// a `#` after a word, `&` or `.` is a private field or an HTML entity, not a colour
const HEX = /(?<![&.\w])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
const FORBIDDEN: readonly RegExp[] = [
  HEX,
  /(?<![\w-])(?:rgba?|hsl|oklch|color-mix)\(/g,
  /-\[#/g,
  /(?<![\w-])(?:bg-black|bg-white|text-white|text-xs|text-sm|text-base)(?![\w-])/g,
  /(?<![\w-])dark:(?=[\w[!-])/g,
  /var\(--p-/g,
  // an opacity modifier on a colour utility: bg-subtle/50, border-line/[0.5]
  /(?<![\w-])(?:bg|text|border|ring|outline|fill|stroke|decoration|shadow|accent|caret|divide|placeholder|from|via|to)-[a-z][\w-]*\/(?:\d+|\[[^\]]*\])/g,
];
/** A property that takes a colour, in CSS (`border-color`) or in a style object (`backgroundColor`), and its value up to the end of the declaration. */
const COLOUR_PROPERTY =
  /(?<![\w-])[a-zA-Z-]*(?:[cC]olor|[bB]ackground|[bB]order|[oO]utline|[fF]ill|[sS]troke|[sS]hadow|[dD]ecoration)[a-zA-Z-]*\s*:([^;{}\n]*)/g;
const WORD = /(?<![\w-])[a-z]+(?![\w-])/gi;
const IN_HREF = new RegExp("href\\s*=\\s*[\"'][^\"']*$");

// CSS Color 4's named colours; `transparent` and `currentcolor` are keywords, not colours of their own.
const NAMED_COLOURS: ReadonlySet<string> = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown " +
    "burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan " +
    "darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid " +
    "darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet " +
    "deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro " +
    "ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
    "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow " +
    "lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray " +
    "lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine " +
    "mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise " +
    "mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab " +
    "orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru " +
    "pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
    "seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan " +
    "teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen"
  ).split(" "),
);

interface Found {
  offset: number;
  text: string;
}

const matches = (text: string, pattern: RegExp): Found[] =>
  [...text.matchAll(pattern)].map((match) => ({
    offset: match.index,
    text: match[0],
  }));

const namedColours = (text: string): Found[] =>
  [...text.matchAll(COLOUR_PROPERTY)].flatMap((declaration) => {
    const value = declaration[1] ?? "";
    const start = declaration.index + declaration[0].length - value.length;
    return matches(value, WORD)
      .filter((word) => NAMED_COLOURS.has(word.text.toLowerCase()))
      .map((word) => ({ ...word, offset: start + word.offset }));
  });

/**
 * In a page, `#…` is also a link target and an id selector. A hex is skipped when it sits inside an `href`
 * value, or when the next thing after it is `{`; an id selector followed by a comma or another selector is still read.
 */
const isPageReference = (text: string, found: Found): boolean => {
  const lineStart = text.lastIndexOf("\n", found.offset) + 1;
  return (
    IN_HREF.test(text.slice(lineStart, found.offset)) ||
    /^\s*\{/.test(text.slice(found.offset + found.text.length))
  );
};

const lineAt = (text: string, offset: number): number =>
  text.slice(0, offset).split("\n").length;

function findIn(file: string, text: string): Violation[] {
  const page = file.endsWith(".html");
  return [
    ...FORBIDDEN.flatMap((pattern) =>
      matches(text, pattern).filter(
        (found) => !(page && pattern === HEX && isPageReference(text, found)),
      ),
    ),
    ...namedColours(text),
  ]
    .toSorted((a, b) => a.offset - b.offset)
    .map((found) => ({
      file,
      line: lineAt(text, found.offset),
      rule: "colour-outside-theme" as const,
      message: `${found.text} is set outside the theme`,
    }));
}

const isScanned = (file: string): boolean =>
  file !== THEME &&
  !file.startsWith(STOCK) &&
  !file.split("/").some((folder) => SKIPPED_FOLDERS.includes(folder));

/** Every colour under `root`'s packages/ and apps/ that is not in the theme file, the stock components or a test, by file then position. */
export async function findColours(root: string): Promise<Violation[]> {
  const files: string[] = [];
  for (const pattern of PATTERNS)
    for await (const found of new Bun.Glob(pattern).scan({ cwd: root }))
      files.push(found.replaceAll("\\", "/"));
  const scanned = files.filter(isScanned).toSorted();
  const violations: Violation[] = [];
  for (const file of scanned)
    violations.push(...findIn(file, await Bun.file(join(root, file)).text()));
  return violations;
}
