// Sections in the browser: their intrinsic size against their real height, which ones are skipped, the caret
// across their boundaries, and spellcheck by the script's size.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { serveHarness } from "./harness/serve.ts";

let harness: { url: string; stop(): Promise<void> };
test.beforeAll(async () => {
  harness = await serveHarness("editor");
});
test.afterAll(async () => {
  await harness.stop();
});

// The probe is reached with brackets: the lint refuses a member name that begins with an underscore.
async function open(page: Page, query: string): Promise<void> {
  await page.goto(`${harness.url}?${query}`);
  expect(await page.evaluate(() => window["__mn"].ready)).toBe("ready");
}

/** Whether this engine keeps sections it does not show unrendered: the page drops the rule with class no-cv. */
function hasContainment(page: Page): Promise<boolean> {
  return page.evaluate(
    () => !document.querySelector(".mn-pages")!.classList.contains("no-cv"),
  );
}

/**
 * Each section's intrinsic size, as written (none where the engine has no containment), the engine's height that
 * it is written from (its serialised form is rounded), and the section's height laid out in full.
 */
function sizes(page: Page): Promise<[boolean, number, number][]> {
  return page.evaluate(() => {
    const sections = [...document.querySelectorAll<HTMLElement>(".section")];
    const written = sections.map((s) => s.style.containIntrinsicSize !== "");
    const heights = window["__mn"].sectionHeights();
    for (const s of sections) s.style.contentVisibility = "visible";
    return sections.map((s, i) => [
      written[i]!,
      heights[i]!,
      s.getBoundingClientRect().height,
    ]);
  });
}

test("every section's intrinsic size is its real height", async ({
  page,
}, info) => {
  let largest = 0;
  for (const query of [
    "script=corpus:3000",
    "script=corpus:3000&format=multicam",
    "script=corpus:3000&format=manuscript&paper=a4",
  ]) {
    await open(page, query);
    const contained = await hasContainment(page);
    const found = await sizes(page);
    if (!contained) {
      expect(found.filter(([written]) => written)).toEqual([]);
      continue;
    }
    expect(found.filter(([written]) => !written)).toEqual([]);
    const differences = found.map(([, model, height]) =>
      Math.abs(model - height),
    );
    largest = Math.max(largest, ...differences);
    expect(differences.filter((d) => !(d <= 0.02))).toEqual([]);
  }
  info.annotations.push({
    type: "largest difference",
    description: `${largest} px`,
  });
});

test("only the section that changed is touched", async ({ page }) => {
  await open(page, "script=corpus:750");
  const heading = page.locator(".section").nth(3).locator("p.el-scene_heading");
  await heading.first().click();
  const at = () =>
    page.evaluate(() => window["__mn"].view.state.selection.from);
  await expect.poll(at).toBeGreaterThan(2);
  const [updates, pages] = await page.evaluate(() => [
    window["__mn"].sectionUpdates(),
    window["__mn"].pages(),
  ]);
  await page.keyboard.type("x");
  // a scene heading of one line keeps it, so no break moves
  expect(
    await page.evaluate(() => [
      window["__mn"].sectionUpdates(),
      window["__mn"].pages(),
    ]),
  ).toEqual([updates + 1, pages]);
});

test("sections far from the selection are skipped and its neighbours are not", async ({
  page,
}) => {
  await open(page, "script=corpus:3000");
  await page.locator(".section").nth(20).locator("p.el").first().click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll(".section.keep")].map((s) =>
          [...document.querySelectorAll(".section")].indexOf(s),
        ),
      ),
    )
    .toEqual([19, 20, 21]);
  const skipped = (await hasContainment(page)) ? "auto" : "visible";
  expect(
    await page.evaluate(() =>
      [0, 19, 20, 21].map(
        (i) =>
          getComputedStyle(document.querySelectorAll(".section")[i]!)
            .contentVisibility,
      ),
    ),
  ).toEqual([skipped, "visible", "visible", "visible"]);
});

