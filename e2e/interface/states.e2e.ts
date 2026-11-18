// Every surface in every state it reaches, on the test build's gallery: the accessibility rules, the words, and a new script's chrome.
import AxeBuilder from "@axe-core/playwright";
import { COMMANDS } from "@manent/commands";
import { DEMO_PEOPLE, DEMO_WORKSPACES } from "@manent/demo";
import { SETTINGS } from "@manent/settings";
import {
  DIALOG_WORDS,
  DOCUMENT_WORDS,
  LIBRARY_WORDS,
  MENU_WORDS,
  PREFERENCES_WORDS,
  SEND_WORDS,
  SYNC_CENTRE_WORDS,
  TOUR_WORDS,
  keyLabel,
  statusText,
} from "@manent/ui";
import type { StatusFacts } from "@manent/ui";
import type { Platform } from "@manent/settings";
import { expect, test } from "@playwright/test";
import type { Browser, BrowserContextOptions, Page } from "@playwright/test";
import { labelOf, platformOf } from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";

const RULES = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
// the gallery's Send form takes its title and its button from the address
const SEND_TITLE = SYNC_CENTRE_WORDS.exportCopy;
// the local status every fixture document starts from, as the test build's document source gives it
const LOCAL: StatusFacts = {
  access: "edit",
  device: "ok",
  network: "online",
  server: "synced",
  waiting: 0,
  notSent: 0,
  offlineSinceAt: null,
  neverSynced: true,
  shell: "web",
  toReview: 0,
  now: 0,
};

/** The words of the status for `facts` laid over the local status, as its two slots read them. */
function statusWords(facts: Partial<StatusFacts>): string[] {
  const words = statusText({ ...LOCAL, ...facts });
  return words.spans || words.device === null
    ? [words.server]
    : [words.device, words.server];
}

const signInLabel = labelOf("app.signInToSync");
const signInReason =
  COMMANDS.find((command) => command.id === "app.signInToSync")?.whyNot?.() ??
  "";

// the chooser's alert is the web app's own sentence, and the boundary check keeps the tests out of the app's modules
const CHOOSER_UNREACHABLE =
  "Can't reach Manent. Start the server, then choose again.";
// a loading section draws placeholders and no sentence
const LOADING = "loading";
type Sections = Readonly<Record<string, readonly string[] | typeof LOADING>>;

/** One page of the gallery: its address's parameters, and the sentences each of its sections draws, in order. */
interface Gallery {
  search: Readonly<Record<string, string>>;
  sections: Sections;
}

const PALETTE: Gallery = { search: { surface: "palette" }, sections: {} };
const dialog = (variant: string): Gallery => ({
  search: { surface: "consequence_dialog", variant },
  sections: {},
});

/** Every page of the gallery; the left panel's empty line names the platform's key. */
function galleries(platform: Platform): readonly Gallery[] {
  return [
    {
      search: {},
      sections: {
        "library · ready": [
          LIBRARY_WORDS.untitledProject("film"),
          LIBRARY_WORDS.untitledScript,
          LIBRARY_WORDS.neverSynced(false),
        ],
        "library · empty": [LIBRARY_WORDS.empty],
        "library · loading": LOADING,
        "library · problem": [LIBRARY_WORDS.problem],
        "choose · ready": DEMO_PEOPLE.map((p) => p.name),
        "choose · loading": LOADING,
        "choose · problem": [CHOOSER_UNREACHABLE],
        "document · ready": statusWords({}),
        "document · read_only": statusWords({ access: "view" }),
        "document · offline": statusWords({
          neverSynced: false,
          network: "offline",
        }),
        "document · problem": statusWords({ device: "failing" }),
        "document · no_access": [
          ...statusWords({
            neverSynced: false,
            server: "access_removed",
            notSent: 3,
          }),
          DOCUMENT_WORDS.noAccess,
        ],
        "sync_centre · ready": [
          SYNC_CENTRE_WORDS.title,
          SYNC_CENTRE_WORDS.neverSynced(false),
        ],
        "sync_centre · empty": [
          SYNC_CENTRE_WORDS.title,
          SYNC_CENTRE_WORDS.empty,
        ],
        "sync_centre · problem": statusWords({
          device: "failing",
          network: "offline",
        }),
        "sync_centre · offline": [
          SYNC_CENTRE_WORDS.unreachable,
          SYNC_CENTRE_WORDS.waitingInScene("8", 12),
        ],
        "preferences · ready": [
          SETTINGS.get("writing.typewriterScrolling").description ?? "",
        ],
        "preferences · problem": [PREFERENCES_WORDS.notSavedHere],
        "send · ready": [SEND_WORDS.back(LIBRARY_WORDS.title), SEND_TITLE],
      },
    },
    {
      search: { surface: "left_panel" },
      sections: {
        "left_panel · ready": DEMO_WORKSPACES.map((w) => w.name.toUpperCase()),
        "left_panel · empty": [
          DOCUMENT_WORDS.scenesEmpty(
            "screenplay",
            null,
            keyLabel("Alt+Enter", platform),
          ),
        ],
        "left_panel · problem": [
          DOCUMENT_WORDS.panelProblem,
          DOCUMENT_WORDS.reloadPanel,
        ],
      },
    },
    {
      search: { surface: "side_panel" },
      sections: {
        "side_panel · ready": [
          DOCUMENT_WORDS.scriptScopeLine(LIBRARY_WORDS.untitledScript),
        ],
        "side_panel · read_only": [DOCUMENT_WORDS.readOnlySettings],
      },
    },
    {
      search: { surface: "tour" },
      sections: { "side_panel · ready": [TOUR_WORDS.title] },
    },
    PALETTE,
    dialog("plain"),
    dialog("alternative"),
    dialog("refusal"),
    dialog("disabled"),
  ];
}

