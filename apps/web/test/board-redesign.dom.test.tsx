import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import type { Resolved } from "@manent/commands";
import type { EpisodeEntry, JsonMapView } from "@manent/crdt";
import {
  BOARD_WORDS,
  CommandsProvider,
  DOCUMENT_WORDS,
  SettingsProvider,
  createValue,
} from "@manent/ui";
import { act, createRef } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { EpisodeScenesState } from "../src/board/episode-scenes.ts";
import {
  addCard,
  addStoryline,
  moveStoryline,
  readBoard,
  removeCard,
  resolveStorylineLanes,
  restoreCard,
  setStorylineTone,
} from "../src/board/model.ts";
import type { BoardCard, BoardStoryline } from "../src/board/model.ts";
import type { BoardMutations } from "../src/board/use-board-mutations.ts";
import {
  BoardStatusBar,
  BoardToolbar,
} from "../src/screens/board/board-bars.tsx";
import { BoardGrid } from "../src/screens/board/board-grid.tsx";
import {
  BoardEdgeScrollers,
  computeNextEpisodeScrollLeft,
} from "../src/screens/board/board-pan.tsx";
import { useBoardDensity } from "../src/screens/board/board-view.ts";
import { EpisodeHeader } from "../src/screens/board/episode-header.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { testEnvironment, testServices } from "./services.fixtures.ts";

withDom();

const roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

function memoryMap(): JsonMapView {
  const store = new Map<string, unknown>();
  return {
    get: (k) => store.get(k),
    set: (k, v) => {
      store.set(k, v);
    },
    delete: (k) => {
      store.delete(k);
    },
    keys: () => [...store.keys()],
    entries: () => Object.fromEntries(store),
    subscribe: () => () => {},
  };
}

function mountWithServices(node: ReactNode): {
  host: HTMLDivElement;
  cleanup(): void;
} {
  const env = testEnvironment();
  const services = testServices({ userId: "dana", environment: env });
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  const resolved = createValue<Resolved>({
    effective: new Map(),
    editorTable: [],
    lostChord: [],
  });
  act(() =>
    root.render(
      <EnvironmentProvider environment={env}>
        <ServicesProvider services={services}>
          <SettingsProvider store={services.settings}>
            <CommandsProvider
              service={services.commands}
              resolved={resolved}
              platform="mac"
            >
              {node}
            </CommandsProvider>
          </SettingsProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    ),
  );
  return {
    host,
    cleanup: () => services.dispose(),
  };
}

const EPISODES: readonly EpisodeEntry[] = [
  {
    id: "ep-201",
    seasonId: "s2",
    number: 201,
    title: "Low Tide",
    writerUserId: "sam",
    stage: "Blue",
    dueAt: null,
    pages: 61,
    openCount: { round: "Network", open: 2 },
    locked: true,
    docIds: { script: "doc-201", outline: null, roomLog: "log-201" },
  },
  {
    id: "ep-202",
    seasonId: "s2",
    number: 202,
    title: "Salt",
    writerUserId: "dana",
    stage: "Outline",
    dueAt: null,
    pages: null,
    openCount: null,
    locked: false,
    docIds: { script: null, outline: "outline-202", roomLog: null },
  },
];

const STORYLINES: readonly BoardStoryline[] = [
  { id: "sl-a", title: "A — The licence review", order: "a0" },
  { id: "sl-b", title: "B — Cal comes home", order: "a1", tone: 4 },
];

const CARDS: readonly BoardCard[] = [
  {
    id: "c-1",
    storylineId: "sl-a",
    episodeId: "ep-201",
    text: "Licence review letter arrives.",
    order: "a0",
    link: { blockId: "sc-7" },
  },
  {
    id: "c-2",
    storylineId: "sl-b",
    episodeId: "ep-201",
    text: "Cal walks off the ferry.",
    order: "a0",
    link: { blockId: "sc-removed" },
  },
  {
    id: "c-3",
    storylineId: "sl-a",
    episodeId: "ep-202",
    text: "Salt threatens the timetable.",
    order: "a0",
    link: null,
  },
];

