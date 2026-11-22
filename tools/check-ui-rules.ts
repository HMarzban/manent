// Checks the interface's static rules: private stores, components kept away from the editor, storage and
// the platform read in their own modules, no view transitions, every visible word from a word table,
// DOM tests that register the DOM first, and motion through tokens.
import { join } from "node:path";
import { findImports, mask } from "./source-scan.ts";

const UI_RULES = [
  "store-private",
  "editor-reach",
  "storage-direct",
  "platform-direct",
  "no-view-transition",
  "literal-text",
  "dom-first",
  "motion",
] as const;
export type UiRule = (typeof UI_RULES)[number];

export interface UiViolation {
  file: string;
  line: number;
  rule: UiRule;
  message: string;
}

type Finding = Omit<UiViolation, "file" | "rule">;

interface Source {
  /** Repository-relative, with forward slashes. */
  file: string;
  text: string;
  /** `text` with comments and string contents blanked (`mask`). */
  masked: ReturnType<typeof mask>;
}

/** Files that broke a rule before it existed; each is skipped for that rule until its screen is rewritten. */
const PRE_EXISTING: readonly { file: string; rule: UiRule }[] = [];

const SOURCES = new Bun.Glob("{packages,apps}/*/{src,test}/**/*.{ts,tsx,css}");
const INTERFACE_DIRS = ["packages/ui/src/", "apps/web/src/"] as const;
const STORAGE_MODULES: readonly string[] = [
  "apps/web/src/boot/boot-cache.ts",
  "apps/web/src/services/device-bag.ts",
  "apps/web/src/services/local-map.ts",
  "apps/web/src/session.ts",
  "apps/web/src/services/flags.ts",
  "apps/web/src/services/sync/device-memory.ts",
  "apps/web/src/history/last-opened.ts",
  "apps/web/src/import/reopen.ts",
];
const PLATFORM_MODULE = "apps/web/src/platform.ts";
const EDITOR_HOST_DIR = "apps/web/src/editor-host/";
const WORD_PLACES = [
  "packages/ui/src/words/",
  "apps/web/src/text.ts",
  "packages/ui/src/components/stock/",
] as const;
const STOCK_DIR = "/components/stock/";

const inInterface = (file: string): boolean =>
  INTERFACE_DIRS.some((dir) => file.startsWith(dir));

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let k = 0; k < offset; k++) if (text.charCodeAt(k) === 10) line++;
  return line;
}

/** A finding for each match of `pattern` in the masked code. */
const matches = (
  source: Source,
  pattern: RegExp,
  message: (match: string) => string,
): Finding[] =>
  [...source.masked.text.matchAll(pattern)].map((m) => ({
    line: lineAt(source.masked.text, m.index),
    message: message(m[0]),
  }));

const STORE_FILE = /(?:^|\/)state\/[^/]+\.store\.ts$/;
const STORE_FACTORIES = new Set(["create", "createStore"]);
const NAMED_IMPORT = new RegExp(
  String.raw`\bimport\s*\{([^}]*)\}\s*from\s*(["'])`,
  "g",
);
const EXPORTED_DECLARATION = new RegExp(
  String.raw`\bexport\s+(?:async\s+)?(?:function\*?|const|let|var|class|enum)\s+([\w$]+)`,
  "g",
);
const EXPORTED_NAMES = new RegExp(String.raw`\bexport\s*\{([^}]*)\}`, "g");
const OTHER_EXPORT = new RegExp(
  String.raw`\bexport\s+default\b|\bexport\s*\*`,
  "g",
);
const isStoreExport = (name: string): boolean =>
  /^use[A-Z]|^[a-z][\w$]*Actions$|^selectors$|^create[A-Z][\w$]*Store$/.test(
    name,
  );

/** The value names listed in an import or export's braces: `type` entries dropped, `a as b` read as `b` when `alias` holds. */
const braceNames = (list: string, alias: boolean): string[] =>
  list
    .split(",")
    .map((entry) => entry.trim().split(/\s+/))
    .filter(
      ([first]) => first !== undefined && first !== "" && first !== "type",
    )
    .map((words) => (alias ? words.at(-1) : words[0]) ?? "");

function storePrivate(source: Source): Finding[] {
  const { text, strings } = source.masked;
  if (!STORE_FILE.test(source.file))
    return [...text.matchAll(NAMED_IMPORT)].flatMap((m) => {
      const specifier = strings.get(m.index + m[0].length - 1) ?? "";
      if (specifier !== "zustand" && !specifier.startsWith("zustand/"))
        return [];
      return braceNames(m[1] ?? "", false)
        .filter((name) => STORE_FACTORIES.has(name))
        .map((name) => ({
          line: lineAt(text, m.index),
          message: `${name} from ${specifier} outside a state/*.store.ts file`,
        }));
    });
  const declared = [...text.matchAll(EXPORTED_DECLARATION)].map((m) => ({
    index: m.index,
    names: [m[1] ?? ""],
  }));
  const listed = [...text.matchAll(EXPORTED_NAMES)].map((m) => ({
    index: m.index,
    names: braceNames(m[1] ?? "", true),
  }));
  return [
    ...[...declared, ...listed].flatMap(({ index, names }) =>
      names
        .filter((name) => !isStoreExport(name))
        .map((name) => ({
          line: lineAt(text, index),
          message: `a store file exports ${name}`,
        })),
    ),
    ...matches(source, OTHER_EXPORT, (form) => `a store file uses ${form}`),
  ];
}

