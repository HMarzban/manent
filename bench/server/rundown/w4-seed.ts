// Aged project-file cache and today's show setup for the W4 daily-show benchmark.
import { existsSync } from "node:fs";
import { cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  STORED_COLUMNS,
  initRundown,
  insertRows,
  scriptDocFromJSON,
  updateMeta,
} from "@manent/crdt";
import { ENGINE_VERSION } from "@manent/pagination";
import { SCHEMA_VERSION, randomBlockId } from "@manent/schema";
import { openSqliteStorage } from "@manent/storage";
import type { Storage } from "@manent/storage";
import { createBot } from "@manent/testkit";
import type { TestServer } from "@manent/testkit";
import { cached } from "../../corpus/cache.ts";
import type { CorpusRundown } from "../../corpus/rundown.ts";
import { CORPUS_VERSION } from "../../corpus/version.ts";
import { HOME, OWNER, docIdOf, until } from "../support.ts";

export const SEGMENTS = 20;
export const VERSIONS_PER_SEGMENT = 250;
export const RUNDOWN_ID = docIdOf(0);
export const SEGMENT_IDS = Array.from({ length: SEGMENTS }, (_, i) =>
  docIdOf(i + 1),
);
export const EARLIER_OFFSET = 100;
export const EARLIER_SAMPLE_ID = docIdOf(EARLIER_OFFSET);

const T0 = Date.UTC(2026, 10, 25, 12, 0, 0);
const DAY_MS = 86_400_000;
const READY_MS = 30_000;
const EDITOR_ROLES = ["sam", "priya", "ana"] as const;
const VIEWER_ROLES = ["leo", "you"] as const;
const CACHE_DIR = join(import.meta.dir, "..", "..", "corpus", "cache");

/** Encodes each corpus segment once, reusing the corpus cache when writable. */
export function segmentStates(rundown: CorpusRundown): Uint8Array[] {
  return rundown.stories.map((story, i) => {
    let doc = null;
    try {
      doc = cached(`w4-segment-${i}`, () => scriptDocFromJSON(story.doc));
    } catch {
      doc = scriptDocFromJSON(story.doc);
    }
    const state = doc.encodeState();
    doc.destroy();
    return state;
  });
}

function appendState(storage: Storage, docId: string, state: Uint8Array): void {
  const clocks = updateMeta(state).map(({ clientId, toClock }) => ({
    clientId,
    clock: toClock,
  }));
  storage.open(HOME).log.append({
    docId,
    generation: 1,
    update: state,
    userId: OWNER,
    origin: "import",
    clocks,
  });
}

function addVersions(
  storage: Storage,
  docId: string,
  prefix: string,
  startAt: number,
): void {
  const file = storage.open(HOME);
  for (let v = 0; v < VERSIONS_PER_SEGMENT; v++) {
    const named = v % 50 === 49;
    file.versions.add({
      id: `${prefix}-v${v}`,
      docId,
      generation: 1,
      seq: 1,
      kind: named ? "named" : "auto",
      name: named ? `Draft ${v + 1}` : null,
      createdByUserId: OWNER,
      createdAt: startAt + v * 60_000,
      deviceId: null,
    });
  }
}

/** Seeds earlier show days (20 segments each, 250 versions each) into `dataPath`, caching by CORPUS_VERSION. */
export async function seedAgedHistory(
  dataPath: string,
  earlierDays: number,
  sampleState: Uint8Array,
): Promise<void> {
  const cachedDir = join(
    CACHE_DIR,
    `w4-aged-${earlierDays}-v${CORPUS_VERSION}`,
  );
  if (existsSync(join(cachedDir, ".ready"))) {
    await cp(cachedDir, dataPath, { recursive: true });
    await rm(join(dataPath, ".ready"), { force: true });
    return;
  }
  const storage = openSqliteStorage({
    dir: dataPath,
    now: () => T0,
    durability: "off",
  });
  try {
    storage.transaction(() => {
      for (let d = 0; d < earlierDays; d++)
        for (let s = 0; s < SEGMENTS; s++) {
          const docId = docIdOf(EARLIER_OFFSET + d * SEGMENTS + s);
          storage.directory.place(docId, HOME, "script", OWNER);
          storage.directory.setRole(docId, OWNER, "owner", []);
        }
    });
    const file = storage.open(HOME);
    file.transaction(() => {
      for (let d = 0; d < earlierDays; d++) {
        const dayStart = T0 - (earlierDays - d) * DAY_MS;
        for (let s = 0; s < SEGMENTS; s++) {
          const docId = docIdOf(EARLIER_OFFSET + d * SEGMENTS + s);
          file.log.create({
            id: docId,
            kind: "script",
            ownerUserId: null,
            schemaVersion: SCHEMA_VERSION,
            engineVersion: ENGINE_VERSION,
          });
          if (docId === EARLIER_SAMPLE_ID)
            appendState(storage, docId, sampleState);
          addVersions(storage, docId, `d${d}-s${s}`, dayStart);
        }
      }
    });
  } finally {
    storage.close();
  }
  const partial = `${cachedDir}.partial-${process.pid}`;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await cp(dataPath, partial, { recursive: true });
    await writeFile(join(partial, ".ready"), String(CORPUS_VERSION));
    await rename(partial, cachedDir);
  } catch {
    await rm(partial, { recursive: true, force: true });
  }
}

/** Creates today's rundown and 20 segments via POST /api/docs, seeds segment states/roles, and populates rows. */
export async function setupTodayShow(
  server: TestServer,
  rundown: CorpusRundown,
  states: readonly Uint8Array[],
  danaToken: string,
): Promise<void> {
  const home = `project:${HOME.id}`;
  await server.createDocument(OWNER, {
    docId: RUNDOWN_ID,
    kind: "rundown",
    home,
  });
  for (const docId of SEGMENT_IDS)
    await server.createDocument(OWNER, { docId, kind: "script", home });

  await server.stop();
  const storage = openSqliteStorage({
    dir: join(server.dataDir, "data"),
    now: Date.now,
  });
  try {
    storage.transaction(() => {
      for (const docId of [RUNDOWN_ID, ...SEGMENT_IDS]) {
        for (const u of EDITOR_ROLES)
          storage.directory.setRole(docId, u, "edit", []);
        for (const u of VIEWER_ROLES)
          storage.directory.setRole(docId, u, "view", []);
      }
    });
    storage.open(HOME).transaction(() => {
      for (let i = 0; i < SEGMENTS; i++)
        appendState(storage, SEGMENT_IDS[i]!, states[i]!);
      addVersions(
        storage,
        SEGMENT_IDS[0]!,
        "today-s0",
        Date.now() - VERSIONS_PER_SEGMENT * 60_000,
      );
    });
  } finally {
    storage.close();
  }
  await server.start();

  const writer = createBot({ server, userId: OWNER, token: danaToken });
  try {
    const handle = await writer.open(RUNDOWN_ID);
    initRundown(
      handle.doc(),
      {
        airDate: "2026-11-25",
        airAt: Date.now() + 3_600_000,
        windowLeadMs: 1_800_000,
        targetMs: 3_600_000,
      },
      STORED_COLUMNS,
    );
    insertRows(
      handle.doc(),
      rundown.rows.map((r) => ({
        id: randomBlockId(),
        kind: r.kind === "header" ? "header" : "script",
        docId: r.story === null ? null : SEGMENT_IDS[r.story]!,
        blockId: null,
      })),
      null,
    );
    await until(() => handle.status.get().waiting === 0, READY_MS);
  } finally {
    await writer.close();
  }
}
