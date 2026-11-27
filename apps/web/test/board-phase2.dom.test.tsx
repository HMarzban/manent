import { withDom } from "@manent/testkit/dom";
import { createDoc, jsonMap } from "@manent/crdt";
import type { EpisodeEntry } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import { ASSIGNMENT_WORDS, BOARD_WORDS } from "@manent/ui";
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { scenesFromBlocks } from "../src/board/episode-scenes.ts";
import {
  addCard,
  addStoryline,
  cardsInCell,
  duplicateCard,
  readBoard,
  setCardFlagged,
  setCardLink,
} from "../src/board/model.ts";
import { AddCardInput } from "../src/screens/board/board-inputs.tsx";
import { BoardPrintHeader } from "../src/screens/board/board-print-header.tsx";
import { BoardScenePeek } from "../src/screens/board/board-scene-peek.tsx";
import { filterBoardCards } from "../src/screens/board/use-board-viewport.ts";

withDom();

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

function mount(node: React.ReactNode): HTMLElement {
  const el = document.body.appendChild(document.createElement("div"));
  root = createRoot(el);
  act(() => root?.render(node));
  return el;
}

const EP_201: EpisodeEntry = {
  id: "ep-1",
  seasonId: "s-1",
  number: 201,
  title: "Low Tide",
  docIds: { script: "doc-1", outline: null, roomLog: null },
  writerUserId: null,
  stage: null,
  dueAt: null,
  pages: 52,
  openCount: null,
  locked: false,
};

test("Board model supports additive room flagging and card duplication without claiming links", () => {
  const doc = createDoc();
  const map = jsonMap(doc, "board");
  const sl = addStoryline(map, [], "sl-1", "A — Harbour");
  const first = addCard(map, [], {
    id: "c-1",
    storylineId: sl.id,
    episodeId: EP_201.id,
    text: "Ferry stalls at dawn",
  });
  setCardLink(map, first, { blockId: "b-7" });
  setCardFlagged(map, { ...first, link: { blockId: "b-7" } }, true);

  let snap = readBoard(map);
  expect(snap.cards[0]?.flagged).toBe(true);

  const dup = duplicateCard(
    map,
    cardsInCell(snap.cards, sl.id, EP_201.id),
    snap.cards[0]!,
    "c-2",
  );
  snap = readBoard(map);
  expect(dup.id).toBe("c-2");
  expect(snap.cards.map((c) => c.id)).toEqual(["c-1", "c-2"]);
  expect(snap.cards[1]?.text).toBe("Ferry stalls at dawn");
  expect(snap.cards[1]?.flagged).toBe(true);
  expect(snap.cards[1]?.link).toBeNull();

  const flaggedOnly = filterBoardCards({
    seasonCards: snap.cards,
    episodes: [EP_201],
    storylines: snap.storylines,
    scenesByScript: new Map(),
    query: "",
    selectedStorylineIds: new Set(),
    unlinkedOnly: false,
    flaggedOnly: true,
  });
  expect(flaggedOnly.length).toBe(2);

  setCardFlagged(map, snap.cards[1]!, false);
  const afterClear = filterBoardCards({
    seasonCards: readBoard(map).cards,
    episodes: [EP_201],
    storylines: snap.storylines,
    scenesByScript: new Map(),
    query: "",
    selectedStorylineIds: new Set(),
    unlinkedOnly: false,
    flaggedOnly: true,
  });
  expect(afterClear.map((c) => c.id)).toEqual(["c-1"]);
});

test("scenesFromBlocks extracts synopsis, omitted state, progress, 3-line excerpt and unique cast", () => {
  const blocks: BlockJSON[] = [
    {
      type: "block",
      attrs: {
        id: "sc-7",
        type: "scene_heading",
        num: "7",
        synopsis: "Spring low strands the ferry.",
      },
      content: [{ type: "text", text: "EXT. MAINLAND SLIP - DAY" }],
    },
    {
      type: "block",
      attrs: { id: "b-1", type: "action" },
      content: [{ type: "text", text: "Fog hugs the slipway." }],
    },
    {
      type: "block",
      attrs: { id: "b-2", type: "character" },
      content: [{ type: "text", text: "CAL (CONT'D)" }],
    },
    {
      type: "block",
      attrs: { id: "b-3", type: "dialogue" },
      content: [{ type: "text", text: "She won't float until six." }],
    },
    {
      type: "block",
      attrs: { id: "b-4", type: "character" },
      content: [{ type: "text", text: "IDA" }],
    },
    {
      type: "block",
      attrs: { id: "b-5", type: "character" },
      content: [{ type: "text", text: "CAL" }],
    },
  ];
  const scenes = scenesFromBlocks(blocks, () => "drafting");
  expect(scenes).toEqual([
    {
      blockId: "sc-7",
      number: "7",
      heading: "EXT. MAINLAND SLIP - DAY",
      synopsis: "Spring low strands the ferry.",
      progress: "drafting",
      excerpt: [
        "Fog hugs the slipway.",
        "CAL (CONT'D)",
        "She won't float until six.",
      ],
      characters: ["CAL", "IDA"],
    },
  ]);
});

test("AddCardInput supports Mod+Enter rapid multi-card entry without closing", () => {
  const continued: string[] = [];
  const committed: string[] = [];
  const host = mount(
    <AddCardInput
      onCommit={(t) => committed.push(t)}
      onCommitAndContinue={(t) => continued.push(t)}
      onCancel={() => {}}
    />,
  );
  const textarea = host.querySelector("textarea")!;
  const setVal = (value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(textarea, value);
      textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
      textarea.dispatchEvent(
        new window.KeyboardEvent("keyup", { bubbles: true }),
      );
    });
  };

  setVal("Beat one");
  act(() => {
    textarea.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(continued).toEqual(["Beat one"]);
  expect(committed).toEqual([]);
  expect(textarea.value).toBe("");

  setVal("Beat two");
  act(() => {
    textarea.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(committed).toEqual(["Beat two"]);
});

test("BoardPrintHeader and BoardScenePeek render print metadata and scene preview details", () => {
  let opened = 0;
  const host = mount(
    <div>
      <BoardPrintHeader
        projectTitle="Harbour Lights"
        activeSeason={{ id: "s-2", number: 2, title: "Winter" }}
        summary="4 storylines · 6 episodes · 12 cards · 8 linked"
        hasActiveFilter={true}
      />
      <BoardScenePeek
        open={true}
        episode={EP_201}
        scene={{
          blockId: "sc-7",
          number: "7",
          heading: "EXT. MAINLAND SLIP - DAY",
          synopsis: "Spring low strands the ferry.",
          progress: "handed_in",
          excerpt: ["Fog hugs the slipway."],
          characters: ["CAL", "IDA"],
        }}
        compact={false}
        onOpenChange={() => {}}
        onOpenScene={() => {
          opened += 1;
        }}
        onRestoreFocus={() => {}}
      />
    </div>,
  );
  expect(host.textContent).toContain("Harbour Lights · Board");
  expect(host.textContent).toContain(BOARD_WORDS.printFilteredNote);
  expect(document.body.textContent).toContain("Spring low strands the ferry.");
  expect(document.body.textContent).toContain(
    ASSIGNMENT_WORDS.progressNames.handed_in,
  );
  expect(document.body.textContent).toContain("Fog hugs the slipway.");
  expect(document.body.textContent).toContain("CAL");

  const openBtn = [...document.body.querySelectorAll("button")].find(
    (b) => b.textContent === BOARD_WORDS.openScene,
  )!;
  act(() => openBtn.click());
  expect(opened).toBe(1);
  act(() => {
    root?.render(null);
  });
});
