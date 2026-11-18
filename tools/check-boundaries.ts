// Checks the monorepo's import boundaries against a table of rules, one row per workspace.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, posix, sep } from "node:path";
import { RULES } from "./boundaries.config.ts";
import type { BoundaryRules, WorkspaceRule } from "./boundaries.config.ts";
import {
  findGlobals,
  findImports,
  findInlineTypes,
  mask,
} from "./source-scan.ts";
import type { Import } from "./source-scan.ts";

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
  | "catalog"
  | "no-rule"
  | "testing-entry"
  | "test-code"
  | "zone"
  | "inline-type";

export interface Violation {
  file: string;
  line: number;
  rule: Rule;
  message: string;
}

type Located = Omit<Violation, "file">;
type Finding = Omit<Located, "line">;

interface Manifest {
  name: string | null;
  exports: unknown;
  /** Every entry of every dependency field, as `[name, version]`. */
  dependencies: readonly (readonly [string, unknown])[];
}

interface Workspace {
  /** The name after `@manent/`, which is also the key of its row. */
  key: string;
  /** Repository-relative directory, without a trailing slash. */
  dir: string;
  manifest: Manifest;
  manifestText: string;
  /** Matched by a `dir/*` glob: only `src/` and `test/` hold its code. */
  grouped: boolean;
}

/** A source file and everything that decides its rules. */
interface Source {
  /** Repository-relative path. */
  file: string;
  /** Path relative to the workspace's directory. */
  local: string;
  ws: Workspace;
  row: WorkspaceRule;
  code: "product" | "test";
  rules: BoundaryRules;
  workspaces: readonly Workspace[];
}

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;
const SCOPE = "@manent/";
const MAIN_ENTRY = "./src/index.ts";
const TEST_ENTRIES = ["testing", "dom"];
const TEST_FOLDERS = ["test/", "src/testing/"];
const STYLESHEET_ENTRY = new RegExp("^\\./([^/]+)\\.css$");
const TEST_FILE = new RegExp("\\.(test\\.tsx?|e2e\\.ts)$");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** Under `test/` or `src/testing/`, given a workspace-relative path. */
const isTestFolder = (local: string) =>
  TEST_FOLDERS.some((folder) => `${local}/`.startsWith(folder));

const isBuiltin = (specifier: string) =>
  specifier === "bun" ||
  specifier.startsWith("bun:") ||
  specifier.startsWith("node:");

const finding = (rule: Rule, message: string): Finding => ({ rule, message });
const INLINE_TYPE = finding(
  "inline-type",
  "a type needs its own import type or export type statement",
);

/** The package an external specifier names: `lib0/encoding` is `lib0`. */
function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : (parts[0] ?? specifier);
}

/** The line `needle` first appears on, or 1. */
const lineOf = (text: string, needle: string) =>
  text.slice(0, Math.max(0, text.indexOf(needle))).split("\n").length;

function readManifest(text: string, file: string): Manifest {
  const raw: unknown = JSON.parse(text);
  if (!isRecord(raw)) throw new TypeError(`${file} is not a JSON object`);
  return {
    name: typeof raw.name === "string" ? raw.name : null,
    exports: raw.exports,
    dependencies: DEPENDENCY_FIELDS.flatMap((field) => {
      const entries = raw[field];
      return isRecord(entries) ? Object.entries(entries) : [];
    }),
  };
}

const declared = (ws: Workspace, name: string) =>
  ws.manifest.dependencies.some(([dependency]) => dependency === name);

async function findWorkspaces(root: string): Promise<Workspace[]> {
  const text = await readFile(join(root, "package.json"), "utf8");
  const raw: unknown = JSON.parse(text);
  const listed = isRecord(raw) ? raw.workspaces : null;
  const globs = isRecord(listed) ? listed.packages : listed;
  if (!isStringList(globs))
    throw new TypeError("package.json must list its workspaces");
  const workspaces: Workspace[] = [];
  for (const glob of globs) {
    const found = new Bun.Glob(`${glob}/package.json`).scan({ cwd: root });
    for await (const path of found) {
      const file = path.split(sep).join("/");
      const dir = posix.dirname(file);
      const manifestText = await readFile(join(root, file), "utf8");
      const manifest = readManifest(manifestText, file);
      const key = manifest.name?.startsWith(SCOPE)
        ? manifest.name.slice(SCOPE.length)
        : posix.basename(dir);
      const grouped = glob.includes("*");
      workspaces.push({ key, dir, manifest, manifestText, grouped });
    }
  }
  return workspaces.toSorted((a, b) => a.dir.localeCompare(b.dir));
}

