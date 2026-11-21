// A script made at an address before a test opens it, as the Library makes one: a page opens only a script its device keeps.
import type { Page } from "@playwright/test";
import { signedInAs } from "./tour.ts";

/** Makes the script `docId` on `page`'s device through the test build's hooks, for the person signed in there. */
export async function makeScript(page: Page, docId: string): Promise<void> {
  // the person's sync sets its hooks once it has started
  await page.waitForFunction(() => {
    const sync: unknown = Reflect.get(
      Object(Reflect.get(window, "__manent")),
      "sync",
    );
    return typeof Reflect.get(Object(sync), "createScript") === "function";
  });
  await page.evaluate(async (id) => {
    const sync: unknown = Reflect.get(
      Object(Reflect.get(window, "__manent")),
      "sync",
    );
    await Reflect.apply(Reflect.get(Object(sync), "createScript"), sync, [id]);
  }, docId);
}

/** Signs `page` in as `userId`, makes the script `docId`, and opens `/s/<docId>`. */
export async function openMadeScript(
  page: Page,
  userId: string,
  docId: string,
): Promise<void> {
  await signedInAs(page, userId);
  await makeScript(page, docId);
  await page.goto(`/s/${docId}`);
}
