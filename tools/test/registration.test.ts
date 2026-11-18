import { expect, test } from "bun:test";
import { dirname, join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

const LISTS = [
  "packages/editor/src/index.ts",
  "packages/formats/src/index.ts",
  "packages/revisions/src/index.ts",
  "packages/server-core/src/index.ts",
  "packages/ui/src/components/index.ts",
  "packages/ui/src/index.ts",
  "packages/ui/src/tokens/index.ts",
];

test("a registration list holds one sorted line per feature folder and nothing else", async () => {
  for (const file of LISTS) {
    const code = (await Bun.file(join(repoRoot, file)).text())
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("//"));
    const folders = code.map(
      (line) =>
        new RegExp(
          '^export \\* from "\\./([a-z][a-z0-9-]*)/index\\.ts";$',
        ).exec(line)?.[1] ?? null,
    );
    if (code.length === 1 && code[0] === "export {};") continue;
    expect({ file, folders }).toEqual({
      file,
      folders: folders.filter((f) => f !== null).toSorted(),
    });
    for (const folder of folders)
      expect(
        await Bun.file(
          join(repoRoot, dirname(file), folder!, "index.ts"),
        ).exists(),
      ).toBe(true);
  }
});
