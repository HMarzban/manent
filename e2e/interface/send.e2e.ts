import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { signedInAs } from "../support/tour.ts";

// leo's stand-in document
const STAND_IN_DOC_ID = "00000000-0000-4000-8000-0000006c656f";
const DOC_ID = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";

/** The test form's address: its title, its button and its rows are read from it. */
const sendDraft = (docId: string, search: Record<string, string>): string =>
  `/s/${docId}/send/send_draft?${new URLSearchParams(search).toString()}`;

/** Where the caret was kept: its text node, found again still in the page, with its text and offset; and how far the page is scrolled. */
const caretAndScroll = (page: Page, remember: boolean) =>
  page.evaluate((keep) => {
    if (keep) {
      const selection = window.getSelection();
      Reflect.set(window, "__caret", {
        node: selection?.anchorNode ?? null,
        offset: selection?.anchorOffset,
      });
    }
    const kept: unknown = Reflect.get(window, "__caret");
    const node: unknown =
      typeof kept === "object" && kept !== null
        ? Reflect.get(kept, "node")
        : null;
    return {
      caret:
        node instanceof Node &&
        node.isConnected &&
        node.parentElement?.closest("[data-editor-host]") !== null
          ? [node.textContent, Reflect.get(Object(kept), "offset")]
          : null,
      scrollTop: document.querySelector("[data-region='page']")?.scrollTop,
    };
  }, remember);

/** The page's scroll offset once two reads in a row agree. */
async function settledScroll(region: Locator): Promise<number> {
  let last: number | null = null;
  await expect
    .poll(async () => {
      const top = await region.evaluate((element) => element.scrollTop);
      const settled = top === last;
      last = top;
      return settled;
    })
    .toBe(true);
  return last ?? 0;
}

test("Back from Send returns to the document with its caret and scroll as they were", async ({
  page,
}) => {
  await signedInAs(page, "leo", "/__stand-in");
  await page.getByRole("textbox").click();
  for (let line = 0; line < 80; line++) await page.keyboard.press("Enter");
  await page.keyboard.type("The lamp is lit");
  for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowLeft");
  const region = page.locator("[data-region='page']");
  // typing scrolls the caret into view; the page is moved once that has stopped
  await settledScroll(region);
  await region.evaluate((element) => element.scrollTo({ top: 300 }));
  await settledScroll(region);
  const before = await caretAndScroll(page, true);
  // the app moves to the address itself, as a command that opens Send does
  await page.evaluate(
    (href) => window.history.pushState(null, "", href),
    sendDraft(STAND_IN_DOC_ID, {
      title: "Send draft",
      button: "Send draft",
      from: "/__stand-in",
    }),
  );
  await expect(
    page.getByRole("heading", { name: "Send draft", level: 1 }),
  ).toBeFocused();
  await page.getByRole("button", { name: /^‹ / }).click();
  await expect(page).toHaveURL(/\/__stand-in$/);
  await settledScroll(region);
  expect(await caretAndScroll(page, false)).toEqual(before);
  expect(before).toEqual({ caret: ["The lamp is lit", 11], scrollTop: 300 });
});

test("the Send screen passes the accessibility rules and works by keys alone", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signedInAs(
    page,
    "leo",
    sendDraft(DOC_ID, {
      title: "Send draft",
      button: "Send draft",
      what: "Whole script",
      to: "Nobody",
    }),
  );
  await expect(
    page.getByRole("heading", { name: "Send draft", level: 1 }),
  ).toBeFocused();
  // the covered document has drawn its page, taller than the window, so the page holds text out of view
  await expect(
    page.locator("[data-region='page'] .mn-page-view"),
  ).toBeAttached();
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  // at Interface size 200 %, nothing scrolls sideways
  const sideways = await page.evaluate(() => {
    document.documentElement.setAttribute("data-ui-size", "200");
    return [...document.querySelectorAll("*")]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .filter((element) =>
        ["auto", "scroll"].includes(getComputedStyle(element).overflowX),
      )
      .map((element) => element.outerHTML.slice(0, 80));
  });
  expect([axe.violations, sideways]).toEqual([[], []]);
  // WebKit on macOS, as Safari does, tabs to a button only with Option held
  const tab =
    browserName === "webkit" && process.platform === "darwin"
      ? "Alt+Tab"
      : "Tab";
  await page.keyboard.press(tab);
  await expect(page.getByRole("button", { name: "Send draft" })).toBeFocused();
  await page.keyboard.press(`Shift+${tab}`);
  await expect(page.getByRole("button", { name: /^‹ / })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/s/${DOC_ID}$`));
});