const NOOP_MUTATIONS: BoardMutations = {
  commitStoryline: () => {},
  renameStoryline: () => {},
  setStorylineTone: () => {},
  moveStoryline: () => {},
  removeStoryline: () => {},
  commitAddCard: () => {},
  editCardText: () => {},
  linkCardScene: () => {},
  duplicateCard: () => {},
  toggleCardFlag: () => {},
  moveCard: () => {},
  moveCardToEpisode: () => {},
  moveCardToStoryline: () => {},
  removeCard: () => {},
};

test("Board model supports additive storyline tones, storyline reordering and card restore", () => {
  const map = memoryMap();
  const s1 = addStoryline(map, [], "sl-1", "A Story");
  const s2 = addStoryline(map, [s1], "sl-2", "B Story");
  const s3 = addStoryline(map, [s1, s2], "sl-3", "C Story");

  setStorylineTone(map, s2, 6);
  const afterTone = readBoard(map);
  expect(afterTone.storylines.map((s) => [s.id, s.tone])).toEqual([
    ["sl-1", undefined],
    ["sl-2", 6],
    ["sl-3", undefined],
  ]);

  // Explicit tone stays pinned; automatic lanes avoid duplicating tone 6
  const lanes = resolveStorylineLanes(afterTone.storylines);
  expect(lanes.get("sl-2")).toBe(6);
  expect(new Set(lanes.values()).size).toBe(3);

  // Move C Story to index 0
  moveStoryline(map, s3, afterTone.storylines, 0);
  expect(readBoard(map).storylines.map((s) => s.id)).toEqual([
    "sl-3",
    "sl-1",
    "sl-2",
  ]);

  // Remove and restore a linked card cleanly
  const created = addCard(map, [], {
    id: "c-9",
    storylineId: "sl-1",
    episodeId: "ep-201",
    text: "Holdall on the pier.",
  });
  const linkedCard: BoardCard = { ...created, link: { blockId: "blk-9" } };
  restoreCard(map, linkedCard);
  removeCard(map, created.id);
  expect(readBoard(map).cards).toEqual([]);
  restoreCard(map, linkedCard);
  expect(readBoard(map).cards).toEqual([linkedCard]);
});

