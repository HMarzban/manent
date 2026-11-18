// Installs the stock components in a temporary project and checks the committed copies against the CLI's output.
// `--write` writes the copies and their hashes instead.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  STOCK,
  STOCK_DEPENDENCIES,
  hashFile,
  rewriteImports,
} from "./stock.config.ts";

const repoRoot = join(import.meta.dir, "..");
const STOCK_DIR = "packages/ui/src/components/stock";
const HASHES_FILE = "tools/stock-hashes.json";
const CSS_NAME = "shadcn.css";
const CSS_HEADER =
  "/* shadcn 4.23.0 tailwind.css, MIT, copied unedited by tools/check-stock.ts */";

const PROJECT_FILES: Readonly<Record<string, unknown>> = {
  "package.json": {
    name: "stock",
    private: true,
    type: "module",
    dependencies: {
      react: "19.3.1",
      "react-dom": "19.3.1",
      "@base-ui/react": "1.9.0",
      "class-variance-authority": "0.7.1",
      cn: "0.5.2",
      "lucide-react": "1.73.0",
      tailwindcss: "4.1.14",
      "tw-animate-css": "1.4.0",
      shadcn: "4.23.0",
    },
  },
  "tsconfig.json": {
    compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } },
  },
  "components.json": {
    $schema: "https://ui.shadcn.com/schema.json",
    style: STOCK.style,
    rsc: false,
    tsx: true,
    tailwind: {
      config: "",
      css: "src/index.css",
      baseColor: "neutral",
      cssVariables: true,
      prefix: "",
    },
    iconLibrary: STOCK.iconLibrary,
    aliases: {
      components: "@/components",
      utils: "@/lib/utils",
      ui: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
    },
  },
};

/** A command that exits with a code other than 0, said as a terminal sentence. */
class CommandExit extends Error {}

async function run(
  command: readonly string[],
  cwd: string,
  input: string | null,
): Promise<string> {
  const proc = Bun.spawn([...command], {
    cwd,
    stdin: input === null ? "ignore" : new TextEncoder().encode(input),
    stdout: "pipe",
    stderr: "inherit",
  });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0)
    throw new CommandExit(
      `The command bun ${command[1]} exited with code ${code}. Check the network, then run the check again.`,
    );
  return out;
}

const format = (text: string, name: string): Promise<string> =>
  run(
    [process.execPath, "fmt", `--stdin-filepath=${STOCK_DIR}/${name}`],
    repoRoot,
    text,
  );

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await Bun.file(path).text());
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`${path} must hold a JSON object`);
  return Object.fromEntries(Object.entries(value));
}

/** The dependencies of the temporary project that are not in `STOCK_DEPENDENCIES`. */
async function unexpectedDependencies(project: string): Promise<string[]> {
  const manifest = await readJsonObject(join(project, "package.json"));
  const allowed: ReadonlySet<string> = new Set(STOCK_DEPENDENCIES);
  return ["dependencies", "devDependencies"]
    .flatMap((field) => {
      const list = manifest[field];
      return typeof list === "object" && list !== null ? Object.keys(list) : [];
    })
    .filter((name) => !allowed.has(name));
}

/** The CLI's output as it is committed: file name → text, the 23 components then the stylesheet. */
async function installStock(project: string): Promise<Map<string, string>> {
  for (const [name, content] of Object.entries(PROJECT_FILES))
    await Bun.write(join(project, name), JSON.stringify(content, null, 2));
  await Bun.write(join(project, "src/index.css"), '@import "tailwindcss";\n');
  await run([process.execPath, "install"], project, null);
  await run(
    [
      process.execPath,
      "x",
      "--bun",
      STOCK.cli,
      "add",
      ...STOCK.components,
      "--yes",
      "--overwrite",
    ],
    project,
    null,
  );
  const files = new Map<string, string>();
  for (const component of STOCK.components) {
    const name = `${component}.tsx`;
    const text = await Bun.file(
      join(project, "src/components/ui", name),
    ).text();
    files.set(name, await format(rewriteImports(text), name));
  }
  const css = await Bun.file(
    join(project, "node_modules/shadcn/dist/tailwind.css"),
  ).text();
  files.set(CSS_NAME, await format(css, CSS_NAME));
  return files;
}

/** The committed text that the CLI's output is compared with: for the stylesheet, everything below its first line. */
async function committed(name: string): Promise<string | null> {
  const file = Bun.file(join(repoRoot, STOCK_DIR, name));
  if (!(await file.exists())) return null;
  const text = await file.text();
  return name === CSS_NAME ? text.slice(text.indexOf("\n") + 1) : text;
}

async function writeStock(files: ReadonlyMap<string, string>): Promise<void> {
  const hashes: Record<string, string> = {};
  for (const [name, text] of files) {
    const written = name === CSS_NAME ? `${CSS_HEADER}\n${text}` : text;
    await Bun.write(join(repoRoot, STOCK_DIR, name), written);
    hashes[name] = hashFile(written);
  }
  await Bun.write(
    join(repoRoot, HASHES_FILE),
    `${JSON.stringify(hashes, null, 2)}\n`,
  );
}

/** Whether every committed file equals the CLI's output; prints one line per file that does not. */
async function compareStock(
  files: ReadonlyMap<string, string>,
): Promise<boolean> {
  let same = true;
  for (const [name, text] of files)
    if ((await committed(name)) !== text) {
      console.log(
        `${STOCK_DIR}/${name} differs from ${STOCK.cli} ${STOCK.style}`,
      );
      same = false;
    }
  return same;
}

async function main(write: boolean): Promise<number> {
  const project = await mkdtemp(join(tmpdir(), "manent-stock-"));
  try {
    const files = await installStock(project);
    const unexpected = await unexpectedDependencies(project);
    for (const name of unexpected)
      console.log(`the stock project gained the dependency ${name}`);
    if (unexpected.length > 0) return 1;
    if (write) {
      await writeStock(files);
      console.log(`stock: wrote ${files.size} files and ${HASHES_FILE}`);
      return 0;
    }
    if (!(await compareStock(files))) return 1;
    console.log(
      `stock: ${STOCK.components.length} components and ${CSS_NAME}, unedited`,
    );
    return 0;
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    process.exit(await main(process.argv.includes("--write")));
  } catch (e) {
    if (!(e instanceof CommandExit)) throw e;
    console.log(e.message);
    process.exit(1);
  }
}
