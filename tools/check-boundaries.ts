// Checks the monorepo's import boundaries by reading the source as text, so
// that `import type` stays visible. Limits of the masker: regular-expression
// literals and JSX text are not understood, a template literal is one string up
// to its closing backtick, and a specifier must be a string literal.
import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import {
  FORBIDDEN_GLOBALS,
  INTERNAL,
  NEVER_IMPORTED,
  NO_BUN,
  PURE,
  PURE_EXTERNAL,
  RESTRICTED_EXTERNAL,
  TYPES_ONLY,
} from "./boundaries.config.ts";

export type Rule =
  | "allow-list"
  | "types-only"
  | "pure"
  | "no-bun"
  | "deep-import"
  | "app-import"
  | "restricted-external"
  | "undeclared"
  | "single-entry"
  | "catalog";

export interface Violation {
  file: string;
  line: number;
  rule: Rule;
  message: string;
}

interface Workspace {
  /** The name after `@manent/`, which is also the key in the config. */
  key: string;
  /** Repo-relative directory, without a trailing slash. */
  dir: string;
  manifest: Manifest;
  manifestText: string;
  /** Matched by a `dir/*` glob: only `src/` and `test/` hold its code. */
  grouped: boolean;
}

interface Manifest {
  name?: string;
  exports?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface Import {
  specifier: string;
  line: number;
  typeOnly: boolean;
}

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;
const SCOPE = "@manent/";
const ENTRY = { ".": "./src/index.ts" };

/** `file` relative to `root`, with forward slashes, whatever the system. */
export function toRepoPath(root: string, file: string): string {
  const base = root.replaceAll("\\", "/").replace(/\/+$/, "");
  let path = file.replaceAll("\\", "/");
  if (path.startsWith(base + "/")) path = path.slice(base.length + 1);
  return path.replace(/^(\.\/)+/, "");
}

/** Blanks comments and the contents of strings, keeping every offset and newline. */
function mask(source: string): { text: string; strings: Map<number, string> } {
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
      String.raw`\b(?:import|export)\b([\w$\s{},*]*?)\bfrom\s*` + QUOTE,
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

const names = FORBIDDEN_GLOBALS.join("|");
const GLOBAL_USES = [
  new RegExp(String.raw`(?<![\w$.])(?:${names})(?=[.[(])`, "g"),
  new RegExp(String.raw`\bglobalThis\s*\.\s*(?:${names})\b`, "g"),
];

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let k = 0; k < offset; k++) if (text.charCodeAt(k) === 10) line++;
  return line;
}

function findImports(masked: {
  text: string;
  strings: Map<number, string>;
}): Import[] {
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

function findGlobals(text: string): { name: string; line: number }[] {
  return GLOBAL_USES.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((m) => ({
      name: m[0],
      line: lineAt(text, m.index),
    })),
  );
}

/** The package an external specifier names: `lib0/encoding` is `lib0`. */
function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : (parts[0] ?? specifier);
}

const isBuiltin = (specifier: string) =>
  specifier === "bun" ||
  specifier.startsWith("bun:") ||
  specifier.startsWith("node:");

const isTestFile = (path: string) =>
  path.split("/").includes("test") || /\.(test\.tsx?|e2e\.ts)$/.test(path);

const includes = (list: readonly string[], value: string) =>
  list.includes(value);

function declared(ws: Workspace, name: string): boolean {
  return DEPENDENCY_FIELDS.some(
    (field) => ws.manifest[field]?.[name] !== undefined,
  );
}

function lineOf(text: string, needle: string): number {
  const index = text.indexOf(needle);
  return index === -1 ? 1 : lineAt(text, index);
}

async function findWorkspaces(root: string): Promise<Workspace[]> {
  const rootManifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  ) as {
    workspaces?: { packages?: string[] } | string[];
  };
  const globs = Array.isArray(rootManifest.workspaces)
    ? rootManifest.workspaces
    : (rootManifest.workspaces?.packages ?? []);
  const workspaces: Workspace[] = [];
  for (const glob of globs) {
    for await (const path of new Bun.Glob(`${glob}/package.json`).scan({
      cwd: root,
    })) {
      const dir = posix.dirname(toRepoPath(root, join(root, path)));
      const manifestText = await readFile(
        join(root, dir, "package.json"),
        "utf8",
      );
      const manifest = JSON.parse(manifestText) as Manifest;
      const key = manifest.name?.startsWith(SCOPE)
        ? manifest.name.slice(SCOPE.length)
        : posix.basename(dir);
      workspaces.push({
        key,
        dir,
        manifest,
        manifestText,
        grouped: glob.includes("*"),
      });
    }
  }
  return workspaces.toSorted((a, b) => a.dir.localeCompare(b.dir));
}

async function sourceFiles(root: string, ws: Workspace): Promise<string[]> {
  const pattern = ws.grouped ? "{src,test}/**/*.{ts,tsx}" : "**/*.{ts,tsx}";
  const files: string[] = [];
  for await (const path of new Bun.Glob(pattern).scan({
    cwd: join(root, ws.dir),
  })) {
    const repoPath = toRepoPath(root, join(root, ws.dir, path));
    if (!repoPath.split("/").includes("node_modules")) files.push(repoPath);
  }
  return files.toSorted();
}

