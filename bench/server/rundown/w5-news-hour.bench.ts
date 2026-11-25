// W5 news hour: 6 rundowns of 80 stories, 200 viewers per rundown (20 prompters + 180 viewers),
// 25 editors typing at realistic rates and saving every 30 s, plus idle-room unload with viewers kept.
import { PROFILES, createRng } from "@manent/demo";
import { blockText, blockView } from "@manent/schema";
import { DEFAULT_LIMITS } from "@manent/server-core";
import type { DocHandle } from "@manent/sync-client";
import { createBot, createPrompterBot, createViewerBot } from "@manent/testkit";
import type { Bot, PrompterBot, ViewerBot } from "@manent/testkit";
import type { RUNDOWN_ROWS } from "../../corpus/rundown.ts";
import { benchMode } from "../../env.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import { measurement, sampleMs } from "../../measure.ts";
import { delay, until } from "../support.ts";
import {
  replayKey,
  seedNewsRundowns,
  startW5Server,
  watchEventLoop,
  withTimeout,
  wrapDsmallFailure,
} from "./w5-server.ts";
import type { PlacedRundown, W5Server } from "./w5-server.ts";

type Mode = ReturnType<typeof benchMode>;

interface ModeConfig {
  readonly rundowns: number;
  readonly rows: (typeof RUNDOWN_ROWS)[number];
  readonly promptersPerRundown: number;
  readonly viewersPerRundown: number;
  readonly editors: number;
  readonly fanoutSamples: number;
  readonly roomIdleMs: number;
  readonly saveEveryMs: number;
}

const MODES: Readonly<Record<Mode, ModeConfig>> = Object.freeze({
  quick: {
    rundowns: 1,
    rows: 20,
    promptersPerRundown: 2,
    viewersPerRundown: 8,
    editors: 3,
    fanoutSamples: 15,
    roomIdleMs: 200,
    saveEveryMs: 400,
  },
  standard: {
    rundowns: 6,
    rows: 80,
    promptersPerRundown: 20,
    viewersPerRundown: 180,
    editors: 25,
    fanoutSamples: 240,
    roomIdleMs: DEFAULT_LIMITS.roomIdleMs,
    saveEveryMs: 30_000,
  },
  full: {
    rundowns: 6,
    rows: 80,
    promptersPerRundown: 20,
    viewersPerRundown: 180,
    editors: 25,
    fanoutSamples: 240,
    roomIdleMs: DEFAULT_LIMITS.roomIdleMs,
    saveEveryMs: 30_000,
  },
});

const SEED = 4747;
const READY_MS = 30_000;
const SETTLE_MS = 20_000;
const IDLE_GRACE_MS = 300;
const INTERVAL_MS = Math.round(1_000 / PROFILES.realistic.keysPerSecond);

interface PendingMarker {
  seen: Set<number>;
  viewerCount: number;
  resolve(): void;
}

interface EditorClient {
  readonly index: number;
  readonly userId: string;
  readonly token: string;
  readonly docId: string;
  readonly bot: Bot;
  readonly handle: DocHandle;
}

function subscribeRundownViewers(
  server: W5Server,
  rundown: PlacedRundown,
  rundownIdx: number,
  config: ModeConfig,
  pendingByDoc: Map<string, Map<string, PendingMarker>>,
  viewersByDoc: Map<string, number>,
  unsubs: (() => void)[],
): { prompters: PrompterBot[]; viewers: ViewerBot[] } {
  const prompters: PrompterBot[] = [];
  const viewers: ViewerBot[] = [];
  for (let p = 0; p < config.promptersPerRundown; p++) {
    const userId = `w5-viewer-${(rundownIdx * 200 + p) % 40}`;
    prompters.push(
      createPrompterBot({
        server,
        userId,
        token: server.token(userId),
        rundownId: rundown.rundownId,
      }),
    );
  }
  for (let v = 0; v < config.viewersPerRundown; v++) {
    const docId = rundown.storyDocIds[v % rundown.storyDocIds.length]!;
    const slot = viewersByDoc.get(docId) ?? 0;
    viewersByDoc.set(docId, slot + 1);
    const userId = `w5-viewer-${(rundownIdx * 200 + config.promptersPerRundown + v) % 40}`;
    const viewer = createViewerBot({
      server,
      userId,
      token: server.token(userId),
      docId,
    });
    viewers.push(viewer);
    let pending = pendingByDoc.get(docId);
    if (pending === undefined) {
      pending = new Map();
      pendingByDoc.set(docId, pending);
    }
    const docPending = pending;
    unsubs.push(
      viewer.view.blocks.subscribe((blocks) => {
        if (docPending.size === 0) return;
        for (let b = blocks.length - 1; b >= 0; b--) {
          const entry = docPending.get(blockText(blockView(blocks[b]!)));
          if (entry === undefined) continue;
          entry.seen.add(slot);
          if (entry.seen.size >= entry.viewerCount) entry.resolve();
        }
      }),
    );
  }
  return { prompters, viewers };
}