test("BoardGrid uses single-cell drop containers, sibling card actions outside drag handles, scene heading pills, missing link cues and collapse", () => {
  const openedDocs: string[] = [];
  const collapsed = new Set<string>();
  const scenesByScript = new Map<string, EpisodeScenesState>([
    [
      "doc-201",
      {
        status: "ready",
        scenes: [
          {
            blockId: "sc-7",
            number: "7",
            heading: "INT. TERMINAL OFFICE - MORNING",
          },
        ],
      },
    ],
  ]);
  const lanes = resolveStorylineLanes(STORYLINES);

  const { host, cleanup } = mountWithServices(
    <BoardGrid
      allStorylines={STORYLINES}
      storylines={STORYLINES}
      laneByStoryline={lanes}
      episodes={EPISODES}
      cards={CARDS}
      scenesByScript={scenesByScript}
      targetPages={58}
      people={[
        { userId: "sam", name: "Sam Osei" },
        { userId: "dana", name: "Dana Reyes" },
      ]}
      density="comfortable"
      focusedEpisodeId="ep-201"
      canEdit={true}
      selectedCardId="c-1"
      linkingCardId={null}
      addingStoryline={false}
      addingCardCell={null}
      collapsedStorylineIds={collapsed}
      sortableRef={createRef()}
      mutations={NOOP_MUTATIONS}
      onSelectCard={() => {}}
      onLinkingCardChange={() => {}}
      onOpenCard={() => {}}
      onOpenDoc={(id) => openedDocs.push(id)}
      onCommitStoryline={() => {}}
      onCancelStoryline={() => {}}
      onStartAddCard={() => {}}
      onCommitAddCard={() => {}}
      onCancelAddCard={() => {}}
      onToggleCollapseStoryline={() => {}}
      onToggleCollapseAll={() => {}}
      onRemoveCard={() => {}}
    />,
  );

  // 4 single-cell grid intersections (2 storylines × 2 episodes)
  const cells = host.querySelectorAll("[data-board-cell]");
  expect(cells.length).toBe(4);
  expect(host.querySelectorAll('[data-tour="board.addCard"]').length).toBe(4);

  // Card 1: RowMenu and Edit live OUTSIDE [data-board-card] drag handle, INSIDE [role="listitem"]
  const firstItem = host.querySelector('[role="listitem"]')!;
  const dragHandle = firstItem.querySelector('[data-board-card="c-1"]')!;
  const menuBtn = firstItem.querySelector(
    `button[aria-label="${DOCUMENT_WORDS.rowMenuName("Licence review letter arrives.")}"]`,
  );
  const editBtn = firstItem.querySelector(
    `button[aria-label="${BOARD_WORDS.editCard}"]`,
  );
  expect(menuBtn).not.toBeNull();
  expect(editBtn).not.toBeNull();
  expect(dragHandle.contains(menuBtn)).toBe(false);
  expect(dragHandle.contains(editBtn)).toBe(false);

  // Card 1 shows linked place AND scene heading
  expect(dragHandle.textContent).toContain("201 · sc. 7");
  expect(dragHandle.textContent).toContain("INT. TERMINAL OFFICE - MORNING");

  // Card 2 has a removed scene link -> shows explicit missing-scene relink cue
  const secondCard = host.querySelector('[data-board-card="c-2"]')!;
  expect(secondCard.textContent).toContain(BOARD_WORDS.sceneMissing);

  // Card 3 is on outline-only ep-202 -> shows Open outline quick link
  const thirdCard = host.querySelector('[data-board-card="c-3"]')!;
  expect(thirdCard.textContent).toContain(BOARD_WORDS.openOutline);

  // Episode 201 header opens script on click, displays revision chip, lock, over-target delta and writer avatar
  const ep201Header = host.querySelector('[data-episode-col="ep-201"]')!;
  expect(ep201Header.getAttribute("data-focused-ep")).toBe("true");
  expect(ep201Header.getAttribute("data-locked")).toBe("true");
  expect(ep201Header.querySelector('[data-rev="blue"]')).not.toBeNull();
  expect(ep201Header.textContent).toContain("61 pp.");
  expect(ep201Header.textContent).toContain("▲3");
  expect(ep201Header.querySelector('[aria-label="Sam Osei"]')).not.toBeNull();
  act(() => {
    ep201Header.querySelector<HTMLButtonElement>("button")?.click();
  });
  expect(openedDocs).toEqual(["doc-201"]);

  cleanup();
});

