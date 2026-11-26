// The Tour's broadcast-mos-bridge scenario: configure Autoscript WinPlus-IP against a loopback mock MOS prompter, opt in Lannick One News, and verify air-window hold until Send to prompter.
import { docPath } from "@manent/demo";
import { createMockMosPrompter } from "@manent/testkit";
import { BROADCAST_MOS_WORDS, RUNDOWN_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import { settled } from "../editor/support.ts";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

const NEWS_DAY = docPath("medium/lannick-one-news/rundowns/day");
const EDIT_PHRASE = "mos-air-window-check";

tourScenario("broadcast-mos-bridge", async ({ page, scenario }) => {
  const [liveWord, mosToggleWord, sendWord] = scenario.evidence;
  const mockPrompter = await createMockMosPrompter({
    host: "127.0.0.1",
    port: 0,
    dialect: "autoscript_winplus_ip",
  });

  let mosConfigured = false;

  try {
    // Navigate from Library to Writers' room -> Workspace settings -> Broadcast.
    await selectTourStep(page, scenario.promise, 0);
    await page.goto("/w/medium/settings/broadcast");

    // Step 0: Configure Autoscript WinPlus-IP on loopback mock prompter port, Save and Check prompter.
    const broadcastSection = page.locator("[data-tour='workspace:broadcast']");
    await expect(broadcastSection).toBeVisible();

    const autoscriptOpt = broadcastSection.getByRole("button", {
      name: BROADCAST_MOS_WORDS.autoscript,
    });
    if ((await autoscriptOpt.getAttribute("aria-pressed")) !== "true")
      await autoscriptOpt.click();

    await broadcastSection
      .getByLabel(BROADCAST_MOS_WORDS.addressLabel)
      .fill(mockPrompter.host);
    await broadcastSection
      .getByRole("button", { name: BROADCAST_MOS_WORDS.advancedToggle })
      .click();
    await broadcastSection
      .getByLabel(BROADCAST_MOS_WORDS.lowerPortLabel)
      .fill(String(mockPrompter.port));
    await broadcastSection
      .getByLabel(BROADCAST_MOS_WORDS.upperPortLabel)
      .fill(String(mockPrompter.port));

    const saveBtn = broadcastSection.locator("[data-tour='mos:save']");
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();
    mosConfigured = true;

    await broadcastSection
      .getByRole("button", { name: BROADCAST_MOS_WORDS.check })
      .click();
    await expect(
      broadcastSection.getByRole("status").filter({ hasText: liveWord! }),
    ).toBeVisible();
    await expectEvidence([page], { ...scenario, evidence: [liveWord!] });

    // Step 1: Open Lannick One News today's rundown, open Details -> Rundown, and enable MOS toggle.
    await page.goto(NEWS_DAY);
    await expect(page.locator("[data-tour='rundown:grid']")).toBeVisible();

    await page.locator("[data-tour='tab:details']").click();
    const mosToggle = page.locator("[data-tour='rundown:mos_toggle']");
    await expect(mosToggle).toBeVisible();
    await expect(page.getByText(mosToggleWord!)).toBeVisible();
    await mosToggle.click();
    await expect(mosToggle).toHaveAttribute("aria-checked", "true");
    await expectEvidence([page], { ...scenario, evidence: [mosToggleWord!] });

    await mockPrompter.waitFor(
      (messages) =>
        messages.some((m) => m.kind === "roCreate") &&
        messages.some((m) => m.kind === "roStorySend"),
      10_000,
    );

    // Step 2: Inside the air window, editing story 01 does NOT push to MOS until Send to prompter is clicked.
    const story01Cell = page
      .locator('[role="gridcell"][data-col-id="story"]')
      .filter({ hasText: "Tolle Exchange library: council votes yes" })
      .first();
    await expect(story01Cell).toBeVisible();
    await story01Cell.click();

    await page
      .getByRole("button", {
        name: RUNDOWN_WORDS.rowHandle(
          "Tolle Exchange library: council votes yes",
        ),
      })
      .click();
    await page.getByRole("menuitem", { name: "Open beside" }).click();

    const beside = page.locator("[data-tour='beside']");
    await expect(beside).toBeVisible();
    const dialogue = beside.locator("[data-type='dialogue']").first();
    await expect(dialogue).toBeVisible();
    await dialogue.click();
    await settled(page);
    await page.keyboard.press("End");
    await page.keyboard.type(` ${EDIT_PHRASE}`);
    await settled(page);

    // Allow debounce to settle and verify air-window hold prevented unsolicited MOS send.
    await page.waitForTimeout(800);
    const leakedBeforeSend = mockPrompter.received.some(
      (m) =>
        m.kind === "roStorySend" &&
        m.paragraphs.some((p) => p.includes(EDIT_PHRASE)),
    );
    expect(leakedBeforeSend).toBe(false);

    const sendBtn = beside.locator("[data-tour='prompter.send']").first();
    await expect(sendBtn).toBeVisible();
    await expect(sendBtn).toContainText(sendWord!);
    await expectEvidence([page], { ...scenario, evidence: [sendWord!] });
    await sendBtn.click();

    await mockPrompter.waitFor(
      (messages) =>
        messages.some(
          (m) =>
            m.kind === "roStorySend" &&
            m.paragraphs.some((p) => p.includes(EDIT_PHRASE)),
        ),
      10_000,
    );
  } finally {
    if (mosConfigured) {
      await page.goto("/w/medium/settings/broadcast");
      const removeBtn = page.getByRole("button", {
        name: BROADCAST_MOS_WORDS.remove,
      });
      if (await removeBtn.isVisible().catch(() => false)) {
        await removeBtn.click();
        const confirmBtn = page
          .locator("button")
          .filter({ hasText: BROADCAST_MOS_WORDS.remove })
          .last();
        if (await confirmBtn.isVisible().catch(() => false))
          await confirmBtn.click();
      }
    }
    await mockPrompter.close();
  }
});
