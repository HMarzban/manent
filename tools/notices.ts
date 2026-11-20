// The licence notices of the third-party code that ships: bun tools/notices.ts <out-file> writes them,
// and exits 1, naming each package, when one has no licence text.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** What ships: the web build, the embedded server, the shell. */
export const BUNDLED_FROM = [
  "apps/web",
  "apps/server",
  "apps/desktop",
] as const;

export interface BundledPackage {
  name: string;
  version: string;
  /** The package's folder in the isolated linker's store. */
  dir: string;
}

/** `licence` is the package.json "license", or SPDX's NOASSERTION when it names none. */
export interface NoticeEntry {
  name: string;
  version: string;
  licence: string;
  texts: string[];
}

/** Notices for data that no package carries; `path` is from the repository root. */
export const EXTRA_NOTICES: readonly { title: string; path: string }[] = [
  {
    title: "Unicode Character Database 15.0.0",
    path: "tools/notices/unicode-license-v3.txt",
  },
];

/** The toolkit's own notices, which the desktop build adds when they are present. */
export const DESKTOP_NOTICES = [
  "chromium-credits.html",
  "cef-license.txt",
  "bun-license.txt",
  "electrobun-license.txt",
] as const;

const HEADER =
  "Manent includes the following software from others. Each is listed with its licence.";
const LICENCE_FILE = /^(license|licence|copying|notice)(\..+)?$/i;
const NO_ASSERTION = "NOASSERTION";
const STORE = "node_modules/.bun";
// licence texts fetched for packages that ship none of their own, as <name>@<version>.txt with "/" as "+"
const SAVED_TEXTS = join(import.meta.dir, "notices/packages");

interface LockPackage {
  name: string;
  version: string;
  /** Set for a workspace: its path in the repository. */
  workspace: string | null;
  deps: string[];
}

interface Lock {
  workspaces: ReadonlyMap<string, { name: string; deps: string[] }>;
  packages: ReadonlyMap<string, LockPackage>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const keysOf = (value: unknown): string[] =>
  isRecord(value) ? Object.keys(value) : [];

/** The names a lock entry needs at run time: its dependencies and its peers that are not optional. */
function runtimeDeps(meta: unknown): string[] {
  if (!isRecord(meta)) return [];
  const optional = Array.isArray(meta.optionalPeers) ? meta.optionalPeers : [];
  return [
    ...keysOf(meta.dependencies),
    ...keysOf(meta.peerDependencies).filter((name) => !optional.includes(name)),
  ];
}

function readLockPackage(key: string, value: unknown): LockPackage {
  const [id, , meta]: unknown[] = Array.isArray(value) ? value : [];
  const at = typeof id === "string" ? id.lastIndexOf("@") : -1;
  if (typeof id !== "string" || at < 1)
    throw new TypeError(`bun.lock: the package ${key} has no name@version`);
  const version = id.slice(at + 1);
  const workspace = version.startsWith("workspace:")
    ? version.slice("workspace:".length)
    : null;
  return { name: id.slice(0, at), version, workspace, deps: runtimeDeps(meta) };
}

function readLock(root: string): Lock {
  const lock: unknown = Bun.JSONC.parse(
    readFileSync(join(root, "bun.lock"), "utf8"),
  );
  if (!isRecord(lock) || !isRecord(lock.workspaces) || !isRecord(lock.packages))
    throw new TypeError(`bun.lock in ${root} has no workspaces or packages`);
  const workspaces = new Map<string, { name: string; deps: string[] }>();
  for (const [path, value] of Object.entries(lock.workspaces)) {
    const name = isRecord(value) ? value.name : undefined;
    if (typeof name !== "string")
      throw new TypeError(`bun.lock: the workspace ${path} has no name`);
    workspaces.set(path, { name, deps: runtimeDeps(value) });
  }
  const packages = new Map<string, LockPackage>();
  for (const [key, value] of Object.entries(lock.packages))
    packages.set(key, readLockPackage(key, value));
  return { workspaces, packages };
}

/** What `name` resolves to from `chain` (the key path that reached it): the most nested lock key first, as Bun nests them. */
function resolvePackage(
  lock: Lock,
  chain: readonly string[],
  name: string,
): { path: string[]; entry: LockPackage } {
  for (let depth = chain.length; depth >= 0; depth--) {
    const path = [...chain.slice(0, depth), name];
    const entry = lock.packages.get(path.join("/"));
    if (entry !== undefined) return { path, entry };
  }
  throw new RangeError(`bun.lock resolves no ${name} for ${chain.join("/")}`);
}

/** The folder of `name@version` in the store, whose name may carry a hash of its peers. */
function storeDir(
  root: string,
  folders: readonly string[],
  name: string,
  version: string,
): string {
  const prefix = `${name.replace("/", "+")}@${version}`;
  const folder = folders
    .filter((f) => f === prefix || f.startsWith(`${prefix}+`))
    .toSorted()[0];
  if (folder === undefined)
    throw new RangeError(`${name}@${version} is not installed in ${STORE}`);
  return join(root, STORE, folder, "node_modules", name);
}

function byNameThenVersion(
  a: { name: string; version: string },
  b: { name: string; version: string },
): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return Bun.semver.order(a.version, b.version);
}

/**
 * From bun.lock: the closure of the `dependencies` and `peerDependencies` (never `devDependencies`)
 * of BUNDLED_FROM, through every workspace package they reach; workspaces left out; one entry per
 * name and version; sorted by name, then version. Throws when the lock or the store lacks one.
 */
