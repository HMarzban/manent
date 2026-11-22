// The appearance in the browser: no flash at start-up, a theme change that is one attribute, the dark sheet, sizes, focus, motion and forced colours.
import { SETTINGS } from "@manent/settings";
import { LIBRARY_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Browser, BrowserContextOptions, Page } from "@playwright/test";
import {
  labelOf,
  longestMark,
  markDurations,
  pressKeyOf,
  runFromPalette,
} from "../support/interface.ts";
import { makeScript, openMadeScript } from "../support/made-script.ts";
import { signedInAs } from "../support/tour.ts";

const DOC_ID = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const BOOT_KEY = "manent.boot";

const DARK = labelOf("setting.appearance.theme.dark");
const WHITE_PAGE = SETTINGS.get("appearance.whitePage").label;

/** One sRGB channel, 0 to 255, as linear light. */
function linear(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a computed `rgb(…)` colour. */
function luminance(colour: string): number {
  const [r = 0, g = 0, b = 0] = (colour.match(/[\d.]+/g) ?? []).map(Number);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * Loads `path` in a new context of `scheme` whose boot cache holds `cache` (none when null), and returns every distinct
 * background the page showed, one per frame, until the app's frame replaced the static one.
 */
async function backgroundsAtStart(
  browser: Browser,
  options: { scheme: "light" | "dark"; cache: string | null; path: string },
): Promise<string[]> {
  const context = await browser.newContext({ colorScheme: options.scheme });
  const page = await context.newPage();
  if (options.path !== "/choose") {
    await signedInAs(page, "you");
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  }
  await page.addInitScript(
    ({ key, theme }) => {
      if (theme !== null)
        sessionStorage.setItem(
          key,
          JSON.stringify([["a", "data-theme", theme]]),
        );
      const seen: string[] = [];
      Reflect.set(window, "__backgrounds", seen);
      const record = (): void => {
        const hook: unknown = Reflect.get(window, "__manent");
        const marks: unknown =
          typeof hook === "object" && hook !== null
            ? Reflect.apply(Reflect.get(hook, "readMarks"), hook, ["app.frame"])
            : [];
        if (Array.isArray(marks) && marks.length > 0) return;
        // the canvas takes the body's background; the root's own stays transparent
        const painted = document.body ?? document.documentElement;
        seen.push(getComputedStyle(painted).backgroundColor);
        requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    },
    { key: BOOT_KEY, theme: options.cache },
  );
  await page.goto(options.path);
  await expect.poll(() => markDurations(page, "app.frame")).toHaveLength(1);
  const seen: string[] = await page.evaluate(() =>
    Reflect.get(window, "__backgrounds"),
  );
  await context.close();
  return [...new Set(seen)];
}

test("no flash of the wrong theme at start-up", async ({ browser }) => {
  const shown: Record<string, string[]> = {};
  for (const path of ["/", `/s/${DOC_ID}`]) {
    shown[`dark cache ${path}`] = await backgroundsAtStart(browser, {
      scheme: "light",
      cache: "dark",
      path,
    });
    shown[`light cache ${path}`] = await backgroundsAtStart(browser, {
      scheme: "dark",
      cache: "light",
      path,
    });
  }
  shown["no cache, dark system"] = await backgroundsAtStart(browser, {
    scheme: "dark",
    cache: null,
    path: "/choose",
  });
  shown["no cache, light system"] = await backgroundsAtStart(browser, {
    scheme: "light",
    cache: null,
    path: "/choose",
  });
  const themeOf: Record<string, "dark" | "light"> = {
    "dark cache /": "dark",
    "light cache /": "light",
    [`dark cache /s/${DOC_ID}`]: "dark",
    [`light cache /s/${DOC_ID}`]: "light",
    "no cache, dark system": "dark",
    "no cache, light system": "light",
  };
  // a load whose real frame is drawn before its first animation frame shows the static frame not at all, so a
  // theme's background is the first one any of its loads showed
  const backgroundOf = (theme: "dark" | "light"): string =>
    Object.keys(themeOf)
      .filter((load) => themeOf[load] === theme)
      .flatMap((load) => shown[load] ?? [])[0] ?? "";
  const [dark, light] = [backgroundOf("dark"), backgroundOf("light")];
  const expected = Object.fromEntries(
    Object.entries(themeOf).map(([load, theme]) => [
      load,
      theme === "dark" ? dark : light,
    ]),
  );
  const wrong = Object.entries(shown).flatMap(([load, backgrounds]) =>
    backgrounds.filter((b) => b !== expected[load]).map((b) => [load, b]),
  );
  expect([Object.keys(shown).toSorted(), wrong]).toEqual([
    Object.keys(expected).toSorted(),
    [],
  ]);
  expect(luminance(dark)).toBeLessThan(luminance(light));
});

test("a theme change is an attribute and nothing else, within its budget", async ({
  page,
}) => {
  await signedInAs(page, "you");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await page.evaluate(() => {
    const names: string[] = [];
    Reflect.set(window, "__rootAttributes", names);
    new MutationObserver((records) => {
      for (const record of records) names.push(record.attributeName ?? "");
    }).observe(document.documentElement, { attributes: true });
  });
  await runFromPalette(page, DARK);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).not.toHaveAttribute("data-switching");
  const names: string[] = await page.evaluate(() =>
    Reflect.get(window, "__rootAttributes"),
  );
  expect([...new Set(names)].toSorted()).toEqual([
    "data-switching",
    "data-theme",
  ]);
  await expect(page.locator("html")).not.toHaveAttribute("style");
  expect(await longestMark(page, "ui.setting.apply")).toBeLessThan(100);
});

/** The sheet's paper and its ink, as luminances. */
const sheetColours = (page: Page): Promise<{ paper: number; ink: string }> =>
  page
    .locator(".mn-sheet")
    .evaluate((sheet) => {
      const ink = document.createElement("span");
      ink.style.color = "var(--page-ink)";
      sheet.append(ink);
      const colours = {
        paper: getComputedStyle(sheet).backgroundColor,
        ink: getComputedStyle(ink).color,
      };
      ink.remove();
      return colours;
    })
    .then(({ paper, ink }) => ({ paper: luminance(paper), ink }));

test("in the dark theme the sheet is dark by default, and white page makes it paper", async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await openMadeScript(page, "you", DOC_ID);
  // the editor's sheet, once the editor has replaced its placeholder
  await expect(page.locator(".mn-page-view")).toBeVisible();
  const dark = await sheetColours(page);
  expect(dark.paper).toBeLessThan(luminance(dark.ink));
  await runFromPalette(page, WHITE_PAGE);
  await expect(page.locator("html")).toHaveAttribute("data-white-page", "");
  const white = await sheetColours(page);
  expect(white.paper).toBeGreaterThan(luminance(white.ink));
  expect(await longestMark(page, "ui.setting.apply")).toBeLessThan(100);
  await expect(page.locator("html")).not.toHaveAttribute("style");
  await context.close();
});

test("the browsers in use support light-dark()", async ({ page }) => {
  expect(
    await page.evaluate(() => CSS.supports("color", "light-dark(#000, #fff)")),
  ).toBe(true);
});

/** A context whose person You has Interface size `size` kept on this device. */
async function youAt(
  browser: Browser,
  size: "100" | "200",
  options: BrowserContextOptions = {},
): Promise<Page> {
  const context = await browser.newContext(options);
  await context.addInitScript((value) => {
    localStorage.setItem(
      "manent.device.you",
      JSON.stringify({ "device.interfaceSize": value }),
    );
  }, size);
  const page = await context.newPage();
  await signedInAs(page, "you");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  return page;
}

/** Focuses `target` after a key press, so it matches :focus-visible, and waits for its transitions to end. */
async function focusByKey(page: Page, target: string): Promise<void> {
  await page.keyboard.press("Shift");
  await page.locator(target).focus();
  await page
    .locator(target)
    .evaluate((element) =>
      Promise.all(element.getAnimations().map((a) => a.finished)),
    );
}

const NEW_SCRIPT = `[data-region="title_bar"] [data-tour="library.newScript"]`;

test("a default button is 28 px high, 56 px at 200 %, and its focus ring is one 2 px outline", async ({
  browser,
}) => {
  const sizes: Record<string, [number, string]> = {};
  for (const size of ["100", "200"] as const) {
    const page = await youAt(browser, size);
    await expect(page.locator(NEW_SCRIPT)).toHaveText(LIBRARY_WORDS.newScript);
    sizes[size] = await page
      .locator(NEW_SCRIPT)
      .evaluate((button) => [
        button.getBoundingClientRect().height,
        getComputedStyle(button).fontSize,
      ]);
    if (size === "100") {
      await focusByKey(page, NEW_SCRIPT);
      const ring = await page.locator(NEW_SCRIPT).evaluate((button) => {
        const style = getComputedStyle(button);
        return {
          outline: [
            style.outlineStyle,
            style.outlineWidth,
            style.outlineOffset,
          ],
          // every layer of the stock halo is fully transparent
          shadows:
            style.boxShadow === "none"
              ? []
              : style.boxShadow.split(/,(?![^(]*\))/),
        };
      });
      expect(ring.outline).toEqual(["solid", "2px", "2px"]);
      for (const layer of ring.shadows)
        expect(layer.trim().startsWith("rgba(0, 0, 0, 0)")).toBe(true);
    }
    await page.context().close();
  }
  expect(sizes).toEqual({ "100": [28, "13px"], "200": [56, "26px"] });
});

// the popups that animate as they open: a menu, the palette's field, a dialog
const POPUPS = "[role='menu'], [role='combobox'], [role='alertdialog']";

/**
 * For each popup, by its role, every distinct transform, translate and scale it had, frame by frame, since the page
 * loaded or was last read; then forgets them.
 */
async function motionSeen(page: Page): Promise<Record<string, string[]>> {
  await page.waitForFunction(
    (popups) =>
      [...document.querySelectorAll(popups)].every(
        (element) => element.getAnimations().length === 0,
      ),
    POPUPS,
  );
  return page.evaluate(() => {
    const seen: Record<string, string[]> = Reflect.get(window, "__motion");
    const distinct = Object.fromEntries(
      Object.entries(seen).map(([role, frames]) => [
        role,
        [...new Set(frames)],
      ]),
    );
    for (const role of Object.keys(seen)) Reflect.deleteProperty(seen, role);
    return distinct;
  });
}

// a transform that leaves an element where it is
const IDENTITY = ["none", "matrix(1, 0, 0, 1, 0, 0)"];

/** True when a popup kept one placement through every frame it was drawn in (a centring translate stays), and never scaled. */
function heldStill(frames: readonly string[] = []): boolean {
  const placements = new Set(
    frames.map((frame) => {
      const [transform = "", translate = "", scale = ""] = frame.split(" | ");
      return IDENTITY.includes(transform) && scale === "none"
        ? translate
        : null;
    }),
  );
  return placements.size === 1 && !placements.has(null);
}

test("under reduced motion nothing scales or slides", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.addInitScript((popups) => {
    const seen: Record<string, string[]> = {};
    Reflect.set(window, "__motion", seen);
    const sample = (): void => {
      for (const element of document.querySelectorAll(popups)) {
        const role = element.getAttribute("role") ?? "";
        const style = getComputedStyle(element);
        (seen[role] ??= []).push(
          `${style.transform} | ${style.translate} | ${style.scale}`,
        );
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, POPUPS);
  const page = await context.newPage();
  await signedInAs(page, "you");
  await page
    .locator('[data-region="title_bar"] [data-slot="dropdown-menu-trigger"]')
    .first()
    .click();
  await expect(page.getByRole("menu")).toBeVisible();
  const menu = await motionSeen(page);
  await page.keyboard.press("Escape");
  await pressKeyOf(page, "app.palette");
  await expect(page.getByRole("combobox")).toBeFocused();
  const palette = await motionSeen(page);
  await page.goto("/__states?surface=consequence_dialog");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  const dialog = await motionSeen(page);
  expect({
    menu: heldStill(menu.menu),
    palette: heldStill(palette.combobox),
    dialog: heldStill(dialog.alertdialog),
  }).toEqual({ menu: true, palette: true, dialog: true });
  await context.close();
});

test("in forced colours every state has an outline or a system colour", async ({
  browser,
}) => {
  const page = await youAt(browser, "100", { forcedColors: "active" });
  const highlight = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.cssText = "forced-color-adjust: none; background: Highlight";
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  });
  const outlineOf = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.outlineStyle, style.outlineWidth];
      });
  const current = await page
    .locator(".mn-row[aria-current='true']")
    .first()
    .evaluate((row) => getComputedStyle(row).backgroundColor);
  await focusByKey(page, NEW_SCRIPT);
  const button = await outlineOf(NEW_SCRIPT);
  await page.keyboard.press("Escape");
  const switcher = page
    .locator('[data-region="title_bar"] [data-slot="dropdown-menu-trigger"]')
    .first();
  await switcher.focus();
  await page.keyboard.press("Enter");
  const item = await outlineOf("[role='menuitem']:focus");
  await page.keyboard.press("Escape");
  await makeScript(page, DOC_ID);
  await page.goto(`/s/${DOC_ID}`);
  // the editor's sheet, once the editor has replaced its placeholder
  await expect(page.locator(".mn-page-view")).toBeVisible();
  const sheet = await outlineOf(".mn-sheet");
  expect({ current, button, item, sheet }).toEqual({
    current: highlight,
    button: ["solid", "2px"],
    item: ["solid", "2px"],
    sheet: ["solid", "2px"],
  });
  await page.context().close();
});

