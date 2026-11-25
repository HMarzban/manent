// Shared browser storage-pressure helpers: Chromium/CDP prerequisite guards, quota observers, typing, and loss counting.
import type { CDPSession, Page } from "@playwright/test";
import { NotMeasured } from "../../env.ts";
import { startBenchDemo } from "../driver.ts";
import type { BenchDemo, BenchPage } from "../driver.ts";
import { until } from "../people.ts";
import { caretAt, settled } from "../typing/run-typing.ts";

export const STORAGE_PAGES = 120;
export const STORAGE_KEYSTROKES = {
  quick: 10,
  standard: 200,
  full: 200,
} as const;
export const QUOTA_HEADROOM_BYTES = 65_536;
export const TOLD_TIMEOUT_MS = 15_000;
export const SYNC_SETTLE_TIMEOUT_MS = 30_000;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const QUOTA_STATUS_SNIPPETS = [
  "Not saved on this device",
  "Can't save on this device",
] as const;

const reasonOf = (cause: unknown): string =>
  cause instanceof Error
    ? (cause.message.split("\n")[0] ?? cause.message)
    : String(cause);

const CHROMIUM_MISSING = new RegExp(
  "executable doesn't exist|browsertype\\.launch|chromium|failed to launch|no usable sandbox",
  "i",
);

/** Starts the bench demo; converts missing Chromium / browser-launch failures into `NotMeasured`. */
export async function startStorageDemo(): Promise<BenchDemo> {
  try {
    return await startBenchDemo();
  } catch (cause) {
    if (cause instanceof NotMeasured) throw cause;
    const message = reasonOf(cause);
    if (CHROMIUM_MISSING.test(message)) {
      throw new NotMeasured(`Chromium is unavailable: ${message}`);
    }
    throw cause;
  }
}

/** Returns `page.cdp` when Chromium CDP is attached; throws `NotMeasured` otherwise. */
export function requireCdp(benchPage: BenchPage): CDPSession {
  const session: CDPSession | null | undefined = benchPage.cdp;
  if (session === null || session === undefined) {
    throw new NotMeasured(
      "CDP is unavailable; browser storage pressure scenarios require Chromium with CDP",
    );
  }
  return session;
}

/** Reads the origin's current storage usage via CDP; throws `NotMeasured` if CDP refuses the command. */
export async function readOriginUsage(
  cdp: CDPSession,
  origin: string,
): Promise<number> {
  try {
    const result = await cdp.send("Storage.getUsageAndQuota", { origin });
    return result.usage;
  } catch (cause) {
    throw new NotMeasured(
      `CDP Storage.getUsageAndQuota is unavailable: ${reasonOf(cause)}`,
    );
  }
}

/** Overrides (or resets, when `quotaSize` is omitted) the origin's quota via CDP; throws `NotMeasured` if unavailable. */
export async function setOriginQuota(
  cdp: CDPSession,
  origin: string,
  quotaSize?: number,
): Promise<void> {
  try {
    await cdp.send(
      "Storage.overrideQuotaForOrigin",
      quotaSize === undefined ? { origin } : { origin, quotaSize },
    );
  } catch (cause) {
    throw new NotMeasured(
      `CDP Storage.overrideQuotaForOrigin is unavailable: ${reasonOf(cause)}`,
    );
  }
}

/** Deterministic string of `count` printable characters for verifying typed character preservation. */
export function makeTypedText(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => ALPHABET[index % ALPHABET.length]!,
  ).join("");
}

/**
 * Counts how many characters of `expected` (typed after `beforeText`) are missing from `afterText`.
 * Uses ordered subsequence matching over the appended slice so partial saves report exact loss.
 */
export function countChangesLost(
  beforeText: string,
  expected: string,
  afterText: string,
): number {
  if (expected.length === 0) return 0;
  const added = afterText.startsWith(beforeText)
    ? afterText.slice(beforeText.length)
    : afterText;
  if (added.includes(expected)) return 0;
  let matched = 0;
  for (let i = 0; i < added.length && matched < expected.length; i += 1) {
    if (added[i] === expected[matched]) matched += 1;
  }
  return expected.length - matched;
}

/** Reads the visible editable text of block `blockId` after scrolling it into view. */
export async function readBlockText(
  page: Page,
  blockId: string,
): Promise<string> {
  await caretAt(page, blockId, "end");
  return page.evaluate((id) => {
    const block = document.querySelector(
      `[data-editor-host] [data-id="${id}"]`,
    );
    if (block === null) throw new Error(`block ${id} is not drawn`);
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement?.closest(
          "[contenteditable='false']:not(.ProseMirror)",
        ) === null
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    let text = "";
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
      text += node.textContent ?? "";
    return text;
  }, blockId);
}

/** Types each character of `text` via `page.keyboard.press` and waits two animation frames. */
export async function typeCharacters(page: Page, text: string): Promise<void> {
  for (const ch of text) {
    await page.keyboard.press(ch);
  }
  await settled(page);
}

