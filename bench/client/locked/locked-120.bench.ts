// Typing in an aged 120-page script (400 sessions, 150 edits each, cached) that is locked for
// production with 12 issued revisions (Pink active): warm open, keystroke paint, and client IDs.
import { blockIds, measureDoc } from "@manent/crdt";
import { createBot } from "@manent/testkit";
import type { Page } from "@playwright/test";
import { cached } from "../../corpus/cache.ts";
import { ageScript } from "../../crdt/aged.ts";
import { NotMeasured, benchMode } from "../../env.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import { inputBlocks, measurement } from "../../measure.ts";
import { startBenchDemo } from "../driver.ts";
import { shareRoles, untilHandleSynced } from "../people.ts";
import {
  caretAt,
  markRecords,
  pressPaced,
  scriptBlocks,
  untilBlocks,
} from "../typing/run-typing.ts";

const PAGES = 120;
const SESSIONS = 400;
const EDITS_PER_SESSION = 150;
const SEED = 7;
const ISSUED_REVISIONS = 12;
const INTERVAL_MS = 60;
const KEYSTROKES = { quick: 1, standard: 200, full: 200 } as const;
const POSITIONS = [0.05, 0.5, 0.95] as const;
const TYPED = "the tide turns ";
const DAY = "2027-06-01";

const keysOf = (count: number): string[] =>
  Array.from({ length: count }, (_, k) => {
    const ch = TYPED[k % TYPED.length]!;
    return ch === " " ? "Space" : ch;
  });

const keyOf = (n: number): string => n.toString(16).padStart(32, "0");

async function postProduction(
  url: string,
  token: string,
  step: string,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const parsed: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      typeof parsed === "object" && parsed !== null && "code" in parsed
        ? String(Reflect.get(parsed, "code"))
        : String(response.status);
    throw new NotMeasured(`${step} was refused: ${code}`);
  }
  return parsed;
}

function pageLabelsFromState(value: unknown): string[] {
  const root: unknown =
    typeof value === "object" && value !== null && "state" in value
      ? Reflect.get(value, "state")
      : value;
  const anchors: unknown = Reflect.get(Object(root), "anchors");
  if (!Array.isArray(anchors)) return [];
  return anchors.flatMap((anchor: unknown) => {
    const label: unknown = Reflect.get(Object(anchor), "label");
    return typeof label === "string" ? [label] : [];
  });
}

async function editableAfterReload(
  page: Page,
  blocks: number,
): Promise<number> {
  await page.reload();
  await untilBlocks(page, blocks);
  const [record] = await markRecords(page, "open.editable");
  if (record === undefined)
    throw new NotMeasured("the open.editable mark was not recorded");
  return record.durationMs;
}

const scenario: Scenario = {
  id: "locked-120",
  workload: "W1",
  processes: 5,
  async run(): Promise<Measurement[]> {
    const aged = cached("aged-120-400x150-s7", () =>
      ageScript({
        pages: PAGES,
        sessions: SESSIONS,
        editsPerSession: EDITS_PER_SESSION,
        seed: SEED,
      }),
    );
    const state = aged.encodeState();
    const { clientIds } = measureDoc(aged);
    const blocks = blockIds(aged).length;
    aged.destroy();

    const demo = await startBenchDemo();
    try {
      const token = await demo.token("priya");
      const bot = createBot({
        server: { url: demo.url },
        userId: "priya",
        token,
      });
      let docId: string;
      try {
        const handle = await bot.client.create({
          kind: "script",
          home: `project:${crypto.randomUUID()}`,
          workspaceId: null,
        });
        docId = handle.docId;
        handle.doc().applyUpdate(state, "bench");
        await untilHandleSynced(handle);
      } finally {
        await bot.close();
      }

      await shareRoles(demo, docId, [
        {
          userId: "priya",
          role: "owner",
          capabilities: ["lock_page_numbers", "issue_revisions"],
        },
      ]);

      const locked = await postProduction(
        demo.url,
        token,
        "lock",
        "/api/production/lock",
        {
          docId,
          key: keyOf(1),
          numbering: "suffix",
          colourOrder: "standard",
          lockedOn: DAY,
        },
      );
      let pages = pageLabelsFromState(locked);
      for (let ordinal = 1; ordinal <= ISSUED_REVISIONS; ordinal++) {
        const issued = await postProduction(
          demo.url,
          token,
          "issue",
          "/api/production/issue",
          {
            docId,
            key: keyOf(ordinal + 1),
            expectedOrdinal: ordinal,
            what: "full",
            pages,
            files: ["pdf_marked"],
            tint: false,
            recipientUserIds: [],
            memo: "",
            issuedOn: DAY,
          },
        );
        const nextState: unknown = Reflect.get(Object(issued), "state");
        const nextPages = pageLabelsFromState(nextState);
        if (nextPages.length > 0) pages = nextPages;
      }

      const p = await demo.openPage({ userId: "priya" });
      try {
        await p.page.goto(`${demo.url}/s/${docId}`);
        await untilBlocks(p.page, blocks);
        const warmMs = await editableAfterReload(p.page, blocks);

        const loadedBlocks = await scriptBlocks(p.page);
        const keys = keysOf(KEYSTROKES[benchMode()]);
        const keystrokePaint: number[] = [];
        for (const at of POSITIONS) {
          const from = Math.floor(loadedBlocks.length * at);
          const target =
            loadedBlocks.find((b, i) => i >= from && b.type === "action") ??
            loadedBlocks[from]!;
          await caretAt(p.page, target.id, "end");
          keystrokePaint.push(...(await pressPaced(p.page, keys, INTERVAL_MS)));
        }

        return [
          measurement("first_editable_warm", "ms", [warmMs]),
          measurement("keystroke_paint", "ms", keystrokePaint),
          measurement("client_ids", "count", [clientIds]),
          inputBlocks(blocks),
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
