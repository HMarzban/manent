// The Tour's long-folders-trash scenario: Dana browses 40 projects in folders, Favourites, and restores The Glassblower from Trash.
import { expect, test } from "@playwright/test";
import { E2E_PORT } from "../support/ports.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

const HEAVY_READY_MS = 1_200_000;
const POLL_MS = 5000;

test.describe.configure({ timeout: HEAVY_READY_MS + 180_000 });

async function waitForHeavyReady(
  request: Parameters<typeof test>[1] extends never
    ? never
    : import("@playwright/test").APIRequestContext,
): Promise<void> {
  const signIn = await request.post(
    `http://localhost:${E2E_PORT}/api/sign-in`,
    {
      data: { userId: "dana" },
    },
  );
  const token: unknown = Reflect.get(Object(await signIn.json()), "token");
  if (typeof token !== "string")
    throw new Error("the demo did not sign dana in");
  await expect
    .poll(
      async () => {
        const me: unknown = await (
          await request.get(`http://localhost:${E2E_PORT}/api/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).json();
        const workspaces: unknown = Reflect.get(Object(me), "workspaces");
        return Array.isArray(workspaces)
          ? workspaces.map((w: unknown) => [
              Reflect.get(Object(w), "id"),
              Reflect.get(Object(w), "seeding"),
            ])
          : workspaces;
      },
      { timeout: HEAVY_READY_MS, intervals: [POLL_MS] },
    )
    .toContainEqual(["heavy", null]);
}

tourScenario("long-folders-trash", async ({ page, scenario, step }) => {
  test.setTimeout(HEAVY_READY_MS + 180_000);
  const [folderName, daysLeft, restoredMsg] = scenario.evidence;
  await waitForHeavyReady(page.request);

  const switcher = await step(0);
  await switcher.click();
  await page
    .getByRole("menuitem")
    .filter({ hasText: "Lanternfield Studios" })
    .click();
  await expect(switcher).toContainText("Lanternfield Studios");

  const folders = await step(1);
  await folders.getByText(folderName!, { exact: true }).click();
  await expectEvidence([page], { ...scenario, evidence: [folderName!] });
  const folderSection = page.locator(`section[aria-label='${folderName!}']`);
  await expect(folderSection.locator(".mn-row")).toHaveCount(4, {
    timeout: 15_000,
  });

  const favourites = await step(2);
  await favourites.click();
  const favouritesSection = page.locator("section[aria-label='Favourites']");
  await expect(favouritesSection).toContainText(
    "Ned Ashby and the Lantern of Hours",
  );
  await expect(favouritesSection).toContainText("Ward Nine");

  await page.locator("[data-tour='library:trash']").click();
  const trashSection = page.locator("section[aria-label='Trash']");
  await expect(trashSection).toContainText("The Glassblower");
  await expectEvidence([page], { ...scenario, evidence: [daysLeft!] });

  const restore = await step(3);
  await restore.click();
  await expectEvidence([page], { ...scenario, evidence: [restoredMsg!] });
});