/** The gallery's section `name`, found by its label: after a search by role on this page, an accessibility walk crashes Firefox's content process. */
const sectionNamed = (page: Page, name: string) =>
  page.locator(`section[aria-label="${name}"]`);

/** Opens one page of the gallery as You, and waits until everything it draws is there. */
async function openGallery(page: Page, gallery: Gallery): Promise<void> {
  const search = new URLSearchParams({
    title: SEND_TITLE,
    button: SEND_TITLE,
    ...gallery.search,
  });
  await signedInAs(page, "you", `/__states?${search.toString()}`);
  const names = Object.keys(gallery.sections);
  await expect(page.locator("section[aria-label*=' · ']")).toHaveCount(
    names.length,
  );
  // asked in the page: a locator that waits on these sections crashes Firefox's next accessibility walk
  await page.waitForFunction(
    (loading) =>
      loading.every(
        (label) =>
          document.querySelector(
            `section[aria-label="${label}"] [data-placeholder]`,
          ) !== null,
      ),
    names.filter((n) => gallery.sections[n] === LOADING),
  );
  const { surface } = gallery.search;
  // by CSS and text, for the reason `sectionNamed` gives
  if (surface === "side_panel")
    await expect(
      page.locator("button", { hasText: DOCUMENT_WORDS.scriptSettingsHeading }),
    ).toHaveCount(2);
  if (surface === "palette")
    await expect(page.locator("[role='combobox']")).toBeFocused();
  if (surface === "consequence_dialog") {
    const open = page.locator("[role='alertdialog']");
    await expect(open).toBeVisible();
    // its opening fade has ended, so its colours are its own
    await open.evaluate((element) =>
      Promise.all(
        element.getAnimations({ subtree: true }).map((a) => a.finished),
      ),
    );
  }
}

async function violationsOf(
  page: Page,
  skipRules: readonly string[] = [],
): Promise<unknown[]> {
  // Base UI's focus guards, which pass focus back into a dialog, are nameless buttons in WebKit
  const axe = new AxeBuilder({ page })
    .withTags(RULES)
    .exclude("[data-base-ui-focus-guard]");
  return (await axe.disableRules([...skipRules]).analyze()).violations;
}

test("every surface in every state passes the automated accessibility rules", async ({
  page,
}) => {
  for (const gallery of galleries(await platformOf(page))) {
    await openGallery(page, gallery);
    expect([gallery.search, await violationsOf(page)]).toEqual([
      gallery.search,
      [],
    ]);
  }
});

// in forced colours the browser paints the system's colours, yet axe reads the text fill as authored, so its contrast rule cannot judge them
const FORCED_COLOURS_RULES = ["color-contrast"];