/** Workspace-relative paths of the workspace's source files. */
async function sourceFiles(root: string, ws: Workspace): Promise<string[]> {
  const pattern = ws.grouped ? "{src,test}/**/*.{ts,tsx}" : "**/*.{ts,tsx}";
  const files: string[] = [];
  const found = new Bun.Glob(pattern).scan({ cwd: join(root, ws.dir) });
  for await (const path of found) {
    const local = path.split(sep).join("/");
    if (!local.split("/").includes("node_modules")) files.push(local);
  }
  return files.toSorted();
}

/** What `key` of `exports` must point to for this row, or null when the row may not have it. */
function entryTarget(key: string, row: WorkspaceRule): string | null {
  if (key === "./testing") return "./src/testing/index.ts";
  if (key === "./dom" && row.layer === "tooling") return "./src/dom.ts";
  const stylesheet = STYLESHEET_ENTRY.exec(key);
  return stylesheet ? `./src/${stylesheet[1]}.css` : null;
}

function entryProblem(
  root: string,
  ws: Workspace,
  row: WorkspaceRule,
): string | null {
  const { exports } = ws.manifest;
  if (!isRecord(exports) || exports["."] !== MAIN_ENTRY)
    return `exports must map "." to "${MAIN_ENTRY}"`;
  for (const [key, value] of Object.entries(exports)) {
    if (key === ".") continue;
    const target = entryTarget(key, row);
    if (target === null || value !== target)
      return `exports may not map ${key} to ${JSON.stringify(value)}`;
    if (!existsSync(join(root, ws.dir, target)))
      return `exports maps ${key} to ${target}, which does not exist`;
  }
  return null;
}

function checkManifest(
  root: string,
  ws: Workspace,
  row: WorkspaceRule,
): Violation[] {
  const file = `${ws.dir}/package.json`;
  const violations: Violation[] = [];
  const problem =
    row.importable === "never" ? null : entryProblem(root, ws, row);
  if (problem !== null) {
    const line = lineOf(ws.manifestText, '"exports"');
    violations.push({ file, line, rule: "single-entry", message: problem });
  }
  for (const [name, version] of ws.manifest.dependencies) {
    const expected = name.startsWith(SCOPE) ? "workspace:*" : "catalog:";
    if (version === expected) continue;
    violations.push({
      file,
      line: lineOf(ws.manifestText, `"${name}":`),
      rule: "catalog",
      message: `${name} must be "${expected}", not ${JSON.stringify(version)}`,
    });
  }
  return violations;
}

function checkRelative(src: Source, { specifier }: Import): Finding | null {
  const target = posix.normalize(
    posix.join(posix.dirname(src.file), specifier),
  );
  const owner = src.workspaces.find(
    (w) => target === w.dir || target.startsWith(`${w.dir}/`),
  );
  if (owner === undefined) return null;
  if (owner !== src.ws) {
    const never = src.rules.workspaces[owner.key]?.importable === "never";
    const reach = `${specifier} reaches into ${SCOPE}${owner.key}`;
    return never
      ? finding("app-import", `${reach}, which is never imported`)
      : finding("deep-import", `${reach}; import it by name`);
  }
  if (src.code === "test" || !isTestFolder(target.slice(owner.dir.length + 1)))
    return null;
  return finding("test-code", `${specifier} is test code`);
}

function checkInternal(src: Source, imp: Import): Finding | null {
  const { specifier } = imp;
  const [key = "", ...rest] = specifier.slice(SCOPE.length).split("/");
  const name = `${SCOPE}${key}`;
  const self = `${SCOPE}${src.ws.key}`;
  const target = src.rules.workspaces[key];
  const tooling = src.row.layer === "tooling";
  const test = src.code === "test";
  const testingEntry = finding(
    "testing-entry",
    `${specifier} is for test code and tooling only`,
  );
  if (target?.importable === "never")
    return finding("app-import", `${name} is never imported`);
  const subpath = rest.join("/");
  if (TEST_ENTRIES.includes(subpath)) {
    if (!test && !tooling) return testingEntry;
    const exports = src.workspaces.find((w) => w.key === key)?.manifest.exports;
    if (isRecord(exports) && `./${subpath}` in exports) return null;
    return finding("deep-import", `${name} has no ./${subpath} entry`);
  }
  if (subpath !== "")
    return finding("deep-import", `import ${name}, not ${specifier}`);
  if (target?.importable === "tests") {
    const fromTesting = src.local.startsWith("src/testing/");
    return tooling || (test && !fromTesting) ? null : testingEntry;
  }
  const { internal, typesOnly } = src.row;
  if (internal === "*" ? target === undefined : !internal.includes(key))
    return finding("allow-list", `${self} may not import ${name}`);
  if (test) return null;
  if (!imp.typeOnly && typesOnly.includes(key))
    return finding("types-only", `${self} may import only types from ${name}`);
  if (!declared(src.ws, name))
    return finding("undeclared", `${name} is not declared by ${self}`);
  return null;
}

