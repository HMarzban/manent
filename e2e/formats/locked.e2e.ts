// A Final Draft file locked for production: it opens with Final Draft's page starts, a page that holds a little more
// than fits is drawn whole, and once that page is edited here it gains its A-page.
import { lockedOver } from "@manent/formats/testing";
import { IMPORT_WORDS, PRODUCTION_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import { blocks, caretAt } from "../editor/support.ts";
import {
  dropFiles,
  messageSlot,
  onLibrary,
  openedScript,
  pagesOf,
} from "./support.ts";

test("a locked FDX opens in production with Final Draft's page numbers, and an edited page gains its A-page", async ({
  page,
}) => {
  // wide enough for the Scenes the script opens and the Tour a first visit opens; in a narrower window the Scenes give way
  await page.setViewportSize({ width: 1440, height: 900 });
  await onLibrary(page, "priya");
  await dropFiles(page, [{ name: "Locked.fdx", bytes: lockedOver(3) }]);
  await openedScript(page);
  await expect(
    messageSlot(page).getByText(
      `Imported 'Locked': 3 pages, 3 scenes, 0 notes. Page count can differ from Final Draft. Shortcuts follow Final Draft. ${IMPORT_WORDS.lockWaiting}`,
    ),
  ).toBeVisible();

  // the Pages tab joins the Scenes once the authority has locked the script
  await page.getByRole("tab", { name: PRODUCTION_WORDS.pagesTab }).click();
  const rows = page
    .getByRole("tabpanel", { name: PRODUCTION_WORDS.pagesTab })
    .getByRole("listitem");
  await expect(rows).toHaveCount(3);
  for (const [at, label] of ["1", "2", "3"].entries()) {
    const row = rows.nth(at);
    await expect(row.getByText(label, { exact: true })).toBeVisible();
    await expect(
      row.getByRole("img", { name: PRODUCTION_WORDS.lockMarkerName }),
    ).toBeVisible();
  }
  await expect
    .poll(async () => (await pagesOf(page)).map((p) => p.label))
    .toEqual(["1", "2", "3"]);

  const page2 = (await pagesOf(page)).find((p) => p.label === "2");
  const heading =
    page2 === undefined ? undefined : (await blocks(page))[page2.block];
  if (heading === undefined) throw new Error("page 2 starts in no block");
  await caretAt(page, heading.id, "end");
  await page.keyboard.type(" AGAIN");
  await expect
    .poll(async () => (await pagesOf(page)).map((p) => p.label))
    .toEqual(["1", "2", "2A", "3"]);
});
