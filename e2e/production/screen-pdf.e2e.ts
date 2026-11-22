// The pages a locked script shows against the file its issue makes: in each hard case of locked page numbers the
// labels on screen are the issued file's and the issue's, and that file stays as issued whatever comes after.
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { EDITABLE, blocks, caretAt, transfer } from "../editor/support.ts";
import { editorHook, keepEveryHooks } from "../support/editor-hooks.ts";
import { labelOf } from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";
import { readPdf } from "./read-pdf.ts";
import type { ReadPage } from "./read-pdf.ts";

/** The labels `from` to `to`, as numbers. */
const numbered = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

/** 60 lines of action, each filling the line's 60 cells. */
const SIXTY_LINES = Array.from({ length: 60 }, (_, i) => {
  const head = `Growth ${String(i + 1).padStart(3, "0")} `;
  return `${head}${"x".repeat(59 - head.length)}. `;
}).join("");

interface PageStart {
  label: string;
  block: number;
}

/** The open script's pages, each with the index of the block it starts in. */
async function pagesOf(page: Page): Promise<PageStart[]> {
  const found = await editorHook(page, "pages");
  if (!Array.isArray(found)) throw new TypeError("the pages are not a list");
  return found;
}

const labelsOf = async (page: Page): Promise<string[]> =>
  (await pagesOf(page)).map((start) => start.label);

/** The index of the block page `label` starts in. */
async function startOf(page: Page, label: string): Promise<number> {
  const start = (await pagesOf(page)).find((held) => held.label === label);
  if (start === undefined) throw new RangeError(`no page ${label}`);
  return start.block;
}

/** Priya Nair in a new screenplay of 47 pages, which she made and so owns; resolves to its doc id. */
async function openAsPriya(page: Page): Promise<string> {
  await keepEveryHooks(page);
  await signedInAs(page, "priya");
  await page
    .getByRole("button", { name: labelOf("library.newScript") })
    .first()
    .click();
  await expect(page.locator(EDITABLE)).toBeAttached();
  const docId = await editorHook(
    page,
    "open",
    "screenplay",
    corpusDoc(generateBlocks("screenplay", 750, 7)),
  );
  await expect(page.locator(EDITABLE)).toBeVisible();
  return String(docId);
}

/** Selects from the end of block `fromId` to the end of block `toId`, as a drag between them does. */
async function selectAfter(
  page: Page,
  fromId: string,
  toId: string,
): Promise<void> {
  await page.evaluate(
    ([from, to, editable]) => {
      const [start, end] = [from, to].map((id) => {
        const block = document.querySelector(
          `[data-editor-host] [data-id="${id}"]`,
        );
        if (block === null) throw new Error(`block ${id} is not drawn`);
        return block;
      });
      if (start === undefined || end === undefined) return;
      document.querySelector<HTMLElement>(editable)?.focus();
      document
        .getSelection()
        ?.setBaseAndExtent(
          start,
          start.childNodes.length,
          end,
          end.childNodes.length,
        );
    },
    [fromId, toId, EDITABLE] as const,
  );
}

interface HardCase {
  name: string;
  /** Edits the script as locked into the case. */
  edit(page: Page): Promise<void>;
  /** The labels its pages print, as the locked-pages tests of the revisions package pin them. */
  labels: string[];
}

const HARD_CASES: readonly HardCase[] = [
  {
    name: "page 12 grows by 60 lines",
    async edit(page) {
      const all = await blocks(page);
      await caretAt(page, all[(await startOf(page, "13")) - 1]!.id, "end");
      await page.keyboard.press("Enter");
      await page.keyboard.insertText(SIXTY_LINES);
    },
    labels: [...numbered(1, 12), "12A", "12B", ...numbered(13, 47)],
  },
  {
    name: "page 13 deleted",
    async edit(page) {
      const all = await blocks(page);
      const [from, to] = [await startOf(page, "13"), await startOf(page, "14")];
      await selectAfter(page, all[from - 1]!.id, all[to - 1]!.id);
      await page.keyboard.press("Backspace");
    },
    labels: [...numbered(1, 12), "13–14", ...numbered(15, 47)],
  },
  {
    name: "pages 12 and 13 moved after page 30",
    async edit(page) {
      const all = await blocks(page);
      const [from, to, end] = [
        await startOf(page, "12"),
        await startOf(page, "14"),
        await startOf(page, "31"),
      ];
      await selectAfter(page, all[from - 1]!.id, all[to - 1]!.id);
      const { held } = await transfer(page, "cut", {});
      await caretAt(page, all[end - 1]!.id, "end");
      await transfer(page, "paste", held);
      // the paste brings the cut's empty first line with it, which is taken out again
      const ids = new Set(all.map((block) => block.id));
      const empty = (await blocks(page)).find((block) => !ids.has(block.id));
      if (empty !== undefined) {
        await caretAt(page, empty.id, 0);
        await page.keyboard.press("Backspace");
      }
      expect((await blocks(page)).map((block) => block.id)).toEqual(
        [
          ...all.slice(0, from),
          ...all.slice(to, end),
          ...all.slice(from, to),
          ...all.slice(end),
        ].map((block) => block.id),
      );
    },
    labels: [
      ...numbered(1, 11),
      ...numbered(14, 30),
      "30A",
      "30B",
      "30C",
      ...numbered(31, 47),
    ],
  },
];

