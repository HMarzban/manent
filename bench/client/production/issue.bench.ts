// Issuing a revision of a locked 120-page script whose active revision changed 400 blocks, through the
// production service, over memory storage.
import { scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { canonicalBlocksOf, revisedPages } from "@manent/revisions";
import {
  activeSet,
  marksSince,
  overridesOf,
  scriptAt,
  versionContent,
} from "@manent/server-core";
import type { ProductionService } from "@manent/server-core";
import type { IssueRequest } from "@manent/sync-protocol";
import type { Measurement, Scenario } from "../../harness.ts";
import { sampleMs } from "../../measure.ts";
import { keyOf, spread } from "../../server/history/restore-120.bench.ts";
import { HOME, OWNER, scriptOfPages } from "../../server/support.ts";
import { DAY, createProductionBench, lockRequest } from "./lock.bench.ts";
import type { ProductionBench } from "./lock.bench.ts";

const ITERATIONS = 20;
const CHANGED = 400;
const WORD = "Again ";

/** The labels of the pages `doc` revises, as the server reads them at the issue's turn: what the Send screen states. */
function statedPages(
  bench: ProductionBench,
  docId: string,
  doc: CrdtDoc,
): string[] {
  const file = bench.storage.open(HOME);
  const active = activeSet(file, docId);
  const read = scriptAt(doc, file, docId, active.engineVersion);
  if (!read.ok)
    throw new Error(`the script cannot be laid out: ${read.reason}`);
  const { content, flat, layout } = read.script;
  const baseline = versionContent(file, active.baselineVersionId).blocks;
  const marks = marksSince(
    baseline,
    content,
    flat,
    overridesOf(doc, active.id),
  );
  return revisedPages(layout.pagination, marks);
}

/** A fresh copy locked, then a word typed at the start of `changed` of its blocks; the pages it revises. */
async function revised(
  bench: ProductionBench,
  changed: readonly string[],
): Promise<IssueRequest> {
  const docId = bench.place();
  const locked = await bench.service.lock(OWNER, lockRequest(docId));
  if (!locked.ok)
    throw new Error(`the lock was refused: ${JSON.stringify(locked.body)}`);
  let pages: string[] = [];
  const written = await bench.sync.authorityWrite(docId, {
    userId: OWNER,
    origin: "system",
    edit(doc) {
      scriptBody(doc).write((w) => {
        for (const blockId of changed) w.insertText(blockId, 0, WORD);
      });
      pages = statedPages(bench, docId, doc);
      return { ok: true };
    },
    inTransaction() {},
  });
  if (!written.ok) throw new Error(`the edits were refused: ${written.code}`);
  return {
    docId,
    key: keyOf(2),
    expectedOrdinal: 1,
    what: "changed",
    pages,
    files: ["pdf_marked"],
    tint: false,
    recipientUserIds: [],
    memo: "",
    issuedOn: DAY,
  };
}

async function issueTimes(): Promise<number[]> {
  const script = scriptOfPages(120);
  const blockIds = canonicalBlocksOf(script).map((b) => String(b.attrs?.id));
  const changed = spread(blockIds, CHANGED);
  const bench = createProductionBench(script);
  const times: number[] = [];
  for (let n = 0; n < ITERATIONS; n++) {
    const request = await revised(bench, changed);
    const issues: Awaited<ReturnType<ProductionService["issue"]>>[] = [];
    times.push(
      await sampleMs(async () => {
        issues.push(await bench.service.issue(OWNER, request));
      }),
    );
    const issued = issues[0]!;
    if (!issued.ok)
      throw new Error(`the issue was refused: ${JSON.stringify(issued.body)}`);
  }
  return times;
}

/** `issue_ms`: 20 issues of Blue, each of a fresh locked 120-page script with 400 blocks changed since the lock. */
const scenario: Scenario = {
  id: "production.issue",
  workload: "W1",
  processes: 5,
  run: async (): Promise<Measurement[]> => [
    { metric: "issue_ms", unit: "ms", samples: await issueTimes() },
  ],
};

export default scenario;