const EDITOR_SPECIFIER =
  /^(?:prosemirror-|y-prosemirror(?:\/|$)|@manent\/(?:editor|crdt-binding)(?:\/|$))/;

const editorReach = (source: Source): Finding[] =>
  !source.file.endsWith(".tsx") || source.file.startsWith(EDITOR_HOST_DIR)
    ? []
    : findImports(source.masked)
        .filter(({ specifier }) => EDITOR_SPECIFIER.test(specifier))
        .map(({ specifier, line }) => ({
          line,
          message: `a component imports ${specifier}`,
        }));

const STORAGE = /(?<![\w$])(?:localStorage|sessionStorage|indexedDB)(?![\w$])/g;
const PLATFORM =
  /(?<![\w$])navigator\s*\??\.\s*(?:userAgent|platform)(?![\w$])/g;
const VIEW_TRANSITION = /(?<![\w$])startViewTransition(?![\w$])/g;

const storageDirect = (source: Source): Finding[] =>
  !inInterface(source.file) || STORAGE_MODULES.includes(source.file)
    ? []
    : matches(source, STORAGE, (name) => `${name} outside the storage modules`);

const platformDirect = (source: Source): Finding[] =>
  !inInterface(source.file) || source.file === PLATFORM_MODULE
    ? []
    : matches(source, PLATFORM, (read) => `${read} outside ${PLATFORM_MODULE}`);

const noViewTransition = (source: Source): Finding[] =>
  matches(source, VIEW_TRANSITION, (name) => `${name} is called`);

// JSX is compiled to calls of FACTORY, whose string arguments are the literal text

const FACTORY = "__jsx";
const transpiler = new Bun.Transpiler({
  loader: "tsx",
  tsconfig: {
    compilerOptions: {
      jsx: "react",
      jsxFactory: FACTORY,
      jsxFragmentFactory: "__fragment",
    },
  },
});
const FACTORY_CALL = new RegExp(String.raw`(?<![\w$.])${FACTORY}\(`, "g");
const TEXT_ATTRIBUTES = new Set(["aria-label", "title", "placeholder"]);
const LETTER = /\p{L}/u;

/** The [start, end) offsets of the items of the bracketed list that opens at `open`. */
function listItems(text: string, open: number): [number, number][] {
  const items: [number, number][] = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth > 0) continue;
      if (text.slice(start, i).trim() !== "") items.push([start, i]);
      return items;
    } else if (c === "," && depth === 1) {
      items.push([start, i]);
      start = i + 1;
    }
  }
  return items;
}

/** The value of the string literal that is the whole of [start, end), or null. */
function stringAt(
  masked: Source["masked"],
  [start, end]: [number, number],
): string | null {
  const slice = masked.text.slice(start, end);
  const from = start + slice.length - slice.trimStart().length;
  const raw = masked.strings.get(from);
  if (
    raw === undefined ||
    from + raw.length + 2 !== start + slice.trimEnd().length
  )
    return null;
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    // an escape JSON does not read: the raw text still shows whether it holds a letter
    return raw;
  }
}

/** Each literal text in the compiled calls: children first, then the text attributes of the props object. */
function literals(
  compiled: Source["masked"],
): { text: string; message: string }[] {
  const found: { text: string; message: string }[] = [];
  for (const call of compiled.text.matchAll(FACTORY_CALL)) {
    const [, props, ...children] = listItems(
      compiled.text,
      call.index + FACTORY.length,
    );
    for (const child of children) {
      const text = stringAt(compiled, child);
      if (text !== null)
        found.push({ text, message: `literal text ${JSON.stringify(text)}` });
    }
    const propsText = props === undefined ? "" : compiled.text.slice(...props);
    if (props === undefined || !propsText.trimStart().startsWith("{")) continue;
    for (const [start, end] of listItems(
      compiled.text,
      props[0] + propsText.indexOf("{"),
    )) {
      const colon = compiled.text.indexOf(":", start);
      if (colon === -1 || colon >= end) continue;
      const key =
        stringAt(compiled, [start, colon]) ??
        compiled.text.slice(start, colon).trim();
      const text = stringAt(compiled, [colon + 1, end]);
      if (TEXT_ATTRIBUTES.has(key) && text !== null)
        found.push({
          text,
          message: `${key} holds literal text ${JSON.stringify(text)}`,
        });
    }
  }
  return found.filter(({ text }) => LETTER.test(text));
}