/** The device's calendar day, YYYY-MM-DD, by which the app dates a revision. */
const deviceDay = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((n) => String(n).padStart(2, "0"))
      .join("-");
  });

type Post = (
  path: string,
  data: object,
) => ReturnType<APIRequestContext["post"]>;

/** A POST with the session of the person signed in on `page`. */
async function asPerson(page: Page, request: APIRequestContext): Promise<Post> {
  const token: unknown = await page.evaluate(() => {
    const raw = sessionStorage.getItem("manent.demo.session");
    return raw === null ? null : Reflect.get(Object(JSON.parse(raw)), "token");
  });
  if (typeof token !== "string") throw new TypeError("no session token");
  return (path, data) =>
    request.post(path, { headers: { Authorization: `Bearer ${token}` }, data });
}

/** A request key: 32 lower-case hexadecimal digits. */
const requestKey = (): string => crypto.randomUUID().replaceAll("-", "");

/** Locks the open script from its title menu, and waits until its page shows Blue as the revision under way. */
async function lockForProduction(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Untitled script" }).click();
  await page.getByRole("menuitem", { name: "Lock for production…" }).click();
  await page
    .getByRole("alertdialog", { name: "Lock for production" })
    .getByRole("button", { name: "Lock for production" })
    .click();
  await expect(page.locator('[data-region="state_bar"]')).toContainText(
    "BLUE revision",
  );
}

/** Changes the paper of the locked script to A4 through Script settings' Change layout…. */
async function changePaperToA4(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Untitled script" }).click();
  await page.getByRole("menuitem", { name: "Script settings" }).click();
  const settings = page.locator('[data-region="side_panel"]');
  // the Paper row's own Change layout…, the first button after its choices
  await settings
    .getByRole("radiogroup", { name: "Paper" })
    .locator("xpath=following::button[1]")
    .click();
  await settings.getByRole("radio", { name: "A4", disabled: false }).click();
  await page
    .getByRole("alertdialog", { name: "Change paper size to A4?" })
    .getByRole("button", { name: "Change paper size to A4" })
    .click();
  // the new paper reaches the page once the server has written it
  await expect(
    settings.getByRole("radio", { name: "A4", checked: true }),
  ).toBeVisible({ timeout: 15_000 });
}

const synced = (page: Page): Promise<void> =>
  expect(
    page.getByRole("button", { name: "Saved · Synced", exact: true }),
  ).toBeVisible();

test("the page on screen is the page in the issued PDF", async ({
  page,
  request,
}) => {
  test.setTimeout(600_000);
  for (const hard of HARD_CASES)
    await test.step(hard.name, async () => {
      const docId = await openAsPriya(page);
      await lockForProduction(page);
      await hard.edit(page);
      await expect.poll(() => labelsOf(page)).toEqual(hard.labels);
      await synced(page);
      const post = await asPerson(page, request);
      // the server lays the pages out again and refuses an issue whose pages differ from the screen's
      const issued = await post("/api/production/issue", {
        docId,
        key: requestKey(),
        // Blue, the revision after the White production draft the lock issued
        expectedOrdinal: 1,
        what: "full",
        pages: await labelsOf(page),
        files: ["pdf_marked"],
        tint: true,
        recipientUserIds: ["priya"],
        memo: "",
        issuedOn: await deviceDay(page),
      });
      expect(issued.status()).toBe(200);
      const issueId: unknown = Reflect.get(
        Object(Reflect.get(Object(await issued.json()), "issue")),
        "issueId",
      );
      const state: unknown = await (
        await post("/api/production/state", { docId })
      ).json();
      const issues: unknown = Reflect.get(Object(state), "issues");
      const stored: unknown = Array.isArray(issues) ? issues[0] : null;
      const file = async (): Promise<ReadPage[]> => {
        const answer = await post("/api/production/file", {
          docId,
          issueId,
          file: "pdf_marked",
        });
        return readPdf(await answer.body());
      };
      const first = await file();
      // the first page prints no number
      expect([
        first.map((read) => read.label),
        Reflect.get(Object(stored), "pages"),
      ]).toEqual([[null, ...hard.labels.slice(1)], hard.labels]);

      const all = await blocks(page);
      await caretAt(page, all[(await startOf(page, "3")) - 1]!.id, "end");
      await page.keyboard.type(" Not yet.");
      await changePaperToA4(page);
      await synced(page);
      expect(await file()).toEqual(first);
    });
});
