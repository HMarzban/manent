// Floating Book Format Bar E2E: caret/selection retention, sheet-content alignment across edits, opening styles, line spacing, and WCAG 2.2 AA.
import AxeBuilder from "@axe-core/playwright";
import { docPath } from "@manent/demo";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { signedInAs } from "../support/tour.ts";

const RULES = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const BOOK_PATH = docPath("medium/the-salt-almanac/manuscript");
const FILM_PATH = docPath("medium/the-long-night/script");

async function violationsOf(page: Page): Promise<unknown[]> {
  const axe = new AxeBuilder({ page })
    .withTags(RULES)
    .exclude("[data-base-ui-focus-guard]");
  return (await axe.analyze()).violations;
}

/** Selects substring `phrase` inside the element matched by `selector` and focuses ProseMirror. */
async function selectPhrase(
  page: Page,
  selector: string,
  phrase: string,
): Promise<void> {
  await page.evaluate(
    ({ sel, text }) => {
      const editor = document.querySelector<HTMLElement>(".ProseMirror");
      const block = document.querySelector<HTMLElement>(sel);
      if (editor === null || block === null)
        throw new Error(`missing editor or ${sel}`);
      editor.focus({ preventScroll: true });
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node !== null) {
        const content = node.textContent ?? "";
        const idx = content.indexOf(text);
        if (idx >= 0) {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + text.length);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          document.dispatchEvent(new Event("selectionchange"));
          return;
        }
        node = walker.nextNode();
      }
      throw new Error(`phrase "${text}" not found in ${sel}`);
    },
    { sel: selector, text: phrase },
  );
}

/** Asserts every rendered `.el-chapter` keeps `pg-first` and sits cleanly inside its mounted `.mn-sheet` bounds. */
async function expectChaptersAlignedToSheets(page: Page): Promise<void> {
  const count = await page.locator("p.el.el-chapter").count();
  for (let i = 0; i < count; i++) {
    await page.locator("p.el.el-chapter").nth(i).scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        ),
    );
    const issue = await page.evaluate((index) => {
      const ch =
        document.querySelectorAll<HTMLElement>("p.el.el-chapter")[index];
      if (ch === undefined) return `missing chapter ${index}`;
      if (!ch.classList.contains("pg-first")) {
        return `chapter "${ch.textContent}" lost pg-first`;
      }
      const box = ch.getBoundingClientRect();
      if (box.height === 0) return null;
      const sheets = [
        ...document.querySelectorAll<HTMLElement>(".mn-sheet"),
      ].map((s) => ({
        page: s.dataset["page"],
        top: Math.round(s.getBoundingClientRect().top),
        bottom: Math.round(s.getBoundingClientRect().bottom),
      }));
      const enclosing = sheets.find(
        (s) => box.top >= s.top - 2 && box.bottom <= s.bottom + 2,
      );
      return enclosing === undefined
        ? `chapter "${ch.textContent}" (${Math.round(box.top)}..${Math.round(box.bottom)}) straddles sheets ${JSON.stringify(sheets)}`
        : null;
    }, i);
    expect(issue).toBeNull();
  }
}