async function saveVersion(
  server: W5Server,
  editor: EditorClient,
  counter: number,
): Promise<void> {
  const res = await fetch(`${server.url}/api/versions/save`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${editor.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      docId: editor.docId,
      key: replayKey(0x55a0, editor.index, counter),
      kind: "saved",
    }),
  });
  if (!res.ok)
    throw new Error(
      `POST /api/versions/save for ${editor.docId} answered ${res.status}`,
    );
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

async function runW5(): Promise<Measurement[]> {
  const config = MODES[benchMode()];
  const editorUsers = Array.from(
    { length: config.editors },
    (_, i) => `w5-editor-${i}`,
  );
  const viewerUsers = Array.from({ length: 40 }, (_, i) => `w5-viewer-${i}`);
  const maxConnections =
    config.rundowns * (config.promptersPerRundown + config.viewersPerRundown) +
    config.editors +
    64;
  const server = await startW5Server({
    roomIdleMs: config.roomIdleMs,
    maxConnections,
  });
  const allPrompters: PrompterBot[] = [];
  const allViewers: ViewerBot[] = [];
  const editors: EditorClient[] = [];
  const unsubs: (() => void)[] = [];
  try {
    const rundowns = seedNewsRundowns(server.storage, {
      rundownCount: config.rundowns,
      rows: config.rows,
      editorUsers,
      viewerUsers,
      insideAirWindow: false,
    });
    const pendingByDoc = new Map<string, Map<string, PendingMarker>>();
    const viewersByDoc = new Map<string, number>();

    // Join storm: all viewers of rundown 0 subscribe at once, timed from first SUBSCRIBE to last snapshot.
    const joinStormMs = await sampleMs(async () => {
      const first = subscribeRundownViewers(
        server,
        rundowns[0]!,
        0,
        config,
        pendingByDoc,
        viewersByDoc,
        unsubs,
      );
      allPrompters.push(...first.prompters);
      allViewers.push(...first.viewers);
      await until(
        () =>
          first.prompters.every(
            (p) => p.prompter.status.get().feed === "live",
          ) && first.viewers.every((v) => v.view.status.get().live),
        READY_MS,
      );
    });

    for (let r = 1; r < rundowns.length; r++) {
      const group = subscribeRundownViewers(
        server,
        rundowns[r]!,
        r,
        config,
        pendingByDoc,
        viewersByDoc,
        unsubs,
      );
      allPrompters.push(...group.prompters);
      allViewers.push(...group.viewers);
      await until(
        () =>
          group.prompters.every(
            (p) => p.prompter.status.get().feed === "live",
          ) && group.viewers.every((v) => v.view.status.get().live),
        READY_MS,
      );
    }

    for (let e = 0; e < config.editors; e++) {
      const rundown = rundowns[e % rundowns.length]!;
      const docId =
        rundown.storyDocIds[
          Math.floor(e / rundowns.length) % rundown.storyDocIds.length
        ]!;
      const userId = editorUsers[e]!;
      const token = server.token(userId);
      const bot = createBot({ server, userId, token });
      const handle = await bot.open(docId);
      await until(() => handle.status.get().waiting === 0, READY_MS);
      editors.push({ index: e, userId, token, docId, bot, handle });
    }

    const rng = createRng(SEED);
    const fanout: number[] = [];
    let claimed = 0;
    const loop = watchEventLoop();
    const loops = editors.map(async (editor) => {
      await delay(rng.int(0, INTERVAL_MS));
      let seq = 0;
      let saves = 0;
      let lastSaveAt = Date.now();
      const pending = pendingByDoc.get(editor.docId)!;
      const viewerCount = viewersByDoc.get(editor.docId) ?? 0;
      while (claimed < config.fanoutSamples) {
        claimed += 1;
        const ms = await typeAndMeasureFanout(
          editor,
          `w5-e${editor.index}-${seq++}`,
          pending,
          viewerCount,
        );
        fanout.push(ms);
        if (Date.now() - lastSaveAt >= config.saveEveryMs) {
          await saveVersion(server, editor, saves++);
          lastSaveAt = Date.now();
        }
        if (claimed < config.fanoutSamples) await delay(INTERVAL_MS);
      }
      if (saves === 0) await saveVersion(server, editor, saves);
    });
    await Promise.all(loops);
    await loop.stop();

    // Every editor leaves while all viewers stay subscribed; wait for roomIdleMs to unload rooms.
    await Promise.all(editors.splice(0).map((e) => e.bot.close()));
    await delay(config.roomIdleMs + IDLE_GRACE_MS);
    const idleRooms = server.loadedRooms();

    return [
      measurement("fanout_ms", "ms", fanout),
      measurement("event_loop_lag_ms", "ms", loop.lateness),
      measurement("last_synced_ms", "ms", [joinStormMs]),
      measurement("rooms_after_idle", "count", [idleRooms]),
    ];
  } catch (error) {
    throw wrapDsmallFailure(error);
  } finally {
    for (const unsub of unsubs) unsub();
    await Promise.all([
      ...editors.map((e) => e.bot.close()),
      ...allViewers.map((v) => v.close()),
      ...allPrompters.map((p) => p.close()),
    ]);
    await server.stop();
  }
}

const scenario: Scenario = {
  id: "rundown.w5",
  workload: "W5",
  processes: 5,
  run: runW5,
};

export default scenario;