export function bundledPackages(root: string): BundledPackage[] {
  const lock = readLock(root);
  const found = new Map<string, { name: string; version: string }>();
  const seen = new Set<string>();
  const entered = new Set<string>();
  const queue: { chain: string[]; name: string }[] = [];
  const enterWorkspace = (path: string): void => {
    const workspace = lock.workspaces.get(path);
    if (workspace === undefined)
      throw new RangeError(`bun.lock has no workspace ${path}`);
    if (entered.has(path)) return;
    entered.add(path);
    for (const name of workspace.deps)
      queue.push({ chain: [workspace.name], name });
  };
  for (const path of BUNDLED_FROM) enterWorkspace(path);
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    const { path, entry } = resolvePackage(lock, next.chain, next.name);
    const key = path.join("/");
    if (seen.has(key)) continue;
    seen.add(key);
    if (entry.workspace !== null) {
      enterWorkspace(entry.workspace);
      continue;
    }
    found.set(`${entry.name}@${entry.version}`, entry);
    for (const name of entry.deps) queue.push({ chain: path, name });
  }
  const folders = readdirSync(join(root, STORE));
  return [...found.values()]
    .toSorted(byNameThenVersion)
    .map(({ name, version }) => ({
      name,
      version,
      dir: storeDir(root, folders, name, version),
    }));
}

function readManifest(dir: string): {
  name: string;
  version: string;
  licence: string;
} {
  const manifest: unknown = JSON.parse(
    readFileSync(join(dir, "package.json"), "utf8"),
  );
  if (
    !isRecord(manifest) ||
    typeof manifest.name !== "string" ||
    typeof manifest.version !== "string"
  )
    throw new TypeError(`${dir}/package.json names no package and version`);
  const { name, version, license } = manifest;
  return {
    name,
    version,
    licence: typeof license === "string" ? license : NO_ASSERTION,
  };
}

/**
 * The files in `dir` named LICENSE, LICENCE, COPYING or NOTICE (any case, any extension), sorted,
 * as text; then the text saved under tools/notices/packages/ for the package, when there is one.
 */
export function licenceTexts(dir: string): string[] {
  const own = readdirSync(dir, { withFileTypes: true })
    .filter((file) => file.isFile() && LICENCE_FILE.test(file.name))
    .map((file) => file.name)
    .toSorted()
    .map((file) => readFileSync(join(dir, file), "utf8"));
  const { name, version } = readManifest(dir);
  const saved = join(SAVED_TEXTS, `${name.replace("/", "+")}@${version}.txt`);
  return existsSync(saved) ? [...own, readFileSync(saved, "utf8")] : own;
}

/** Every bundled package with its licence texts; `missing` names, as "<name>@<version>", those with none. */
export function collectNotices(root: string): {
  entries: NoticeEntry[];
  missing: string[];
} {
  const entries: NoticeEntry[] = [];
  const missing: string[] = [];
  for (const { name, version, dir } of bundledPackages(root)) {
    const texts = licenceTexts(dir);
    if (texts.length === 0) missing.push(`${name}@${version}`);
    else
      entries.push({
        name,
        version,
        licence: readManifest(dir).licence,
        texts,
      });
  }
  return { entries, missing };
}

/** A heading line, then each text with "\n" line ends, an empty line between each. */
const section = (title: string, texts: readonly string[]): string =>
  [
    `==== ${title} ====`,
    ...texts.map((text) => text.replaceAll(/\r\n?/g, "\n").trimEnd()),
  ].join("\n\n");

/** The notices file: the header, each entry, then each extra. Nothing varies between runs over one lock file. */
export function renderNotices(
  entries: readonly NoticeEntry[],
  extras: readonly { title: string; text: string }[],
): string {
  const sections = [
    ...entries.map((e) =>
      section(`${e.name} ${e.version} (${e.licence})`, e.texts),
    ),
    ...extras.map((extra) => section(extra.title, [extra.text])),
  ];
  return `${[HEADER, ...sections].join("\n\n")}\n`;
}

/** Collects, renders and writes the notices; throws a RangeError naming every bundled package without a licence text. */
export function writeNotices(
  outFile: string,
  root: string = process.cwd(),
): void {
  const { entries, missing } = collectNotices(root);
  if (missing.length > 0)
    throw new RangeError(`no licence text for ${missing.join(", ")}`);
  const extras = EXTRA_NOTICES.map(({ title, path }) => ({
    title,
    text: readFileSync(join(root, path), "utf8"),
  }));
  writeFileSync(outFile, renderNotices(entries, extras));
}

/** `webNotices` followed by each DESKTOP_NOTICES file present in `dir`, in that order; `missing` names the absent ones. */
export function desktopNotices(
  webNotices: string,
  dir: string,
): { text: string; missing: string[] } {
  const present = DESKTOP_NOTICES.filter((name) => existsSync(join(dir, name)));
  const sections = present.map((name) =>
    section(name, [readFileSync(join(dir, name), "utf8")]),
  );
  return {
    text: `${[webNotices.trimEnd(), ...sections].join("\n\n")}\n`,
    missing: DESKTOP_NOTICES.filter((name) => !present.includes(name)),
  };
}

if (import.meta.main) {
  const outFile = process.argv[2];
  if (outFile === undefined) {
    console.error("usage: bun tools/notices.ts <out-file>");
    process.exit(1);
  }
  try {
    writeNotices(outFile);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}
