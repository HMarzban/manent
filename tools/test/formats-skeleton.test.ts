import { expect, test } from "bun:test";

// every import is by path from the repository root: tools declares none of the web app's files
const fromRoot = (path: string): string =>
  new URL(`../../${path}`, import.meta.url).href;

const SKELETON_PATHS = [
  "packages/formats/src/script/index.ts",
  "packages/formats/src/script/model.ts",
  "packages/formats/src/script/record.ts",
  "packages/formats/src/script/decode.ts",
  "packages/formats/src/xml/index.ts",
  "packages/formats/src/xml/node.ts",
  "packages/formats/src/xml/write.ts",
  "packages/formats/src/xml/checks.ts",
  "packages/formats/src/fdx/index.ts",
  "packages/formats/src/fdx/read.ts",
  "packages/formats/src/fdx/write.ts",
  "packages/formats/src/fdx/elements.ts",
  "packages/formats/src/fdx/runs.ts",
  "packages/formats/src/fdx/offsets.ts",
  "packages/formats/src/fdx/colours.ts",
  "packages/formats/src/fdx/notes.ts",
  "packages/formats/src/fdx/production.ts",
  "packages/formats/src/fdx/kept.ts",
  "packages/formats/src/fountain/index.ts",
  "packages/formats/src/fountain/read.ts",
  "packages/formats/src/fountain/lines.ts",
  "packages/formats/src/fountain/inline.ts",
  "packages/formats/src/fountain/write.ts",
  "packages/formats/src/text/index.ts",
  "packages/formats/src/text/pasted.ts",
  "packages/formats/src/testing/index.ts",
  "packages/formats/src/testing/fixtures.ts",
  "packages/formats/src/testing/bun-xml.ts",
  "packages/formats/src/testing/xml-expected.ts",
  "packages/formats/src/testing/locked-over.ts",
  "packages/schema/src/notes.ts",
  "packages/crdt/src/script-maps.ts",
  "packages/ui/src/words/import.ts",
  "apps/web/src/import/import-section.tsx",
];

test("every new module exists and every package entry imports cleanly", async () => {
  for (const path of SKELETON_PATHS)
    expect({
      path,
      exists: await Bun.file(new URL(fromRoot(path))).exists(),
    }).toEqual({
      path,
      exists: true,
    });
  for (const entry of [
    "packages/formats/src/index.ts",
    "packages/formats/src/testing/index.ts",
    "packages/schema/src/index.ts",
    "packages/crdt/src/index.ts",
    "packages/ui/src/index.ts",
    "packages/sync-protocol/src/index.ts",
  ])
    await import(fromRoot(entry));
});

test("the Import section is registered among the script's sections", async () => {
  const [{ DETAILS_SECTIONS }, { ImportSection }] = await Promise.all([
    import(fromRoot("apps/web/src/screens/document/details-sections.ts")),
    import(fromRoot("apps/web/src/import/import-section.tsx")),
  ]);
  expect(
    DETAILS_SECTIONS.find(
      (section: { readonly id: string }) => section.id === "import",
    ),
  ).toEqual({
    id: "import",
    scope: "script",
    Section: ImportSection,
  });
});
