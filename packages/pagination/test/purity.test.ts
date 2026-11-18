import { expect, test } from "bun:test";
import { join } from "node:path";

test("the engine carries its own Unicode knowledge", async () => {
  const banned = [
    "Intl\\.",
    "\\.toUpperCase\\(",
    "\\.toLowerCase\\(",
    "\\.toLocaleUpperCase\\(",
    "\\.toLocaleLowerCase\\(",
    "\\.normalize\\(",
    "\\.localeCompare\\(",
    "\\\\p\\{",
  ];
  const hits: string[] = [];
  for await (const file of new Bun.Glob("src/**/*.ts").scan(
    join(import.meta.dir, ".."),
  ))
    for (const b of banned)
      if (
        new RegExp(b).test(
          await Bun.file(join(import.meta.dir, "..", file)).text(),
        )
      )
        hits.push(`${file}: ${b}`);
  expect(hits).toEqual([]);
});
