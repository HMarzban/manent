import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import type { EpisodeEntry } from "@manent/crdt";
import { SERIES_WORDS } from "@manent/ui";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { SeasonSection } from "../src/screens/library/series/season-section.tsx";
import {
  computeSeasonStats,
  dueUrgency,
  episodeNeedsAttention,
} from "../src/screens/library/series/series-facts.ts";
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

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 27, 12, 0, 0).getTime();

function makeEpisodes(): readonly EpisodeEntry[] {
  return [
    {
      id: "ep-201",
      seasonId: "s2",
      number: 201,
      title: "Low Tide",
      writerUserId: "sam",
      stage: "Blue",
      dueAt: NOW + 10 * DAY,
      pages: 58,
      openCount: null,
      locked: true,
      docIds: { script: "doc-201", outline: null, roomLog: null },
    },
    {
      id: "ep-202",
      seasonId: "s2",
      number: 202,
      title: "Salt",
      writerUserId: "dana",
      stage: "White",
      dueAt: NOW + 2 * DAY,
      pages: 56,
      openCount: null,
      locked: true,
      docIds: { script: "doc-202", outline: null, roomLog: null },
    },
    {
      id: "ep-203",
      seasonId: "s2",
      number: 203,
      title: "Undertow",
      writerUserId: "dana",
      stage: "Network",
      dueAt: NOW - 2 * DAY,
      pages: 61,
      openCount: { round: "Network", open: 4 },
      locked: false,
      docIds: { script: "doc-203", outline: null, roomLog: null },
    },
    {
      id: "ep-204",
      seasonId: "s2",
      number: 204,
      title: "The Ferry",
      writerUserId: "sam",
      stage: "Studio",
      dueAt: null,
      pages: 52,
      openCount: null,
      locked: false,
      docIds: { script: "doc-204", outline: "out-204", roomLog: null },
    },
    {
      id: "ep-205",
      seasonId: "s2",
      number: 205,
      title: "Slack Water",
      writerUserId: "sam",
      stage: "Writer's First",
      dueAt: null,
      pages: 31,
      openCount: null,
      locked: false,
      docIds: { script: "doc-205", outline: null, roomLog: "log-205" },
    },
    {
      id: "ep-206",
      seasonId: "s2",
      number: 206,
      title: "The Bar",
      writerUserId: "dana",
      stage: null,
      dueAt: null,
      pages: null,
      openCount: null,
      locked: false,
      docIds: { script: null, outline: "out-206", roomLog: null },
    },
  ];
}

async function mountInRouter(node: ReactNode): Promise<{
  host: HTMLDivElement;
  cleanup(): void;
}> {
  const env = testEnvironment({ now: () => NOW });
  const services = testServices({ userId: "sam", environment: env });
  const rootRoute = createRootRoute({ component: () => node });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      <EnvironmentProvider environment={env}>
        <ServicesProvider services={services}>
          <RouterProvider router={router} />
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });
  return { host, cleanup: () => services.dispose() };
}

test("series-facts computes due urgency, attention flags and season summary stats", () => {
  const episodes = makeEpisodes();
  expect(dueUrgency(NOW - 2 * DAY, NOW)).toBe("overdue");
  expect(dueUrgency(NOW + 2 * DAY, NOW)).toBe("soon");
  expect(dueUrgency(NOW + 10 * DAY, NOW)).toBe("normal");
  expect(dueUrgency(null, NOW)).toBeNull();

  expect(episodeNeedsAttention(episodes[0]!, 58, NOW)).toBe(false);
  expect(episodeNeedsAttention(episodes[2]!, 58, NOW)).toBe(true);

  expect(computeSeasonStats(episodes, 58, 22, NOW)).toEqual({
    total: 6,
    locked: 2,
    openNotes: 4,
    overdue: 1,
    overTarget: 1,
    boardCards: 22,
  });
});

