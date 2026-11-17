import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

const PACKAGES = [
  "schema",
  "pagination",
  "revisions",
  "crdt",
  "sync-protocol",
  "sync-client",
  "storage",
  "server-core",
  "local-node",
  "formats",
  "editor",
  "ui",
  "testkit",
  "perf",
];
const WORKSPACES = [
  ...PACKAGES.map((p) => `packages/${p}`),
  "apps/web",
  "apps/server",
  "apps/desktop",
  "bench",
  "e2e",
  "tools",
];

const PINNED = {
  typescript: "^7",
  "@types/bun": "1.4.4",
  "prosemirror-model": "1.25.13",
  "prosemirror-state": "1.4.4",
  "prosemirror-view": "1.42.9",
  "prosemirror-transform": "1.12.5",
  "prosemirror-keymap": "1.2.3",
  "prosemirror-commands": "1.7.2",
  "prosemirror-inputrules": "1.6.0",
  "prosemirror-gapcursor": "1.4.1",
  "prosemirror-search": "1.1.1",
  "prosemirror-changeset": "2.4.6",
  yjs: "13.6.33",
  "y-prosemirror": "1.3.7",
  "y-protocols": "1.0.7",
  lib0: "0.2.120",
  react: "19.3.1",
  "react-dom": "19.3.1",
  "@types/react": "19.3.0",
  "@types/react-dom": "19.3.0",
  "@base-ui/react": "1.9.0",
  tailwindcss: "4.3.5",
  "bun-plugin-tailwind": "0.1.2",
  zustand: "5.1.0",
  "@tanstack/react-router": "1.170.46",
  "@tanstack/react-query": "5.107.1",
  "@tanstack/react-virtual": "3.14.26",
  "@tanstack/react-table": "9.3.1",
  "@tanstack/react-form": "1.33.5",
  "@tanstack/react-hotkeys": "0.27.0",
  "@tanstack/react-pacer": "0.24.1",
  "@dnd-kit/react": "0.5.3",
  "lucide-react": "^1",
  sonner: "2.0.8",
  "react-resizable-panels": "4.24.0",
  serwist: "9.5.14",
  pdfkit: "0.20.2",
  inkjs: "2.4.0",
  "@fontsource/courier-prime": "5.3.0",
  "fast-check": "4.10.2",
  "@playwright/test": "1.65.1",
  tinybench: "6.2.3",
  oxlint: "1.93.0",
  electrobun: "2.0.6",
  electron: "45.3.3",
};

interface Manifest {
  name: string;
  version?: string;
  private?: boolean;
  type?: string;
  exports?: unknown;
  packageManager?: string;
  workspaces?: { packages: string[]; catalog: Record<string, string> };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");
const manifestAt = (dir: string) =>
  JSON.parse(read(join(dir, "package.json"))) as Manifest;
const manifest = (pkg: string) => manifestAt(`packages/${pkg}`);
const entryPath = (pkg: string) =>
  join(repoRoot, "packages", pkg, "src", "index.ts");

test("the root pins Bun and the catalog holds every pinned version", () => {
  const root = manifestAt(".");
  expect(root.packageManager).toBe("bun@1.4.4");
  expect(root.workspaces?.packages).toEqual([
    "packages/*",
    "apps/*",
    "bench",
    "e2e",
    "tools",
  ]);
  expect(root.workspaces?.catalog).toMatchObject(PINNED);
});

test("minimumReleaseAge is three days in integer seconds", () => {
  const bunfig = read("bunfig.toml");
  expect(
    (Bun.TOML.parse(bunfig) as { install: { minimumReleaseAge: number } })
      .install.minimumReleaseAge,
  ).toBe(259200);
});

test("every workspace is private, ESM and named @manent/<dir>", () => {
  for (const dir of WORKSPACES) {
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

test("every package has exactly one public entry that imports cleanly", async () => {
  for (const p of PACKAGES) {
    expect(manifest(p).exports).toEqual({ ".": "./src/index.ts" });
    await import(entryPath(p));
  }
});

test("external versions come from the catalog, internal ones from the workspace", () => {
  for (const dir of [".", ...WORKSPACES]) {
    const m = manifestAt(dir);
    for (const deps of [m.dependencies, m.devDependencies]) {
      for (const [name, version] of Object.entries(deps ?? {})) {
        const expected = name.startsWith("@manent/")
          ? "workspace:*"
          : "catalog:";
        expect({ dir, name, version }).toEqual({
          dir,
          name,
          version: expected,
        });
      }
    }
  }
});

test("line endings are LF on every system", () => {
  expect(read(".gitattributes")).toContain("* text=auto eol=lf");
});

test("each Make target wraps bun run", () => {
  const makefile = read("Makefile");
  for (const t of ["demo", "desktop", "reset", "test", "bench", "stop"])
    expect(makefile).toMatch(new RegExp(`^${t}:.*\\n\\t.*bun run ${t}`, "m"));
});
