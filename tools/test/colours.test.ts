import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { findColours } from "../check-colours.ts";

const repoRoot = join(import.meta.dir, "..", "..");

const trees = createTempTrees("manent-colours-");
afterAll(trees.removeAll);

/** The line and the offending text of each violation found in `text`, placed in a component file. */
const found = async (path: string, text: string) =>
  (await findColours(await trees.tree({ [path]: text }))).map((v) => [
    v.line,
    v.message,
  ]);

test("a colour outside the theme is a violation", async () => {
  const root = await trees.tree({
    "packages/x/src/a.tsx": 'const s = "bg-white";',
    "apps/y/src/b.css": ".a{color:#fff}",
    "packages/ui/src/theme.css": ":root{--a:#fff}",
  });
  expect((await findColours(root)).map((v) => [v.file, v.rule])).toEqual([
    ["apps/y/src/b.css", "colour-outside-theme"],
    ["packages/x/src/a.tsx", "colour-outside-theme"],
  ]);
});

test("every form of colour is found on its line", async () => {
  const lines = [
    "#abc",
    "#abcd",
    "#a1b2c3",
    "#a1b2c3d4",
    "rgb(0 0 0)",
    "rgba(0, 0, 0, 0.5)",
    "hsl(0 0% 0%)",
    "oklch(0.5 0.1 200)",
    "color-mix(in srgb, red, blue)",
    "color: red;",
    "backgroundColor: 'white',",
    "border: 1px solid black;",
    "bg-[var(--a)] text-[#a1b2c3]",
    "bg-black",
    "hover:bg-white",
    "text-white",
    "dark:bg-desk",
    "color: var(--p-ink);",
    "text-xs",
    "text-sm",
    "text-base",
    "bg-subtle/50",
    "border-line/[0.5]",
  ];
  expect(await found("apps/y/src/forms.css", lines.join("\n"))).toEqual([
    [1, "#abc is set outside the theme"],
    [2, "#abcd is set outside the theme"],
    [3, "#a1b2c3 is set outside the theme"],
    [4, "#a1b2c3d4 is set outside the theme"],
    [5, "rgb( is set outside the theme"],
    [6, "rgba( is set outside the theme"],
    [7, "hsl( is set outside the theme"],
    [8, "oklch( is set outside the theme"],
    [9, "color-mix( is set outside the theme"],
    [10, "red is set outside the theme"],
    [11, "white is set outside the theme"],
    [12, "black is set outside the theme"],
    [13, "-[# is set outside the theme"],
    [13, "#a1b2c3 is set outside the theme"],
    [14, "bg-black is set outside the theme"],
    [15, "bg-white is set outside the theme"],
    [16, "text-white is set outside the theme"],
    [17, "dark: is set outside the theme"],
    [18, "var(--p- is set outside the theme"],
    [19, "text-xs is set outside the theme"],
    [20, "text-sm is set outside the theme"],
    [21, "text-base is set outside the theme"],
    [22, "bg-subtle/50 is set outside the theme"],
    [23, "border-line/[0.5] is set outside the theme"],
  ]);
});

test("text that only looks like a colour is not one", async () => {
  const text = [
    "#12 #1234567 #abcdefg",
    'const appearance = { light: "light", dark: "dark" };',
    "text-subtle text-baseline bg-white-ish w-1/2",
    "color: transparent; outline-color: currentcolor;",
    "const red = 1; // a colour word that is not a value",
    "rgbValue(x)",
  ].join("\n");
  expect(await found("packages/x/src/look.tsx", text)).toEqual([]);
});

test("two colours side by side are two violations", async () => {
  expect(
    await found(
      "apps/y/src/pair.css",
      ".a{color:#fff}.b{background:rgb(0 0 0)}\nbg-white text-sm",
    ),
  ).toEqual([
    [1, "#fff is set outside the theme"],
    [1, "rgb( is set outside the theme"],
    [2, "bg-white is set outside the theme"],
    [2, "text-sm is set outside the theme"],
  ]);
});

test("an href or an id selector in a page is not a colour, an inline style is", async () => {
  const page = [
    '<a href="#add">Add</a>',
    "<style>#bad { margin: 0 }</style>",
    '<p style="color:#bad">',
  ].join("\n");
  expect(await found("apps/y/src/index.html", page)).toEqual([
    [3, "#bad is set outside the theme"],
  ]);
});

test("the theme, the stock components, tests, installed packages and other files are not read", async () => {
  const root = await trees.tree({
    "packages/ui/src/theme.css": ":root{--a:#fff}",
    "packages/ui/src/components/stock/button.tsx": '"bg-white text-sm"',
    "packages/x/test/a.test.ts": '"#fff"',
    "apps/y/test/support/b.tsx": '"bg-black"',
    "packages/x/node_modules/lib/c.css": ".a{color:#fff}",
    "apps/y/dist/d.css": ".a{color:#fff}",
    "packages/x/src/e.json": '{ "a": "#fff" }',
    "packages/x/README.md": "#fff",
    "tools/f.ts": '"#fff"',
  });
  expect(await findColours(root)).toEqual([]);
});

test("this repository has no colour outside the theme", async () => {
  expect(await findColours(repoRoot)).toEqual([]);
});