test("SeasonSection renders non-nested interactive episode rows, click-to-open titles, summary strip, rename and filter bar", async () => {
  const episodes = makeEpisodes();
  const opened: string[] = [];
  const renamed: (string | null)[] = [];

  const { host, cleanup } = await mountInRouter(
    <SeasonSection
      projectId="harbour"
      projectTitle="Harbour Lights"
      season={{ id: "s2", number: 2, title: null }}
      episodes={episodes}
      targetPages={58}
      ladder={["Writer's First", "Studio", "Network", "White", "Blue"]}
      boardCardCount={22}
      collapsible={true}
      hideNewSeasonButton={true}
      canEdit={true}
      creating={false}
      people={[
        { userId: "sam", name: "Sam Okafor" },
        { userId: "dana", name: "Dana Reyes" },
      ]}
      lastEditedByDoc={new Map()}
      placeByDoc={new Map()}
      shell="web"
      now={NOW}
      open={(docId) => opened.push(docId)}
      onSaveEpisode={() => {}}
      onRenameSeason={(_s, title) => renamed.push(title)}
      onNewEpisode={() => {}}
    />,
  );

  // Zero WCAG 4.1.2 nested-interactive violations: no [role="button"] contains another button
  const roleButtons = host.querySelectorAll('[role="button"]');
  for (const el of roleButtons) {
    expect(el.querySelector("button")).toBeNull();
  }

  // Season summary strip shows episode, locked, open notes, target and board card counts
  expect(host.textContent).toContain("6 episodes");
  expect(host.textContent).toContain("2 locked");
  expect(host.textContent).toContain("4 open notes");
  expect(host.textContent).toContain("58 pp. target");
  expect(host.textContent).toContain("22 board cards");

  // Primary click on episode title opens script (not inline rename)
  const lowTideBtn = [
    ...host.querySelectorAll<HTMLButtonElement>("button"),
  ].find((b) => b.textContent?.includes("Low Tide"))!;
  act(() => lowTideBtn.click());
  expect(opened).toEqual(["doc-201"]);

  // Room log quick-open button opens secondary room log doc
  const roomLogBtn = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${SERIES_WORDS.openRoomLog}"]`,
  )!;
  act(() => roomLogBtn.click());
  expect(opened).toEqual(["doc-201", "log-205"]);

  // Needs attention filter narrows the table to Undertow (ep 203)
  const attentionBtn = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${SERIES_WORDS.needsAttentionLabel}"]`,
  )!;
  act(() => attentionBtn.click());
  expect(host.querySelectorAll('[role="listitem"]').length).toBe(1);
  expect(host.textContent).toContain("Undertow");

  // Clear filters restores all 6 episodes
  const clearBtn = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === SERIES_WORDS.clearFilters,
  )!;
  act(() => clearBtn.click());
  expect(host.querySelectorAll('[role="listitem"]').length).toBe(6);

  // Inline season rename commits new title
  const renameBtn = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${SERIES_WORDS.renameSeason}"]`,
  )!;
  act(() => renameBtn.click());
  const renameInput = host.querySelector<HTMLInputElement>(
    `input[aria-label="${SERIES_WORDS.renameSeason}"]`,
  )!;
  expect(renameInput).not.toBeNull();
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(renameInput),
      "value",
    )?.set;
    setter?.call(renameInput, "The Ferry Arc");
    renameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
    renameInput.dispatchEvent(
      new window.KeyboardEvent("keyup", { bubbles: true }),
    );
    renameInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  act(() => {
    renameInput.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(renamed).toEqual(["The Ferry Arc"]);

  cleanup();
});

test("SeasonSection collapses empty past seasons when defaultCollapsed is true", async () => {
  const { host, cleanup } = await mountInRouter(
    <SeasonSection
      projectId="ward"
      projectTitle="Ward Nine"
      season={{ id: "s1", number: 1, title: null }}
      episodes={[]}
      targetPages={55}
      collapsible={true}
      defaultCollapsed={true}
      hideNewSeasonButton={true}
      canEdit={true}
      creating={false}
      people={[]}
      lastEditedByDoc={new Map()}
      placeByDoc={new Map()}
      shell="web"
      now={NOW}
      open={() => {}}
      onSaveEpisode={() => {}}
      onNewEpisode={() => {}}
    />,
  );

  expect(host.textContent).toContain(SERIES_WORDS.emptySeasonTag);
  expect(host.textContent).not.toContain(SERIES_WORDS.empty);
  const expandBtn = host.querySelector<HTMLButtonElement>(
    'button[aria-expanded="false"]',
  )!;
  act(() => expandBtn.click());
  expect(host.textContent).toContain(SERIES_WORDS.empty);

  cleanup();
});
