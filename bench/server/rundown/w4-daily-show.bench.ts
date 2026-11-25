// W4 daily show: one rundown with 20 segments, 15 editors at realistic rates, 60 viewers spread
// evenly over the segments, and 200 earlier show days of history (5,000 versions a day) on disk.
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEMO_USER_IDS, PROFILES, createRng } from "@manent/demo";
import { blockText, blockView } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { createBot, createViewerBot, startTestServer } from "@manent/testkit";
import type { Bot, TestServer, ViewerBot } from "@manent/testkit";
import { segmentRundown } from "../../corpus/rundown.ts";
import { benchMode } from "../../env.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import { measurement, sampleMs } from "../../measure.ts";
import { OWNER, delay, until } from "../support.ts";
import {
  EARLIER_SAMPLE_ID,
  SEGMENTS,
  SEGMENT_IDS,
  seedAgedHistory,
  segmentStates,
  setupTodayShow,
} from "./w4-seed.ts";

type Mode = ReturnType<typeof benchMode>;

const EDITORS = 15;
const VIEWERS = 60;
const SEED = 4747;
const TIMER_MS = 10;
const READY_MS = 30_000;
const SETTLE_MS = 15_000;
const INTERVAL_MS = Math.round(1_000 / PROFILES.realistic.keysPerSecond);
const EDITOR_USERS = ["dana", "sam", "priya", "ana"] as const;

const MODES: Readonly<
  Record<
    Mode,
    { earlierDays: number; fanoutSamples: number; listPerDoc: number }
  >
> = Object.freeze({
  quick: { earlierDays: 2, fanoutSamples: 20, listPerDoc: 10 },
  standard: { earlierDays: 200, fanoutSamples: 240, listPerDoc: 120 },
  full: { earlierDays: 200, fanoutSamples: 240, listPerDoc: 120 },
});

interface PendingMarker {
  seen: Set<number>;
  viewerCount: number;
  resolve(): void;
}

interface EditorClient {
  readonly bot: Bot;
  readonly handle: DocHandle;
  readonly segment: number;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms} ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function watchEventLoop(): { lateness: number[]; stop(): Promise<void> } {
  const lateness: number[] = [];
  const stopping = new AbortController();
  const watched = (async () => {
    while (!stopping.signal.aborted) {
      const ms = await sampleMs(() => delay(TIMER_MS));
      lateness.push(Math.max(0, ms - TIMER_MS));
    }
  })();
  return {
    lateness,
    async stop() {
      stopping.abort();
      await watched;
    },
  };
}

