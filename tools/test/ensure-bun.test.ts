import { afterAll, expect, test } from "bun:test";
import { chmod, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";

const repoRoot = join(import.meta.dir, "..", "..");
const scriptPath = join(repoRoot, "tools/demo/ensure-bun.sh");
const trees = createTempTrees("manent ensure-bun ");
afterAll(() => trees.removeAll(), 30_000);

const SYSTEM_UTILS = [
  "awk",
  "cat",
  "chmod",
  "dirname",
  "env",
  "head",
  "id",
  "mkdir",
  "mktemp",
  "printf",
  "pwd",
  "rm",
  "sed",
  "sh",
  "tr",
  "uname",
] as const;

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Creates an isolated PATH directory holding standard POSIX utilities plus the given mock scripts. */
async function createSandbox(
  mocks: Record<string, string>,
  options: { omitSystem?: readonly string[] } = {},
): Promise<{ binDir: string; homeDir: string; bunInstall: string }> {
  const root = await trees.tree({});
  const binDir = join(root, "bin");
  const homeDir = join(root, "home dir");
  const bunInstall = join(homeDir, ".bun");
  await mkdir(binDir, { recursive: true });
  await mkdir(homeDir, { recursive: true });

  const omitted = new Set(options.omitSystem ?? []);
  for (const name of SYSTEM_UTILS) {
    if (name in mocks || omitted.has(name)) continue;
    const found = Bun.which(name);
    if (found === null) continue;
    await symlink(found, join(binDir, name));
  }

  for (const [name, body] of Object.entries(mocks)) {
    const file = join(binDir, name);
    await writeFile(file, body);
    await chmod(file, 0o755);
  }

  return { binDir, homeDir, bunInstall };
}

async function writeExecutable(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
  await chmod(path, 0o755);
}

async function runScript(
  args: readonly string[],
  env: { binDir: string; homeDir: string; bunInstall?: string },
  extraEnv: Record<string, string> = {},
): Promise<RunResult> {
  const sh = Bun.which("sh") ?? "/bin/sh";
  const child = Bun.spawn([sh, scriptPath, ...args], {
    cwd: repoRoot,
    env: {
      PATH: env.binDir,
      HOME: env.homeDir,
      TMPDIR: env.homeDir,
      ...(env.bunInstall !== undefined ? { BUN_INSTALL: env.bunInstall } : {}),
      ...extraEnv,
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

const fakeBun = (version: string): string =>
  [
    "#!/bin/sh",
    'if [ "$1" = "--version" ]; then',
    `  echo "${version}"`,
    "  exit 0",
    "fi",
    `printf "ran:%s:%s\\n" "${version}" "$*"`,
  ].join("\n") + "\n";

test("Makefile wires demo to auto-install Bun and other targets to locate Bun", async () => {
  const makefile = await readFile(join(repoRoot, "Makefile"), "utf8");
  expect(makefile).toContain("ENSURE_BUN = sh tools/demo/ensure-bun.sh");
  expect(makefile).toMatch(
    new RegExp(
      "^demo:.*\\n\\t.*\\$\\(ENSURE_BUN\\) --install -- bun run demo",
      "m",
    ),
  );
  for (const target of ["desktop", "reset", "test", "bench", "stop"]) {
    expect(makefile).toMatch(
      new RegExp(
        `^${target}:.*\\n\\t.*\\$\\(ENSURE_BUN\\) -- bun run ${target}`,
        "m",
      ),
    );
  }
  const script = await readFile(scriptPath, "utf8");
  expect(script).not.toContain("\r");
  const forbidden = /\b(generation|rebuild|conflict|error|failed)\b/i;
  for (const line of script.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("echo ") || trimmed.startsWith("printf ")) {
      expect(forbidden.test(trimmed)).toBe(false);
    }
  }
});

test("uses an existing Bun 1.4.4+ on PATH without calling curl", async () => {
  if (process.platform === "win32") return;
  for (const version of ["1.4.4", "1.4.5", "1.10.0", "2.0.0"]) {
    const sandbox = await createSandbox({
      bun: fakeBun(version),
      curl: "#!/bin/sh\necho unexpected-curl >&2\nexit 99\n",
    });
    const res = await runScript(
      ["--install", "--", "bun", "run", "demo", "with spaces"],
      sandbox,
    );
    expect(res).toEqual({
      exitCode: 0,
      stdout: `ran:${version}:run demo with spaces\n`,
      stderr: "",
    });
  }
});

test("finds Bun 1.4.4+ in HOME/.bun/bin or BUN_INSTALL/bin even when PATH lacks it or has an older Bun", async () => {
  if (process.platform === "win32") return;
  const sandbox = await createSandbox({
    bun: fakeBun("1.4.3"),
    curl: "#!/bin/sh\necho unexpected-curl >&2\nexit 99\n",
  });
  await writeExecutable(
    join(sandbox.homeDir, ".bun/bin/bun"),
    fakeBun("1.4.5"),
  );
  const res = await runScript(["--install", "--", "bun", "run", "demo"], {
    binDir: sandbox.binDir,
    homeDir: sandbox.homeDir,
  });
  expect(res).toEqual({
    exitCode: 0,
    stdout: "ran:1.4.5:run demo\n",
    stderr: "",
  });
});

test("check-only mode reports missing or older Bun without installing", async () => {
  if (process.platform === "win32") return;
  const missing = await createSandbox({
    curl: "#!/bin/sh\necho unexpected-curl >&2\nexit 99\n",
  });
  const missingRes = await runScript(["--", "bun", "run", "stop"], missing);
  expect(missingRes).toEqual({
    exitCode: 1,
    stdout: "",
    stderr:
      "Manent needs Bun 1.4.4 or later. Run make demo to install it, or install it with: curl -fsSL https://bun.com/install | bash\n",
  });

  for (const oldVersion of ["1.4.3", "1.4.4-canary.1"]) {
    const older = await createSandbox({
      bun: fakeBun(oldVersion),
      curl: "#!/bin/sh\necho unexpected-curl >&2\nexit 99\n",
    });
    const olderRes = await runScript(["--", "bun", "run", "stop"], older);
    expect(olderRes).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: `Manent needs Bun 1.4.4 or later (found ${oldVersion}). Run make demo to update it, or install it with: curl -fsSL https://bun.com/install | bash\n`,
    });
  }
});

test("installs Bun automatically when missing and then runs the target command", async () => {
  if (process.platform === "win32") return;
  const sandbox = await createSandbox({
    unzip: "#!/bin/sh\nexit 0\n",
    bash: '#!/bin/sh\nexec /bin/sh "$@"\n',
    curl:
      [
        "#!/bin/sh",
        'out=""',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "-o" ]; then out="$2"; shift 2; else shift; fi',
        "done",
        "cat > \"$out\" <<'EOF'",
        'mkdir -p "${BUN_INSTALL:-$HOME/.bun}/bin"',
        "cat > \"${BUN_INSTALL:-$HOME/.bun}/bin/bun\" <<'BUN'",
        fakeBun("1.4.5").trimEnd(),
        "BUN",
        'chmod +x "${BUN_INSTALL:-$HOME/.bun}/bin/bun"',
        "EOF",
      ].join("\n") + "\n",
  });

  const res = await runScript(
    ["--install", "--", "bun", "run", "demo"],
    sandbox,
  );
  expect(res).toEqual({
    exitCode: 0,
    stdout: [
      "Bun 1.4.4 or later was not found. Installing Bun...",
      "Installed Bun 1.4.5.",
      "ran:1.4.5:run demo",
      "",
    ].join("\n"),
    stderr: "",
  });
});

test("updates an older Bun automatically and prefers the newly installed binary", async () => {
  if (process.platform === "win32") return;
  const sandbox = await createSandbox({
    bun: fakeBun("1.4.3"),
    unzip: "#!/bin/sh\nexit 0\n",
    bash: '#!/bin/sh\nexec /bin/sh "$@"\n',
    curl:
      [
        "#!/bin/sh",
        'out=""',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "-o" ]; then out="$2"; shift 2; else shift; fi',
        "done",
        "cat > \"$out\" <<'EOF'",
        'mkdir -p "${BUN_INSTALL:-$HOME/.bun}/bin"',
        "cat > \"${BUN_INSTALL:-$HOME/.bun}/bin/bun\" <<'BUN'",
        fakeBun("1.4.5").trimEnd(),
        "BUN",
        'chmod +x "${BUN_INSTALL:-$HOME/.bun}/bin/bun"',
        "EOF",
      ].join("\n") + "\n",
  });

  const res = await runScript(
    ["--install", "--", "bun", "run", "demo"],
    sandbox,
  );
  expect(res).toEqual({
    exitCode: 0,
    stdout: [
      "Bun 1.4.3 is older than 1.4.4. Installing a newer Bun...",
      "Installed Bun 1.4.5.",
      "ran:1.4.5:run demo",
      "",
    ].join("\n"),
    stderr: "",
  });
});

