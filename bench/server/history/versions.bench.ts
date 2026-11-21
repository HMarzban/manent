// The first page of a 120-page script's versions, read from SQLite, after 5,000 versions across
// 200 days have been thinned by the document's maintenance.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDoc, scriptBody, updateMeta } from "@manent/crdt";
import { isSceneHeading, textOf } from "@manent/revisions";
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { contentAt, thinVersions, writeSnapshot } from "@manent/server-core";
import type { HistoryService } from "@manent/server-core";
import { openSqliteStorage } from "@manent/storage";
import type { DocFile, VersionRow } from "@manent/storage";
import type { VersionAuthor } from "@manent/sync-protocol";
import type { Measurement, Scenario } from "../../harness.ts";
import { HOME, OWNER, scriptOfPages } from "../support.ts";
import { T0, WRITER, createHistoryWorld, spread } from "./restore-120.bench.ts";

const VERSIONS = 5_000;
const DAY_MS = 86_400_000;
const HISTORY_MS = 200 * DAY_MS;
/** The list's page, as the versions route asks for it. */
const PAGE_ROWS = 500;
const WRITERS = [OWNER, WRITER] as const;

/** Each block's scene: the id of the scene heading at or before it. */
function scenesOf(blocks: readonly BlockJSON[]): Map<string, string> {
  const scenes = new Map<string, string>();
  let scene = "";
  for (const block of blocks) {
    const id = String(block.attrs?.id);
    if (isSceneHeading(block)) scene = id;
    scenes.set(id, scene);
  }
  return scenes;
}

/** `block` with an "x" typed at its start. */
const typed = (block: BlockJSON): BlockJSON => ({
  ...block,
  content: [{ type: "text", text: `x${textOf(block)}` }],
});

/**
 * The row of the n-th version, n from 0: made by the writers in turn, each at its own place in the
 * log after the import, evenly spaced over HISTORY_MS up to T0, every hundredth named.
 */
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

/**
 * Writes the log rows and versions of the script placed as `docId`, each version with its summary
 * and with the snapshot or pin it would hold had the daily maintenance run all along: a named
 * version, or one that thinning keeps past its first day, holds a snapshot; any other one stays a
 * pinned position. Each writer types into a replica of the script as placed; every character is
 * an "x" at the start of a block, so the text is the same in whatever order the replicas merge.
 */
function writeVersions(file: DocFile, docId: string): void {
  const base = contentAt(file, docId, { generation: 1, seq: 1 });
  if (base === null) throw new Error("the placed script does not read");
  // the import, as the log holds it: the replicas' edits build on its structs
  const [placed] = file.log.tail(docId, 1, 0).rows;
  if (placed === undefined) throw new Error("the placed script has no log");
  const replicas = WRITERS.map((_, i) => {
    const doc = loadDoc(placed.update, { clientId: 2001 + i });
    return { doc, body: scriptBody(doc) };
  });
  const blocks = [...base.blocks];
  const at = new Map(blocks.map((block, i) => [String(block.attrs?.id), i]));
  const scenes = scenesOf(blocks);
  const authors: Record<string, VersionAuthor> = {};
  const rows = Array.from({ length: VERSIONS }, (_, n) => versionRow(docId, n));
  const kept = new Set(thinVersions(rows, T0).keep);
  const edited = spread([...at.keys()], VERSIONS);
  file.transaction(() => {
    rows.forEach((row, n) => {
      const blockId = edited[n]!;
      const { createdByUserId: userId, createdAt } = row;
      const { doc, body } = replicas[n % WRITERS.length]!;
      const made: Uint8Array[] = [];
      const stop = doc.subscribe((update) => made.push(update));
      body.write((w) => w.insertText(blockId, 0, "x"));
      stop();
      const [update] = made;
      if (update === undefined) throw new Error(`nothing typed in ${blockId}`);
      const clocks = updateMeta(update).map(({ clientId, toClock }) => ({
        clientId,
        clock: toClock,
      }));
      const seq = file.log.append({
        docId,
        generation: 1,
        update,
        userId,
        origin: "edit",
        clocks,
      });
      if (seq !== row.seq) throw new Error(`${row.id} is not at ${seq}`);
      const i = at.get(blockId)!;
      blocks[i] = typed(blocks[i]!);
      authors[blockId] = { userId, at: createdAt };
      file.versions.add(row);
      file.history.setSummary(row.id, {
        authorIds: [userId],
        blockIds: [blockId],
        sceneIds: [scenes.get(blockId)!],
      });
      const aged = kept.has(row.id) && T0 - createdAt >= DAY_MS;
      if (row.kind !== "named" && !aged) {
        file.checkpoints.pin(row.id, docId, 1, row.seq!);
        return;
      }
      const content = { ...base, blocks, authors };
      const ref = writeSnapshot(file, content);
      file.history.setSnapshot(row.id, ref, content.engineVersion);
    });
  });
  const head = contentAt(file, docId, { generation: 1, seq: VERSIONS + 1 });
  if (
    JSON.stringify(head?.blocks) !== JSON.stringify(blocks.map(canonicalBlock))
  )
    throw new Error("the versions hold other text than the log");
}

async function listTimes(
  history: HistoryService,
  docId: string,
  samples: number,
): Promise<number[]> {
  const times: number[] = [];
  for (let n = 0; n < samples; n++) {
    const start = performance.now();
    const listed = await history.list(OWNER, docId, null, PAGE_ROWS);
    times.push(performance.now() - start);
    if (!listed.ok) throw new Error(`the list was refused: ${listed.code}`);
  }
  return times;
}

/** `list_ms`: `samples` reads (default 20) of the first page of the versions list. */
export function listScenario(options: { samples?: number } = {}): Scenario {
  const { samples = 20 } = options;
  return {
    id: "history.list.first_page",
    workload: "W1",
    processes: 5,
    async run(): Promise<Measurement[]> {
      const dir = await mkdtemp(join(tmpdir(), "manent-history-list-"));
      const storage = openSqliteStorage({ dir, now: () => T0 });
      try {
        const script = scriptOfPages(120);
        const { docId, history } = createHistoryWorld({ script, storage });
        writeVersions(storage.open(HOME), docId);
        history.maintain(docId);
        const times = await listTimes(history, docId, samples);
        return [{ metric: "list_ms", unit: "ms", samples: times }];
      } finally {
        storage.close();
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

export default listScenario();