async function measureLists(
  server: TestServer,
  token: string,
  perDoc: number,
): Promise<number[]> {
  const docs = [SEGMENT_IDS[0]!, EARLIER_SAMPLE_ID];
  const samples: number[] = [];
  for (let i = 0; i < perDoc * docs.length; i++) {
    const docId = docs[i % docs.length]!;
    samples.push(
      await sampleMs(async () => {
        const res = await fetch(
          `${server.url}/api/versions?docId=${encodeURIComponent(docId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok)
          throw new Error(
            `GET /api/versions for ${docId} answered ${res.status}`,
          );
        await res.json();
      }),
    );
  }
  return samples;
}

async function typeAndMeasureFanout(
  editor: EditorClient,
  marker: string,
  pending: Map<string, PendingMarker>,
  viewerCount: number,
): Promise<number> {
  const seen = new Set<number>();
  const allSeen = Promise.withResolvers<void>();
  pending.set(marker, { seen, viewerCount, resolve: allSeen.resolve });
  const acked = Promise.withResolvers<void>();
  const stop = editor.handle.status.subscribe((s) => {
    if (s.waiting === 0) acked.resolve();
  });
  try {
    editor.bot.typeLine(editor.handle, marker);
    if (editor.handle.status.get().waiting === 0) acked.resolve();
    await withTimeout(acked.promise, SETTLE_MS, `ack ${marker}`);
    return await sampleMs(() =>
      withTimeout(allSeen.promise, SETTLE_MS, `fanout ${marker}`),
    );
  } finally {
    stop();
    pending.delete(marker);
  }
}

async function runScenario(): Promise<Measurement[]> {
  const config = MODES[benchMode()];
  const rundown = segmentRundown({ seed: 1 });
  const states = segmentStates(rundown);
  const dataDir = await mkdtemp(join(tmpdir(), "manent-w4-"));
  const dataPath = join(dataDir, "data");
  await mkdir(dataPath, { recursive: true });
  await seedAgedHistory(dataPath, config.earlierDays, states[0]!);

  const server = await startTestServer({ dataDir });
  const viewers: ViewerBot[] = [];
  const editors: EditorClient[] = [];
  const unsubs: (() => void)[] = [];
  try {
    const tokens = new Map<string, string>();
    for (const u of DEMO_USER_IDS) tokens.set(u, await server.token(u));
    const danaToken = tokens.get(OWNER)!;
    await setupTodayShow(server, rundown, states, danaToken);

    const pendingBySeg = Array.from(
      { length: SEGMENTS },
      () => new Map<string, PendingMarker>(),
    );
    const viewersPerSeg = Array.from({ length: SEGMENTS }, () => 0);

    for (let i = 0; i < VIEWERS; i++) {
      const seg = i % SEGMENTS;
      const slot = viewersPerSeg[seg]!;
      viewersPerSeg[seg] = slot + 1;
      const userId = DEMO_USER_IDS[i % DEMO_USER_IDS.length]!;
      const viewer = createViewerBot({
        server,
        userId,
        token: tokens.get(userId)!,
        docId: SEGMENT_IDS[seg]!,
      });
      viewers.push(viewer);
      const pending = pendingBySeg[seg]!;
      unsubs.push(
        viewer.view.blocks.subscribe((blocks) => {
          if (pending.size === 0) return;
          for (let b = blocks.length - 1; b >= 0; b--) {
            const entry = pending.get(blockText(blockView(blocks[b]!)));
            if (entry === undefined) continue;
            entry.seen.add(slot);
            if (entry.seen.size >= entry.viewerCount) entry.resolve();
          }
        }),
      );
    }
    await until(() => viewers.every((v) => v.view.status.get().live), READY_MS);

    for (let e = 0; e < EDITORS; e++) {
      const userId = EDITOR_USERS[e % EDITOR_USERS.length]!;
      const bot = createBot({ server, userId, token: tokens.get(userId)! });
      const handle = await bot.open(SEGMENT_IDS[e]!);
      await until(() => handle.status.get().waiting === 0, READY_MS);
      editors.push({ bot, handle, segment: e });
    }

    const rng = createRng(SEED);
    const fanout: number[] = [];
    let claimed = 0;
    const loop = watchEventLoop();
    const listPromise = measureLists(server, danaToken, config.listPerDoc);
    const loops = editors.map(async (editor, idx) => {
      await delay(rng.int(0, INTERVAL_MS));
      let seq = 0;
      while (claimed < config.fanoutSamples) {
        claimed += 1;
        const ms = await typeAndMeasureFanout(
          editor,
          `w4-e${idx}-${seq++}`,
          pendingBySeg[editor.segment]!,
          viewersPerSeg[editor.segment]!,
        );
        fanout.push(ms);
        if (claimed < config.fanoutSamples) await delay(INTERVAL_MS);
      }
    });
    const [lists] = await Promise.all([listPromise, Promise.all(loops)]);
    await loop.stop();
    return [
      measurement("fanout_ms", "ms", fanout),
      measurement("event_loop_lag_ms", "ms", loop.lateness),
      measurement("list_ms", "ms", lists),
    ];
  } finally {
    for (const unsub of unsubs) unsub();
    await Promise.all([
      ...editors.map((e) => e.bot.close()),
      ...viewers.map((v) => v.close()),
    ]);
    await server.stop();
    await rm(dataDir, { recursive: true, force: true });
  }
}

const scenario: Scenario = {
  id: "rundown.w4",
  workload: "W4",
  processes: 5,
  run: runScenario,
};

export default scenario;