test("Book format bar preserves caret/selection and sheet alignment across inline, colour, opening, alignment, and layout actions", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ colorScheme: "dark" });
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    // 1. Screenplay has zero floating Book toolbar.
    await signedInAs(page, "priya", `${FILM_PATH}?panels=closed`);
    await expect(page.locator("[data-tour='page'] .ProseMirror")).toBeVisible();
    await expect(page.locator("[data-tour='book-toolbar']")).toHaveCount(0);

    // 2. Open The Salt Almanac (Book): floating pill + live word count readout appear.
    await page.goto(`${BOOK_PATH}?panels=closed`);
    const editor = page.locator("[data-tour='page'] .ProseMirror");
    await expect(editor).toBeVisible();
    const toolbar = page.getByRole("toolbar", { name: "Book format" });
    await expect(toolbar).toBeVisible();
    await expect(page.locator("[data-region='status_bar']")).toContainText(
      "words",
    );

    // 3. Select a phrase in Chapter 2, apply Underline, Bold, Red colour, Yellow highlight, Superscript, Alignment:
    //    selection and ProseMirror focus must survive EVERY click, and pg-first / sheet alignment must stay intact.
    const chapter2 = page.locator("p.el.el-chapter").nth(1);
    await chapter2.scrollIntoViewIfNeeded();
    await selectPhrase(page, "p.el.el-chapter:nth-of-type(1)", "High Water");

    await toolbar.getByRole("button", { name: "Underline" }).click();
    expect(
      await page.evaluate(() => ({
        focused:
          document.activeElement?.classList.contains("ProseMirror") ?? false,
        selected: window.getSelection()?.toString() ?? "",
      })),
    ).toEqual({ focused: true, selected: "High Water" });

    await toolbar.getByRole("button", { name: "Bold" }).click();
    expect(
      await page.evaluate(() => ({
        focused:
          document.activeElement?.classList.contains("ProseMirror") ?? false,
        selected: window.getSelection()?.toString() ?? "",
      })),
    ).toEqual({ focused: true, selected: "High Water" });

    await toolbar.getByRole("button", { name: "Colour and highlight" }).click();
    const redSwatch = page.getByRole("button", { name: "Text colour: Red" });
    await expect(redSwatch).toBeVisible();
    await redSwatch.click();
    const yellowHighlight = page.getByRole("button", {
      name: "Highlight: Yellow",
    });
    await yellowHighlight.click();
    expect(
      await page.evaluate(() => ({
        focused:
          document.activeElement?.classList.contains("ProseMirror") ?? false,
        selected: window.getSelection()?.toString() ?? "",
        hasRed:
          document.querySelector("p.el.el-chapter span[data-color='red']") !==
          null,
        hasYellow:
          document.querySelector(
            "p.el.el-chapter mark[data-highlight='yellow']",
          ) !== null,
      })),
    ).toEqual({
      focused: true,
      selected: "High Water",
      hasRed: true,
      hasYellow: true,
    });
    await page.keyboard.press("Escape");

    // 4. Alignment dropdown keeps selection & focus intact after choice.
    await toolbar.getByRole("button", { name: "Alignment" }).click();
    await page.getByRole("menuitem", { name: "Right" }).click();
    expect(
      await page.evaluate(() => ({
        focused:
          document.activeElement?.classList.contains("ProseMirror") ?? false,
        selected: window.getSelection()?.toString() ?? "",
      })),
    ).toEqual({ focused: true, selected: "High Water" });

    // Restore centre alignment and verify all chapters still hold pg-first & sit cleanly inside sheets.
    await toolbar.getByRole("button", { name: "Alignment" }).click();
    await page.getByRole("menuitem", { name: "Centre" }).click();
    await expectChaptersAlignedToSheets(page);

    // 5. Drop cap + Raised cap + Flush left on first body paragraph render data-first-line without losing focus.
    await selectPhrase(page, "p.el.el-body", "harbour");
    await toolbar.getByRole("button", { name: "Drop cap" }).click();
    await expect(page.locator("p.el.el-body").first()).toHaveAttribute(
      "data-first-line",
      "drop_cap",
    );
    expect(
      await page.evaluate(
        () =>
          document.activeElement?.classList.contains("ProseMirror") ?? false,
      ),
    ).toBe(true);

    // 6. Toggle Single <-> Double line spacing in Page layout without losing sheet alignment.
    await toolbar.getByRole("button", { name: "Page layout" }).click();
    await page.getByRole("button", { name: "Single" }).click();
    await expectChaptersAlignedToSheets(page);
    await page.getByRole("button", { name: "Double" }).click();
    await page.keyboard.press("Escape");
    await expectChaptersAlignedToSheets(page);

    // 7. Phase 2 craft: Footnote mark + superscript callout + Subheading/Epigraph element options.
    await selectPhrase(page, "p.el.el-body", "clocks");
    await toolbar.getByRole("button", { name: "More text styles" }).click();
    await page.getByRole("button", { name: "Footnote" }).click();
    await page
      .getByPlaceholder("Add a note for readers…")
      .fill("Harbour tide log, 1911.");
    await page.getByRole("button", { name: "Save footnote" }).click();
    await expect(page.locator("p.el.el-body span.mn-footnote")).toHaveCount(1);
    await expect(page.locator(".mn-fn-ref")).toHaveCount(1);
    await expectChaptersAlignedToSheets(page);

    await toolbar.getByRole("button", { name: "Element" }).click();
    await expect(
      page.getByRole("menuitem", { name: /Subheading/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /Epigraph/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // 8. Phase 2 Engine 3 Book Layout: opt-in Source Serif 4, 6×9″ trim, and mirrored margins (on by default).
    await toolbar.getByRole("button", { name: "Page layout" }).click();
    await page.getByRole("switch", { name: "Book layout" }).click();
    await expect(
      page.locator('.mn-pages[data-typography="book_serif"]'),
    ).toBeVisible();
    await page.getByRole("button", { name: "6×9″" }).click();
    const mirrorSwitch = page.getByRole("switch", {
      name: "Left and right margins",
    });
    await expect(mirrorSwitch).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(
      page.locator('.mn-sheet[data-side="recto"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('.mn-sheet[data-side="verso"]').first(),
    ).toBeVisible();
    await expectChaptersAlignedToSheets(page);

    // 9. WCAG 2.2 AA check on Engine 3 Book Layout + Footnotes.
    expect(await violationsOf(page)).toEqual([]);
  } finally {
    await context.close();
  }
});
