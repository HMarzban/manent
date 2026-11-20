import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DocJSON } from "@manent/schema";
import { compareDocs } from "../src/index.ts";
import type { Comparison } from "../src/index.ts";

const GOLDEN_NAMES = [
  "typed-word",
  "deleted-sentence",
  "bold-added",
  "link-changed",
  "element-changed",
  "synopsis-changed",
  "block-added",
  "block-removed",
  "scene-moved",
  "split",
  "join",
  "dual-dialogue",
  "unicode",
  "empty-to-script",
  "identical",
  "unknown-attribute",
  "two-blocks-one-id",
];

const DIR = join(import.meta.dir, "golden", "compare");

interface Golden {
  older: DocJSON;
  newer: DocJSON;
  comparison: Comparison;
}

function goldens(): Golden[] {
  return GOLDEN_NAMES.map((name) =>
    JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8")),
  );
}

test("every golden comparison is the stored one", () => {
  expect(readdirSync(DIR).toSorted()).toEqual(
    GOLDEN_NAMES.map((name) => `${name}.json`).toSorted(),
  );
  for (const g of goldens())
    expect(compareDocs(g.older, g.newer)).toEqual(g.comparison);
});
