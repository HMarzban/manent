// Ink compile-after-pause latency on The Keeper's Logbook: edits `-> dark` to `-> cottage`, measures
// `pause_to_problem_ms` from the final keystroke to the Ink problem mark appearing on that line, and restores `-> dark`.
import { docPath } from "@manent/demo";
import type { Page } from "@playwright/test";
import { NotMeasured, benchMode } from "../../env.ts";
import type { Scenario } from "../../harness.ts";
import { measurement, sampleMs } from "../../measure.ts";
import { startBenchDemo } from "../driver.ts";
import { settled } from "../typing/run-typing.ts";

const KEEPERS_LOGBOOK_PATH = docPath("medium/game-samples/keepers-logbook");
const ITERATIONS = { quick: 3, standard: 200, full: 200 } as const;
const OPEN_TIMEOUT_MS = 30_000;
const PROBLEM_TIMEOUT_MS = 10_000;
const PAGE_SELECTOR = "[data-tour='page']";
const PROBLEM_SELECTOR = ".mn-ink-problem, .mn-ink-mark-problem";

/** Selects `target` within the first line containing `lineNeedle` inside the Ink editor; returns false if absent. */
async function selectTokenInLine(
  page: Page,
  lineNeedle: string,
  target: string,
): Promise<boolean> {
  const line = page
    .locator(`${PAGE_SELECTOR} .ProseMirror`)
    .getByText(lineNeedle)
    .first();
  if ((await line.count()) === 0) return false;
  await line.scrollIntoViewIfNeeded();
  const ok = await line.evaluate((node, wanted) => {
    const editable = node.closest<HTMLElement>("[contenteditable]");
    editable?.focus();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (
      let current = walker.nextNode();
      current !== null;
      current = walker.nextNode()
    ) {
      if (!(current instanceof Text)) continue;
      const offset = current.data.indexOf(wanted);
      if (offset === -1) continue;
      const range = document.createRange();
      range.setStart(current, offset);
      range.setEnd(current, offset + wanted.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return true;
    }
    return false;
  }, target);
  if (ok) await settled(page);
  return ok;
}

/** Resolves true once the Ink problem mark matches `present` (true = visible, false = cleared), or false on timeout. */
async function waitForProblemState(
  page: Page,
  present: boolean,
  timeoutMs: number,
): Promise<boolean> {
  return page.evaluate(
    ({ rootSelector, markSelector, wantPresent, limitMs }) =>
      new Promise<boolean>((resolve) => {
        const root = document.querySelector(rootSelector);
        if (root === null) {
          resolve(false);
          return;
        }
        const matches = (): boolean =>
          (root.querySelector(markSelector) !== null) === wantPresent;
        if (matches()) {
          resolve(true);
          return;
        }
        let done = false;
        const finish = (ok: boolean): void => {
          if (done) return;
          done = true;
          observer.disconnect();
          clearTimeout(timer);
          resolve(ok);
        };
        const observer = new MutationObserver(() => {
          if (matches()) finish(true);
        });
        observer.observe(root, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["class", "data-ink-problem-line", "data-ink-mark"],
        });
        const timer = setTimeout(() => finish(false), limitMs);
      }),
    {
      rootSelector: PAGE_SELECTOR,
      markSelector: PROBLEM_SELECTOR,
      wantPresent: present,
      limitMs: timeoutMs,
    },
  );
}

const scenario: Scenario = {
  id: "ink-compile",
  workload: null,
  processes: 5,
  async run() {
    const demo = await startBenchDemo();
    try {
      const { page } = await demo.openPage({ userId: "sam" });
      await page.goto(`${demo.url}${KEEPERS_LOGBOOK_PATH}`);
      try {
        await page
          .locator(`${PAGE_SELECTOR} .ProseMirror`)
          .getByText("-> dark")
          .first()
          .waitFor({ state: "visible", timeout: OPEN_TIMEOUT_MS });
      } catch {
        throw new NotMeasured(
          "The Keeper's Logbook did not open in the Ink editor",
        );
      }

      const clearedInitially = await waitForProblemState(
        page,
        false,
        PROBLEM_TIMEOUT_MS,
      );
      if (!clearedInitially) {
        throw new NotMeasured(
          "The Keeper's Logbook opened with an active Ink problem mark",
        );
      }

      const count = ITERATIONS[benchMode()];
      const samples: number[] = [];
      for (let i = 0; i < count; i += 1) {
        const selectedDark = await selectTokenInLine(page, "-> dark", "dark");
        if (!selectedDark) {
          throw new NotMeasured(
            "could not locate '-> dark' in The Keeper's Logbook",
          );
        }
        await page.keyboard.type("cottag");
        const ms = await sampleMs(async () => {
          await page.keyboard.press("e");
          const appeared = await waitForProblemState(
            page,
            true,
            PROBLEM_TIMEOUT_MS,
          );
          if (!appeared) {
            throw new NotMeasured(
              `Ink problem mark did not appear within ${PROBLEM_TIMEOUT_MS} ms`,
            );
          }
        });
        samples.push(ms);

        const selectedCottage = await selectTokenInLine(
          page,
          "-> cottage",
          "cottage",
        );
        if (!selectedCottage) {
          throw new NotMeasured(
            "could not locate '-> cottage' to restore The Keeper's Logbook",
          );
        }
        await page.keyboard.type("dark");
        const cleared = await waitForProblemState(
          page,
          false,
          PROBLEM_TIMEOUT_MS,
        );
        if (!cleared) {
          throw new NotMeasured(
            `Ink problem mark did not clear within ${PROBLEM_TIMEOUT_MS} ms after restoring -> dark`,
          );
        }
      }

      return [measurement("pause_to_problem_ms", "ms", samples)];
    } finally {
      await demo.stop();
    }
  },
};

export default scenario;