test("installs missing installer prerequisites via an available package manager before installing Bun", async () => {
  if (process.platform === "win32") return;
  const sandbox = await createSandbox({
    bash: '#!/bin/sh\nexec /bin/sh "$@"\n',
    curl:
      [
        "#!/bin/sh",
        'out=""',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "-o" ]; then out="$2"; shift 2; else shift; fi',
        "done",
        "cat > \"$out\" <<'EOF'",
        'mkdir -p "${BUN_INSTALL:-$HOME/.bun}/bin"',
        "cat > \"${BUN_INSTALL:-$HOME/.bun}/bin/bun\" <<'BUN'",
        fakeBun("1.4.5").trimEnd(),
        "BUN",
        'chmod +x "${BUN_INSTALL:-$HOME/.bun}/bin/bun"',
        "EOF",
      ].join("\n") + "\n",
    brew:
      [
        "#!/bin/sh",
        'if [ "$HOMEBREW_NO_AUTO_UPDATE" = "1" ] && [ "$1" = "install" ] && [ "$2" = "unzip" ]; then',
        '  cat > "$(dirname "$0")/unzip" <<\'EOF\'',
        "#!/bin/sh",
        "exit 0",
        "EOF",
        '  chmod +x "$(dirname "$0")/unzip"',
        "  exit 0",
        "fi",
        "exit 1",
      ].join("\n") + "\n",
  });

  const res = await runScript(
    ["--install", "--", "bun", "run", "demo"],
    sandbox,
  );
  expect(res).toEqual({
    exitCode: 0,
    stdout: [
      "Installing missing tools needed for Bun: unzip...",
      "Bun 1.4.4 or later was not found. Installing Bun...",
      "Installed Bun 1.4.5.",
      "ran:1.4.5:run demo",
      "",
    ].join("\n"),
    stderr: "",
  });
});