const VARIANTS: readonly {
  name: string;
  options: BrowserContextOptions;
  device: Readonly<Record<string, string>>;
  skipRules: readonly string[];
}[] = [
  { name: "dark", options: { colorScheme: "dark" }, device: {}, skipRules: [] },
  {
    name: "high contrast",
    options: { contrast: "more" },
    device: {},
    skipRules: [],
  },
  {
    name: "forced colours",
    options: { forcedColors: "active" },
    device: {},
    skipRules: FORCED_COLOURS_RULES,
  },
  {
    name: "reduced motion",
    options: { reducedMotion: "reduce" },
    device: {},
    skipRules: [],
  },
  {
    name: "200 %",
    options: {},
    device: { "device.interfaceSize": "200" },
    skipRules: [],
  },
];

/** A context in `variant`, with You's device preferences already kept in this origin. */
async function contextIn(browser: Browser, variant: (typeof VARIANTS)[number]) {
  const context = await browser.newContext(variant.options);
  await context.addInitScript((device) => {
    localStorage.setItem("manent.device.you", JSON.stringify(device));
  }, variant.device);
  return context;
}

test("the same in dark, high contrast, forced colours, reduced motion and at 200 %", async ({
  browser,
}) => {
  for (const variant of VARIANTS) {
    const context = await contextIn(browser, variant);
    const page = await context.newPage();
    for (const gallery of galleries(await platformOf(page))) {
      await openGallery(page, gallery);
      expect([
        variant.name,
        gallery.search,
        await violationsOf(page, variant.skipRules),
      ]).toEqual([variant.name, gallery.search, []]);
    }
    await context.close();
  }
});

test("every state's words are the design's", async ({ page }) => {
  const all = galleries(await platformOf(page));
  for (const gallery of all) {
    await openGallery(page, gallery);
    for (const [name, words] of Object.entries(gallery.sections)) {
      const section = sectionNamed(page, name);
      if (words === LOADING) {
        // six placeholder rows of the final size, hidden and holding no text
        const placeholders = await section
          .locator("[data-placeholder]")
          .evaluateAll((elements) =>
            elements.map((e) => [e.getAttribute("aria-hidden"), e.textContent]),
          );
        expect([name, placeholders]).toEqual([
          name,
          Array.from({ length: 6 }, () => ["true", ""]),
        ]);
        continue;
      }
      for (const sentence of words)
        await expect(section, name).toContainText(sentence);
    }
  }
  await openGallery(page, PALETTE);
  const listbox = page.getByRole("listbox");
  for (const menu of [
    MENU_WORDS.app,
    MENU_WORDS.file,
    MENU_WORDS.view,
    MENU_WORDS.help,
  ])
    await expect(listbox).toContainText(menu);
  const lines: Readonly<Record<string, readonly string[]>> = {
    plain: [],
    alternative: [SYNC_CENTRE_WORDS.exportCopy],
    refusal: [LIBRARY_WORDS.problem, DIALOG_WORDS.tryAgain],
    disabled: [DIALOG_WORDS.disabledLine(signInLabel, signInReason)],
  };
  for (const [variant, more] of Object.entries(lines)) {
    await openGallery(page, dialog(variant));
    const open = page.getByRole("alertdialog");
    for (const sentence of [
      signInLabel,
      SYNC_CENTRE_WORDS.neverSynced(false),
      DIALOG_WORDS.cancel,
      ...more,
    ])
      await expect(open, variant).toContainText(sentence);
  }
});

test("a new script as You shows at most eight controls outside the page, and no dialog in a solo session", async ({
  page,
}) => {
  await signedInAs(page, "you");
  // the Tour opens on a first visit in demo mode; it is the demo's, not the script's
  await page
    .getByRole("button", { name: DOCUMENT_WORDS.closeSidePanel })
    .click();
  await page
    .locator('[data-region="title_bar"]')
    .getByRole("button", { name: LIBRARY_WORDS.newScript, exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    LIBRARY_WORDS.untitledScript,
  );
  // every control in the window's regions but the page and the demo bar
  const controls = await page.evaluate(
    () =>
      [
        ...document.querySelectorAll(
          "[data-region]:not([data-region='page'], [data-region='demo_bar']) :is(button, a[href], input, select, textarea, [tabindex='0'])",
        ),
      ].filter((element) => element.checkVisibility()).length,
  );
  expect(controls).toBeLessThanOrEqual(8);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});
