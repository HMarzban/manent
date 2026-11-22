// A script made at an address before a test opens it, as the Library makes one: a page opens only a script its device keeps.
import type { Page } from "@playwright/test";
import { signedInAs } from "./tour.ts";

// not the Library: a first visit there opens the Tour in the side panel once the demo answers, and the person's panels
// go with them to the script
const SIGN_IN_AT = "/preferences/writing";

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

/**
 * Signs `page` in as `userId`, makes the script `docId` once the demo has answered, and opens `/s/<docId>`. Waiting for
 * the demo makes every machine take the order a slow one takes.
 */
export async function openMadeScript(
  page: Page,
  userId: string,
  docId: string,
): Promise<void> {
  await signedInAs(page, userId, SIGN_IN_AT);
  await page
    .getByRole("region", { name: "Demo" })
    .getByRole("button", { name: "Tour" })
    .waitFor();
  await makeScript(page, docId);
  await page.goto(`/s/${docId}`);
}
