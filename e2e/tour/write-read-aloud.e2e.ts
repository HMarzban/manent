// The Tour's write-read-aloud scenario: reading Every Key But One aloud from scene 14 and stopping from the state bar.
import { DEMO_WORDS, DOCUMENT_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

// Headless Chromium ships no system speech synthesis voices and never completes real audio playback reliably;
// install a deterministic mock speechSynthesis with two English voices whose utterances end shortly after speak().
function installMockSpeechSynthesis(): void {
  const voices = [
    {
      name: "Mock Voice A",
      lang: "en-GB",
      localService: true,
      default: true,
      voiceURI: "mock-voice-a",
    },
    {
      name: "Mock Voice B",
      lang: "en-GB",
      localService: true,
      default: false,
      voiceURI: "mock-voice-b",
    },
  ];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let speaking = false;
  const mockSynth = {
    get speaking() {
      return speaking;
    },
    pending: false,
    paused: false,
    onvoiceschanged: null,
    getVoices: () => voices,
    speak(utterance: EventTarget) {
      if (timer !== null) clearTimeout(timer);
      speaking = true;
      timer = setTimeout(() => {
        timer = null;
        speaking = false;
        utterance.dispatchEvent(new Event("end"));
      }, 60);
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      speaking = false;
    },
    pause() {},
    resume() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  };
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: mockSynth,
  });
  Reflect.set(window, "__mockSpeechInstalled", true);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMockSpeechSynthesis);
});

tourScenario("write-read-aloud", async ({ page, scenario, step }) => {
  // Ensure the init script ran before page load even when tourScenario uses its own extended test fixture
  const installed = await page.evaluate(
    () => Reflect.get(window, "__mockSpeechInstalled") === true,
  );
  if (!installed) {
    await page.addInitScript(installMockSpeechSynthesis);
    await page.reload();
    const tourBtn = page
      .getByRole("region", { name: DEMO_WORDS.demo })
      .getByRole("button", { name: DEMO_WORDS.tour });
    const tourTab = page
      .locator("[data-region='side_panel']")
      .getByRole("tabpanel", { name: DOCUMENT_WORDS.tourTab });
    if (!(await tourTab.isVisible())) await tourBtn.click();
    await expect(tourTab).toBeVisible();
  }

  const [readingCopy, stopCopy] = scenario.evidence;
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );

  // Step 0: put the caret in scene 14
  const sheet = await step(0);
  const scene14 = sheet.locator("[data-type='scene_heading']").nth(13);
  await scene14.scrollIntoViewIfNeeded();
  await scene14.click();

  // Step 1: choose Read aloud in the Script menu via the command palette
  await selectTourStep(page, scenario.promise, 1);
  await page.locator("[data-tour='app.palette']").click();
  await page.getByRole("option", { name: "Script", exact: true }).click();
  await page.getByRole("option", { name: /^Read aloud$/ }).click();

  const stateBar = page.locator("[data-tour='state_bar']");
  await expect(stateBar).toContainText(readingCopy!);
  await expect(stateBar).toContainText(stopCopy!);
  await expectEvidence([page], scenario);

  // Step 2: choose Stop in the state bar (state bar hides once no lines remain)
  await (await step(2)).click();
  await expect(stateBar).toBeHidden();
});
