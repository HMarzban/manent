// Offline browser import of text PDF, Word (.docx) and plain text (.txt) fixtures with exact summary lines.
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { IMPORT_WORDS, UNREAD_LABELS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import { blocks } from "../editor/support.ts";
import { setConnection } from "../offline/support.ts";
import { labelOf, pressKeyOf } from "../support/interface.ts";
import { dropFiles, messageSlot, onLibrary, openedScript } from "./support.ts";
import type { GivenFile } from "./support.ts";

const TIMEOUT_MS = 120_000;
const FIXTURES = join(import.meta.dirname, "..", "fixtures", "formats");

const formatFixture = (name: string): GivenFile => ({
  name: basename(name),
  bytes: new Uint8Array(readFileSync(join(FIXTURES, name))),
});

const PDF_SUMMARY = `${IMPORT_WORDS.summary("every-key-but-one-first-draft", 104, 54, 0)} ${IMPORT_WORDS.pdfClause}`;
const SCENE_14_SUMMARY = IMPORT_WORDS.summary(
  "every-key-but-one-scene-14",
  1,
  1,
  0,
);

const SCENE_14_TYPES = [
  "scene_heading",
  "action",
  "action",
  "action",
  "character",
  "dialogue",
  "character",
  "dialogue",
  "action",
  "action",
  "character",
  "dialogue",
  "action",
  "character",
  "dialogue",
  "action",
] as const;

test("a text PDF imports offline in the browser with the PDF summary line and unread furniture note", async ({
  page,
}) => {
  test.setTimeout(TIMEOUT_MS);
  await onLibrary(page, "dana");
  await setConnection(page, "offline");
  await dropFiles(page, [formatFixture("every-key-but-one-first-draft.pdf")]);
  await openedScript(page);

  await expect(messageSlot(page).getByText(PDF_SUMMARY)).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(
      async () =>
        (await blocks(page)).filter((b) => b.type === "scene_heading").length,
    )
    .toBe(54);

  await pressKeyOf(page, "app.palette");
  await page.keyboard.type(labelOf("doc.scriptSettings"));
  await page.keyboard.press("Enter");
  const group = page.locator("section", {
    has: page.getByRole("heading", {
      name: IMPORT_WORDS.groupTitle,
      exact: true,
    }),
  });
  await expect(
    group.getByRole("heading", { name: IMPORT_WORDS.notBroughtInTitle }),
  ).toBeVisible();
  await expect(group.locator(".mn-row")).toHaveText([
    UNREAD_LABELS.page_furniture,
  ]);
});

test("a Word .docx file imports offline in the browser with its exact summary line and element styles", async ({
  page,
}) => {
  await onLibrary(page, "dana");
  await setConnection(page, "offline");
  await dropFiles(page, [formatFixture("every-key-but-one-scene-14.docx")]);
  await openedScript(page);

  await expect(messageSlot(page).getByText(SCENE_14_SUMMARY)).toBeVisible();
  await expect
    .poll(async () => (await blocks(page)).map((b) => b.type))
    .toEqual([...SCENE_14_TYPES]);
  const imported = await blocks(page);
  expect(imported[0]?.text).toBe("INT. SEAMEN'S INSTITUTE - HALL - NIGHT");
  expect(imported[4]?.text).toBe("LILY");
  expect(imported[5]?.text).toBe("Do you want me to find the switch?");
});

test("a plain text .txt file imports offline in the browser with its exact summary line and elements", async ({
  page,
}) => {
  await onLibrary(page, "dana");
  await setConnection(page, "offline");
  await dropFiles(page, [formatFixture("every-key-but-one-scene-14.txt")]);
  await openedScript(page);

  await expect(messageSlot(page).getByText(SCENE_14_SUMMARY)).toBeVisible();
  await expect
    .poll(async () => (await blocks(page)).map((b) => b.type))
    .toEqual([...SCENE_14_TYPES]);
  const imported = await blocks(page);
  expect(imported[0]?.text).toBe("INT. SEAMEN'S INSTITUTE - HALL - NIGHT");
  expect(imported[6]?.text).toBe("MIRA");
  expect(imported[7]?.text).toBe("No. Play me a C. The top one.");
});