test("BoardToolbar, EpisodeHeader outline click, and BoardStatusBar summary + ActivePaletteGem work cleanly", () => {
  const events: string[] = [];
  const lanes = resolveStorylineLanes(STORYLINES);
  const { host, cleanup } = mountWithServices(
    <>
      <BoardToolbar
        query=""
        storylines={STORYLINES}
        laneByStoryline={lanes}
        cardCountByStoryline={
          new Map([
            ["sl-a", 2],
            ["sl-b", 1],
          ])
        }
        selectedStorylineIds={new Set()}
        unlinkedOnly={false}
        unlinkedCount={1}
        episodes={EPISODES}
        visibleEpisodeIds={new Set(["ep-201"])}
        density="comfortable"
        filteredCardCount={3}
        totalCardCount={3}
        hasActiveFilter={false}
        onQueryChange={(q) => events.push(`q:${q}`)}
        onToggleStoryline={(id) => events.push(`sl:${id}`)}
        onClearStorylines={() => events.push("clear-sl")}
        onToggleUnlinked={() => events.push("unlinked")}
        onClearFilters={() => events.push("clear")}
        onJumpEpisode={(id) => events.push(`jump:${id}`)}
        onDensityChange={(d) => events.push(`density:${d}`)}
      />
      <EpisodeHeader
        episode={EPISODES[1]!}
        colIndex={1}
        cardCount={1}
        targetPages={58}
        people={[{ userId: "dana", name: "Dana Reyes" }]}
        density="comfortable"
        focused={false}
        onOpenDoc={(id) => events.push(`open:${id}`)}
      />
      <BoardStatusBar summary={BOARD_WORDS.statusSummary(2, 2, 3, 1)} />
    </>,
  );

  // Episode jump pills mark in-view episodes and trigger jump callback
  const jump201 = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${BOARD_WORDS.jumpToEpisode(201, "Low Tide")}"]`,
  )!;
  const jump202 = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${BOARD_WORDS.jumpToEpisode(202, "Salt")}"]`,
  )!;
  expect(jump201.getAttribute("data-in-view")).toBe("true");
  expect(jump202.getAttribute("data-in-view")).toBeNull();
  act(() => jump202.click());

  // Unlinked toggle fires callback
  act(() => {
    host
      .querySelector<HTMLButtonElement>(
        `button[aria-label="${BOARD_WORDS.unlinkedOnlyLabel}"]`,
      )
      ?.click();
  });

  // Outline-only episode header opens outline doc on click
  act(() => {
    host
      .querySelector<HTMLButtonElement>('[data-episode-col="ep-202"] button')
      ?.click();
  });

  expect(events).toEqual(["jump:ep-202", "unlinked", "open:outline-202"]);

  // Status bar shows season summary and ActivePaletteGem
  const statusBar = host.querySelector('[data-region="status_bar"]')!;
  expect(statusBar.textContent).toContain(
    "2 storylines · 2 episodes · 3 cards · 1 linked",
  );
  expect(statusBar.querySelector(".mn-app-gem")).not.toBeNull();

  cleanup();
});

