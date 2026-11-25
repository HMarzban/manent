import type { BlockJSON } from "@manent/schema";
import type { PrompterHandle, PrompterStatus } from "@manent/sync-client";
import type { PrompterRow } from "@manent/sync-protocol";
import { withDom } from "@manent/testkit/dom";
import { PROMPTER_WINDOW_WORDS, createValue } from "@manent/ui";
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { createHandlers } from "../src/handlers/index.ts";
import { openPresentWindow } from "../src/screens/present/open-window.ts";
import { writeCachedFeed } from "../src/screens/present/prompter/prompter-storage.ts";
import { usePrompterFeed } from "../src/screens/present/prompter/use-prompter-feed.ts";
import type { PrompterFeedView } from "../src/screens/present/prompter/use-prompter-feed.ts";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { createPersonStore } from "../src/state/person.store.ts";
import {
  MemoryStorage,
  QUIET_DOM,
  createNavigation,
  fakeApi,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

const RUNDOWN_ID = "00000000-0000-4000-8000-000000000001";
const STORY_ID = "00000000-0000-4000-8000-000000000002";
const FEED_KEY = `manent.prompter.feed.${RUNDOWN_ID}`;

const SAMPLE_ROWS: readonly PrompterRow[] = [
  {
    rowId: "row-1",
    kind: "story",
    number: 1,
    title: "Evening headlines",
    storyId: STORY_ID,
    durationMs: 30_000,
  },
];

const SAMPLE_BLOCKS: readonly BlockJSON[] = [
  {
    type: "block",
    attrs: { type: "dialogue" },
    content: [{ type: "text", text: "Good evening." }],
  },
];

function createFakePrompterHandle(initial: PrompterStatus): {
  handle: PrompterHandle;
  runOrder: ReturnType<typeof createValue<readonly PrompterRow[]>>;
  stories: ReturnType<
    typeof createValue<ReadonlyMap<string, readonly BlockJSON[]>>
  >;
  status: ReturnType<typeof createValue<PrompterStatus>>;
} {
  const runOrder = createValue<readonly PrompterRow[]>([]);
  const stories = createValue<ReadonlyMap<string, readonly BlockJSON[]>>(
    new Map(),
  );
  const status = createValue<PrompterStatus>(initial);
  return {
    handle: {
      runOrder,
      stories,
      status,
      close() {},
    },
    runOrder,
    stories,
    status,
  };
}

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  document.body.replaceChildren();
});

test("refusing a prompter feed deletes cached text from storage and never re-persists it on unmount", async () => {
  const storage = new MemoryStorage();
  writeCachedFeed(storage, RUNDOWN_ID, {
    v: 1,
    runOrder: SAMPLE_ROWS,
    stories: [{ storyId: STORY_ID, blocks: [...SAMPLE_BLOCKS] }],
    lastReceivedAt: 1_700_000_000_000,
  });
  expect(storage.getItem(FEED_KEY)).not.toBeNull();

  const fake = createFakePrompterHandle({
    feed: "live",
    lastReceivedAt: 1_700_000_001_000,
  });
  fake.runOrder.set(SAMPLE_ROWS);
  fake.stories.set(new Map([[STORY_ID, SAMPLE_BLOCKS]]));

  const environment = testEnvironment({ storage });
  const baseServices = testServices({ userId: "ana", environment });
  const services = {
    ...baseServices,
    prompter: async () => fake.handle,
  };

  const latest: { current: PrompterFeedView | null } = { current: null };
  function Probe() {
    latest.current = usePrompterFeed(RUNDOWN_ID);
    return null;
  }

  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);

  await act(async () => {
    mounted?.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <Probe />
        </ServicesProvider>
      </EnvironmentProvider>,
    );
    await Promise.resolve();
  });

  expect(latest.current?.feed).toBe("live");
  expect(storage.getItem(FEED_KEY)).not.toBeNull();

  act(() => {
    fake.status.set({ feed: "refused", lastReceivedAt: null });
  });

  expect({
    feed: latest.current?.feed,
    hasFeed: latest.current?.hasFeed,
    storiesCount: latest.current?.stories.length,
    cachedAfterRefusal: storage.getItem(FEED_KEY),
  }).toEqual({
    feed: "refused",
    hasFeed: false,
    storiesCount: 0,
    cachedAfterRefusal: null,
  });

  act(() => {
    mounted?.unmount();
    mounted = null;
  });

  expect(storage.getItem(FEED_KEY)).toBeNull();
  baseServices.dispose();
});

test("opening a present window reports whether the browser allowed the pop-up", () => {
  const originalOpen = window.open;
  let focusCalls = 0;
  const fakeWindow = {
    closed: false,
    focus() {
      focusCalls += 1;
    },
  } as unknown as Window;

  const docBlocked = "00000000-0000-4000-8000-000000000010";
  const docAllowed = "00000000-0000-4000-8000-000000000011";
  const openedCalls: [string, string][] = [];

  window.open = ((url?: string | URL, target?: string) => {
    openedCalls.push([String(url), String(target)]);
    return String(url).includes(docBlocked) ? null : fakeWindow;
  }) as typeof window.open;

  try {
    const blockedResult = openPresentWindow(docBlocked, "prompter");
    const allowedResult = openPresentWindow(docAllowed, "prompter");
    const refocusedResult = openPresentWindow(docAllowed, "prompter");

    expect({
      blockedResult,
      allowedResult,
      refocusedResult,
      focusCalls,
      openedCalls,
    }).toEqual({
      blockedResult: false,
      allowedResult: true,
      refocusedResult: true,
      focusCalls: 1,
      openedCalls: [
        [`/s/${docBlocked}/prompter`, `manent-prompter-${docBlocked}`],
        [`/s/${docAllowed}/prompter`, `manent-prompter-${docAllowed}`],
      ],
    });
  } finally {
    window.open = originalOpen;
  }
});

test("presenting on prompter shows the blocked pop-up message when the browser refuses the window", () => {
  const originalOpen = window.open;
  const docBlocked = "00000000-0000-4000-8000-000000000020";
  const docAllowed = "00000000-0000-4000-8000-000000000021";
  const fakeWindow = { closed: false, focus() {} } as unknown as Window;

  window.open = ((url?: string | URL) =>
    String(url).includes(docBlocked) ? null : fakeWindow) as typeof window.open;

  const environment = testEnvironment();
  const services = testServices({ userId: "ana", environment });
  const route = createNavigation({
    routeId: "/s/$docId",
    href: `/s/${docBlocked}`,
    search: {},
  });

  try {
    environment.shellState.set({
      ...environment.shellState.get(),
      docId: docBlocked,
    });
    const handlers = createHandlers({
      services,
      api: fakeApi(),
      usePerson: createPersonStore(null),
      router: route.navigation,
      dom: QUIET_DOM,
      shellState: environment.shellState.get,
      frame: environment.frame,
      visitUndo: environment.visitUndo,
      desktop: null,
      nodeCloud: null,
      language: environment.language,
      now: environment.now,
      storage: environment.storage,
    });

    handlers["view.presentOnPrompter"]();
    expect(services.messages.current()).toEqual({
      id: "prompter.popup_blocked",
      text: PROMPTER_WINDOW_WORDS.popupBlocked,
      actions: [],
      lifetime: "brief",
      ownWork: false,
    });

    services.messages.dismiss("prompter.popup_blocked");
    environment.shellState.set({
      ...environment.shellState.get(),
      docId: docAllowed,
    });
    handlers["view.presentOnPrompter"]();
    expect(services.messages.current()).toBeNull();
  } finally {
    window.open = originalOpen;
    services.dispose();
  }
});
