// Standalone child process that polls a prompter folder in a tight loop with no sleep.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

interface ObservedEntry {
  readonly content: string;
  readonly count: number;
}

interface ReaderOutput {
  readonly totalReads: number;
  readonly files: Record<string, ObservedEntry[]>;
}

function isMissingFile(caught: unknown): boolean {
  return (
    typeof caught === "object" &&
    caught !== null &&
    "code" in caught &&
    (caught as { code?: unknown }).code === "ENOENT"
  );
}

function recordRead(
  observed: Map<string, Map<string, number>>,
  name: string,
  content: string,
): void {
  let byContent = observed.get(name);
  if (byContent === undefined) {
    byContent = new Map<string, number>();
    observed.set(name, byContent);
  }
  byContent.set(content, (byContent.get(content) ?? 0) + 1);
}

async function runReader(folder: string, doneFile: string): Promise<void> {
  const donePath = join(folder, doneFile);
  const observed = new Map<string, Map<string, number>>();
  let totalReads = 0;

  process.stdout.write("READY\n");

  while (!existsSync(donePath)) {
    const entries = readdirSync(folder);
    for (const name of entries) {
      if (name === doneFile || name.startsWith(".")) continue;
      let content: string;
      try {
        content = readFileSync(join(folder, name), "utf8");
      } catch (caught) {
        if (isMissingFile(caught)) continue;
        throw caught;
      }
      recordRead(observed, name, content);
      totalReads += 1;
    }
  }

  const files: Record<string, ObservedEntry[]> = {};
  for (const [name, counts] of observed) {
    const list: ObservedEntry[] = [];
    for (const [content, count] of counts) {
      list.push({ content, count });
    }
    files[name] = list;
  }

  const payload: ReaderOutput = { totalReads, files };
  await Bun.write(Bun.stdout, `${JSON.stringify(payload)}\n`);
}

if (import.meta.main) {
  const [folder, doneFile] = Bun.argv.slice(2);
  if (folder === undefined || doneFile === undefined) {
    process.stderr.write("Usage: reader.ts <folder> <doneFile>\n");
    process.exit(2);
  }
  await runReader(folder, doneFile);
}
