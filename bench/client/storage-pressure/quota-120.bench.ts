// Browser storage quota exhaustion on a 120-page screenplay: overrides origin quota to usage + 64 KB via CDP,
// types keystrokes, measures time until the app reports storage failure (`told_ms`), then lifts the quota,
// reloads after sync settles, and counts any lost characters (`changes_lost`).
import { NotMeasured, benchMode } from "../../env.ts";
import type { Scenario } from "../../harness.ts";
import { inputBlocks, measurement, sampleMs } from "../../measure.ts";
import { waitForServer } from "../people.ts";
import {
  caretAt,
  openCorpusScript,
  scriptBlocks,
  untilBlocks,
} from "../typing/run-typing.ts";
import {
  QUOTA_HEADROOM_BYTES,
  STORAGE_KEYSTROKES,
  STORAGE_PAGES,
  armQuotaObserver,
  awaitQuotaObserver,
  countChangesLost,
  makeTypedText,
  readBlockText,
  readOriginUsage,
  requireCdp,
  setOriginQuota,
  startStorageDemo,
  typeCharacters,
  waitUntilSynced,
} from "./shared.ts";

const scenario: Scenario = {
  id: "storage-quota-120",
  workload: "W1",
  processes: 1,
  async run() {
    const demo = await startStorageDemo();
    let cdp: ReturnType<typeof requireCdp> | null = null;
    const origin = new URL(demo.url).origin;
    let quotaOverridden = false;
    try {
      const benchPage = await demo.openPage({ userId: "dana" });
      cdp = requireCdp(benchPage);
      const { page } = benchPage;
      const { d, docId } = await openCorpusScript(page, STORAGE_PAGES);
      await waitForServer(demo, { userId: "dana", docId, blocks: d.blocks });

      const blocks = await scriptBlocks(page);
      const targetId = blocks[Math.floor(blocks.length / 2)]!.id;
      const beforeText = await readBlockText(page, targetId);
      const typed = makeTypedText(STORAGE_KEYSTROKES[benchMode()]);

      const usage = await readOriginUsage(cdp, origin);
      await setOriginQuota(cdp, origin, usage + QUOTA_HEADROOM_BYTES);
      quotaOverridden = true;

      await armQuotaObserver(page);
      await caretAt(page, targetId, "end");
      let observedElapsedMs: number | null = null;
      const measuredWaitMs = await sampleMs(async () => {
        await typeCharacters(page, typed);
        const outcome = await awaitQuotaObserver(page);
        if (!outcome.ok) throw new NotMeasured(outcome.reason);
        observedElapsedMs = outcome.elapsedMs;
      });
      const toldMs = observedElapsedMs ?? measuredWaitMs;

      await setOriginQuota(cdp, origin);
      quotaOverridden = false;
      await waitUntilSynced(page);
      await page.reload();
      await untilBlocks(page, d.blocks);

      const afterText = await readBlockText(page, targetId);
      const changesLost = countChangesLost(beforeText, typed, afterText);
      return [
        measurement("told_ms", "ms", [toldMs]),
        measurement("changes_lost", "count", [changesLost]),
        inputBlocks(d.blocks),
      ];
    } finally {
      if (quotaOverridden && cdp !== null) {
        try {
          await cdp.send("Storage.overrideQuotaForOrigin", { origin });
        } catch {
          // ignore cleanup failure if browser already closed
        }
      }
      await demo.stop();
    }
  },
};

export default scenario;