test("installs missing curl, unzip and ca-certificates via apt-get when running as root", async () => {
  if (process.platform === "win32") return;
  const sandbox = await createSandbox({
    id: "#!/bin/sh\necho 0\n",
    bash: '#!/bin/sh\nexec /bin/sh "$@"\n',
    "apt-get":
      [
        "#!/bin/sh",
        'if [ "$DEBIAN_FRONTEND" != "noninteractive" ]; then exit 2; fi',
        'if [ "$1" = "update" ]; then exit 0; fi',
        'if [ "$1" = "install" ] && [ "$2" = "-y" ] && [ "$3" = "-qq" ]; then',
        '  case " $* " in',
        '    *" curl unzip ca-certificates "*)',
        '      cat > "$(dirname "$0")/unzip" <<\'EOF\'',
        "#!/bin/sh",
        "exit 0",
        "EOF",
        '      chmod +x "$(dirname "$0")/unzip"',
        '      cat > "$(dirname "$0")/curl" <<\'EOF\'',
        "#!/bin/sh",
        'out=""',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "-o" ]; then out="$2"; shift 2; else shift; fi',
        "done",
        "cat > \"$out\" <<'INSTALLER'",
        'mkdir -p "${BUN_INSTALL:-$HOME/.bun}/bin"',
        "cat > \"${BUN_INSTALL:-$HOME/.bun}/bin/bun\" <<'BUN'",
        fakeBun("1.4.5").trimEnd(),
        "BUN",
        'chmod +x "${BUN_INSTALL:-$HOME/.bun}/bin/bun"',
        "INSTALLER",
        "EOF",
        '      chmod +x "$(dirname "$0")/curl"',
        "      exit 0",
        "      ;;",
        "  esac",
        "fi",
        "exit 1",
      ].join("\n") + "\n",
  });

  const res = await runScript(
    ["--install", "--", "bun", "run", "demo"],
    sandbox,
  );
  expect(res).toEqual({
    exitCode: 0,
    stdout: [
      "Installing missing tools needed for Bun: curl unzip...",
      "Bun 1.4.4 or later was not found. Installing Bun...",
      "Installed Bun 1.4.5.",
      "ran:1.4.5:run demo",
      "",
    ].join("\n"),
    stderr: "",
  });
});

test("reports missing prerequisites cleanly when no package manager can run non-interactively", async () => {
  if (process.platform === "win32") return;
  const sandbox = await createSandbox({
    bash: '#!/bin/sh\nexec /bin/sh "$@"\n',
    curl: "#!/bin/sh\necho unexpected-curl >&2\nexit 99\n",
  });
  const res = await runScript(
    ["--install", "--", "bun", "run", "demo"],
    sandbox,
  );
  expect(res).toEqual({
    exitCode: 1,
    stdout: "",
    stderr:
      "Manent needs unzip to install Bun 1.4.4 or later. Install it, then run make demo again.\n",
  });
});

