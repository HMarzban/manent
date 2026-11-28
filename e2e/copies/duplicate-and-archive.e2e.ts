// Duplicating a named version opens a copy of that version, and exporting a project writes one zip archive.
import { readFile } from "node:fs/promises";
import {
  ARCHIVE_WORDS,
  COPIES_WORDS,
  DOCUMENT_WORDS,
  EDITOR_WORDS,
  HISTORY_WORDS,
  LIBRARY_WORDS,
} from "@manent/ui";
import { expect } from "@playwright/test";
import {
  SPEECH,
  asPerson,
  pageText,
  readStatus,
  renameScript,
  test,
  typeIn,
  writeScript,
} from "../offline/support.ts";
import { labelOf } from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";

const TIMEOUT_MS = 120_000;

test("duplicating a version from History opens a copy holding that version while leaving the original unchanged", async ({
  browser,
}) => {
  test.setTimeout(TIMEOUT_MS);
  const dana = await asPerson(browser, "dana");
  const originalId = await writeScript(dana);
  await renameScript(dana, "Tide Chart");

  // Name the current state as First draft from the title menu
  await dana.getByRole("heading", { level: 1 }).getByRole("button").click();
  await dana
    .getByRole("menuitem", { name: labelOf("history.nameDraft") })
    .click();
  const field = dana.getByRole("textbox", { name: HISTORY_WORDS.nameField });
  await expect(field).toBeVisible();
  await field.fill("First draft");
  await field.press("Enter");
  await expect(dana.locator("[data-tour='history_list']")).toContainText(
    "First draft",
  );

  // Return from the read-only Version history screen before editing Working
  const backButton = dana.getByRole("button", { name: /Back to script/ });
  if (await backButton.isVisible()) {
    await backButton.click();
    await expect(
      dana.locator("[data-editor-host] .ProseMirror[contenteditable='true']"),
    ).toBeVisible();
  }

  // Edit Working after First draft
  await typeIn(dana, SPEECH, " before the fog");
  await expect.poll(() => readStatus(dana)).toBe("Saved · Synced");
  const workingText = await pageText(dana);
  expect(workingText).toContain("before the fog");

  // Reopen Version history and choose Duplicate from First draft's row menu
  const historyBtn = dana
    .locator("[data-region='title_bar']")
    .getByRole("button", {
      name: DOCUMENT_WORDS.historyTab,
      exact: true,
    });
  if (await historyBtn.isVisible()) await historyBtn.click();
  await dana
    .getByRole("button", { name: DOCUMENT_WORDS.rowMenuName("First draft") })
    .click();
  await dana
    .getByRole("menuitem", { name: labelOf("doc.duplicateVersion") })
    .click();

  await dana.waitForURL(
    (at) =>
      /^\/s\/[0-9a-f-]{36}$/.test(at.pathname) &&
      at.pathname !== `/s/${originalId}`,
  );
  const copyTitle = COPIES_WORDS.copyTitle("Tide Chart");
  await expect(
    dana.getByRole("button", { name: DOCUMENT_WORDS.titleMenu(copyTitle) }),
  ).toBeVisible();
  await expect.poll(() => pageText(dana)).not.toContain("before the fog");
  await expect.poll(() => pageText(dana)).toContain("The boats are in");

  // Original still holds the later edit
  await dana.goto(`/s/${originalId}`);
  await expect.poll(() => pageText(dana)).toContain("before the fog");
});

test("exporting a project as a Project archive downloads one zip holding its scripts and manifest", async ({
  page,
}, testInfo) => {
  test.setTimeout(TIMEOUT_MS);
  await signedInAs(page, "dana", "/?panels=closed");

  // Open Export… from The Lamp Room's project row menu in the Library
  await page
    .getByRole("region", { name: LIBRARY_WORDS.projectsRegion })
    .getByRole("button", { name: DOCUMENT_WORDS.rowMenuName("The Lamp Room") })
    .click();
  await page
    .getByRole("menuitem", { name: labelOf("library.exportProject") })
    .click();

  await expect(
    page.getByRole("button", {
      name: ARCHIVE_WORDS.projectArchive,
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");

  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: EDITOR_WORDS.send.exportTitle(1) })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("The Lamp Room.zip");

  const archivePath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(archivePath);
  const bytes = await readFile(archivePath);
  // ZIP local file header signature ("PK\x03\x04") and manifest.json entry present
  expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([
    0x50, 0x4b, 0x03, 0x04,
  ]);
  expect(Buffer.from(bytes).includes("manifest.json")).toBe(true);
  expect(Buffer.from(bytes).includes("The Lamp Room.fdx")).toBe(true);
  expect(Buffer.from(bytes).includes("The Lamp Room.fountain")).toBe(true);

  await expect(page.locator("[data-tour='message_slot']")).toContainText(
    "Exported 'The Lamp Room'.",
  );
});