function checkManifest(ws: Workspace): Violation[] {
  const file = `${ws.dir}/package.json`;
  const violations: Violation[] = [];
  if (
    !includes(NEVER_IMPORTED, ws.key) &&
    !Bun.deepEquals(ws.manifest.exports, ENTRY)
  ) {
    violations.push({
      file,
      line: lineOf(ws.manifestText, '"exports"'),
      rule: "single-entry",
      message: `exports must be exactly { ".": "./src/index.ts" }`,
    });
  }
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, version] of Object.entries(ws.manifest[field] ?? {})) {
      const expected = name.startsWith(SCOPE) ? "workspace:*" : "catalog:";
      if (version === expected) continue;
      violations.push({
        file,
        line: lineOf(ws.manifestText, `"${name}":`),
        rule: "catalog",
        message: `${name} must be "${expected}", not "${version}"`,
      });
    }
  }
  return violations;
}

function checkImport(
  file: string,
  ws: Workspace,
  imp: Import,
  workspaces: readonly Workspace[],
): Omit<Violation, "file" | "line"> | undefined {
  const { specifier } = imp;
  const self = `${SCOPE}${ws.key}`;
  const test = isTestFile(file);

  if (specifier.startsWith(".")) {
    const target = posix.normalize(posix.join(posix.dirname(file), specifier));
    const owner = workspaces.find(
      (w) => target === w.dir || target.startsWith(w.dir + "/"),
    );
    if (!owner || owner === ws) return undefined;
    if (includes(NEVER_IMPORTED, owner.key))
      return {
        rule: "app-import",
        message: `${specifier} reaches into ${SCOPE}${owner.key}, which is never imported`,
      };
    return {
      rule: "deep-import",
      message: `${specifier} reaches into ${SCOPE}${owner.key}; import it by name`,
    };
  }

  if (specifier.startsWith(SCOPE)) {
    const [key = "", ...rest] = specifier.slice(SCOPE.length).split("/");
    const target = `${SCOPE}${key}`;
    if (includes(NEVER_IMPORTED, key))
      return { rule: "app-import", message: `${target} is never imported` };
    if (rest.length > 0)
      return {
        rule: "deep-import",
        message: `import ${target}, not ${specifier}: a package has one entry`,
      };
    if (test) return undefined;
    const allowed = INTERNAL[ws.key] ?? [];
    const isPackage = workspaces.some((w) => w.key === key);
    if (allowed === "*" ? !isPackage : !allowed.includes(key))
      return {
        rule: "allow-list",
        message: `${self} may not import ${target}`,
      };
    if (
      !imp.typeOnly &&
      TYPES_ONLY.some(([from, to]) => from === ws.key && to === key)
    )
      return {
        rule: "types-only",
        message: `${self} may import only types from ${target}: write import type`,
      };
    if (!declared(ws, target))
      return {
        rule: "undeclared",
        message: `${target} is not declared in ${ws.dir}/package.json`,
      };
    return undefined;
  }

  if (test) return undefined;

  if (isBuiltin(specifier)) {
    if (includes(PURE, ws.key))
      return {
        rule: "pure",
        message: `${self} is pure and may not import ${specifier}`,
      };
    if (includes(NO_BUN, ws.key))
      return {
        rule: "no-bun",
        message: `${self} runs in a browser and may not import ${specifier}`,
      };
    return undefined;
  }

  const name = packageName(specifier);
  const homes = RESTRICTED_EXTERNAL[name];
  if (homes && !homes.includes(ws.key))
    return {
      rule: "restricted-external",
      message: `only ${homes.map((h) => SCOPE + h).join(", ")} may import ${name}`,
    };
  if (
    includes(PURE, ws.key) &&
    !PURE_EXTERNAL[ws.key as (typeof PURE)[number]].includes(name)
  )
    return {
      rule: "allow-list",
      message: `${self} is pure and may not import ${name}`,
    };
  if (!declared(ws, name))
    return {
      rule: "undeclared",
      message: `${name} is not declared in ${ws.dir}/package.json`,
    };
  return undefined;
}

async function scan(
  root: string,
): Promise<{ files: number; violations: Violation[] }> {
  const workspaces = await findWorkspaces(root);
  const violations: Violation[] = [];
  let files = 0;
  for (const ws of workspaces) {
    violations.push(...checkManifest(ws));
    for (const file of await sourceFiles(root, ws)) {
      files++;
      const masked = mask(await readFile(join(root, file), "utf8"));
      for (const imp of findImports(masked)) {
        const found = checkImport(file, ws, imp, workspaces);
        if (found) violations.push({ file, line: imp.line, ...found });
      }
      if (includes(PURE, ws.key) && !isTestFile(file)) {
        for (const use of findGlobals(masked.text)) {
          violations.push({
            file,
            line: use.line,
            rule: "pure",
            message: `${SCOPE}${ws.key} is pure and may not use ${use.name}`,
          });
        }
      }
    }
  }
  const sorted = violations.toSorted((a, b) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1,
  );
  return { files, violations: sorted };
}

/** Every boundary violation in the repository at `root`. */
export async function checkBoundaries(root: string): Promise<Violation[]> {
  return (await scan(root)).violations;
}

if (import.meta.main) {
  const { files, violations } = await scan(process.cwd());
  for (const v of violations)
    console.log(`${v.file}:${v.line} ${v.rule} ${v.message}`);
  if (violations.length > 0) process.exit(1);
  console.log(`boundaries: 0 violations in ${files} files`);
}
