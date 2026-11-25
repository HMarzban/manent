// Simulated people running on headless bots against a bench demo, plus shared helpers for
// collaboration scenarios: server sync waits, viewer bots, script regions and socket traffic.
import { browserClock } from "@manent/client-web";
import { blockIds } from "@manent/crdt";
import { createRng, createSimulatedPerson } from "@manent/demo";
import type { SimulatedPerson, WritingProfile } from "@manent/demo";
import type { DocHandle, Random, ViewHandle } from "@manent/sync-client";
import { createBot } from "@manent/testkit";
import type { Bot } from "@manent/testkit";
import type { CDPSession } from "@playwright/test";
import { NotMeasured } from "../env.ts";
import type { BenchDemo } from "./driver.ts";

export interface PersonSpec {
  userId: string;
  profile: WritingProfile;
  region: { firstBlockId: string; lastBlockId: string } | null;
  markers: boolean;
}

export interface StartPeopleOptions {
  demo: BenchDemo;
  docId: string;
  people: readonly PersonSpec[];
  seed: number;
}

export interface StartedPeople {
  persons: SimulatedPerson[];
  stop(): Promise<void>;
}

const SYNC_TIMEOUT_MS = 180_000;
const ATTEMPT_MS = 15_000;
const POLL_MS = 200;

/** A deterministic `Random` driven by `@manent/demo`'s seeded RNG. */
export function seededRandom(seed: number): Random {
  const rng = createRng(seed);
  return {
    next: () => rng.next(),
    clientId: () => rng.int(1, 0x7fffffff),
    bytes(length) {
      const out = new Uint8Array(length);
      for (let i = 0; i < length; i++) out[i] = rng.int(0, 255);
      return out;
    },
  };
}

/** Polls `predicate` until true, or throws `message` after `timeoutMs`. */
export async function until(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  message: string,
): Promise<void> {
  const limit = performance.now() + timeoutMs;
  while (!(await predicate())) {
    if (performance.now() > limit) throw new Error(message);
    await Bun.sleep(POLL_MS);
  }
}

/** Resolves once `handle` holds synced blocks on the server. */
export async function untilHandleSynced(
  handle: DocHandle,
  timeoutMs: number = SYNC_TIMEOUT_MS,
): Promise<void> {
  await until(
    () =>
      handle.status.get().synced &&
      handle.status.get().waiting === 0 &&
      blockIds(handle.doc()).length > 0,
    timeoutMs,
    `bot handle ${handle.docId} did not sync`,
  );
}

/** Resolves once a fresh bot of `userId` sees all `blocks` blocks of `docId` from the server. */
export async function waitForServer(
  demo: BenchDemo,
  at: { userId: string; docId: string; blocks: number },
): Promise<void> {
  const deadline = performance.now() + SYNC_TIMEOUT_MS;
  let held = 0;
  while (performance.now() < deadline) {
    const bot = createBot({
      server: { url: demo.url },
      userId: at.userId,
      token: await demo.token(at.userId),
    });
    try {
      const handle = await bot.open(at.docId);
      const attemptUntil = performance.now() + ATTEMPT_MS;
      while (performance.now() < attemptUntil) {
        held = blockIds(handle.doc()).length;
        if (held === at.blocks) return;
        await Bun.sleep(POLL_MS);
      }
    } finally {
      await bot.close();
    }
  }
  throw new Error(`the server held ${held} of the ${at.blocks} blocks`);
}

