// Bringing a Final Draft or Fountain file in: dropped on the Library, chosen in Import…, opened again, and what is
// kept with the script but not shown.
import { XML_EXPECTED } from "@manent/formats/testing";
import {
  DOCUMENT_WORDS,
  IMPORT_WORDS,
  KEPT_LABELS,
  MENU_WORDS,
  formatDate,
} from "@manent/ui";
import { expect, test } from "@playwright/test";
import { blocks } from "../editor/support.ts";
import { labelOf, pressKeyOf } from "../support/interface.ts";
import {
  dropFiles,
  fixtureFile,
  fixturePath,
  fixtureText,
  messageSlot,
  onLibrary,
  openedScript,
  pagesOf,
} from "./support.ts";

// a message waits while the one before it is shown, for up to 30 s
const QUEUED_MS = 40_000;

const ELEMENTS_SUMMARY =
  "Imported 'elements': 2 pages, 1 scene, 0 notes. Page count can differ from Final Draft. Shortcuts follow Final Draft.";

test("an FDX dropped on the Library opens as a script and says what came in", async ({
  page,
}) => {
  await onLibrary(page, "dana");
  await dropFiles(page, [fixtureFile("fdx/elements.fdx")]);
  await openedScript(page);
  const slot = messageSlot(page);
  await expect(slot.getByText(ELEMENTS_SUMMARY)).toBeVisible();
  await expect(
    slot.getByRole("button", { name: IMPORT_WORDS.seeShortcuts }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const found = await blocks(page);
      const heading = found.findIndex((b) => b.type === "scene_heading");
      const pages = await pagesOf(page);
      const page2 = pages.find((p) => p.label === "2")?.block ?? -1;
      return {
        heading: found[heading]?.text,
        onPage1: heading >= 0 && heading < page2,
        labels: pages.map((p) => p.label),
      };
    })
    .toEqual({
      heading: "INT. LAMP ROOM - NIGHT",
      onPage1: true,
      labels: ["1", "2"],
    });
});

test("Import… opens a Fountain file", async ({ page }) => {
  await onLibrary(page, "dana");
  const chooser = page.waitForEvent("filechooser");
  await pressKeyOf(page, "app.palette");
  await page.getByRole("option", { name: MENU_WORDS.file }).click();
  await page.getByRole("option", { name: labelOf("file.import") }).click();
  await (await chooser).setFiles(fixturePath("fountain/title-notes.fountain"));
  await openedScript(page);
  await expect(
    page.getByRole("button", {
      name: DOCUMENT_WORDS.titleMenu("The Long Night"),
    }),
  ).toBeVisible();
});

test("the same file again opens the earlier script, and Import again makes a second", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await onLibrary(page, "dana");
  await dropFiles(page, [fixtureFile("fdx/elements.fdx")]);
  const first = await openedScript(page);
  const slot = messageSlot(page);
  await expect(slot.getByText(ELEMENTS_SUMMARY)).toBeVisible();
  await page.getByRole("button", { name: DOCUMENT_WORDS.back }).click();
  await page.waitForURL((at) => at.pathname === "/");
  await dropFiles(page, [fixtureFile("fdx/elements.fdx")]);
  await page.waitForURL((at) => at.pathname === `/s/${first}`);
  const day = formatDate(await page.evaluate(() => Date.now()));
  await expect(
    slot.getByText(IMPORT_WORDS.reopened("elements", day)),
  ).toBeVisible({ timeout: QUEUED_MS });
  await slot.getByRole("button", { name: IMPORT_WORDS.importAgain }).click();
  const second = await openedScript(page, first);
  expect(second).not.toBe(first);
  await expect(slot.getByText(ELEMENTS_SUMMARY)).toBeVisible({
    timeout: QUEUED_MS,
  });
});

test("the browser's own XML parser reads every XML fixture as the tests do", async ({
  page,
}) => {
  await onLibrary(page, "dana");
  const read: Record<string, unknown> = {};
  for (const name of Object.keys(XML_EXPECTED))
    read[name] = await page.evaluate(
      (text) => {
        const hook: unknown = Reflect.get(window, "__manent");
        const domXml: unknown = Reflect.get(Object(hook), "domXml");
        if (typeof domXml !== "function")
          throw new Error("the test build's XML parser is missing");
        return Reflect.apply(domXml, null, [text]);
      },
      fixtureText(`xml/${name}`),
    );
  expect(read).toEqual(XML_EXPECTED);
});

test("Details → Script → Import lists what is kept but not shown", async ({
  page,
}) => {
  await onLibrary(page, "dana");
  await dropFiles(page, [fixtureFile("fdx/kept.fdx")]);
  await openedScript(page);
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
    group.getByRole("heading", { name: IMPORT_WORDS.notShownTitle }),
  ).toBeVisible();
  await expect(group.locator(".mn-row")).toHaveText([
    `${KEPT_LABELS.paragraph_part} (2)`,
    KEPT_LABELS.run_part,
    KEPT_LABELS.title_page,
    KEPT_LABELS.document_part("ElementSettings"),
    KEPT_LABELS.document_part("HeaderAndFooter"),
    KEPT_LABELS.document_part("SmartType"),
    KEPT_LABELS.document_part("TagData"),
    KEPT_LABELS.document_part("ListItems"),
    KEPT_LABELS.document_part("FutureThing"),
  ]);
});
