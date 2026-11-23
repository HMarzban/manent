// The Send screen's Export writes the script as an FDX or a Fountain file, and the FDX brings the same script back.
import { readFile } from "node:fs/promises";
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import {
  DOCUMENT_WORDS,
  EDITOR_WORDS,
  IMPORT_WORDS,
  LIBRARY_WORDS,
} from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Download, Page } from "@playwright/test";
import { blocks, openScript } from "../editor/support.ts";
import { labelOf } from "../support/interface.ts";
import { dropFiles, openedScript } from "./support.ts";

/** Exports the open script as `as` from the title menu's Export…, and resolves to the download once it has been made. */
async function exportAs(page: Page, as: string): Promise<Download> {
  await page
    .getByRole("button", {
      name: DOCUMENT_WORDS.titleMenu(LIBRARY_WORDS.untitledScript),
    })
    .click();
  await page.getByRole("menuitem", { name: labelOf("doc.export") }).click();
  await page.getByRole("button", { name: as, exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: EDITOR_WORDS.send.exportTitle(1) })
    .click();
  return download;
}

test("a script exports as FDX and as Fountain, and the FDX imports back the same", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await openScript(
    page,
    "screenplay",
    corpusDoc(generateBlocks("screenplay", 30, 5)),
  );
  const written = (await blocks(page)).map((b) => [b.type, b.kind, b.text]);

  const fountain = await exportAs(page, IMPORT_WORDS.asFountain);
  const fountainPath = testInfo.outputPath(fountain.suggestedFilename());
  await fountain.saveAs(fountainPath);
  const fdx = await exportAs(page, IMPORT_WORDS.asFdx);
  const fdxPath = testInfo.outputPath(fdx.suggestedFilename());
  await fdx.saveAs(fdxPath);
  expect([fountain.suggestedFilename(), fdx.suggestedFilename()]).toEqual([
    "Untitled script.fountain",
    "Untitled script.fdx",
  ]);
  expect((await readFile(fountainPath, "utf8")).split("\n", 1)).toEqual([
    "Title: Untitled script",
  ]);

  const from = new URL(page.url()).pathname.slice("/s/".length);
  await page.getByRole("button", { name: DOCUMENT_WORDS.back }).click();
  await page.waitForURL((at) => at.pathname === "/");
  await dropFiles(page, [
    { name: fdx.suggestedFilename(), bytes: await readFile(fdxPath) },
  ]);
  await openedScript(page, from);
  await expect
    .poll(async () => (await blocks(page)).map((b) => [b.type, b.kind, b.text]))
    .toEqual(written);
});