/** Shares `docId` with `grants`; throws `NotMeasured` if any role cannot be written. */
export async function shareRoles(
  demo: BenchDemo,
  docId: string,
  grants: readonly {
    userId: string;
    role: "owner" | "edit" | "view";
    capabilities: readonly string[];
  }[],
): Promise<void> {
  try {
    await demo.share(docId, grants);
  } catch (cause) {
    throw new NotMeasured(
      `share was refused: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

/** Starts `people` writing to `docId` on `demo`, each on its own bot with a deterministic `Random`. */
export async function startPeople(
  options: StartPeopleOptions,
): Promise<StartedPeople> {
  const { demo, docId, people, seed } = options;
  const bots: Bot[] = [];
  const persons: SimulatedPerson[] = [];
  try {
    for (const [index, spec] of people.entries()) {
      const bot = createBot({
        server: { url: demo.url },
        userId: spec.userId,
        token: await demo.token(spec.userId),
      });
      bots.push(bot);
      const handle = await bot.open(docId);
      await untilHandleSynced(handle);
      const person = createSimulatedPerson({
        handle,
        client: bot.client,
        profile: spec.profile,
        clock: browserClock,
        random: seededRandom(seed + index + 1),
        region: spec.region,
        markers: spec.markers,
      });
      persons.push(person);
    }
    for (const person of persons) person.start();
  } catch (cause) {
    await Promise.allSettled(persons.map((person) => person.stop()));
    await Promise.allSettled(bots.map((bot) => bot.close()));
    throw cause;
  }
  return {
    persons,
    async stop() {
      await Promise.allSettled(persons.map((person) => person.stop()));
      await Promise.allSettled(bots.map((bot) => bot.close()));
    },
  };
}

/** Opens `count` viewer bots as `userId` on `docId` and returns a stop function. */
export async function openViewers(
  demo: BenchDemo,
  docId: string,
  userId: string,
  count: number,
): Promise<() => Promise<void>> {
  const bots: Bot[] = [];
  const views: ViewHandle[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const bot = createBot({
        server: { url: demo.url },
        userId,
        token: await demo.token(userId),
      });
      bots.push(bot);
      views.push(bot.client.view(docId));
    }
    await until(
      () => views.every((view) => view.status.get().live),
      SYNC_TIMEOUT_MS,
      "viewer bots did not become live",
    );
  } catch (cause) {
    for (const view of views) view.close();
    await Promise.allSettled(bots.map((bot) => bot.close()));
    throw cause;
  }
  return async () => {
    for (const view of views) view.close();
    await Promise.allSettled(bots.map((bot) => bot.close()));
  };
}

/** Divides `blocks` between `from` and `to` fractions into `count` contiguous non-overlapping regions. */
export function regionsIn(
  blocks: readonly { id: string }[],
  from: number,
  to: number,
  count: number,
): { firstBlockId: string; lastBlockId: string }[] {
  const start = Math.floor(blocks.length * from);
  const end = Math.max(start + count * 2, Math.floor(blocks.length * to));
  const span = Math.max(2, Math.floor((end - start) / count));
  return Array.from({ length: count }, (_, i) => {
    const first = Math.min(blocks.length - 1, start + i * span);
    const last = Math.min(blocks.length - 1, first + span - 1);
    return {
      firstBlockId: blocks[first]!.id,
      lastBlockId: blocks[last]!.id,
    };
  });
}

function frameByteLength(opcode: number, payloadData: string): number {
  if (opcode !== 2) return Buffer.byteLength(payloadData, "utf8");
  const padding = payloadData.endsWith("==")
    ? 2
    : payloadData.endsWith("=")
      ? 1
      : 0;
  return Math.max(0, Math.floor((payloadData.length * 3) / 4) - padding);
}

/** Counts WebSocket bytes sent and received on `cdp`. */
export async function watchSocketBytes(
  cdp: CDPSession | null,
): Promise<() => { sent: number; received: number }> {
  if (cdp === null)
    throw new Error("watchSocketBytes requires a Chromium CDP session");
  await cdp.send("Network.enable");
  let sent = 0;
  let received = 0;
  cdp.on("Network.webSocketFrameSent", ({ response }) => {
    sent += frameByteLength(response.opcode, response.payloadData);
  });
  cdp.on("Network.webSocketFrameReceived", ({ response }) => {
    received += frameByteLength(response.opcode, response.payloadData);
  });
  return () => ({ sent, received });
}
