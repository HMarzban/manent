import { expect, test } from "bun:test";
import { applyLayoutPatches, engineFor } from "@manent/pagination";
import {
  layoutImpact,
  productionLayout,
  revisedPages,
} from "@manent/revisions";
import type { RecallRequest } from "@manent/sync-protocol";
import {
  layoutUnder,
  marksSince,
  materializeVersion,
  overridesOf,
  scriptPages,
} from "../src/index.ts";
import { key, productionWorld, valueOf } from "./production-world.ts";
import type { ProductionWorld } from "./production-world.ts";
import { DOC } from "./seed.ts";

const BLUE_RECIPIENTS = ["sam", "leo"];
const K3 = key(31);
const engine = engineFor(1)!;

/** Locked, page 12 grown into 12A, and Blue issued with those two pages. */
async function issuedBlue() {
  const w = productionWorld();
  await w.lock();
  await w.editPage(12, 60);
  const blue = valueOf(
    await w.run(
      w.service.issue("priya", {
        docId: DOC,
        key: key(11),
        expectedOrdinal: 1,
        what: "changed",
        pages: ["12", "12A"],
        files: ["pdf_marked"],
        tint: false,
        recipientUserIds: BLUE_RECIPIENTS,
        memo: "Blue revisions 16 Nov: pp. 12, 12A",
        issuedOn: "2026-11-16",
      }),
    ),
  );
  return {
    w,
    BLUE: blue.state.sets[1]!.setId,
    BLUE_ISSUE: blue.issue.issueId,
  };
}

const recallRequest = (
  change: Pick<RecallRequest, "setId" | "pages"> & Partial<RecallRequest>,
): RecallRequest => ({
  docId: DOC,
  key: key(21),
  memo: "Blue (corrected), 17 Nov. Replaces p. 9 of Blue as issued on 16 Nov. Corrected: the gulls.",
  issuedOn: "2026-11-17",
  files: ["pdf_marked"],
  tint: false,
  ...change,
});

function layoutOf(settings: Record<string, unknown>) {
  const under = layoutUnder(settings, 1);
  if (!under.ok) throw new RangeError(`no layout: ${under.reason}`);
  return under.profile;
}

/** The labels of the pages holding a line the active revision marks. */
function activeMarkedPages(w: ProductionWorld): string[] {
  const state = valueOf(w.service.state("priya", DOC));
  const active = state.sets.at(-1)!;
  const baseline = w.file.history.get(active.baselineVersionId)!;
  const flat = w.blocks();
  const marks = marksSince(
    materializeVersion(w.file, baseline)!.blocks,
    w.script(),
    flat,
    overridesOf(w.replica(), active.setId),
  );
  const profile = layoutOf(w.settings());
  const p = scriptPages(flat, new Map(), profile, state.anchors, engine);
  return revisedPages(p.pagination, marks);
}

/** What the dialog states for a change of paper: the pages that gain A-pages or end early. */
function impactOf(w: ProductionWorld, paper: string) {
  const flat = w.blocks();
  const blocks = applyLayoutPatches(
    engine.toLayoutBlocks(flat),
    productionLayout(flat, new Map()),
  );
  const settings = w.settings();
  return layoutImpact(
    blocks,
    layoutOf(settings),
    layoutOf({ ...settings, "script.paper": paper }),
    valueOf(w.service.state("priya", DOC)).anchors,
    engine,
  );
}

/** The pages laid out now whose locked page an impact names, and the A-pages after each. */
function pagesOfImpact(
  w: ProductionWorld,
  impact: { gainAPages: string[]; fallShort: string[] },
): string[] {
  const named = new Set([...impact.gainAPages, ...impact.fallShort]);
  const anchors = valueOf(w.service.state("priya", DOC)).anchors;
  const p = scriptPages(
    w.blocks(),
    new Map(),
    layoutOf(w.settings()),
    anchors,
    engine,
  );
  let inside = false;
  return p.pagination.pages.flatMap((page) => {
    if (page.locked) inside = named.has(page.label);
    return inside ? [page.label] : [];
  });
}

const layoutTo = (w: ProductionWorld, paper: string, n: number) =>
  w.run(
    w.service.layout("priya", {
      docId: DOC,
      key: key(n),
      changes: [{ key: "script.paper", value: paper }],
      affected: impactOf(w, paper),
    }),
  );

async function fileJson(w: ProductionWorld, issueId: string): Promise<unknown> {
  const pdf = valueOf(
    await w.service.file("leo", { docId: DOC, issueId, file: "pdf_marked" }),
  );
  return JSON.parse(new TextDecoder().decode(pdf));
}

