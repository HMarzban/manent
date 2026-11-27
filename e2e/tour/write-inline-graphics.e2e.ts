// The Tour's write-inline-graphics scenario: insert lower third via palette, type caption, change Height in Details, attach PNG offline and survive reload.
import { DEMO_WORDS, GRAPHICS_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import { settled } from "../editor/support.ts";
import {
  committedOnDevice,
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

// Valid 1x1 red PNG for deterministic offline image attachment verification.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);
const CAPTION_TEXT = "Grace Owen — Tolle Exchange Live";

tourScenario("write-inline-graphics", async ({ page, scenario, step }) => {
  const [lowerThird, heightWord] = scenario.evidence;
  let wentOffline = false;

  try {
    const editable = page.locator(
      "[data-region='page'] [contenteditable='true']",
    );
    await expect(editable).toBeVisible();

    const firstBlock = editable.locator("[data-type='dialogue']").first();
    await expect(firstBlock).toBeVisible();
    await firstBlock.click();
    await settled(page);

    // Step 0: Open command palette and choose Insert lower third, then type caption on page.
    await selectTourStep(page, scenario.promise, 0);
    await page.locator("[data-tour='app.palette']").click();
    const paletteInput = page.locator("input[role='combobox']").first();
    await expect(paletteInput).toBeVisible();
    await paletteInput.fill(GRAPHICS_WORDS.commands.insertLowerThird);
    await page
      .locator("[role='option']")
      .filter({ hasText: GRAPHICS_WORDS.commands.insertLowerThird })
      .first()
      .click();
    await settled(page);

    const graphicBlock = editable.locator("[data-type='graphic']").first();
    await expect(graphicBlock).toBeVisible();
    await expect(graphicBlock).toContainText(new RegExp(lowerThird!, "i"));

    await graphicBlock.click();
    await settled(page);
    await page.keyboard.type(CAPTION_TEXT);
    await settled(page);
    await expect(graphicBlock).toContainText(CAPTION_TEXT);

    // Step 1: Open Details -> Selection -> Graphic and change Height to 8 lines.
    await page.locator("[data-tour='tab:details']").click();
    const graphicDetails = page.locator("[data-tour='details:graphic']");
    await expect(graphicDetails).toBeVisible();
    await expectEvidence([page], {
      ...scenario,
      evidence: [lowerThird!, heightWord!],
    });

    const heightSpin = graphicDetails.getByRole("spinbutton", {
      name: GRAPHICS_WORDS.height,
    });
    await expect(heightSpin).toBeVisible();
    await heightSpin.fill("8");
    await heightSpin.press("Enter");
    await expect(heightSpin).toHaveAttribute("aria-valuenow", "8");

    // Step 2: Switch Connection to Offline, pick a PNG image onto the graphic, and reload.
    await page
      .getByRole("region", { name: DEMO_WORDS.demo })
      .getByRole("button", { name: DEMO_WORDS.tour })
      .click();
    await (await step(2)).getByRole("button", { name: "Offline" }).click();
    wentOffline = true;

    await page.locator("[data-tour='tab:details']").click();
    await expect(graphicDetails).toBeVisible();

    const chooserPromise = page.waitForEvent("filechooser");
    await graphicDetails
      .getByRole("button", { name: GRAPHICS_WORDS.chooseImage })
      .click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "lower-third-badge.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    const graphicImg = graphicBlock.locator("img").first();
    await expect(graphicImg).toBeVisible();

    await committedOnDevice(page, scenario.setup.userId);
    await page.reload();

    const reloadedEditable = page.locator(
      "[data-region='page'] [contenteditable='true']",
    );
    await expect(reloadedEditable).toBeVisible();
    const reloadedGraphic = reloadedEditable
      .locator("[data-type='graphic']")
      .first();
    await expect(reloadedGraphic).toBeVisible();
    await expect(reloadedGraphic).toContainText(CAPTION_TEXT);
    await expect(reloadedGraphic.locator("img").first()).toBeVisible();
  } finally {
    if (wentOffline) {
      const reconnectBtn = page
        .getByRole("region", { name: DEMO_WORDS.demo })
        .getByRole("button", { name: DEMO_WORDS.reconnect });
      if (await reconnectBtn.isVisible().catch(() => false)) {
        await reconnectBtn.click();
      } else {
        const onlineBtn = page
          .locator("[data-tour='demo:connection']")
          .getByRole("button", { name: "Online" });
        if (await onlineBtn.isVisible().catch(() => false))
          await onlineBtn.click();
      }
    }
  }
});