test("BoardGrid supports collapsed storyline pills and 2D keyboard navigation across cells", () => {
  const toggled: string[] = [];
  const removed: string[] = [];
  const lanes = resolveStorylineLanes(STORYLINES);
  const { host, cleanup } = mountWithServices(
    <BoardGrid
      allStorylines={STORYLINES}
      storylines={STORYLINES}
      laneByStoryline={lanes}
      episodes={EPISODES}
      cards={CARDS}
      scenesByScript={new Map()}
      targetPages={58}
      people={[]}
      density="compact"
      focusedEpisodeId={null}
      canEdit={true}
      selectedCardId="c-1"
      linkingCardId={null}
      addingStoryline={false}
      addingCardCell={null}
      collapsedStorylineIds={new Set(["sl-b"])}
      sortableRef={createRef()}
      mutations={NOOP_MUTATIONS}
      onSelectCard={() => {}}
      onLinkingCardChange={() => {}}
      onOpenCard={() => {}}
      onOpenDoc={() => {}}
      onCommitStoryline={() => {}}
      onCancelStoryline={() => {}}
      onStartAddCard={() => {}}
      onCommitAddCard={() => {}}
      onCancelAddCard={() => {}}
      onToggleCollapseStoryline={(id) => toggled.push(id)}
      onToggleCollapseAll={() => {}}
      onRemoveCard={(card) => removed.push(card.id)}
    />,
  );

  // Storyline B is collapsed -> card c-2 is hidden, replaced by clickable "1 card" pill
  expect(host.querySelector('[data-board-card="c-2"]')).toBeNull();
  const expandPill = host.querySelector<HTMLButtonElement>(
    "[data-collapsed-expand]",
  )!;
  expect(expandPill.textContent).toContain("1 card");
  act(() => expandPill.click());
  expect(toggled).toEqual(["sl-b"]);

  // ArrowRight from card c-1 (sl-a, ep-201) moves focus to card c-3 (sl-a, ep-202)
  const card1 = host.querySelector<HTMLElement>('[data-board-card="c-1"]')!;
  const card3 = host.querySelector<HTMLElement>('[data-board-card="c-3"]')!;
  act(() => {
    card1.focus();
    card1.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(document.activeElement).toBe(card3);

  // Delete on focused card c-3 invokes onRemoveCard
  act(() => {
    card3.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Delete",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(removed).toEqual(["c-3"]);

  cleanup();
});

test("Board defaults to Fit density and supports episode-snapping horizontal scroll controls", () => {
  // Pure episode-snap step math advances and retreats cleanly to episode boundaries
  const columnLefts = [200, 480, 760, 1040, 1320, 1600];
  expect(
    computeNextEpisodeScrollLeft({
      scrollLeft: 0,
      clientWidth: 900,
      scrollWidth: 1880,
      railWidth: 200,
      columnLefts,
      direction: 1,
    }),
  ).toBe(280);
  expect(
    computeNextEpisodeScrollLeft({
      scrollLeft: 560,
      clientWidth: 900,
      scrollWidth: 1880,
      railWidth: 200,
      columnLefts,
      direction: -1,
    }),
  ).toBe(280);

  let readDensity = "";
  function DensityProbe(): ReactNode {
    const { density } = useBoardDensity();
    readDensity = density;
    return <span data-probe={density} />;
  }

  const scrollEvents: number[] = [];
  const lanes = resolveStorylineLanes(STORYLINES);
  const { host, cleanup } = mountWithServices(
    <>
      <DensityProbe />
      <BoardToolbar
        query=""
        storylines={STORYLINES}
        laneByStoryline={lanes}
        cardCountByStoryline={new Map()}
        selectedStorylineIds={new Set()}
        unlinkedOnly={false}
        unlinkedCount={0}
        episodes={EPISODES}
        visibleEpisodeIds={new Set(["ep-201"])}
        canScrollStart={false}
        canScrollEnd={true}
        hasHorizontalOverflow={true}
        density="fit"
        filteredCardCount={3}
        totalCardCount={3}
        hasActiveFilter={false}
        onQueryChange={() => {}}
        onToggleStoryline={() => {}}
        onClearStorylines={() => {}}
        onToggleUnlinked={() => {}}
        onClearFilters={() => {}}
        onJumpEpisode={() => {}}
        onScrollEpisodes={(dir) => scrollEvents.push(dir)}
        onDensityChange={() => {}}
      />
      <BoardEdgeScrollers
        canScrollStart={true}
        canScrollEnd={true}
        onScrollEpisodes={(dir) => scrollEvents.push(dir * 10)}
      />
    </>,
  );

  expect(readDensity).toBe("fit");

  // Toolbar left stepper disabled at start; right stepper active and invokes +1
  const toolbarLeft = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${BOARD_WORDS.scrollLeft}"]:not(.mn-board-pan-btn)`,
  )!;
  const toolbarRight = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${BOARD_WORDS.scrollRight}"]:not(.mn-board-pan-btn)`,
  )!;
  expect(toolbarLeft.disabled).toBe(true);
  expect(toolbarRight.disabled).toBe(false);
  act(() => toolbarRight.click());

  // Floating edge scroll buttons fire -1 / +1 cleanly
  const edgeLeft = host.querySelector<HTMLButtonElement>(
    '.mn-board-pan-btn[data-side="start"]',
  )!;
  const edgeRight = host.querySelector<HTMLButtonElement>(
    '.mn-board-pan-btn[data-side="end"]',
  )!;
  act(() => {
    edgeLeft.click();
    edgeRight.click();
  });

  expect(scrollEvents).toEqual([1, -10, 10]);

  cleanup();
});