function checkExternal(src: Source, { specifier }: Import): Finding | null {
  if (src.code === "test") return null;
  const { ws, row } = src;
  const self = `${SCOPE}${ws.key}`;
  const name = packageName(specifier);
  const homes = src.rules.restrictedExternal[name];
  if (homes !== undefined && !homes.includes(ws.key))
    return finding(
      "restricted-external",
      `only ${homes.map((h) => SCOPE + h).join(", ")} may import ${name}`,
    );
  if (isBuiltin(specifier)) {
    if (row.runtime === "pure")
      return finding("pure", `${self} is pure and may not import ${specifier}`);
    if (row.runtime === "browser")
      return finding("no-bun", `${specifier} is not for a browser`);
    return null;
  }
  if (row.external !== "declared" && !row.external.includes(name))
    return finding("allow-list", `${self} is pure and may not import ${name}`);
  if (!declared(ws, name))
    return finding("undeclared", `${name} is not declared by ${self}`);
  return null;
}

function checkImport(src: Source, imp: Import): Finding | null {
  if (imp.specifier.startsWith(".")) return checkRelative(src, imp);
  if (imp.specifier.startsWith(SCOPE)) return checkInternal(src, imp);
  return checkExternal(src, imp);
}

/** Globals a pure row may not name, and what each zone keeps inside its folders. */
function checkGlobals(
  src: Source,
  text: string,
  imports: readonly Import[],
): Located[] {
  const self = `${SCOPE}${src.ws.key}`;
  const found: Located[] = [];
  const names = [...src.rules.forbiddenGlobals, ...src.row.forbiddenGlobals];
  if (src.row.runtime === "pure")
    for (const { name, line } of findGlobals(text, names))
      found.push({ line, ...finding("pure", `${self} may not use ${name}`) });
  for (const zone of src.rules.zones) {
    if (zone.workspace !== src.ws.key) continue;
    if (zone.only.some((prefix) => src.local.startsWith(prefix))) continue;
    const only = `only ${zone.only.join(", ")} in ${self} may`;
    for (const { name, line } of findGlobals(text, zone.globals))
      found.push({ line, ...finding("zone", `${only} use ${name}`) });
    for (const { specifier, line, typeOnly } of imports)
      if (!typeOnly && zone.values.includes(packageName(specifier)))
        found.push({ line, ...finding("zone", `${only} import ${specifier}`) });
  }
  return found;
}

async function checkFile(root: string, src: Source): Promise<Violation[]> {
  const masked = mask(await readFile(join(root, src.file), "utf8"));
  const imports = findImports(masked);
  const found: Located[] = [];
  for (const imp of imports) {
    const result = checkImport(src, imp);
    if (result !== null) found.push({ line: imp.line, ...result });
  }
  if (src.code === "product")
    found.push(...checkGlobals(src, masked.text, imports));
  for (const line of findInlineTypes(masked.text))
    found.push({ line, ...INLINE_TYPE });
  return found.map((f) => ({ file: src.file, ...f }));
}

async function scan(
  root: string,
  rules: BoundaryRules,
): Promise<{ files: number; violations: Violation[] }> {
  const workspaces = await findWorkspaces(root);
  const violations: Violation[] = [];
  let files = 0;
  for (const ws of workspaces) {
    const row = rules.workspaces[ws.key];
    if (row === undefined) {
      const file = `${ws.dir}/package.json`;
      const message = `${SCOPE}${ws.key} has no row in the boundary rules`;
      violations.push({ file, line: 1, rule: "no-rule", message });
      continue;
    }
    violations.push(...checkManifest(root, ws, row));
    for (const local of await sourceFiles(root, ws)) {
      files++;
      const file = `${ws.dir}/${local}`;
      const test = isTestFolder(local) || TEST_FILE.test(local);
      const code = test ? "test" : "product";
      const src: Source = { file, local, ws, row, code, rules, workspaces };
      violations.push(...(await checkFile(root, src)));
    }
  }
  const sorted = violations.toSorted((a, b) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1,
  );
  return { files, violations: sorted };
}

/** Every boundary violation in the repository at `root`, judged by `rules`. */
export async function checkBoundaries(
  root: string,
  rules: BoundaryRules,
): Promise<Violation[]> {
  return (await scan(root, rules)).violations;
}

if (import.meta.main) {
  const { files, violations } = await scan(process.cwd(), RULES);
  for (const v of violations)
    console.log(`${v.file}:${v.line} ${v.rule} ${v.message}`);
  if (violations.length > 0) process.exit(1);
  console.log(`boundaries: 0 violations in ${files} files`);
}
