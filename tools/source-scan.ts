// Reads TypeScript source as text, so that `import type` stays visible. Limits of
// the masker: regular-expression literals and JSX text are not understood, a
// template literal is one string up to its closing backtick, and a specifier must be a string literal.

interface Masked {
  /** The source with comments and string contents blanked, every offset and newline kept. */
  text: string;
  /** The contents of each string literal, by the offset of its opening quote. */
  strings: Map<number, string>;
}

export interface Import {
  specifier: string;
  line: number;
  typeOnly: boolean;
}

export function mask(source: string): Masked {
  const out = source.split("");
  const strings = new Map<number, string>();
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < source.length && source[j] !== c) {
        if (source[j] === "\\") j++;
        else if (c !== "`" && source[j] === "\n") break;
        j++;
      }
      const end = Math.min(j, source.length);
      strings.set(i, source.slice(i + 1, end));
      blank(i + 1, end);
      i = end + 1;
    } else {
      i++;
    }
  }
  return { text: out.join(""), strings };
}

const QUOTE = "([\"'`])";
const IMPORT_FORMS: readonly {
  pattern: RegExp;
  typeOnly: (m: RegExpExecArray) => boolean;
}[] = [
  // import … from "x", import type … from "x", export … from "x"
  {
    pattern: new RegExp(
      String.raw`\b(?:import|export)\b((?:(?!\b(?:import|export)\b)[\w$\s{},*])*?)\bfrom\s*` +
        QUOTE,
      "g",
    ),
    typeOnly: (m) => /^\s*type\s+\S/.test(m[1] ?? ""),
  },
  // import "x"
  {
    pattern: new RegExp(String.raw`\bimport\s*` + QUOTE, "g"),
    typeOnly: () => false,
  },
  // import("x")
  {
    pattern: new RegExp(String.raw`\bimport\s*\(\s*` + QUOTE, "g"),
    typeOnly: () => false,
  },
  // require("x")
  {
    pattern: new RegExp(String.raw`\brequire\s*\(\s*` + QUOTE, "g"),
    typeOnly: () => false,
  },
];

// The braces of an `import { … }` or `export { … }` statement, after an optional default binding.
const NAMED_BINDINGS = new RegExp(
  String.raw`\b(?:import|export)\s*(?:[\w$]+\s*,\s*)?\{([^}]*)\}`,
  "g",
);
const INLINE_TYPE = new RegExp(String.raw`(?:^|,)\s*type\s+[\w$]`);

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let k = 0; k < offset; k++) if (text.charCodeAt(k) === 10) line++;
  return line;
}

export function findImports(masked: Masked): Import[] {
  const found = new Map<number, Import>();
  for (const { pattern, typeOnly } of IMPORT_FORMS) {
    for (const m of masked.text.matchAll(pattern)) {
      const quote = m.index + m[0].length - 1;
      const specifier = masked.strings.get(quote);
      if (specifier === undefined || found.has(quote)) continue;
      found.set(quote, {
        specifier,
        line: lineAt(masked.text, quote),
        typeOnly: typeOnly(m),
      });
    }
  }
  return [...found.values()];
}

/** Each use of one of `names` as a global in masked text: followed by `.`, `[`, `(` or `?`, or read from `globalThis`. */
export function findGlobals(
  text: string,
  names: readonly string[],
): { name: string; line: number }[] {
  if (names.length === 0) return [];
  const alternatives = names.join("|");
  const uses = [
    new RegExp(String.raw`(?<![\w$.])(?:${alternatives})(?=[.[(?])`, "g"),
    new RegExp(String.raw`\bglobalThis\s*\.\s*(?:${alternatives})\b`, "g"),
  ];
  return uses.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((m) => ({
      name: m[0],
      line: lineAt(text, m.index),
    })),
  );
}

/** The line of each `import` or `export` statement in masked text whose braces mark a name with `type`. */
export function findInlineTypes(text: string): number[] {
  return [...text.matchAll(NAMED_BINDINGS)]
    .filter((m) => INLINE_TYPE.test(m[1] ?? ""))
    .map((m) => lineAt(text, m.index));
}