/** Waits until the document status pill no longer reports failing storage or waiting changes. */
export async function waitUntilSynced(
  page: Page,
  timeoutMs: number = SYNC_SETTLE_TIMEOUT_MS,
): Promise<void> {
  await until(
    async () =>
      page.evaluate(
        (snippets) => {
          const button = document.querySelector(
            'button:has([data-tour="status:server"])',
          );
          const text = `${button?.getAttribute("aria-label") ?? ""} ${button?.textContent ?? ""}`;
          const failing = snippets.some((s) => text.includes(s));
          return !failing && text.includes("Synced");
        },
        [...QUOTA_STATUS_SNIPPETS],
      ),
    timeoutMs,
    `script did not return to Synced within ${timeoutMs} ms`,
  );
}

/**
 * Installs a page-side observer that timestamps the first IndexedDB quota refusal and resolves
 * once the app displays its quota status message in the DOM.
 */
export async function armQuotaObserver(
  page: Page,
  timeoutMs: number = TOLD_TIMEOUT_MS,
): Promise<void> {
  await page.evaluate(
    ({ snippets, limitMs }) => {
      const hasQuotaMessage = (): boolean => {
        const button = document.querySelector(
          'button:has([data-tour="status:server"])',
        );
        const statusNodes = [...document.querySelectorAll('[role="status"]')];
        const text = [
          button?.getAttribute("aria-label") ?? "",
          button?.textContent ?? "",
          ...statusNodes.map((node) => node.textContent ?? ""),
        ].join(" ");
        return snippets.some((snippet) => text.includes(snippet));
      };
      let firstRefusedAt: number | null = null;
      const markRefused = (): void => {
        if (firstRefusedAt === null) firstRefusedAt = performance.now();
      };
      // Observe IndexedDB transaction/request quota refusals directly.
      const origAdd = IDBObjectStore.prototype.add;
      const origPut = IDBObjectStore.prototype.put;
      const watchRequest = <T>(request: IDBRequest<T>): IDBRequest<T> => {
        request.addEventListener("error", () => {
          if (request.error?.name === "QuotaExceededError") markRefused();
        });
        return request;
      };
      IDBObjectStore.prototype.add = function addWatched(value, key) {
        return watchRequest(origAdd.call(this, value, key));
      };
      IDBObjectStore.prototype.put = function putWatched(value, key) {
        return watchRequest(origPut.call(this, value, key));
      };
      const restore = (): void => {
        IDBObjectStore.prototype.add = origAdd;
        IDBObjectStore.prototype.put = origPut;
      };
      const onRejection = (event: PromiseRejectionEvent): void => {
        const reason: unknown = event.reason;
        const name =
          typeof reason === "object" && reason !== null && "name" in reason
            ? String(reason.name)
            : "";
        const code =
          typeof reason === "object" && reason !== null && "code" in reason
            ? String(reason.code)
            : "";
        if (name === "QuotaExceededError" || code === "quota") markRefused();
      };
      window.addEventListener("unhandledrejection", onRejection);
      const promise = new Promise<
        { ok: true; elapsedMs: number } | { ok: false; reason: string }
      >((resolve) => {
        let done = false;
        const finish = (
          outcome:
            { ok: true; elapsedMs: number } | { ok: false; reason: string },
        ): void => {
          if (done) return;
          done = true;
          observer.disconnect();
          clearTimeout(timer);
          window.removeEventListener("unhandledrejection", onRejection);
          restore();
          resolve(outcome);
        };
        const check = (): void => {
          if (!hasQuotaMessage()) return;
          const now = performance.now();
          const start = firstRefusedAt ?? now;
          finish({ ok: true, elapsedMs: Math.max(0, now - start) });
        };
        const observer = new MutationObserver(check);
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["aria-label"],
        });
        const timer = setTimeout(() => {
          finish({
            ok: false,
            reason: `the browser quota message did not appear within ${limitMs} ms`,
          });
        }, limitMs);
        check();
      });
      Reflect.set(window, "__quotaObserver", promise);
    },
    { snippets: [...QUOTA_STATUS_SNIPPETS], limitMs: timeoutMs },
  );
}

/** Awaits the armed quota observer on `page`. */
export async function awaitQuotaObserver(
  page: Page,
): Promise<{ ok: true; elapsedMs: number } | { ok: false; reason: string }> {
  const raw: unknown = await page.evaluate(() =>
    Reflect.get(window, "__quotaObserver"),
  );
  if (typeof raw === "object" && raw !== null && "ok" in raw) {
    if (
      raw.ok === true &&
      "elapsedMs" in raw &&
      typeof raw.elapsedMs === "number"
    )
      return { ok: true, elapsedMs: raw.elapsedMs };
    if (raw.ok === false && "reason" in raw && typeof raw.reason === "string")
      return { ok: false, reason: raw.reason };
  }
  return {
    ok: false,
    reason: "the browser quota observer returned no result",
  };
}
