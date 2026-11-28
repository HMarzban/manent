// History UI on a 120-page script with 5,000 versions seeded into the demo's SQLite store:
// opening the History tab, comparing two versions 400 edits apart, and restoring a version.
import { join } from "node:path";
import { loadDoc, scriptBody, updateMeta } from "@manent/crdt";
import type { CrdtDoc, ScriptBody } from "@manent/crdt";
import { isSceneHeading, textOf } from "@manent/revisions";
import type { BlockJSON } from "@manent/schema";
import { contentAt, thinVersions, writeSnapshot } from "@manent/server-core";
import { openSqliteStorage } from "@manent/storage";
import type { DocFile, VersionRow } from "@manent/storage";
import type { VersionAuthor, VersionContent } from "@manent/sync-protocol";
import type { Page } from "@playwright/test";
import { NotMeasured, benchMode } from "../../env.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import { inputBlocks, measurement } from "../../measure.ts";
import { T0, spread } from "../../server/history/restore-120.bench.ts";
import { startBenchDemo } from "../driver.ts";
import { waitForServer } from "../people.ts";
import {
  openCorpusScript,
  settled,
  untilBlocks,
} from "../typing/run-typing.ts";

const PAGES = 120;
const VERSIONS = 5_000;
const DAY_MS = 86_400_000;
const HISTORY_MS = 200 * DAY_MS;
const WRITERS = ["dana", "sam"] as const;
const COMPARE_DRAFT = "Draft 46";
const ITERATIONS = { quick: 1, standard: 5, full: 5 } as const;
const UI_TIMEOUT_MS = 30_000;

interface Replica {
  readonly doc: CrdtDoc;
  readonly body: ScriptBody;
}

function scenesByBlock(blocks: readonly BlockJSON[]): Map<string, string> {
  const scenes = new Map<string, string>();
  let scene = "";
  for (const block of blocks) {
    const id = String(block.attrs?.id);
    if (isSceneHeading(block)) scene = id;
    scenes.set(id, scene);
  }
  return scenes;
}

const typedBlock = (block: BlockJSON): BlockJSON => ({
  ...block,
  content: [{ type: "text", text: `x${textOf(block)}` }],
});

function versionRow(docId: string, n: number): VersionRow {
  const named = n % 100 === 99;
  return {
    id: `v-${String(n).padStart(5, "0")}`,
    docId,
    generation: 1,
    seq: n + 2,
    kind: named ? "named" : "auto",
    name: named ? `Draft ${(n + 1) / 100}` : null,
    createdByUserId: WRITERS[n % WRITERS.length]!,
    createdAt: T0 - HISTORY_MS + ((n + 1) * HISTORY_MS) / VERSIONS,
    deviceId: null,
  };
}

/** Seeds 5,000 versions (every 100th named) on top of `docId`'s initial log row. */
function seedVersions(file: DocFile, docId: string): void {
  const base = contentAt(file, docId, { generation: 1, seq: 1 });
  const [placed] = file.log.tail(docId, 1, 0).rows;
  if (base === null || placed === undefined)
    throw new NotMeasured("the seeded script has no initial log row");
  const replicas: Replica[] = WRITERS.map((_, i) => {
    const doc = loadDoc(placed.update, { clientId: 2001 + i });
    return { doc, body: scriptBody(doc) };
  });
  const blocks = [...base.blocks];
  const at = new Map(blocks.map((block, i) => [String(block.attrs?.id), i]));
  const scenes = scenesByBlock(blocks);
  const authors: Record<string, VersionAuthor> = {};
  const rows = Array.from({ length: VERSIONS }, (_, n) => versionRow(docId, n));
  const kept = new Set(thinVersions(rows, T0).keep);
  const edited = spread([...at.keys()], VERSIONS);

  file.transaction(() => {
    rows.forEach((row, n) => {
      const blockId = edited[n]!;
      const replica = replicas[n % WRITERS.length]!;
      const made: Uint8Array[] = [];
      const stop = replica.doc.subscribe((update) => made.push(update));
      replica.body.write((w) => w.insertText(blockId, 0, "x"));
      stop();
      const [update] = made;
      if (update === undefined) throw new Error(`nothing typed in ${blockId}`);
      const clocks = updateMeta(update).map(({ clientId, toClock }) => ({
        clientId,
        clock: toClock,
      }));
      file.log.append({
        docId,
        generation: 1,
        update,
        userId: row.createdByUserId,
        origin: "edit",
        clocks,
      });
      const index = at.get(blockId)!;
      blocks[index] = typedBlock(blocks[index]!);
      authors[blockId] = { userId: row.createdByUserId, at: row.createdAt };
      file.versions.add(row);
      file.history.setSummary(row.id, {
        authorIds: [row.createdByUserId],
        blockIds: [blockId],
        sceneIds: [scenes.get(blockId)!],
      });
      const aged = kept.has(row.id) && T0 - row.createdAt >= DAY_MS;
      if (row.kind !== "named" && !aged) {
        file.checkpoints.pin(row.id, docId, 1, row.seq!);
        return;
      }
      const content: VersionContent = { ...base, blocks, authors };
      const ref = writeSnapshot(file, content);
      file.history.setSnapshot(row.id, ref, content.engineVersion);
    });
  });
  for (const replica of replicas) replica.doc.destroy();
}

