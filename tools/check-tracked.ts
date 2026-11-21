// The public tree, as an allow-list, so no tracked file has to name what is private.
export const TRACKED_ROOTS = [
  "packages/",
  "apps/",
  "bench/",
  "e2e/",
  "tools/",
  "types/",
  "spikes/",
  ".github/",
  "site/",
  "docs/architecture/",
  "docs/benchmark/",
  "docs/decisions/",
  "docs/memory/",
] as const;

export const TRACKED_FILES = [
  ".gitignore",
  ".gitattributes",
  ".prettierignore",
  ".oxlintrc.json",
  "package.json",
  "bunfig.toml",
  "bun.lock",
  "tsconfig.base.json",
  "tsconfig.json",
  "Makefile",
  "README.md",
  "LICENSE",
  "NOTICE",
  "CHANGELOG.md",
  "AGENTS.md",
] as const;

const files: ReadonlySet<string> = new Set(TRACKED_FILES);

/** The paths that are in neither list. */
export function untrackable(paths: readonly string[]): string[] {
  return paths.filter(
    (path) =>
      !files.has(path) && !TRACKED_ROOTS.some((dir) => path.startsWith(dir)),
  );
}

async function trackedPaths(root: string): Promise<string[]> {
  const proc = Bun.spawn(["git", "ls-files", "-z"], {
    cwd: root,
    stdout: "pipe",
    stderr: "inherit",
  });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0)
    throw new Error(`git ls-files exited with ${code} in ${root}`);
  return out.split("\0").filter((path) => path !== "");
}

/** Every tracked path under `root`, and those of them that are in neither list. */
export async function checkTracked(
  root: string,
): Promise<{ tracked: string[]; untrackable: string[] }> {
  const tracked = await trackedPaths(root);
  return { tracked, untrackable: untrackable(tracked) };
}

if (import.meta.main) {
  const { tracked, untrackable: bad } = await checkTracked(process.cwd());
  for (const path of bad) console.log(`${path} must not be tracked`);
  if (bad.length > 0) process.exit(1);
  console.log(`tracked: ${tracked.length} files, all in the public tree`);
}