test("at 200 % in 1,280 × 800 nothing scrolls sideways, and every target is at least 24 × 24", async ({
  browser,
}) => {
  const page = await youAt(browser, "200", {
    viewport: { width: 1280, height: 800 },
  });
  const found: Record<string, unknown> = {};
  for (const path of ["/", `/s/${DOC_ID}`]) {
    await page.goto(path);
    // the Library's heading takes focus, and a script's page at the caret
    await expect(
      path === "/"
        ? page.getByRole("heading", { level: 1 })
        : page.locator("[data-region='page'] .mn-page-view"),
    ).toBeFocused();
    found[path] = await page.evaluate(() => {
      const root = document.documentElement;
      const sideways = [...document.querySelectorAll("*")].filter((element) => {
        const { overflowX } = getComputedStyle(element);
        return (
          (overflowX === "auto" || overflowX === "scroll") &&
          element.scrollWidth > element.clientWidth
        );
      }).length;
      const small = [
        ...document.querySelectorAll(
          "button, a[href], input, select, [role='tab'], [role='menuitem']",
        ),
      ]
        // a radio's hidden input belongs to the form, not to the pointer: the radio drawn beside it is the target
        .filter(
          (element) =>
            element.checkVisibility() &&
            element.getAttribute("aria-hidden") !== "true",
        )
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width < 24 || box.height < 24;
        })
        .map(
          (element) =>
            element.getAttribute("aria-label") ?? element.textContent,
        );
      return { wider: root.scrollWidth > root.clientWidth, sideways, small };
    });
  }
  const none = { wider: false, sideways: 0, small: [] };
  expect(found).toEqual({ "/": none, [`/s/${DOC_ID}`]: none });
  await page.context().close();
});
