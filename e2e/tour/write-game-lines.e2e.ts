// The Tour's write-game-lines scenario: Game Script branching line colours, Line data (JSON) export, and Ink Knots tab.
import { readFile } from "node:fs/promises";
import { seedDoc } from "@manent/demo";
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

interface ExportedLine {
  id: string;
  type: string;
  character?: string;
  kind?: string;
  depth?: number;
  text: string;
}

tourScenario("write-game-lines", async ({ page, scenario, step }) => {
  const [lineDataLabel, exportedMsg, knotsLabel, stitchLabel] =
    scenario.evidence;
  const sheet = await step(0);
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  const carDeck = sheet
    .locator("[data-type='scene_heading']", {
      hasText: "INT. CAR DECK - NIGHT",
    })
    .first();
  await carDeck.scrollIntoViewIfNeeded();
  await expect(carDeck).toBeVisible();
  await expect(sheet.locator(".src-choice").first()).toBeVisible();
  await expect(sheet.locator(".src-gather").first()).toBeVisible();
  await expect(sheet.locator(".src-condition").first()).toBeVisible();
  await expect(sheet.locator(".src-tag").first()).toBeVisible();

  const knockBlock = sheet
    .locator("[data-type='dialogue']", {
      hasText: "Ferry's full, whoever you are. I'll need to see a ticket.",
    })
    .first();
  const knockBlockId = await knockBlock.getAttribute("data-id");
  expect(knockBlockId).toBeTruthy();

  await selectTourStep(page, scenario.promise, 1);
  await page
    .getByRole("button", {
      name: DOCUMENT_WORDS.titleMenu("Twelve on Foot — Chapter 1: Fog Bell"),
    })
    .click();
  await (await step(1)).click();
  const lineDataOption = page
    .locator("[data-tour='send:as']")
    .getByRole("button", { name: lineDataLabel! });
  await expect(lineDataOption).toBeVisible();
  await lineDataOption.click();
  await expectEvidence([page], { ...scenario, evidence: [lineDataLabel!] });

  const downloadPromise = page.waitForEvent("download");
  await (await step(2)).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const rows = JSON.parse(
    await readFile(downloadPath!, "utf8"),
  ) as ExportedLine[];

  // Verify the three branching lines of scene 4 with their kind and depth
  const checkVan = rows.find(
    (row) => row.kind === "choice" && row.text.includes("Check the van"),
  );
  expect(checkVan).toMatchObject({ kind: "choice", depth: 1 });
  const knockChoice = rows.find(
    (row) => row.kind === "choice" && row.text.includes("Knock on the door"),
  );
  expect(knockChoice).toMatchObject({ kind: "choice", depth: 2 });
  const gatherRow = rows.find((row) => row.kind === "gather");
  expect(gatherRow).toMatchObject({ kind: "gather", depth: 1 });
  const conditionRow = rows.find(
    (row) => row.kind === "condition" && row.text.includes("{finn_trust >= 1}"),
  );
  expect(conditionRow).toMatchObject({ kind: "condition", depth: 0 });
  const tagRow = rows.find(
    (row) => row.kind === "tag" && row.text.includes("#set finn_trust=1"),
  );
  expect(tagRow).toMatchObject({ kind: "tag", depth: 2 });

  // Cal's knock line keeps its stable D−3 block id across the D−1 rewrite
  const knockRow = rows.find((row) =>
    row.text.includes(
      "Ferry's full, whoever you are. I'll need to see a ticket.",
    ),
  );
  expect(knockRow).toBeDefined();
  expect(knockRow?.character).toBe("CAL");
  expect(knockRow?.id).toBe(knockBlockId);

  const slot = page.locator("[data-tour='message_slot']");
  await expect(async () => {
    const dismiss = slot.getByRole("button", { name: DOCUMENT_WORDS.dismiss });
    if (await dismiss.isVisible()) await dismiss.click();
    await expect(slot).toContainText(exportedMsg!, { timeout: 1000 });
  }).toPass();

  const logbookId = seedDoc("medium/game-samples/keepers-logbook").docId;
  await page.goto(`/s/${logbookId}`);
  await expect(page.locator("[data-tour='page']")).toBeVisible();
  const knotsTab = page.locator("[data-tour='tab:scenes']");
  if (!(await knotsTab.isVisible())) {
    await page.getByRole("button", { name: DOCUMENT_WORDS.viewMenu }).click();
    await page.locator("[data-tour='view.leftPanel']").click();
  }
  await expect(knotsTab).toBeVisible();
  await expect(knotsTab).toContainText(knotsLabel!);
  if ((await knotsTab.getAttribute("aria-selected")) !== "true")
    await knotsTab.click();
  await expectEvidence([page], {
    ...scenario,
    evidence: [knotsLabel!, stitchLabel!],
  });
});
