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

test("every catalog entry is an exact version, except the two that follow a major", () => {
  const RANGES: Record<string, string> = {
    typescript: "^7",
    "lucide-react": "^1",
  };
  for (const [name, version] of Object.entries(
    manifestAt(".").workspaces!.catalog,
  ))
    expect({ name, version }).toEqual({
      name,
      version:
        RANGES[name] ??
        expect.stringMatching(new RegExp("^\\d+\\.\\d+\\.\\d+$")),
    });
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
