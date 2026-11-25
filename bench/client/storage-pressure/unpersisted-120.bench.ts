// Unpersisted browser storage on a 120-page screenplay: forces navigator.storage.persisted() and persist() to
// resolve false, types keystrokes, reloads the tab, and counts any missing characters (`changes_lost`).
import type { Page } from "@playwright/test";
import { benchMode } from "../../env.ts";
import type { Scenario } from "../../harness.ts";
import { inputBlocks, measurement } from "../../measure.ts";
import { waitForServer } from "../people.ts";
import {
  caretAt,
  openCorpusScript,
  scriptBlocks,
  untilBlocks,
} from "../typing/run-typing.ts";
import {
  STORAGE_KEYSTROKES,
  STORAGE_PAGES,
  countChangesLost,
  makeTypedText,
  readBlockText,
  requireCdp,
  startStorageDemo,
  typeCharacters,
  waitUntilSynced,
} from "./shared.ts";

function overridePersistence(): void {
  const storage = navigator.storage;
  if (storage === undefined) return;
  Object.defineProperty(storage, "persisted", {
    configurable: true,
    value: () => Promise.resolve(false),
  });
  Object.defineProperty(storage, "persist", {
    configurable: true,
    value: () => Promise.resolve(false),
  });
}

/** Overrides navigator.storage.persisted() and persist() to resolve false immediately and across reloads. */
async function refusePersistence(page: Page): Promise<void> {
  await page.addInitScript(overridePersistence);
  await page.evaluate(overridePersistence);
}

const scenario: Scenario = {
  id: "storage-unpersisted-120",
  workload: "W1",
  processes: 1,
  async run() {
    const demo = await startStorageDemo();
    try {
      const benchPage = await demo.openPage({ userId: "dana" });
      requireCdp(benchPage);
      const { page } = benchPage;
      await refusePersistence(page);

      const { d, docId } = await openCorpusScript(page, STORAGE_PAGES);
      await waitForServer(demo, { userId: "dana", docId, blocks: d.blocks });

      const blocks = await scriptBlocks(page);
      const targetId = blocks[Math.floor(blocks.length / 2)]!.id;
      const beforeText = await readBlockText(page, targetId);
      const typed = makeTypedText(STORAGE_KEYSTROKES[benchMode()]);

      await caretAt(page, targetId, "end");
      await typeCharacters(page, typed);
      await waitUntilSynced(page);

      await page.reload();
      await untilBlocks(page, d.blocks);

      const afterText = await readBlockText(page, targetId);
      const changesLost = countChangesLost(beforeText, typed, afterText);
      return [
        measurement("changes_lost", "count", [changesLost]),
        inputBlocks(d.blocks),
      ];
    } finally {
      await demo.stop();
    }
  },
};

export default scenario;
