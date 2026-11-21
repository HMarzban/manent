// A script made at an address before a test opens it, as the Library makes one, so a person signed in may open it.
import type { Page } from "@playwright/test";
import { signedInAs } from "./tour.ts";

/** Signs `page` in as `userId`, makes the script `docId` through the test build's hooks, and opens `/s/<docId>`. */
export async function openMadeScript(
  page: Page,
  userId: string,
  docId: string,
): Promise<void> {
  await signedInAs(page, userId);
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
  await page.goto(`/s/${docId}`);
}