function literalText(source: Source): Finding[] {
  if (!source.file.endsWith(".tsx") || !inInterface(source.file)) return [];
  if (WORD_PLACES.some((place) => source.file.startsWith(place))) return [];
  let compiled: string;
  try {
    compiled = transpiler.transformSync(source.text);
  } catch (cause) {
    throw new Error(`${source.file} does not compile`, { cause });
  }
  // the compiled code has no lines of its own: a text's line is where its first word next appears
  let cursor = 0;
  return literals(mask(compiled)).map(({ text, message }) => {
    const word = text.trim().split(/\s+/)[0] ?? text;
    const at = source.text.indexOf(word, cursor);
    const offset = at === -1 ? source.text.indexOf(word) : at;
    if (at !== -1) cursor = at + word.length;
    return { line: offset === -1 ? 0 : lineAt(source.text, offset), message };
  });
}

const DOM_TEST = /\.dom\.test\.tsx?$/;
const DOM_ENTRY = "@manent/testkit/dom";

function domFirst(source: Source): Finding[] {
  if (!DOM_TEST.test(source.file)) return [];
  const [first] = findImports(source.masked).toSorted(
    (a, b) => a.line - b.line,
  );
  const allowed = source.file.startsWith("packages/testkit/")
    ? [DOM_ENTRY, "../src/dom.ts"]
    : [DOM_ENTRY];
  if (first !== undefined && allowed.includes(first.specifier)) return [];
  return [
    {
      line: first?.line ?? 1,
      message:
        first === undefined
          ? `no import of ${DOM_ENTRY}`
          : `the first import is ${first.specifier}, not ${DOM_ENTRY}`,
    },
  ];
}

const MOTION = new RegExp(
  String.raw`(?<![\w-])(transition|transition-property|transition-duration|transition-delay|animation|animation-name|animation-duration|animation-delay)\s*:([^;{}]*)`,
  "g",
);
const wordSet = (list: string): ReadonlySet<string> => new Set(list.split(" "));
const MOTION_PROPERTIES = wordSet(
  "opacity transform color background-color border-color outline-color",
);
const TIMING = wordSet(
  "ease ease-in ease-out ease-in-out linear step-start step-end",
);
const ANIMATION_KEYWORDS = wordSet(
  "infinite normal reverse alternate alternate-reverse forwards backwards both running paused",
);
const TRANSITION_KEYWORDS = wordSet("normal allow-discrete");
const TIME = /^[+-]?(?:\d+\.?\d*|\.\d+)m?s$/;
const TOKEN = /[\w-]+\([^()]*\)|[^\s,()]+/g;

/** What is wrong with one token of a motion declaration's value; null when it is allowed. */
function motionToken(property: string, token: string): string | null {
  if (TIME.test(token))
    return `${property} takes ${token}, not a var(--dur-…) token`;
  if (/^var\(\s*--(?:dur|curve)-/.test(token)) return null;
  if (token.startsWith("var("))
    return `${property} takes ${token}, not a motion token`;
  if (/^(?:cubic-bezier|steps|linear)\(/.test(token) || TIMING.has(token))
    return null;
  if (token === "none" || /^\d+(?:\.\d+)?$/.test(token)) return null;
  const allowed = property.startsWith("transition")
    ? MOTION_PROPERTIES.has(token) || TRANSITION_KEYWORDS.has(token)
    : ANIMATION_KEYWORDS.has(token);
  return allowed ? null : `${property} names ${token}`;
}

function motion(source: Source): Finding[] {
  if (!source.file.endsWith(".css") || source.file.includes(STOCK_DIR))
    return [];
  const { text } = source.masked;
  return [...text.matchAll(MOTION)].flatMap((m) =>
    [...(m[2] ?? "").replace(/!\s*important/g, "").matchAll(TOKEN)]
      .map(([token]) => motionToken(m[1] ?? "", token))
      .filter((problem) => problem !== null)
      .map((message) => ({ line: lineAt(text, m.index), message })),
  );
}

const CHECKS: Readonly<Record<UiRule, (source: Source) => Finding[]>> = {
  "store-private": storePrivate,
  "editor-reach": editorReach,
  "storage-direct": storageDirect,
  "platform-direct": platformDirect,
  "no-view-transition": noViewTransition,
  "literal-text": literalText,
  "dom-first": domFirst,
  motion,
};

const isPreExisting = (file: string, rule: UiRule): boolean =>
  PRE_EXISTING.some((entry) => entry.file === file && entry.rule === rule);

/** Every break of an interface rule under `root`, by file, then by line; empty when there is none. */
export async function checkUiRules(root: string): Promise<UiViolation[]> {
  const files = (await Array.fromAsync(SOURCES.scan({ cwd: root })))
    .map((path) => path.replaceAll("\\", "/"))
    .toSorted();
  const violations: UiViolation[] = [];
  for (const file of files) {
    const text = await Bun.file(join(root, file)).text();
    const source: Source = { file, text, masked: mask(text) };
    const found = UI_RULES.filter((rule) => !isPreExisting(file, rule)).flatMap(
      (rule) =>
        CHECKS[rule](source).map((finding) => ({ file, rule, ...finding })),
    );
    violations.push(...found.toSorted((a, b) => a.line - b.line));
  }
  return violations;
}
