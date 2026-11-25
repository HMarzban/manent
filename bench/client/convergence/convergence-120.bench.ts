// Convergence visibility in a 120-page script: 3 realistic writers type markers while a viewing
// browser tab records when each marker appears in its DOM, plus WebSocket bytes per person-minute.
import { PROFILES } from "@manent/demo";
import type { Page } from "@playwright/test";
import { benchMode } from "../../env.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import { inputBlocks, measurement } from "../../measure.ts";
import { startBenchDemo } from "../driver.ts";
import {
  regionsIn,
  shareRoles,
  startPeople,
  until,
  waitForServer,
  watchSocketBytes,
} from "../people.ts";
import { openCorpusScript, scriptBlocks } from "../typing/run-typing.ts";

const PAGES = 120;
const WRITERS = ["sam", "leo", "ana"] as const;
const MARKERS_TARGET = { quick: 3, standard: 60, full: 60 } as const;
const TIMEOUT_MS = 300_000;
const MINUTE_MS = 60_000;

/** Installs a DOM observer on `[data-editor-host]` recording the epoch ms each `⟦client:n⟧` marker first appears. */
async function installMarkerWatcher(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: Record<string, number> = {};
    const pattern = /⟦\d+:\d+⟧/g;
    const scan = (text: string | null, at: number): void => {
      if (text === null) return;
      for (const match of text.matchAll(pattern)) {
        const marker = match[0];
        if (!(marker in seen)) seen[marker] = at;
      }
    };
    const host = document.querySelector("[data-editor-host]");
    if (host === null) throw new Error("editor host is not mounted");
    scan(host.textContent, Date.now());
    const observer = new MutationObserver((records) => {
      const at = Date.now();
      for (const record of records) {
        if (record.type === "characterData")
          scan(record.target.textContent, at);
        for (const node of record.addedNodes) scan(node.textContent, at);
      }
    });
    observer.observe(host, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    Reflect.set(window, "__markerWatch", { seen, observer });
  });
}

async function readSeenMarkers(page: Page): Promise<Record<string, number>> {
  const found: unknown = await page.evaluate(() => {
    const watch: unknown = Reflect.get(window, "__markerWatch");
    return Reflect.get(Object(watch), "seen");
  });
  if (typeof found !== "object" || found === null) return {};
  return Object.fromEntries(
    Object.entries(found).map(([key, value]) => [key, Number(value)]),
  );
}

async function stopMarkerWatcher(page: Page): Promise<void> {
  await page.evaluate(() => {
    const watch: unknown = Reflect.get(window, "__markerWatch");
    const observer: unknown = Reflect.get(Object(watch), "observer");
    if (observer instanceof MutationObserver) observer.disconnect();
  });
}

const scenario: Scenario = {
  id: "convergence-120",
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
        await shareRoles(
          demo,
          docId,
          WRITERS.map((userId) => ({
            userId,
            role: "edit",
            capabilities: [],
          })),
        );
        const blocks = await scriptBlocks(p.page);
        const regions = regionsIn(blocks, 0.1, 0.9, WRITERS.length);
        const target = MARKERS_TARGET[benchMode()];
        const socketBytes = await watchSocketBytes(p.cdp);
        await installMarkerWatcher(p.page);
        const before = socketBytes();
        const startedAt = performance.now();
        const started = await startPeople({
          demo,
          docId,
          people: WRITERS.map((userId, i) => ({
            userId,
            profile: PROFILES.realistic,
            region: regions[i]!,
            markers: true,
          })),
          seed: 400,
        });
        try {
          await until(
            async () =>
              Object.keys(await readSeenMarkers(p.page)).length >= target,
            TIMEOUT_MS,
            `the page did not see ${target} markers in time`,
          );
          const elapsedMinutes = Math.max(
            (performance.now() - startedAt) / MINUTE_MS,
            1e-6,
          );
          const after = socketBytes();
          const seen = await readSeenMarkers(p.page);
          await stopMarkerWatcher(p.page);

          const sentAt = new Map<string, number>();
          for (const person of started.persons)
            for (const event of person.events)
              if (event.marker !== null && !sentAt.has(event.marker))
                sentAt.set(event.marker, event.at);

          const visibleMs: number[] = [];
          for (const [marker, seenAt] of Object.entries(seen)) {
            const at = sentAt.get(marker);
            if (at !== undefined) visibleMs.push(Math.max(0, seenAt - at));
          }
          const samples = visibleMs.slice(0, target);
          if (samples.length === 0)
            throw new Error("no marker visibility sample was recorded");
          return [
            measurement("visible_ms", "ms", samples),
            measurement("bytes_sent", "bytes", [
              (after.sent - before.sent) / elapsedMinutes,
            ]),
            measurement("bytes_received", "bytes", [
              (after.received - before.received) / elapsedMinutes,
            ]),
            inputBlocks(d.blocks),
          ];
        } finally {
          await started.stop();
        }
      } finally {
        await p.close();
      }
    } finally {
      await demo.stop();
    }
  },
};

export default scenario;
