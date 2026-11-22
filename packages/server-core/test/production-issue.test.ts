import { expect, test } from "bun:test";
import type { IssueRequest } from "@manent/sync-protocol";
import { materializeVersion } from "../src/index.ts";
import {
  T0,
  headingId,
  key,
  lastBlockOf,
  productionWorld,
  valueOf,
} from "./production-world.ts";
import { DOC } from "./seed.ts";

const K1 = key(11);
const K2 = key(12);
const NOW = T0;

const issueRequest = (change: Partial<IssueRequest> = {}): IssueRequest => ({
  docId: DOC,
  key: K1,
  expectedOrdinal: 1,
  what: "changed",
  pages: ["12", "12A"],
  files: ["pdf_marked"],
  tint: false,
  recipientUserIds: ["sam", "leo"],
  memo: "Blue revisions 16 Nov: pp. 12, 12A",
  issuedOn: "2026-11-16",
  ...change,
});

/** Locked, then page 12 grown into 12A. */
async function grown() {
  const w = productionWorld();
  await w.lock();
  await w.editPage(12, 60);
  return w;
}

test("issuing Blue freezes it, records its blocks and A-pages, and starts Pink", async () => {
  const w = await grown();
  const r = await w.run(
    w.service.issue(
      "priya",
      issueRequest({
        expectedOrdinal: 1,
        issuedOn: "2026-11-16",
        pages: ["12", "12A"],
      }),
    ),
  );
  expect(
    r.ok && [
      r.value.issue.pages,
      r.value.state.sets.map((s) => s.name),
      r.value.state.anchors.some(
        (a) => a.label === "12A" && a.source === "issue",
      ),
    ],
  ).toEqual([["12", "12A"], ["White", "Blue", "Pink"], true]);
  expect(r.ok && r.value.state.sets[2]!.baselineVersionId).toBe(
    r.ok && r.value.state.sets[1]!.issuedVersionId!,
  );
});

test("a scene added after lock gets its derived number written at issue", async () => {
  const w = productionWorld();
  await w.lock();
  w.sam.push((writer) =>
    writer.insertBlocks("action-4-8", [
      {
        type: "block",
        attrs: { id: "heading-extra", type: "scene_heading" },
        content: [{ type: "text", text: "INT. ENGINE ROOM - NIGHT" }],
      },
    ]),
  );
  const r = valueOf(
    await w.run(w.service.issue("priya", issueRequest({ pages: ["2"] }))),
  );
  const added = w.blocks().find((b) => b.attrs.id === "heading-extra");
  expect([
    added?.attrs.num,
    r.state.sceneNumbers.find((n) => n.blockId === "heading-extra"),
    r.state.sceneNumbers.find((n) => n.blockId === headingId(5))?.num,
  ]).toEqual([
    "4A",
    { blockId: "heading-extra", num: "4A", reserved: false },
    "5",
  ]);
});

test("two coordinators issuing at once: the second is refused with the first's name and time", async () => {
  const w = await grown();
  const { service } = w;
  const [a, b] = await w.run(
    Promise.all([
      service.issue("priya", issueRequest({ key: K1 })),
      service.issue("dana", issueRequest({ key: K2 })),
    ]),
  );
  expect([a.ok, b.ok ? null : b.body]).toEqual([
    true,
    {
      error: "already_issued",
      issued: {
        name: "Blue",
        byName: "Priya Nair",
        issuedAt: NOW,
        nextName: "Pink",
      },
    },
  ]);
});

test("a retried issue under the same key answers the first result and issues once", async () => {
  const w = await grown();
  const [a, b] = await w.run(
    Promise.all([
      w.service.issue("priya", issueRequest()),
      w.service.issue("priya", issueRequest()),
    ]),
  );
  expect([a.ok, b, w.file.production.sets(DOC).length]).toEqual([true, a, 3]);
});

test("an issue whose pages differ from the server's is answered changed and issues nothing", async () => {
  const w = await grown();
  w.queueEdit(30, 2);
  const r = await w.run(w.service.issue("priya", issueRequest()));
  expect([
    r.ok ? null : [r.status, r.body],
    w.file.production.sets(DOC).length,
  ]).toEqual([[409, { error: "changed", issued: null }], 2]);
});

test("typing on a page already revised does not stop an issue", async () => {
  const w = await grown();
  w.queueEdit(12, 1);
  const r = valueOf(await w.run(w.service.issue("priya", issueRequest())));
  const version = w.file.history.get(r.state.sets[1]!.issuedVersionId!)!;
  const issued = materializeVersion(w.file, version)!.blocks.find(
    (b) => b.attrs?.id === lastBlockOf(12),
  );
  const text = issued?.content?.map((run) => run.text).join("") ?? "";
  expect([r.issue.pages, text.split(" spray").length - 1]).toEqual([
    ["12", "12A"],
    61,
  ]);
});

test("an issued revision keeps the engine it was issued with", async () => {
  const w = await grown();
  const blue = valueOf(await w.run(w.service.issue("priya", issueRequest())));
  const pink = blue.state.sets[2]!;
  w.file.transaction(() =>
    w.file.production.updateSet(pink.setId, { engineVersion: 99 }),
  );
  const r = await w.run(
    w.service.issue(
      "priya",
      issueRequest({ key: K2, expectedOrdinal: 2, pages: [] }),
    ),
  );
  expect([
    blue.state.sets[1]!.engineVersion,
    r.ok ? null : [r.status, r.body.error],
  ]).toEqual([1, [422, "engine_unavailable"]]);
});

test("a full draft is flagged and lists every page", async () => {
  const w = productionWorld();
  await w.lock();
  const every = Array.from({ length: 30 }, (_, i) => String(i + 1));
  const r = valueOf(
    await w.run(
      w.service.issue("priya", issueRequest({ what: "full", pages: every })),
    ),
  );
  expect([r.state.sets[1]!.fullDraft, r.issue.pages]).toEqual([true, every]);
});

test("an issue's version, blocks, anchors and key commit together or not at all", async () => {
  const w = await grown();
  w.storage.failNextCommit();
  const r = await w.run(w.service.issue("priya", issueRequest()));
  expect([
    r.ok ? null : [r.status, r.body.error],
    w.versions().filter((v) => v.kind === "revision_issue"),
    w.file.production.sets(DOC).length,
    w.file.production.request(DOC, K1),
  ]).toEqual([[429, "busy"], [], 2, null]);
});