test("ignores a directory named bun on PATH and falls back to HOME/.bun/bin", async () => {
  if (process.platform === "win32") return;
  const sandbox = await createSandbox({
    curl: "#!/bin/sh\necho unexpected-curl >&2\nexit 99\n",
  });
  await mkdir(join(sandbox.binDir, "bun"), { recursive: true });
  await writeExecutable(
    join(sandbox.homeDir, ".bun/bin/bun"),
    fakeBun("1.4.5"),
  );
  const res = await runScript(["--install", "--", "bun", "run", "demo"], {
    binDir: sandbox.binDir,
    homeDir: sandbox.homeDir,
  });
  expect(res).toEqual({
    exitCode: 0,
    stdout: "ran:1.4.5:run demo\n",
    stderr: "",
  });
});

test("reports download and installer problems cleanly without silently succeeding", async () => {
  if (process.platform === "win32") return;
  const offline = await createSandbox({
    unzip: "#!/bin/sh\nexit 0\n",
    bash: "#!/bin/sh\necho unexpected-bash >&2\nexit 99\n",
    curl: "#!/bin/sh\nexit 22\n",
  });
  expect(
    await runScript(["--install", "--", "bun", "run", "demo"], offline),
  ).toEqual({
    exitCode: 1,
    stdout: "Bun 1.4.4 or later was not found. Installing Bun...\n",
    stderr:
      "Could not download the Bun installer. Check your connection and run make demo again.\n",
  });

  const brokenInstaller = await createSandbox({
    unzip: "#!/bin/sh\nexit 0\n",
    bash: "#!/bin/sh\nexit 1\n",
    curl:
      [
        "#!/bin/sh",
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "-o" ]; then : > "$2"; shift 2; else shift; fi',
        "done",
      ].join("\n") + "\n",
  });
  expect(
    await runScript(["--install", "--", "bun", "run", "demo"], brokenInstaller),
  ).toEqual({
    exitCode: 1,
    stdout: "Bun 1.4.4 or later was not found. Installing Bun...\n",
    stderr:
      "Bun 1.4.4 or later could not be installed. Install it with: curl -fsSL https://bun.com/install | bash\n",
  });

  const missingAfterInstall = await createSandbox({
    unzip: "#!/bin/sh\nexit 0\n",
    bash: "#!/bin/sh\nexit 0\n",
    curl:
      [
        "#!/bin/sh",
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "-o" ]; then : > "$2"; shift 2; else shift; fi',
        "done",
      ].join("\n") + "\n",
  });
  expect(
    await runScript(
      ["--install", "--", "bun", "run", "demo"],
      missingAfterInstall,
    ),
  ).toEqual({
    exitCode: 1,
    stdout: "Bun 1.4.4 or later was not found. Installing Bun...\n",
    stderr:
      "Bun 1.4.4 or later could not be verified after installation. Install it with: curl -fsSL https://bun.com/install | bash\n",
  });
});

test("uses PowerShell to install Bun on Windows shells (Git Bash / MSYS)", async () => {
  if (process.platform === "win32") return;
  const sandbox = await createSandbox({
    uname: "#!/bin/sh\necho MINGW64_NT-10.0\n",
    powershell:
      [
        "#!/bin/sh",
        'case "$*" in',
        '  *"irm https://bun.com/install.ps1 | iex"*)',
        '    mkdir -p "${BUN_INSTALL:-$HOME/.bun}/bin"',
        "    cat > \"${BUN_INSTALL:-$HOME/.bun}/bin/bun\" <<'BUN'",
        fakeBun("1.4.5").trimEnd(),
        "BUN",
        '    chmod +x "${BUN_INSTALL:-$HOME/.bun}/bin/bun"',
        "    exit 0",
        "    ;;",
        "  *) exit 1 ;;",
        "esac",
      ].join("\n") + "\n",
  });
  const res = await runScript(
    ["--install", "--", "bun", "run", "demo"],
    sandbox,
  );
  expect(res).toEqual({
    exitCode: 0,
    stdout: [
      "Bun 1.4.4 or later was not found. Installing Bun...",
      "Installed Bun 1.4.5.",
      "ran:1.4.5:run demo",
      "",
    ].join("\n"),
    stderr: "",
  });
});