async function measureListMs(page: Page): Promise<number> {
  const history = page
    .locator("[data-region='side_panel']")
    .getByRole("region", { name: "History" });
  const start = performance.now();
  await page.keyboard.press("ControlOrMeta+Shift+h");
  try {
    await history
      .getByRole("listitem")
      .first()
      .waitFor({ state: "visible", timeout: UI_TIMEOUT_MS });
  } catch {
    throw new NotMeasured("the History tab did not show a version row");
  }
  await settled(page);
  return performance.now() - start;
}

async function measureCompareMs(page: Page): Promise<number> {
  const history = page
    .locator("[data-region='side_panel']")
    .getByRole("region", { name: "History" });
  const trigger = history.locator("[data-changes-since]").first();
  try {
    await trigger.waitFor({ state: "visible", timeout: UI_TIMEOUT_MS });
  } catch {
    throw new NotMeasured("the History compare picker was not visible");
  }
  await trigger.click();
  const option = page.getByRole("menuitem", { name: COMPARE_DRAFT }).first();
  try {
    await option.waitFor({ state: "visible", timeout: UI_TIMEOUT_MS });
  } catch {
    throw new NotMeasured(`the History compare menu lacked ${COMPARE_DRAFT}`);
  }
  const start = performance.now();
  await option.click();
  try {
    await page
      .locator("[data-editor-host]")
      .getByRole("insertion")
      .first()
      .waitFor({ state: "visible", timeout: UI_TIMEOUT_MS });
  } catch {
    throw new NotMeasured("History comparison did not paint any change mark");
  }
  await settled(page);
  return performance.now() - start;
}

async function measureRestoreMs(page: Page): Promise<number> {
  const history = page
    .locator("[data-region='side_panel']")
    .getByRole("region", { name: "History" });
  const draftsOnly = history.getByRole("button", {
    name: "Drafts only",
    exact: true,
  });
  if ((await draftsOnly.getAttribute("aria-pressed")) !== "true") {
    await draftsOnly.click();
    await settled(page);
  }
  const row = history
    .getByRole("listitem")
    .filter({ hasText: COMPARE_DRAFT })
    .first();
  await row.waitFor({ state: "visible", timeout: UI_TIMEOUT_MS });
  await row.getByRole("button", { name: COMPARE_DRAFT }).click();
  const restore = page.getByRole("menuitem", { name: "Restore", exact: true });
  await restore.waitFor({ state: "visible", timeout: UI_TIMEOUT_MS });
  const restoredResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/api/versions/restore") &&
      res.status() === 200,
    { timeout: UI_TIMEOUT_MS },
  );
  const start = performance.now();
  await restore.click();
  const confirm = page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Restore", exact: true });
  if (
    await confirm.waitFor({ state: "visible", timeout: 500 }).then(
      () => true,
      () => false,
    )
  )
    await confirm.click();
  try {
    await restoredResponse;
    await page
      .locator("[data-editor-host]")
      .getByRole("insertion")
      .first()
      .waitFor({ state: "hidden", timeout: UI_TIMEOUT_MS });
  } catch {
    throw new NotMeasured("History restore did not complete on the page");
  }
  await settled(page);
  return performance.now() - start;
}

const scenario: Scenario = {
  id: "history-ui-120",
  workload: "W1",
  processes: 5,
  async run(): Promise<Measurement[]> {
    const demo = await startBenchDemo();
    try {
      const p = await demo.openPage({ userId: "dana" });
      try {
        const { d, docId } = await openCorpusScript(p.page, PAGES);
        await waitForServer(demo, {
          userId: "dana",
          docId,
          blocks: d.blocks,
        });
        await demo.whileStopped(async (dataDir) => {
          const storage = openSqliteStorage({
            dir: join(dataDir, "data"),
            now: () => T0,
          });
          try {
            const place = storage.directory.placeOf(docId);
            if (place === null)
              throw new NotMeasured("the script was not found in demo storage");
            seedVersions(storage.open(place.home), docId);
          } finally {
            storage.close();
          }
        });

        const listSamples: number[] = [];
        const compareSamples: number[] = [];
        const restoreSamples: number[] = [];
        for (let i = 0; i < ITERATIONS[benchMode()]; i++) {
          await p.page.goto(`${demo.url}/s/${docId}`);
          await untilBlocks(p.page, d.blocks);
          listSamples.push(await measureListMs(p.page));
          compareSamples.push(await measureCompareMs(p.page));
          restoreSamples.push(await measureRestoreMs(p.page));
        }
        return [
          measurement("list_ms", "ms", listSamples),
          measurement("compare_ms", "ms", compareSamples),
          measurement("restore_ms", "ms", restoreSamples),
          inputBlocks(d.blocks),
        ];
      } finally {
        await p.close();
      }
    } finally {
      await demo.stop();
    }
  },
};

export default scenario;
