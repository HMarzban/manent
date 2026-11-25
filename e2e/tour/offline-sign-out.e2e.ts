// The Tour's offline-sign-out scenario: signing out with three waiting offline changes asks first, keeps them on the device, and syncs on return.
import { ACCOUNT_WORDS, DEMO_WORDS, DOCUMENT_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import { settled } from "../editor/support.ts";
import {
  committedOnDevice,
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

test.describe.configure({ timeout: 180_000 });

const LINES = [
  "Rain hammers the ferry roof.",
  "Ida checks the tide table twice.",
  "The engine coughs and catches.",
];

tourScenario("offline-sign-out", async ({ page, scenario, step }) => {
  const [dialogTitle, exportCopy, synced] = scenario.evidence;

  await expect(page.getByText(synced!).first()).toBeVisible({
    timeout: 15_000,
  });
  await (await step(0)).getByRole("button", { name: "Offline" }).click();
  await expect(page.locator("[data-tour='status:server']")).toContainText(
    "Offline",
    { timeout: 15_000 },
  );

  const action = page
    .locator("[data-tour='page'] [data-type='action']")
    .first();
  await action.scrollIntoViewIfNeeded();
  const end = await action.evaluate((block) => {
    const range = document.createRange();
    range.selectNodeContents(block);
    const last = [...range.getClientRects()].at(-1)!;
    return { x: last.right - 1, y: last.top + last.height / 2 };
  });
  await page.mouse.click(end.x, end.y);
  await settled(page);
  for (const line of LINES) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
  for (const line of LINES) await expect(page.getByText(line)).toBeVisible();
  await expectEvidence([page], {
    ...scenario,
    evidence: ["Saved · Offline, 3 waiting"],
  });
  await committedOnDevice(page, scenario.setup.userId);

  await selectTourStep(page, scenario.promise, 1);
  // select step 2 before opening the modal guard dialog (Radix marks the Tour panel aria-hidden while the dialog is open)
  await selectTourStep(page, scenario.promise, 2);
  await page.locator("[data-tour='app.palette']").click();
  const paletteInput = page.locator("input[role='combobox']").first();
  await expect(paletteInput).toBeVisible();
  await paletteInput.fill(ACCOUNT_WORDS.signOut);
  await page
    .locator("[role='option']")
    .filter({ hasText: new RegExp(`^${ACCOUNT_WORDS.signOut}$`) })
    .first()
    .click();

  const confirmSignOut = page
    .locator(`[data-tour="${scenario.steps[2]!.highlight}"]`)
    .filter({ visible: true })
    .first();
  await expect(confirmSignOut).toHaveAttribute("data-tour-ring", "");
  await expectEvidence([page], {
    ...scenario,
    evidence: [dialogTitle!, exportCopy!],
  });
  await expect(
    page.getByText(
      "They stay on this device and sync when you sign in here again.",
    ),
  ).toBeVisible();

  await confirmSignOut.click();
  await page.waitForURL((at) => at.pathname.startsWith("/choose"));

  const samCard = page.getByRole("button", { name: /Sam Okafor/ });
  await expect(samCard).toBeVisible();
  await samCard.click();
  await page.waitForURL((at) => !at.pathname.startsWith("/choose"));

  if (!new URL(page.url()).pathname.startsWith("/s/")) {
    await page.goto(scenario.setup.open);
    await expect(page.locator("[data-tour='page']")).toBeVisible();
  }
  for (const line of LINES) await expect(page.getByText(line)).toBeVisible();

  const tour = page
    .locator("[data-region='side_panel']")
    .getByRole("tabpanel", { name: DOCUMENT_WORDS.tourTab });
  if (!(await tour.isVisible())) {
    await page
      .getByRole("region", { name: DEMO_WORDS.demo })
      .getByRole("button", { name: DEMO_WORDS.tour })
      .click();
    await expect(tour).toBeVisible();
  }

  await (await step(3)).getByRole("button", { name: "Online" }).click();
  await expectEvidence([page], { ...scenario, evidence: [synced!] });
});
