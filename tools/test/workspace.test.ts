import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RULES } from "../boundaries.config.ts";

const repoRoot = join(import.meta.dir, "..", "..");

interface Manifest {
  name: string;
  version?: string;
  private?: boolean;
  type?: string;
  packageManager?: string;
  workspaces?: { packages: string[]; catalog: Record<string, string> };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");
const manifestAt = (dir: string) =>
  JSON.parse(read(join(dir, "package.json"))) as Manifest;

/** The directory of the workspace `key`: `packages/<key>`, `apps/<key>` or `<key>`. */
function dirOf(key: string): string {
  const dir = [`packages/${key}`, `apps/${key}`, key].find((candidate) =>
    existsSync(join(repoRoot, candidate, "package.json")),
  );
  if (dir === undefined)
    throw new Error(`no directory holds the workspace ${key}`);
  return dir;
}

test("the root pins Bun and lists the workspaces", () => {
  const root = manifestAt(".");
  expect(root.packageManager).toBe("bun@1.4.4");
  expect(root.workspaces?.packages).toEqual([
    "packages/*",
    "apps/*",
    "bench",
    "e2e",
    "tools",
  ]);
});

test("every catalog entry is an exact version", () => {
  for (const [name, version] of Object.entries(
    manifestAt(".").workspaces!.catalog,
  ))
    expect({ name, version }).toEqual({
      name,
      version: expect.stringMatching(new RegExp("^\\d+\\.\\d+\\.\\d+$")),
    });
});

test("every catalog entry is declared by some workspace", () => {
  const declared = new Set(
    [".", ...Object.keys(RULES.workspaces).map(dirOf)].flatMap((dir) => {
      const m = manifestAt(dir);
      return Object.keys({ ...m.dependencies, ...m.devDependencies });
    }),
  );
  expect(
    Object.keys(manifestAt(".").workspaces!.catalog).filter(
      (name) => !declared.has(name),
    ),
  ).toEqual([]);
});

test("a package or app declares exactly the internal packages its rule lists", () => {
  for (const [key, rule] of Object.entries(RULES.workspaces)) {
    if (rule.internal === "*") continue;
    const m = manifestAt(dirOf(key));
    const declared = Object.keys({ ...m.dependencies })
      .filter((name) => name.startsWith("@manent/"))
      .toSorted();
    expect({ key, declared }).toEqual({
      key,
      declared: rule.internal
        .filter((to) => to !== "testkit")
        .map((to) => `@manent/${to}`)
        .toSorted(),
    });
  }
});

test("tooling declares every package", () => {
  const packages = Object.keys(RULES.workspaces)
    .filter((key) => dirOf(key) === `packages/${key}`)
    .map((key) => `@manent/${key}`)
    .toSorted();
  for (const [dir, field] of [
    ["bench", "dependencies"],
    ["tools", "dependencies"],
    ["e2e", "devDependencies"],
  ] as const)
    expect({
      dir,
      declared: Object.keys({ ...manifestAt(dir)[field] })
        .filter((n) => n.startsWith("@manent/"))
        .toSorted(),
    }).toEqual({ dir, declared: packages });
});

const firstLine = (key: string) =>
  read(`packages/${key}/src/index.ts`).split("\n")[0];

test("each new package says what it is for in its first line", () => {
  expect(firstLine("settings")).toBe(
    "// The typed settings registry: definitions, validation, resolution and the store.",
  );
  expect(firstLine("commands")).toBe(
    "// The command registry: definitions, context, key bindings and the service.",
  );
  expect(firstLine("client-web")).toBe(
    "// Browser drivers for the sync client: WebSocket, IndexedDB, Web Locks and BroadcastChannel.",
  );
  expect(firstLine("crdt-binding")).toBe(
    "// The binding between the CRDT and ProseMirror, so that no CRDT type reaches the editor.",
  );
  expect(firstLine("demo")).toBe(
    "// Demo people and workspaces, the demo sign-in, the Tour and the seed.",
  );
});

test("minimumReleaseAge is three days in integer seconds", () => {
  const bunfig = read("bunfig.toml");
  expect(
    (Bun.TOML.parse(bunfig) as { install: { minimumReleaseAge: number } })
      .install.minimumReleaseAge,
  ).toBe(259200);
});

test("every workspace is private, ESM and named @manent/<dir>", () => {
  for (const key of Object.keys(RULES.workspaces)) {
    const dir = dirOf(key);
    const m = manifestAt(dir);
    const name = dir.split("/").at(-1);
    expect({ dir, name: m.name, private: m.private, type: m.type }).toEqual({
      dir,
      name: `@manent/${name}`,
      private: true,
      type: "module",
    });
  }
});

test("every package's entry imports cleanly", async () => {
  for (const [key, rule] of Object.entries(RULES.workspaces))
    if (rule.importable !== "never")
      await import(join(repoRoot, dirOf(key), "src", "index.ts"));
});

test("line endings are LF on every system", () => {
  expect(read(".gitattributes")).toContain("* text=auto eol=lf");
});

test("each Make target wraps bun run", () => {
  const makefile = read("Makefile");
  for (const t of ["demo", "desktop", "reset", "test", "bench", "stop"])
    expect(makefile).toMatch(new RegExp(`^${t}:.*\\n\\t.*bun run ${t}`, "m"));
});

// a script declared before the file it runs exists is reached by neither verify nor a Make target, so it is not checked
test("every file a root script runs exists", () => {
  const { scripts } = JSON.parse(read("package.json")) as {
    scripts: Record<string, string>;
  };
  const reached = new Set<string>();
  // verify and the Make targets
  const waiting = [
    "verify",
    "demo",
    "desktop",
    "reset",
    "test",
    "bench",
    "stop",
  ];
  for (let name = waiting.pop(); name !== undefined; name = waiting.pop()) {
    if (reached.has(name)) continue;
    reached.add(name);
    for (const [, next] of scripts[name]!.matchAll(
      new RegExp("\\bbun run ([a-z][\\w:-]*)", "g"),
    ))
      waiting.push(next!);
  }
  const files = new Set(
    [...reached].flatMap((name) =>
      [...scripts[name]!.matchAll(new RegExp("\\bbun (\\S+\\.ts)", "g"))].map(
        (m) => m[1]!,
      ),
    ),
  );
  // a script added later joins without editing this test
  expect([...files]).toEqual(
    expect.arrayContaining([
      "apps/web/build.ts",
      "bench/run.ts",
      "tools/check-boundaries.ts",
      "tools/check-tour.ts",
      "tools/check-tracked.ts",
      "tools/demo/cli.ts",
    ]),
  );
  for (const file of files)
    expect({ file, exists: existsSync(join(repoRoot, file)) }).toEqual({
      file,
      exists: true,
    });
});