test("a section drawn and then scrolled past takes the height its pages give it when it changes", async ({
  page,
}) => {
  await open(page, "script=corpus:3000");
  // the selection far below, so that the section changed is never kept
  await page.evaluate(() => {
    const { view, select } = window["__mn"];
    const below = view.dom.querySelectorAll(".section")[20]!;
    select(view.posAtDOM(below.querySelector("p.el")!, 0));
  });
  const scrollTo = (section: number) =>
    page.evaluate(async (i) => {
      const place = document.getElementById("place")!;
      const at = document.querySelectorAll(".section")[i]!;
      place.scrollTop +=
        at.getBoundingClientRect().top - place.getBoundingClientRect().top;
      await window["__mn"].idle();
    }, section);
  await scrollTo(5);
  await scrollTo(12);
  const [before, laidOut, model] = await page.evaluate(async () => {
    const { view, sectionHeights, idle } = window["__mn"];
    const was = sectionHeights()[5]!;
    const block = view.dom
      .querySelectorAll(".section")[5]!
      .querySelector("p.el-action")!;
    view.dispatch(
      view.state.tr.insertText(
        "The tide turns under the harbour wall and the boats knock. ".repeat(
          10,
        ),
        view.posAtDOM(block, 0),
      ),
    );
    await idle();
    return [
      was,
      view.dom.querySelectorAll(".section")[5]!.getBoundingClientRect().height,
      sectionHeights()[5]!,
    ];
  });
  expect(
    { grown: model > before, laidOut: Math.abs(laidOut - model) <= 0.02 },
    `laid out at ${laidOut} px, its pages give ${model} px`,
  ).toEqual({ grown: true, laidOut: true });
});

test("the caret crosses a section boundary it cannot see", async ({ page }) => {
  await open(page, "script=corpus:3000");
  // the start of section k's last block, an action of one line at the text edge, and the next section's first line
  const places = await page.evaluate(() => {
    const { view } = window["__mn"];
    const sections = [...view.dom.querySelectorAll<HTMLElement>(".section")];
    const k = sections.findIndex((s, i) => {
      const last = s.querySelector<HTMLElement>("p.el:last-of-type");
      return (
        i > 2 &&
        last !== null &&
        last.classList.contains("el-action") &&
        last.textContent !== "" &&
        Number.parseFloat(getComputedStyle(last).paddingTop) +
          Number.parseFloat(getComputedStyle(last).lineHeight) ===
          last.offsetHeight
      );
    });
    const last = sections[k]!.querySelector<HTMLElement>("p.el:last-of-type")!;
    const next = sections[k + 1]!.querySelector<HTMLElement>("p.el")!;
    return { from: view.posAtDOM(last, 0), to: view.posAtDOM(next, 0) };
  });
  const select = (anchor: number) =>
    page.evaluate((pos) => {
      window["__mn"].select(pos);
      document.getElementById("place")!.scrollTop = 0;
    }, anchor);
  const selection = () =>
    page.evaluate(() => {
      const { anchor, head } = window["__mn"].view.state.selection;
      return [anchor, head];
    });
  await select(places.from);
  await page.keyboard.press("ArrowDown");
  await expect.poll(selection).toEqual([places.to, places.to]);
  await select(places.from);
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(selection).toEqual([places.from, places.to]);
  await select(places.from);
  await page.keyboard.press("ControlOrMeta+End");
  const end = await page.evaluate(
    () => window["__mn"].view.state.doc.content.size - 2,
  );
  expect(await selection()).toEqual([end, end]);
  await page.keyboard.press("Shift+ControlOrMeta+Home");
  expect(await selection()).toEqual([end, 2]);
});

test("spellcheck follows the script's size", async ({ page }) => {
  const spellcheck = async (script: string) => {
    await open(page, `script=${script}`);
    return page.locator(".mn-page-view").getAttribute("spellcheck");
  };
  expect([
    await spellcheck("corpus:750"),
    await spellcheck("corpus:8000"),
  ]).toEqual(["true", "false"]);
});
