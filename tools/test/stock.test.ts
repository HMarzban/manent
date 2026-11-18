import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { STOCK, hashFile, rewriteImports } from "../stock.config.ts";

const repoRoot = join(import.meta.dir, "..", "..");

test("the stock set is one style and one list", () => {
  expect(STOCK).toEqual({
    cli: "shadcn@4.23.0",
    style: "base-mira",
    iconLibrary: "lucide",
    components: [
      "alert-dialog",
      "button",
      "collapsible",
      "context-menu",
      "dialog",
      "dropdown-menu",
      "field",
      "input",
      "input-group",
      "kbd",
      "label",
      "popover",
      "radio-group",
      "scroll-area",
      "select",
      "separator",
      "skeleton",
      "switch",
      "tabs",
      "textarea",
      "toggle",
      "toggle-group",
      "tooltip",
    ],
  });
});

test("only import statements are rewritten", () => {
  expect(
    rewriteImports(
      'import { Button } from "@/components/ui/button"\nimport { cn } from "cn"\nconst x = "@/components/ui/button"',
    ),
  ).toBe(
    'import { Button } from "./button.tsx"\nimport { cn } from "cn"\nconst x = "@/components/ui/button"',
  );
  expect(
    rewriteImports(
      'import { cva, type VariantProps } from "class-variance-authority"',
    ),
  ).toBe(
    'import { cva } from "class-variance-authority";\nimport type { VariantProps } from "class-variance-authority";',
  );
});

test("two adjacent imports are each rewritten with their own names", () => {
  expect(
    rewriteImports(
      'import { a, type B } from "x"\nimport {\n  c,\n  type D,\n} from "@/components/ui/y"',
    ),
  ).toBe(
    'import { a } from "x";\nimport type { B } from "x";\nimport { c } from "./y.tsx";\nimport type { D } from "./y.tsx";',
  );
});

test("the committed stock folder holds exactly the list", async () => {
  const files = (
    await readdir(join(repoRoot, "packages/ui/src/components/stock"))
  ).toSorted();
  expect(files).toEqual(
    [
      ...STOCK.components.map((n) => `${n}.tsx`),
      "index.ts",
      "shadcn.css",
    ].toSorted(),
  );
});

test("the committed stock files are the ones the check wrote", async () => {
  const hashes = JSON.parse(
    await Bun.file(join(repoRoot, "tools/stock-hashes.json")).text(),
  );
  for (const name of [...STOCK.components.map((n) => `${n}.tsx`), "shadcn.css"])
    expect([
      name,
      hashFile(
        await Bun.file(
          join(repoRoot, "packages/ui/src/components/stock", name),
        ).text(),
      ),
    ]).toEqual([name, hashes[name]]);
});