test("recalling Blue reissues the chosen pages as Blue (corrected) and leaves the rest in Pink", async () => {
  const { w, BLUE } = await issuedBlue();
  const { service } = w;
  await w.editPage(9, 2);
  await w.editPage(21, 2);
  const r = await w.run(
    service.recall("priya", recallRequest({ setId: BLUE, pages: ["9"] })),
  );
  expect(
    r.ok && [
      r.value.issue.kind,
      r.value.issue.pages,
      r.value.issue.recipientUserIds,
    ],
  ).toEqual(["correction", ["9"], BLUE_RECIPIENTS]);
  expect(activeMarkedPages(w)).toEqual(["21"]);
  expect(w.versions().map((v) => v.name)).toContain("Blue (corrected)");
});

test("a second recall in the window corrects against the first correction", async () => {
  const { w, BLUE } = await issuedBlue();
  await w.editPage(9, 2);
  await w.editPage(21, 2);
  valueOf(
    await w.run(
      w.service.recall("priya", recallRequest({ setId: BLUE, pages: ["9"] })),
    ),
  );
  await w.editPage(21, 2);
  const second = valueOf(
    await w.run(
      w.service.recall(
        "priya",
        recallRequest({ key: key(22), setId: BLUE, pages: ["21"] }),
      ),
    ),
  );
  expect(
    second.state.issues
      .filter((issue) => issue.kind === "correction")
      .map((issue) => issue.pages),
  ).toEqual([["21"], ["9"]]);
});

test("after 24 hours a mistake is fixed by issuing the next colour", async () => {
  const { w, BLUE } = await issuedBlue();
  await w.editPage(9, 2);
  w.clock.advance(86_400_001);
  const r = await w.run(
    w.service.recall("priya", recallRequest({ setId: BLUE, pages: ["9"] })),
  );
  expect(r.ok ? null : [r.status, r.body.error]).toEqual([
    409,
    "recall_closed",
  ]);
});

test("only pages changed since the issue can be recalled", async () => {
  const { w, BLUE } = await issuedBlue();
  await w.editPage(9, 2);
  const r = await w.run(
    w.service.recall("priya", recallRequest({ setId: BLUE, pages: ["3"] })),
  );
  expect(r.ok ? null : [r.status, r.body.error]).toEqual([
    422,
    "unknown_label",
  ]);
});

test("an issued file is drawn from what was issued, with the engine it was issued with", async () => {
  const { w, BLUE_ISSUE } = await issuedBlue();
  const pdf = await w.service.file("leo", {
    docId: DOC,
    issueId: BLUE_ISSUE,
    file: "pdf_marked",
  });
  expect(pdf.ok && JSON.parse(new TextDecoder().decode(pdf.value))).toEqual({
    pages: ["12", "12A"],
    engineVersion: 1,
    paper: "letter",
    anchors: 31,
    marked: true,
    tint: false,
  });
});

test("an issued file does not change when the script or its layout changes afterwards", async () => {
  const { w, BLUE_ISSUE } = await issuedBlue();
  const before = await fileJson(w, BLUE_ISSUE);
  await w.editPage(12, 30);
  valueOf(await layoutTo(w, "a4", 41));
  valueOf(
    await w.run(
      w.service.pages("priya", {
        docId: DOC,
        key: key(42),
        op: "unlock",
        labels: ["12"],
        label: null,
      }),
    ),
  );
  expect(await fileJson(w, BLUE_ISSUE)).toEqual(before);
});

test("a layout change on a locked script goes through the authority and marks every affected page", async () => {
  const { w } = await issuedBlue();
  w.controlKinds();
  const affected = impactOf(w, "a4");
  const r = await w.run(
    w.service.layout("priya", {
      docId: DOC,
      key: K3,
      changes: [{ key: "script.paper", value: "a4" }],
      affected,
    }),
  );
  expect([
    r.ok,
    w.settings()["script.paper"],
    w.controlKinds().at(-1),
    activeMarkedPages(w),
  ]).toEqual([true, "a4", "layout_changed", pagesOfImpact(w, affected)]);
});

test("a layout change whose stated pages are out of date is answered changed", async () => {
  const { w } = await issuedBlue();
  const affected = impactOf(w, "a4");
  w.queueEdit(5, 25);
  const r = await w.run(
    w.service.layout("priya", {
      docId: DOC,
      key: K3,
      changes: [{ key: "script.paper", value: "a4" }],
      affected,
    }),
  );
  expect([
    r.ok ? null : [r.status, r.body.error],
    w.settings()["script.paper"],
  ]).toEqual([[409, "changed"], "letter"]);
});

test("a key that is not a frozen setting is refused", async () => {
  const { w } = await issuedBlue();
  const refusal = async (change: { key: string; value: unknown }) => {
    const r = await w.run(
      w.service.layout("priya", {
        docId: DOC,
        key: K3,
        changes: [change],
        affected: { gainAPages: [], fallShort: [] },
      }),
    );
    return r.ok ? null : [r.status, r.body.error];
  };
  expect(await refusal({ key: "appearance.theme", value: "dark" })).toEqual([
    400,
    "bad_request",
  ]);
});
