import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FontFaceKey } from "@manent/pagination";
import {
  UCD_DIR,
  UCD_SHA256,
  generateFontTable,
  generateUnicodeTables,
} from "../unicode/generate-tables.ts";

const repoRoot = join(import.meta.dir, "..", "..");
const TABLES = "packages/pagination/src/engines/v1/tables";

const readUcd = (name: string) =>
  readFileSync(join(repoRoot, UCD_DIR, name), "utf8");
const readFace = (key: FontFaceKey) =>
  readFileSync(
    Bun.resolveSync(
      `@fontsource/courier-prime/files/courier-prime-${key}.woff`,
      import.meta.dir,
    ),
  );

test("the Unicode data is the pinned release", async () => {
  for (const [name, sha] of Object.entries(UCD_SHA256))
    expect({
      name,
      sha: new Bun.CryptoHasher("sha256")
        .update(await Bun.file(join(repoRoot, UCD_DIR, name)).arrayBuffer())
        .digest("hex"),
    }).toEqual({ name, sha });
});

test("the committed tables are what the generator writes", async () => {
  expect(
    await Bun.file(join(repoRoot, TABLES, "unicode.generated.ts")).text(),
  ).toBe(generateUnicodeTables(readUcd));
  expect(
    await Bun.file(join(repoRoot, TABLES, "font.generated.ts")).text(),
  ).toBe(generateFontTable(readFace));
});
